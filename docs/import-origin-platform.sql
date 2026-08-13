-- ========================================================================================
-- MIGRATION: Origem da plataforma na importação de histórico
-- ========================================================================================
-- NOTA: a coluna study_source de study_history é o TIPO de estudo (PLAN/FREE/REVIEW...),
-- NÃO é equivalente a origem. Por isso criamos colunas próprias de origem.
-- ========================================================================================

-- 1. Tabela de lotes de importação (arquitetura reutilizável por plataforma)
CREATE TABLE IF NOT EXISTS public.study_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,                -- slug: aprovado | estudei | gran | tec | qconcursos | outra
  source_name text NOT NULL,           -- nome de exibição (ex.: "Gran", "TEC Concursos")
  file_name text,                      -- identificador do arquivo (apenas o nome)
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

-- 2. Colunas de origem nas sessões (data do estudo permanece em started_at)
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

-- 3. Índices (filtro futuro por origem)
CREATE INDEX IF NOT EXISTS study_history_origin_source_idx
  ON public.study_history (user_id, origin_source);

CREATE INDEX IF NOT EXISTS study_imports_user_idx
  ON public.study_imports (user_id, created_at);
