-- ========================================================================================
-- MENTOR CONCURSOS IA — HABILITAÇÃO COMPLETA DE RLS PARA SESSÕES DE SUPORTE E AUDITORIA
-- ========================================================================================

-- 1. Políticas RLS para public.support_sessions
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderador pode ler suas próprias sessões de suporte" ON public.support_sessions;
DROP POLICY IF EXISTS "Moderador pode criar sessões de suporte" ON public.support_sessions;
DROP POLICY IF EXISTS "Moderador pode atualizar suas próprias sessões" ON public.support_sessions;
DROP POLICY IF EXISTS "Acesso a suporte para moderadores e admins" ON public.support_sessions;

-- SELECT: Moderador/Admin vê suas próprias sessões
CREATE POLICY "Moderador pode ler suas próprias sessões de suporte"
  ON public.support_sessions FOR SELECT
  USING (auth.uid() = moderator_id);

-- INSERT: Moderador/Admin pode criar sessão de suporte
CREATE POLICY "Moderador pode criar sessões de suporte"
  ON public.support_sessions FOR INSERT
  WITH CHECK (
    auth.uid() = moderator_id 
    AND public.get_user_role(auth.uid()) IN ('admin', 'moderator')
  );

-- UPDATE: Moderador/Admin pode encerrar/atualizar suas sessões
CREATE POLICY "Moderador pode atualizar suas próprias sessões"
  ON public.support_sessions FOR UPDATE
  USING (auth.uid() = moderator_id)
  WITH CHECK (auth.uid() = moderator_id);

-- 2. Políticas RLS para public.audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inserção de logs de auditoria permitida para autenticados" ON public.audit_logs;
DROP POLICY IF EXISTS "Leitura de logs permitida para o próprio autor" ON public.audit_logs;

CREATE POLICY "Inserção de logs de auditoria permitida para autenticados"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = actor_user_id);

CREATE POLICY "Leitura de logs permitida para o próprio autor"
  ON public.audit_logs FOR SELECT
  USING (
    auth.uid() = actor_user_id 
    OR public.get_user_role(auth.uid()) = 'admin'
  );
