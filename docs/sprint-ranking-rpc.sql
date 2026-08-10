-- ========================================================================================
-- MIGRATION: Global Ranking RPC (FIXED v3)
-- Corrige: tabela question_attempts não existe, coluna full_name não existe
-- Execute no SQL Editor do Supabase
-- ========================================================================================

CREATE OR REPLACE FUNCTION public.get_global_ranking(
  p_period TEXT DEFAULT 'this_week',
  p_current_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_has_question_attempts BOOLEAN := FALSE;
BEGIN
  -- 1. Calcular datas (Segunda a Domingo, timezone America/Sao_Paulo)
  v_start_date := CASE 
    WHEN p_period = 'this_week' THEN (SELECT date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date)
    WHEN p_period = 'last_week' THEN (SELECT date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '7 days')
    ELSE NULL
  END;
  
  v_end_date := CASE 
    WHEN p_period = 'last_week' THEN (SELECT date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '1 millisecond')
    ELSE NULL
  END;

  -- 2. Verificar se tabela question_attempts existe
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'question_attempts'
  ) INTO v_has_question_attempts;

  -- 3. Agregar dados de study_history
  WITH history_agg AS (
    SELECT
      sh.user_id,
      COALESCE(SUM(sh.active_minutes), 0) + COALESCE(SUM(sh.duration_minutes), 0) AS total_minutes,
      COALESCE(SUM((sh.metadata->>'pages_read')::int), 0) AS total_pages,
      COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0) AS total_questions_meta
    FROM public.study_history sh
    WHERE (v_start_date IS NULL OR sh.started_at >= v_start_date)
      AND (v_end_date IS NULL OR sh.started_at <= v_end_date)
    GROUP BY sh.user_id
  ),
  -- question_attempts SÓ se a tabela existir
  attempts_agg AS (
    SELECT user_id, COUNT(*) AS questions_count
    FROM public.question_attempts qa
    WHERE v_has_question_attempts = TRUE
      AND (v_start_date IS NULL OR qa.answered_at >= v_start_date)
      AND (v_end_date IS NULL OR qa.answered_at <= v_end_date)
    GROUP BY qa.user_id
  ),
  -- Unir todos os user_ids com atividade
  user_ids AS (
    SELECT user_id FROM history_agg
    UNION
    SELECT user_id FROM attempts_agg
  ),
  -- Agregação unificada por usuário
  all_users AS (
    SELECT
      u.user_id AS id,
      COALESCE(
        (SELECT p.name FROM public.profiles p WHERE p.id = u.user_id),
        'Estudante #' || substring(u.user_id::text, 1, 4)
      ) AS name,
      COALESCE(
        (SELECT p.avatar_url FROM public.profiles p WHERE p.id = u.user_id),
        ''
      ) AS avatar,
      COALESCE((SELECT h.total_minutes FROM history_agg h WHERE h.user_id = u.user_id), 0) AS total_minutes,
      COALESCE((SELECT a.questions_count FROM attempts_agg a WHERE a.user_id = u.user_id), 0)
        + COALESCE((SELECT h.total_questions_meta FROM history_agg h WHERE h.user_id = u.user_id), 0) AS questions_count,
      COALESCE((SELECT h.total_pages FROM history_agg h WHERE h.user_id = u.user_id), 0) AS pages_count
    FROM user_ids u
  ),
  ranked AS (
    SELECT
      id,
      name,
      avatar,
      total_minutes,
      questions_count,
      pages_count,
      -- Iniciais
      CASE 
        WHEN name LIKE '% %' THEN upper(split_part(name, ' ', 1) || ' ' || split_part(name, ' ', array_length(string_to_array(name, ' '), 1)))
        ELSE upper(substring(name, 1, 2))
      END AS initials,
      -- Cor determinística baseada no ID
      CASE (hashtext(id::text) % 6)
        WHEN 0 THEN 'bg-blue-600'
        WHEN 1 THEN 'bg-emerald-600'
        WHEN 2 THEN 'bg-purple-600'
        WHEN 3 THEN 'bg-amber-600'
        WHEN 4 THEN 'bg-rose-600'
        ELSE 'bg-indigo-600'
      END AS bg_color,
      -- Rankings por métrica
      ROW_NUMBER() OVER (ORDER BY total_minutes DESC, questions_count DESC, pages_count DESC, id) AS rank_tempo,
      ROW_NUMBER() OVER (ORDER BY questions_count DESC, total_minutes DESC, pages_count DESC, id) AS rank_questions,
      ROW_NUMBER() OVER (ORDER BY pages_count DESC, total_minutes DESC, questions_count DESC, id) AS rank_pages
    FROM all_users
  ),
  formatted AS (
    SELECT
      id,
      name,
      avatar,
      initials,
      bg_color,
      total_minutes,
      questions_count,
      pages_count,
      rank_tempo,
      rank_questions,
      rank_pages,
      CASE 
        WHEN total_minutes = 0 THEN '0min'
        WHEN total_minutes < 60 THEN total_minutes || 'min'
        WHEN total_minutes % 60 = 0 THEN (total_minutes / 60) || 'h'
        ELSE floor(total_minutes / 60) || 'h ' || (total_minutes % 60) || 'min'
      END AS hours_formatted
    FROM ranked
  )
  SELECT jsonb_build_object(
    'totalParticipants', (SELECT COUNT(*) FROM formatted),
    'rankingTempo', (
      SELECT coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('rank', f.rank_tempo, 'hours', f.hours_formatted)), '[]'::jsonb)
      FROM formatted f
      ORDER BY f.rank_tempo
    ),
    'rankingQuestions', (
      SELECT coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('rank', f.rank_questions, 'hours', f.hours_formatted)), '[]'::jsonb)
      FROM formatted f
      ORDER BY f.rank_questions
    ),
    'rankingPages', (
      SELECT coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('rank', f.rank_pages, 'hours', f.hours_formatted)), '[]'::jsonb)
      FROM formatted f
      ORDER BY f.rank_pages
    ),
    'userStats', jsonb_build_object(
      'tempo', (
        SELECT jsonb_build_object(
          'rank', f.rank_tempo,
          'id', f.id,
          'name', CASE WHEN f.id = p_current_user_id THEN f.name || ' (Você)' ELSE f.name END,
          'avatar', f.avatar,
          'targetContest', 'Global',
          'hours', f.hours_formatted,
          'questions', f.questions_count,
          'pages', f.pages_count,
          'initials', f.initials,
          'bgColor', f.bg_color,
          'hasActivity', f.total_minutes > 0
        )
        FROM formatted f WHERE f.id = p_current_user_id
      ),
      'questoes', (
        SELECT jsonb_build_object(
          'rank', f.rank_questions,
          'id', f.id,
          'name', CASE WHEN f.id = p_current_user_id THEN f.name || ' (Você)' ELSE f.name END,
          'avatar', f.avatar,
          'targetContest', 'Global',
          'hours', f.hours_formatted,
          'questions', f.questions_count,
          'pages', f.pages_count,
          'initials', f.initials,
          'bgColor', f.bg_color,
          'hasActivity', f.questions_count > 0
        )
        FROM formatted f WHERE f.id = p_current_user_id
      ),
      'paginas', (
        SELECT jsonb_build_object(
          'rank', f.rank_pages,
          'id', f.id,
          'name', CASE WHEN f.id = p_current_user_id THEN f.name || ' (Você)' ELSE f.name END,
          'avatar', f.avatar,
          'targetContest', 'Global',
          'hours', f.hours_formatted,
          'questions', f.questions_count,
          'pages', f.pages_count,
          'initials', f.initials,
          'bgColor', f.bg_color,
          'hasActivity', f.pages_count > 0
        )
        FROM formatted f WHERE f.id = p_current_user_id
      )
    )
  ) AS result
  FROM (SELECT 1) dummy;
END;
$$;

-- Permissão
GRANT EXECUTE ON FUNCTION public.get_global_ranking(text, uuid) TO authenticated;