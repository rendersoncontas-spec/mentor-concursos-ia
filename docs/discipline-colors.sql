-- ============================================================================
-- MIGRATION: COR PERSISTENTE POR DISCIPLINA (color_hex)
-- ----------------------------------------------------------------------------
-- 1. Audita a tabela `disciplines`: NÃO existe coluna de cor (apenas
--    id, name, area, created_at). Vamos criar SOMENTE o campo necessário.
-- 2. Cria `color_hex` e faz backfill determinístico com a paleta central.
-- 3. Adiciona policy UPDATE para usuários autenticados alterarem a cor
--    (a tabela é global e a política de SELECT já permite authenticated).
--
-- A paleta deve ser mantida em sincronia com:
--   src/domain/disciplines/discipline-colors.ts
-- ============================================================================

-- 1. Coluna de cor (NULL = cor automática determinística no frontend)
ALTER TABLE public.disciplines
  ADD COLUMN IF NOT EXISTS color_hex text;

-- 2. Backfill determinístico por ordem de criação (estável entre execuções)
UPDATE public.disciplines d
SET color_hex = palette.color
FROM (
  SELECT
    id,
    (ARRAY[
      '#f43f5e', '#8b5cf6', '#f59e0b', '#0ea5e9',
      '#10b981', '#ef4444', '#6366f1', '#14b8a6',
      '#a855f7', '#f97316', '#06b6d4', '#84cc16',
      '#e11d48', '#3b82f6', '#d946ef', '#22c55e'
    ])[((row_number() OVER (ORDER BY created_at, id) - 1) % 16) + 1] AS color
  FROM public.disciplines
) palette
WHERE palette.id = d.id
  AND d.color_hex IS NULL;

-- 3. Policy UPDATE: usuário autenticado pode alterar cor/nome da disciplina
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar disciplinas" ON public.disciplines;
CREATE POLICY "Usuários autenticados podem atualizar disciplinas"
  ON public.disciplines
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Verificação esperada:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'disciplines' AND column_name = 'color_hex';
--   -- 1 linha: color_hex
--   SELECT count(*) FROM public.disciplines WHERE color_hex IS NULL;
--   -- 0 (após backfill)