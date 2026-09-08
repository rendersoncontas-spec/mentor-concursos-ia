-- ============================================================================
-- MIGRATION: Correção de políticas RLS para tabelas de simulados
--
-- Problema: a política "FOR ALL USING (auth.uid() = user_id)" pode falhar
-- em INSERTs dependendo da configuração do Supabase, porque o WITH CHECK
-- não é explicitamente definido.
--
-- Solução: substituir a política genérica por políticas explícitas para
-- cada operação (INSERT, SELECT, UPDATE, DELETE), garantindo que:
--   - INSERT: auth.uid() = user_id (WITH CHECK)
--   - SELECT: auth.uid() = user_id (USING)
--   - UPDATE: auth.uid() = user_id (USING + WITH CHECK)
--   - DELETE: auth.uid() = user_id (USING)
--
-- Segurança: idempotente (DROP IF EXISTS antes de CREATE).
-- Nenhum dado é apagado. RLS continua ativo.
-- ============================================================================

-- ============================================================================
-- 1. TABELA simulados
-- ============================================================================

-- Remove política genérica antiga (se existir)
DROP POLICY IF EXISTS "Usuário gerencia próprios simulados" ON public.simulados;

-- SELECT: usuário vê apenas seus próprios simulados
DROP POLICY IF EXISTS "simulados_select_own" ON public.simulados;
CREATE POLICY "simulados_select_own" ON public.simulados
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT: usuário só pode criar simulado com user_id igual ao seu
DROP POLICY IF EXISTS "simulados_insert_own" ON public.simulados;
CREATE POLICY "simulados_insert_own" ON public.simulados
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: usuário só pode editar seus próprios simulados
DROP POLICY IF EXISTS "simulados_update_own" ON public.simulados;
CREATE POLICY "simulados_update_own" ON public.simulados
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DELETE: usuário só pode excluir seus próprios simulados
DROP POLICY IF EXISTS "simulados_delete_own" ON public.simulados;
CREATE POLICY "simulados_delete_own" ON public.simulados
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 2. TABELA simulado_disciplines
-- ============================================================================

DROP POLICY IF EXISTS "Usuário gerencia disciplinas de seus simulados" ON public.simulado_disciplines;

DROP POLICY IF EXISTS "simulado_disciplines_select_own" ON public.simulado_disciplines;
CREATE POLICY "simulado_disciplines_select_own" ON public.simulado_disciplines
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "simulado_disciplines_insert_own" ON public.simulado_disciplines;
CREATE POLICY "simulado_disciplines_insert_own" ON public.simulado_disciplines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "simulado_disciplines_update_own" ON public.simulado_disciplines;
CREATE POLICY "simulado_disciplines_update_own" ON public.simulado_disciplines
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "simulado_disciplines_delete_own" ON public.simulado_disciplines;
CREATE POLICY "simulado_disciplines_delete_own" ON public.simulado_disciplines
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 3. TABELA simulado_questions (se RLS estiver ativo)
-- ============================================================================

-- Verifica se RLS está habilitado antes de criar políticas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'simulado_questions'
    AND rowsecurity = true
  ) THEN
    -- Remove política genérica antiga
    DROP POLICY IF EXISTS "Usuário gerencia questões de seus simulados" ON public.simulado_questions;

    DROP POLICY IF EXISTS "simulado_questions_select_own" ON public.simulado_questions;
    CREATE POLICY "simulado_questions_select_own" ON public.simulado_questions
      FOR SELECT USING (auth.uid() = user_id);

    DROP POLICY IF EXISTS "simulado_questions_insert_own" ON public.simulado_questions;
    CREATE POLICY "simulado_questions_insert_own" ON public.simulado_questions
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "simulado_questions_update_own" ON public.simulado_questions;
    CREATE POLICY "simulado_questions_update_own" ON public.simulado_questions
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS "simulado_questions_delete_own" ON public.simulado_questions;
    CREATE POLICY "simulado_questions_delete_own" ON public.simulado_questions
      FOR DELETE USING (auth.uid() = user_id);
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
  AND tablename IN ('simulados', 'simulado_disciplines', 'simulado_questions')
ORDER BY tablename, cmd;
