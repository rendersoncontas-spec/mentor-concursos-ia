-- ============================================================================
-- G1.2 (G-10/G-12) — CHECKS VALIDADOS CONTRA DADOS REAIS (2026-09-28).
--
-- Regra: cada constraint só é criada se NENHUMA linha existente a viola
-- (blocos DO com NOTICE + skip). Nada é apagado, corrigido ou fundido aqui.
-- Idempotente (DROP IF EXISTS + ADD dentro do guard).
--
-- Origens das regras (contrato real, não inventado):
-- - scoring_rule/source: SimuladoScoringRule/SimuladoRecordSource
--   (src/domain/simulados/types.ts) + toScoringRule/toSource
--   (simulado-records.actions.ts). net_score/net_percentage SEM limite
--   inferior de propósito: CEBRASPE admite líquido negativo.
-- - penalty_per_wrong >= 0: Math.max(0, ...) no save (servidor).
-- - penalty_score 0..100: clamp Math.max(0, Math.min(100, ...)) no save.
-- - blank_count >= 0: computeSubjects fixa >= 0 (G1.2) + dados 0,1,2,14.
-- - difficulty FACIL/MEDIA/DIFICIL: UI (edit-cycle-modal), testes e dados
--   reais (3/19/4). block_status não existe no banco real (migration antiga
--   nunca aplicada) — sem constraint, documentado no relatório.
-- - round_number > 0: motor inicia em 1 (DEFAULT 1); dados reais 1..4 e 2..3,
--   sem NULL/sem <= 0. study_cycle_round_conclusions NÃO existe no banco
--   real — fora desta migration (ver relatório).
-- - study_days: CHECK existente (subset) é mantido; aqui só não-vazio +
--   sem duplicatas quando configurado. NULL continua "não configurado".
--   Dado real: 1 linha válida com 6 dias distintos.
-- ============================================================================

-- simulados.scoring_rule
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.simulados
    WHERE scoring_rule IS NOT NULL
      AND scoring_rule NOT IN ('PERCENTUAL', 'CEBRASPE', 'PENALIZACAO', 'PERSONALIZADO')
  ) THEN
    RAISE NOTICE 'G1.2: simulados.scoring_rule possui valores fora do contrato — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.simulados DROP CONSTRAINT IF EXISTS simulados_scoring_rule_valid;
    ALTER TABLE public.simulados ADD CONSTRAINT simulados_scoring_rule_valid
      CHECK (scoring_rule IS NULL OR scoring_rule IN ('PERCENTUAL', 'CEBRASPE', 'PENALIZACAO', 'PERSONALIZADO'));
  END IF;
END $$;

-- simulados.source
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.simulados
    WHERE source IS NOT NULL
      AND source NOT IN ('TEC', 'GRAN', 'ESTRATEGIA', 'QCONCURSOS', 'PDF', 'PROVA_ANTERIOR', 'OUTRO')
  ) THEN
    RAISE NOTICE 'G1.2: simulados.source possui valores fora do contrato — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.simulados DROP CONSTRAINT IF EXISTS simulados_source_valid;
    ALTER TABLE public.simulados ADD CONSTRAINT simulados_source_valid
      CHECK (source IS NULL OR source IN ('TEC', 'GRAN', 'ESTRATEGIA', 'QCONCURSOS', 'PDF', 'PROVA_ANTERIOR', 'OUTRO'));
  END IF;
END $$;

-- simulados.penalty_per_wrong >= 0
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.simulados WHERE penalty_per_wrong IS NOT NULL AND penalty_per_wrong < 0) THEN
    RAISE NOTICE 'G1.2: simulados.penalty_per_wrong negativo existente — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.simulados DROP CONSTRAINT IF EXISTS simulados_penalty_per_wrong_nonneg;
    ALTER TABLE public.simulados ADD CONSTRAINT simulados_penalty_per_wrong_nonneg
      CHECK (penalty_per_wrong IS NULL OR penalty_per_wrong >= 0);
  END IF;
END $$;

