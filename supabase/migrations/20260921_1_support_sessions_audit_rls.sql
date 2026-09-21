-- ============================================================================
-- MIGRATION: Políticas de INSERT/UPDATE em support_sessions + SELECT ampliado
-- em audit_logs para admins
--
-- Problema (auditoria de hardening, 21/09/2026): support_sessions e
-- audit_logs foram criadas em docs/admin-moderation-migration.sql (script
-- avulso, nunca versionado em supabase/migrations/) com RLS habilitado, mas:
--
--   - support_sessions só tinha policy de SELECT. As três ações reais que já
--     existem em produção (src/application/admin/admin.actions.ts) fazem
--     INSERT (startSupportSessionAction) e UPDATE (startSupportSessionAction
--     ao encerrar a sessão anterior, endSupportSessionAction, e
--     getActiveSupportSession em src/application/admin/auth-guard.ts, para
--     marcar sessões expiradas) diretamente contra a tabela, sem nenhuma RPC
--     que contorne RLS — sem as policies certas, INSERT falha com erro
--     explícito de RLS (bloqueando o modo de suporte inteiro) e UPDATE falha
--     silenciosamente (0 linhas afetadas, sessão nunca é marcada
--     ENDED/EXPIRED).
--   - audit_logs só permitia o próprio autor ler o que ele mesmo escreveu —
--     não há hoje nenhuma tela de auditoria para admins, mas a policy restrita
--     bloquearia qualquer visão administrativa futura desses logs.
--
-- Esta migration formaliza a correção já rascunhada em
-- docs/fix-support-sessions-rls.sql como uma migration versionada e
-- idempotente. Não altera a regra de impersonação em si (hierarquia
-- moderador/admin continua sendo decidida em código, por
-- canOperatorAccessTarget em src/application/admin/auth-guard.ts) — só
-- garante que o banco permite as operações que a aplicação já faz.
--
-- Dependência: as policies de INSERT desta migration usam
-- public.get_user_role(uuid), criada em docs/admin-moderation-migration.sql
-- (também não versionada). Esta migration checa se a função existe antes de
-- criar essas policies especificamente — se não existir (banco sem a base de
-- admin/moderação aplicada), pula essa parte com um aviso em vez de falhar a
-- migration inteira; SELECT/UPDATE de support_sessions (que não dependem da
-- função) são sempre aplicadas.
--
-- Segurança: idempotente (DROP POLICY IF EXISTS antes de CREATE), protegida
-- por checagem de existência da tabela antes de cada bloco. Nenhum dado é
-- apagado por esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. support_sessions: SELECT (sem mudança de comportamento) + UPDATE
--    (não depende de get_user_role)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'support_sessions'
  ) THEN
    ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Moderador pode ler suas próprias sessões de suporte" ON public.support_sessions;
    CREATE POLICY "Moderador pode ler suas próprias sessões de suporte"
      ON public.support_sessions FOR SELECT
      USING (auth.uid() = moderator_id);

    DROP POLICY IF EXISTS "Moderador pode atualizar suas próprias sessões" ON public.support_sessions;
    CREATE POLICY "Moderador pode atualizar suas próprias sessões"
      ON public.support_sessions FOR UPDATE
      USING (auth.uid() = moderator_id)
      WITH CHECK (auth.uid() = moderator_id);
  ELSE
    RAISE NOTICE 'support_sessions não existe neste banco — policies de SELECT/UPDATE não criadas.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. support_sessions: INSERT (depende de public.get_user_role existir)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'support_sessions'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_user_role'
    ) THEN
      DROP POLICY IF EXISTS "Moderador pode criar sessões de suporte" ON public.support_sessions;
      CREATE POLICY "Moderador pode criar sessões de suporte"
        ON public.support_sessions FOR INSERT
        WITH CHECK (
          auth.uid() = moderator_id
          AND public.get_user_role(auth.uid()) IN ('admin', 'moderator')
        );
    ELSE
      RAISE NOTICE 'public.get_user_role não existe — policy de INSERT de support_sessions não criada. Aplique docs/admin-moderation-migration.sql primeiro.';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. audit_logs: mantém INSERT restrito ao próprio autor; amplia SELECT para
--    admins (via get_user_role, se existir), preservando leitura do próprio
--    autor mesmo sem a função.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
  ) THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Inserção de logs de auditoria permitida para autenticados" ON public.audit_logs;
    CREATE POLICY "Inserção de logs de auditoria permitida para autenticados"
      ON public.audit_logs FOR INSERT
      WITH CHECK (auth.uid() = actor_user_id);

    DROP POLICY IF EXISTS "Leitura de logs permitida para o próprio autor" ON public.audit_logs;
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_user_role'
    ) THEN
      CREATE POLICY "Leitura de logs permitida para o próprio autor"
        ON public.audit_logs FOR SELECT
        USING (
          auth.uid() = actor_user_id
          OR public.get_user_role(auth.uid()) = 'admin'
        );
    ELSE
      CREATE POLICY "Leitura de logs permitida para o próprio autor"
        ON public.audit_logs FOR SELECT
        USING (auth.uid() = actor_user_id);
      RAISE NOTICE 'public.get_user_role não existe — SELECT de audit_logs criado sem a ampliação para admins.';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('support_sessions', 'audit_logs')
ORDER BY tablename, cmd;
