-- ========================================================================================
-- MIGRATION: Correção RLS de disciplines + exclusão segura de importações
-- ========================================================================================
-- CAUSA RAIZ DO ERRO "new row violates row-level security policy for table 'disciplines'":
-- a tabela public.disciplines possui APENAS política de SELECT. Não existe política de
-- INSERT, então qualquer usuário autenticado que tente criar uma disciplina (importação,
-- plano de estudos, edital) era bloqueado pelo RLS.
-- ========================================================================================

-- 1. Permitir que usuários autenticados adicionem disciplinas NOVAS ao catálogo global.
--    Seguro: só INSERT; SELECT já é aberto; UPDATE/DELETE continuam bloqueados (ninguém
--    altera ou apaga disciplinas de terceiros).
DROP POLICY IF EXISTS "Usuários autenticados podem criar disciplinas" ON public.disciplines;
CREATE POLICY "Usuários autenticados podem criar disciplinas"
  ON public.disciplines FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 2. Garantir base da exclusão por lote (idempotente caso a migration anterior
--    não tenha sido aplicada).
CREATE TABLE IF NOT EXISTS public.study_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_name text NOT NULL,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_imports_insert_own" ON public.study_imports;
CREATE POLICY "study_imports_insert_own"
  ON public.study_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_imports_select_own" ON public.study_imports;
CREATE POLICY "study_imports_select_own"
  ON public.study_imports FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Permitir que o usuário exclua SOMENTE os próprios lotes de importação.
DROP POLICY IF EXISTS "study_imports_delete_own" ON public.study_imports;
CREATE POLICY "study_imports_delete_own"
  ON public.study_imports FOR DELETE
  USING (auth.uid() = user_id);

-- 4. study_history já possui política de DELETE (auth.uid() = user_id) da migration
--    fix-study-history-save.sql — reafirmada aqui para garantia.
DROP POLICY IF EXISTS "study_history_delete_policy" ON public.study_history;
CREATE POLICY "study_history_delete_policy"
  ON public.study_history FOR DELETE
  USING (auth.uid() = user_id);
