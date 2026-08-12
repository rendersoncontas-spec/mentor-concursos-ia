-- ========================================================================================
-- MIGRATION: Ranking Global - Períodos ampliados + navegação por semana (v7)
-- Adiciona suporte a:
--   p_period = 'today'        -> Hoje
--   p_period = 'this_week'    -> Esta semana (já existia)
--   p_period = 'last_week'    -> Semana passada (já existia)
--   p_period = 'this_month'   -> Este mês
--   p_period = 'general'      -> Histórico total (já existia)
--   p_week_offset             -> desloca a semana atual para trás
--                                (0 = esta, -1 = anterior, -2 = retrasada...)
-- Usado pela seção "Vencedores das semanas anteriores".
--
-- NÃO altera a lógica de cálculo (tempo/questões/páginas), nem a fonte de dados
-- (study_history), nem o desempate (ROW_NUMBER). Apenas amplia os períodos aceitos.
-- Execute no SQL Editor do Supabase.
-- ========================================================================================

-- Remove versões anteriores da função (assinatura antiga tinha apenas text, uuid)
DROP FUNCTION IF EXISTS public.get_global_ranking(text, uuid);

CREATE OR REPLACE FUNCTION public.get_global_ranking(
  p_period TEXT DEFAULT 'this_week',
  p_current_user_id UUID DEFAULT NULL,
  p_week_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  result JSONB;
BEGIN
  v_start_date := CASE
    WHEN p_period = 'today' THEN (SELECT date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo'))
    WHEN p_period = 'this_week' THEN (SELECT date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') + (p_week_offset * interval '7 days'))
    WHEN p_period = 'last_week' THEN (SELECT date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '7 days')
    WHEN p_period = 'this_month' THEN (SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'))
    ELSE NULL
  END;

  v_end_date := CASE
    WHEN p_period = 'last_week' THEN (SELECT date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '1 millisecond')
    -- Semanas anteriores (offset < 0): janela fechada de Segunda a Domingo
    WHEN p_period = 'this_week' AND p_week_offset < 0 THEN v_start_date + interval '7 days' - interval '1 millisecond'
    ELSE NULL
  END;

  WITH base AS (
    SELECT
      sh.user_id,
      SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0))::bigint AS total_minutes,
      COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0)::bigint AS questions_count,
      COALESCE(SUM((sh.metadata->>'pages_read')::int), 0)::bigint AS pages_count
    FROM public.study_history sh
    WHERE (v_start_date IS NULL OR sh.started_at >= v_start_date)
      AND (v_end_date IS NULL OR sh.started_at <= v_end_date)
    GROUP BY sh.user_id
    HAVING SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) > 0
  ),
  ranked AS (
    SELECT
      b.user_id,
      b.total_minutes,
      b.questions_count,
      b.pages_count,
      COALESCE(p.name, 'Estudante') AS name,
      NULL::text AS avatar_url,
      CASE
        WHEN p.name IS NOT NULL AND p.name LIKE '% %'
          THEN upper(substring(p.name, 1, 1) || substring(p.name, position(' ' in p.name)+1, 1))
        WHEN p.name IS NOT NULL AND length(p.name) >= 2
          THEN upper(substring(p.name, 1, 2))
        ELSE 'ES'
      END AS initials,
      CASE (hashtext(b.user_id::text) % 6)
        WHEN 0 THEN 'bg-blue-600'
        WHEN 1 THEN 'bg-emerald-600'
        WHEN 2 THEN 'bg-purple-600'
        WHEN 3 THEN 'bg-amber-600'
        WHEN 4 THEN 'bg-rose-600'
        ELSE 'bg-indigo-600'
      END AS bg_color,
      ROW_NUMBER() OVER (ORDER BY b.total_minutes DESC, b.questions_count DESC, b.pages_count DESC, b.user_id) AS rank_tempo,
      ROW_NUMBER() OVER (ORDER BY b.questions_count DESC, b.total_minutes DESC, b.pages_count DESC, b.user_id) AS rank_questions,
      ROW_NUMBER() OVER (ORDER BY b.pages_count DESC, b.total_minutes DESC, b.questions_count DESC, b.user_id) AS rank_pages,
      CASE
        WHEN COALESCE(b.total_minutes, 0) < 60 THEN COALESCE(b.total_minutes, 0) || 'min'
        WHEN COALESCE(b.total_minutes, 0) % 60 = 0 THEN (COALESCE(b.total_minutes, 0) / 60) || 'h'
        ELSE floor(COALESCE(b.total_minutes, 0) / 60) || 'h ' || (COALESCE(b.total_minutes, 0) % 60) || 'min'
      END AS hours,
      b.total_minutes AS display_minutes
    FROM base b
    LEFT JOIN public.profiles p ON p.id = b.user_id
  )
  SELECT jsonb_build_object(
    'totalParticipants', (SELECT COUNT(*) FROM ranked),
    'rankingTempo', (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object('rank', r.rank_tempo, 'hasActivity', r.total_minutes > 0) ORDER BY r.rank_tempo), '[]'::jsonb)
      FROM ranked r
    ),
    'rankingQuestions', (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object('rank', r.rank_questions, 'hasActivity', r.questions_count > 0) ORDER BY r.rank_questions), '[]'::jsonb)
      FROM ranked r
    ),
    'rankingPages', (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object('rank', r.rank_pages, 'hasActivity', r.pages_count > 0) ORDER BY r.rank_pages), '[]'::jsonb)
      FROM ranked r
    ),
    'userStats', jsonb_build_object(
      'tempo', (
        SELECT jsonb_build_object(
          'rank', r.rank_tempo, 'id', r.user_id,
          'name', CASE WHEN r.user_id = p_current_user_id THEN r.name || ' (Você)' ELSE r.name END,
          'avatar', COALESCE(r.avatar_url, ''), 'targetContest', 'Global',
          'hours', r.hours, 'totalMinutes', r.total_minutes,
          'questions', r.questions_count, 'pages', r.pages_count,
          'initials', r.initials, 'bgColor', r.bg_color,
          'hasActivity', r.total_minutes > 0
        )
        FROM ranked r WHERE r.user_id = p_current_user_id
      ),
      'questoes', (
        SELECT jsonb_build_object(
          'rank', r.rank_questions, 'id', r.user_id,
          'name', CASE WHEN r.user_id = p_current_user_id THEN r.name || ' (Você)' ELSE r.name END,
          'avatar', COALESCE(r.avatar_url, ''), 'targetContest', 'Global',
          'hours', r.hours, 'totalMinutes', r.total_minutes,
          'questions', r.questions_count, 'pages', r.pages_count,
          'initials', r.initials, 'bgColor', r.bg_color,
          'hasActivity', r.questions_count > 0
        )
        FROM ranked r WHERE r.user_id = p_current_user_id
      ),
      'paginas', (
        SELECT jsonb_build_object(
          'rank', r.rank_pages, 'id', r.user_id,
          'name', CASE WHEN r.user_id = p_current_user_id THEN r.name || ' (Você)' ELSE r.name END,
          'avatar', COALESCE(r.avatar_url, ''), 'targetContest', 'Global',
          'hours', r.hours, 'totalMinutes', r.total_minutes,
          'questions', r.questions_count, 'pages', r.pages_count,
          'initials', r.initials, 'bgColor', r.bg_color,
          'hasActivity', r.pages_count > 0
        )
        FROM ranked r WHERE r.user_id = p_current_user_id
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_ranking(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_ranking(text, uuid, integer) TO anon;

COMMENT ON FUNCTION public.get_global_ranking IS 'Ranking global que agrega dados de todos os usuários por período. v7 - suporta hoje, este mês e navegação entre semanas (p_week_offset).';

-- Verificação (execute separadamente):
-- SELECT get_global_ranking('this_week', NULL, 0);
-- SELECT get_global_ranking('today', NULL, 0);
-- SELECT get_global_ranking('this_month', NULL, 0);
-- SELECT get_global_ranking('general', NULL, 0);
-- SELECT get_global_ranking('this_week', NULL, -1);