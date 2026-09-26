-- ============================================================================
-- P1.5 — CONSOLIDAÇÃO DO PLANEJAMENTO: colunas de preferência em profiles
-- ----------------------------------------------------------------------------
-- Fonte oficial das preferências persistentes do Planejamento passa a ser o
-- banco. localStorage vira legado/compatibilidade (lazy migration no app).
--
-- Colunas (todas NULLABLE — ausência significa "não configurado", nunca erro):
--   work_scale        text      escala: normal|12x36|24x72|24x48|5x1|6x1|4x2|custom_NxM
--   first_shift_day   integer   dia do mês de referência do plantão (1-31)
--   shift_anchor_date date      âncora do cálculo contínuo de plantão
--   study_days        text[]    dias de estudo (seg..dom)
--
-- Segurança: sem RLS nova — colunas herdam as policies existentes de profiles
-- (SELECT/UPDATE da própria linha via auth.uid() = id). Sem INSERT novo.
-- Idempotente: IF NOT EXISTS + DROP CONSTRAINT IF EXISTS antes de cada ADD.
-- Não apaga nada; não altera colunas existentes.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_scale text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_shift_day integer;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shift_anchor_date date;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS study_days text[];

-- first_shift_day: 1-31 quando presente
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_first_shift_day_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_first_shift_day_range
  CHECK (first_shift_day IS NULL OR (first_shift_day >= 1 AND first_shift_day <= 31));

-- work_scale: enum fechado + custom_NxM com N/M 1-14
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_work_scale_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_work_scale_valid
  CHECK (
    work_scale IS NULL
    OR work_scale IN ('normal', '12x36', '24x72', '24x48', '5x1', '6x1', '4x2')
    OR work_scale ~ '^custom_([1-9]|1[0-4])x([1-9]|1[0-4])$'
  );

-- study_days: somente valores controlados (array pode ser NULL)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_study_days_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_study_days_valid
  CHECK (
    study_days IS NULL
    OR study_days <@ ARRAY['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']::text[]
  );

COMMENT ON COLUMN public.profiles.work_scale IS 'P1.5: escala de trabalho do Planejamento (fonte oficial; localStorage é legado)';
COMMENT ON COLUMN public.profiles.first_shift_day IS 'P1.5: dia de referência do plantão 1-31 (NULL = não configurado; fallback técnico 2 só em cálculo)';
COMMENT ON COLUMN public.profiles.shift_anchor_date IS 'P1.5: âncora do cálculo de plantão (NULL = sem âncora configurada)';
COMMENT ON COLUMN public.profiles.study_days IS 'P1.5: dias de estudo seg..dom (fonte oficial; localStorage é legado)';
