-- Nova RPC: conta quantos dias e quantas semanas o usuário já ficou em
-- 1º lugar no ranking de TEMPO (mesma métrica/empate de get_global_ranking:
-- total_minutes desc, questions_count desc, pages_count desc, user_id como
-- desempate final — garante exatamente um líder por dia/semana, igual ao
-- resto do ranking).
--
-- Totalmente retroativo: agrupa o histórico já existente (study_history) por
-- dia e por semana (fuso America/Sao_Paulo), então não depende de nenhuma
-- tabela nova de snapshot nem de cron — o contador já nasce com dados reais
-- e se autocorrige se uma sessão antiga for editada/excluída depois.

CREATE OR REPLACE FUNCTION public.get_ranking_top1_counts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_at_top INT := 0;
  v_weeks_at_top INT := 0;
BEGIN
  WITH day_totals AS (
    SELECT
      sh.user_id,
      (date_trunc('day', sh.started_at AT TIME ZONE 'America/Sao_Paulo'))::date AS period_key,
      SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0))::bigint AS total_minutes,
      COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0)::bigint AS questions_count,
      COALESCE(SUM((sh.metadata->>'pages_read')::int), 0)::bigint AS pages_count
    FROM public.study_history sh
    GROUP BY sh.user_id, period_key
    HAVING SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) > 0
  ),
  day_ranked AS (
    SELECT
      user_id,
      period_key,
      ROW_NUMBER() OVER (
        PARTITION BY period_key
        ORDER BY total_minutes DESC, questions_count DESC, pages_count DESC, user_id
      ) AS rnk
    FROM day_totals
  ),
  week_totals AS (
    SELECT
      sh.user_id,
      (date_trunc('week', sh.started_at AT TIME ZONE 'America/Sao_Paulo'))::date AS period_key,
      SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0))::bigint AS total_minutes,
      COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0)::bigint AS questions_count,
      COALESCE(SUM((sh.metadata->>'pages_read')::int), 0)::bigint AS pages_count
    FROM public.study_history sh
    GROUP BY sh.user_id, period_key
    HAVING SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) > 0
  ),
  week_ranked AS (
    SELECT
      user_id,
      period_key,
      ROW_NUMBER() OVER (
        PARTITION BY period_key
        ORDER BY total_minutes DESC, questions_count DESC, pages_count DESC, user_id
      ) AS rnk
    FROM week_totals
  )
  SELECT
    COALESCE((SELECT COUNT(*) FROM day_ranked WHERE user_id = p_user_id AND rnk = 1), 0),
    COALESCE((SELECT COUNT(*) FROM week_ranked WHERE user_id = p_user_id AND rnk = 1), 0)
  INTO v_days_at_top, v_weeks_at_top;

  RETURN jsonb_build_object(
    'daysAtTop', v_days_at_top,
    'weeksAtTop', v_weeks_at_top
  );
END;
$$;