-- simulados.penalty_score 0..100
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.simulados
    WHERE penalty_score IS NOT NULL AND (penalty_score < 0 OR penalty_score > 100)
  ) THEN
    RAISE NOTICE 'G1.2: simulados.penalty_score fora de 0..100 — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.simulados DROP CONSTRAINT IF EXISTS simulados_penalty_score_range;
    ALTER TABLE public.simulados ADD CONSTRAINT simulados_penalty_score_range
      CHECK (penalty_score IS NULL OR (penalty_score >= 0 AND penalty_score <= 100));
  END IF;
END $$;

-- simulado_disciplines.blank_count >= 0
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.simulado_disciplines WHERE blank_count IS NOT NULL AND blank_count < 0) THEN
    RAISE NOTICE 'G1.2: simulado_disciplines.blank_count negativo — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.simulado_disciplines DROP CONSTRAINT IF EXISTS simulado_disciplines_blank_count_nonneg;
    ALTER TABLE public.simulado_disciplines ADD CONSTRAINT simulado_disciplines_blank_count_nonneg
      CHECK (blank_count IS NULL OR blank_count >= 0);
  END IF;
END $$;

-- study_cycle_items.difficulty
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.study_cycle_items
    WHERE difficulty IS NOT NULL AND difficulty NOT IN ('FACIL', 'MEDIA', 'DIFICIL')
  ) THEN
    RAISE NOTICE 'G1.2: study_cycle_items.difficulty fora do contrato — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.study_cycle_items DROP CONSTRAINT IF EXISTS study_cycle_items_difficulty_valid;
    ALTER TABLE public.study_cycle_items ADD CONSTRAINT study_cycle_items_difficulty_valid
      CHECK (difficulty IS NULL OR difficulty IN ('FACIL', 'MEDIA', 'DIFICIL'));
  END IF;
END $$;

-- study_cycle_sessions.round_number > 0
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.study_cycle_sessions WHERE round_number IS NOT NULL AND round_number <= 0) THEN
    RAISE NOTICE 'G1.2: study_cycle_sessions.round_number <= 0 existente — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.study_cycle_sessions DROP CONSTRAINT IF EXISTS study_cycle_sessions_round_positive;
    ALTER TABLE public.study_cycle_sessions ADD CONSTRAINT study_cycle_sessions_round_positive
      CHECK (round_number IS NULL OR round_number > 0);
  END IF;
END $$;

-- study_cycle_item_skips.round_number > 0
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.study_cycle_item_skips WHERE round_number IS NOT NULL AND round_number <= 0) THEN
    RAISE NOTICE 'G1.2: study_cycle_item_skips.round_number <= 0 existente — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.study_cycle_item_skips DROP CONSTRAINT IF EXISTS study_cycle_item_skips_round_positive;
    ALTER TABLE public.study_cycle_item_skips ADD CONSTRAINT study_cycle_item_skips_round_positive
      CHECK (round_number IS NULL OR round_number > 0);
  END IF;
END $$;

-- profiles.study_days: não-vazio (CHECK) + sem duplicatas (trigger, pois
-- CHECK não admite subquery). NULL continua "não configurado".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE study_days IS NOT NULL AND cardinality(study_days) = 0
  ) THEN
    RAISE NOTICE 'G1.2: profiles.study_days vazio existente — CHECK NÃO criado.';
  ELSE
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_study_days_nonempty;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_study_days_nonempty
      CHECK (study_days IS NULL OR cardinality(study_days) > 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_profiles_study_days_distinct()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trig$
BEGIN
  IF NEW.study_days IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM unnest(NEW.study_days)) <>
       (SELECT COUNT(DISTINCT d) FROM unnest(NEW.study_days) AS d) THEN
      RAISE EXCEPTION 'study_days possui dias duplicados: %', NEW.study_days
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$trig$;

DROP TRIGGER IF EXISTS trg_profiles_study_days_distinct ON public.profiles;
CREATE TRIGGER trg_profiles_study_days_distinct
  BEFORE INSERT OR UPDATE OF study_days ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profiles_study_days_distinct();
