-- ============================================================================
-- MIGRATION: Política de DELETE em study_cycle_sessions
--
-- Problema (auditoria de hardening, 21/09/2026): a tabela public.study_cycle_sessions
-- tem RLS habilitado (docs/study-cycles.sql) com policies de SELECT e INSERT,
-- mas NUNCA teve uma policy de DELETE em nenhuma migration versionada.
--
-- reconcile_study_cycle(...) (supabase/migrations/20260919_cycle_reconciliation_seconds.sql)
-- é SECURITY INVOKER ("this function intentionally runs as the caller") e faz
-- DELETE FROM public.study_cycle_sessions WHERE cycle_id = p_cycle_id antes de
-- reinserir as sessões do rebuild. Sem uma policy de DELETE, esse DELETE roda
-- sob RLS sem nenhuma linha autorizada — Postgres não lança erro nesse caso,
-- apenas afeta 0 linhas ("DELETE 0") — então cada rebuild passava a SÓ
-- inserir, nunca limpar as sessões antigas. Isso foi observado ao vivo em
-- produção: um ciclo real acumulou 774 sessões derivadas de apenas 42 estudos
-- reais (ver docs/cleanup-and-verify-cycle.sql, que documenta a limpeza manual
-- feita para aquele ciclo específico após uma correção ad-hoc no SQL Editor).
--
-- Esta migration formaliza a correção já rascunhada em
-- docs/fix-delete-policy-study-cycle-sessions.sql como uma migration
-- versionada e idempotente, para que ela exista de forma rastreável e se
-- aplique a qualquer ambiente (não só ao banco de produção onde o fix foi
-- aplicado manualmente).
--
-- Escopo: SOMENTE a policy de DELETE. Não recria a tabela, não altera
-- SELECT/INSERT existentes, não toca em reconcile_study_cycle nem em nenhuma
-- outra função do motor de ciclos (motor permanece congelado).
--
-- Segurança: idempotente (DROP POLICY IF EXISTS antes de CREATE), protegida
-- por um DO $$ que só cria a policy se a tabela existir e tiver RLS
-- habilitado (não falha em um banco onde study_cycle_sessions ainda não
-- exista). Nenhum dado é apagado por esta migration.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'study_cycle_sessions'
      AND rowsecurity = true
  ) THEN
    DROP POLICY IF EXISTS "Usuários podem deletar sessões de seus ciclos" ON public.study_cycle_sessions;
    CREATE POLICY "Usuários podem deletar sessões de seus ciclos"
    ON public.study_cycle_sessions
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1
        FROM public.study_cycles
        WHERE study_cycles.id = study_cycle_sessions.cycle_id
          AND study_cycles.user_id = auth.uid()
      )
    );
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
  AND tablename = 'study_cycle_sessions'
ORDER BY cmd;
