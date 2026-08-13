-- ========================================================================================
-- MIGRATION: GARANTIR EXCLUSÃO REAL DE DADOS IMPORTADOS (idempotente — pode rodar N vezes)
-- ========================================================================================
-- O que esta migration garante:
--   1. Tabela study_imports (lote de importação) com RLS
--   2. Policies INSERT/SELECT/DELETE de study_imports (dono pode excluir os próprios lotes)
--   3. Colunas de origem em study_history (origin_source, origin_source_name,
--      origin_imported_at, import_batch_id)
--   4. FK import_batch_id -> study_imports (ON DELETE SET NULL)
--   5. Policy DELETE em study_history (auth.uid() = user_id) — REQUISITO da exclusão
--   6. Policy UPDATE em study_history (auth.uid() = user_id) — para edição de sessões
--   7. Índices de consulta por usuário/origem
-- ========================================================================================
-- SINTOMA QUE ESTE ARQUIVO CORRIGE: o botão "Excluir" aparece, mas nada é apagado,
-- sem mensagem de erro (RLS bloqueia DELETE silenciosamente quando a policy não existe).
-- ========================================================================================

-- 1. Lote de importação
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

-- Policy de DELETE: o dono pode excluir SOMENTE os próprios lotes
DROP POLICY IF EXISTS "study_imports_delete_own" ON public.study_imports;
CREATE POLICY "study_imports_delete_own"
  ON public.study_imports FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Colunas de origem nas sessões
ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS origin_source text;

ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS origin_source_name text;

ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS origin_imported_at timestamptz;

ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.study_history
  DROP CONSTRAINT IF EXISTS study_history_import_batch_fk;

ALTER TABLE public.study_history
  ADD CONSTRAINT study_history_import_batch_fk
  FOREIGN KEY (import_batch_id) REFERENCES public.study_imports(id)
  ON DELETE SET NULL;

-- 3. Policy de DELETE em study_history: dono exclui somente as próprias sessões.
--    SEM esta policy, o Supabase bloqueia o DELETE silenciosamente (rowCount = 0).
DROP POLICY IF EXISTS "study_history_delete_policy" ON public.study_history;
CREATE POLICY "study_history_delete_policy"
  ON public.study_history FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Policy de UPDATE em study_history (edição de sessões importadas/manuais)
DROP POLICY IF EXISTS "study_history_update_policy" ON public.study_history;
CREATE POLICY "study_history_update_policy"
  ON public.study_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Índices
CREATE INDEX IF NOT EXISTS study_history_origin_source_idx
  ON public.study_history (user_id, origin_source);

CREATE INDEX IF NOT EXISTS study_history_import_batch_idx
  ON public.study_history (user_id, import_batch_id);

CREATE INDEX IF NOT EXISTS study_imports_user_idx
  ON public.study_imports (user_id, created_at);

-- ========================================================================================
-- VERIFICAÇÃO (cole a consulta seguinte no SQL Editor e confira as policies):
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('study_imports', 'study_history') AND cmd = 'DELETE'
--   ORDER BY tablename, policyname;
-- Esperado: 2 linhas — "study_history_delete_policy" e "study_imports_delete_own"
-- ========================================================================================