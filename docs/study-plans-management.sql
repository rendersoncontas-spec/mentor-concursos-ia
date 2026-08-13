-- ========================================================================================
-- SPRINT PLANS REFORMULATION: Tabela study_plans ampliada (adição segura)
-- Execute no SQL Editor do Supabase
-- ========================================================================================
-- Esta migration é ADITIVA e IDEMPOTENTE.
-- Adiciona colunas necessárias para a nova central de gerenciamento de planos
-- sem remover nada que já existe.
-- ========================================================================================

-- 1. Coluna de tipo de plano (corrige erro "column plan_type does not exist")
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'CRONOGRAMA_SEMANAL';

-- 2. Nome amigável (substitui o nome técnico "Plano de Estudos v19")
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS name text;

-- 3. Descrição / objetivo do plano
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS description text;

-- 4. Status do plano: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'COMPLETED'
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE';

-- 5. Carga semanal em horas (snapshot no momento da criação)
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS weekly_minutes integer;

-- 6. Data de início do plano
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS start_date date;

-- 7. Data prevista de término / revisão
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS end_date date;

-- 8. Referência ao plano pai (quando duplicado) — usado para agrupar versões
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS parent_plan_id uuid REFERENCES public.study_plans(id) ON DELETE SET NULL;

-- 9. Raiz da cadeia de versões (grupo). Para um plano sem pai, ele mesmo é a raiz.
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS plan_group_id uuid;

-- 10. Pausado em
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- 11. Arquivado em
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 12. Backfill: preencher plan_group_id para registros existentes que não possuem pai
UPDATE public.study_plans
SET plan_group_id = id
WHERE plan_group_id IS NULL;

-- 13. Backfill: definir status = 'ARCHIVED' para planos com active = false
UPDATE public.study_plans
SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, generated_at)
WHERE active = false AND status = 'ACTIVE';

-- 14. Backfill: extrair weekly_minutes de study_plan_items quando possível (carga semanal)
UPDATE public.study_plans sp
SET weekly_minutes = sub.total_minutes
FROM (
  SELECT study_plan_id, SUM(duration_minutes) AS total_minutes
  FROM public.study_plan_items
  GROUP BY study_plan_id
) sub
WHERE sp.id = sub.study_plan_id
  AND sp.weekly_minutes IS NULL;

-- 15. Backfill: usar generated_reason como heurística para plan_type (caso contrário usar default)
UPDATE public.study_plans
SET plan_type = CASE
  WHEN generated_reason = 'cycle_wizard' THEN 'CICLO_ROTATIVO'
  ELSE 'CRONOGRAMA_SEMANAL'
END
WHERE plan_type IS NULL OR plan_type = 'CRONOGRAMA_SEMANAL';

-- 16. Backfill: gerar name amigável a partir do concurso ativo quando name é null
UPDATE public.study_plans sp
SET name = COALESCE(
  NULLIF(sp.name, ''),
  'Plano de Estudos v' || sp.version::text
)
WHERE sp.name IS NULL OR sp.name = '';

-- 17. Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_study_plans_user_status
  ON public.study_plans (user_id, status);

CREATE INDEX IF NOT EXISTS idx_study_plans_user_group
  ON public.study_plans (user_id, plan_group_id);

CREATE INDEX IF NOT EXISTS idx_study_plans_active
  ON public.study_plans (user_id, active);

-- ========================================================================================
-- FIM
-- ========================================================================================
