-- ========================================================================================
-- MIGRATION: Perfil Público de Estudos do Ranking (get_public_study_profile)
-- Retorna dados agregados de estudo para o modal de perfil público ao clicar no ranking.
--
-- REGRAS DE PRIVACIDADE:
-- 1. Se o usuário configurou perfil privado (preferences->>'publicProfile' = 'false')
--    e quem está consultando NÃO é o próprio usuário, retorna somente identificação pública
--    (nome, avatar/iniciais, cargo) com is_private = true e estatísticas vazias.
-- 2. O próprio usuário (p_current_user_id = p_target_user_id) SEMPRE visualiza seu perfil completo.
-- 3. NENHUM dado sensível (e-mail, telefone, anotações, tópicos privados) é retornado.
--
-- Execute no SQL Editor do Supabase como statement único.
-- ========================================================================================

CREATE OR REPLACE FUNCTION public.get_public_study_profile(
  p_target_user_id UUID,
  p_current_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_self BOOLEAN;
  v_is_private BOOLEAN;
  v_profile RECORD;
  v_public_name TEXT;
  v_avatar_url TEXT;
  v_initials TEXT;
  v_bg_color TEXT;
  v_stats JSONB;
  v_top_disciplines JSONB;
  v_recent_activities JSONB;
  v_total_minutes BIGINT := 0;
  v_total_questions BIGINT := 0;
  v_correct_questions BIGINT := 0;
  v_this_week_minutes BIGINT := 0;
  v_last_week_minutes BIGINT := 0;
  v_avg_focus NUMERIC := NULL;
  v_start_this_week TIMESTAMPTZ;
  v_start_last_week TIMESTAMPTZ;
BEGIN
  v_is_self := (p_current_user_id IS NOT NULL AND p_current_user_id = p_target_user_id);

  -- 1. Busca perfil do usuário alvo
  SELECT
    p.id,
    p.name,
    p.full_name,
    p.nickname,
    p.avatar_url,
    p.preferences
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_target_user_id;

  IF NOT FOUND THEN
    -- Fallback se perfil não existir na tabela
    RETURN jsonb_build_object(
      'id', p_target_user_id,
      'name', 'Estudante',
      'avatarUrl', NULL,
      'initials', 'ES',
      'bgColor', 'bg-blue-600',
      'targetContest', 'Concurseiro',
      'isPrivate', NOT v_is_self,
      'isSelf', v_is_self,
      'stats', NULL,
      'topDisciplines', '[]'::jsonb,
      'recentActivities', '[]'::jsonb
    );
  END IF;

  -- 2. Avalia privacidade
  v_is_private := (
    NOT v_is_self AND
    COALESCE((v_profile.preferences->>'publicProfile')::boolean, true) = false
  );

  -- 3. Define nome público e avatar
  v_public_name := COALESCE(
    CASE
      WHEN v_profile.preferences->>'nameType' = 'apelido' AND v_profile.nickname IS NOT NULL AND v_profile.nickname <> ''
        THEN v_profile.nickname
      ELSE COALESCE(v_profile.name, v_profile.full_name)
    END,
    'Estudante'
  );

  v_avatar_url := CASE
    WHEN v_profile.preferences->>'avatarType' = 'iniciais' THEN NULL
    ELSE v_profile.avatar_url
  END;

  v_initials := CASE
    WHEN v_public_name LIKE '% %'
      THEN upper(substring(v_public_name, 1, 1) || substring(v_public_name, position(' ' in v_public_name)+1, 1))
    WHEN length(v_public_name) >= 2
      THEN upper(substring(v_public_name, 1, 2))
    ELSE 'ES'
  END;

  v_bg_color := CASE (hashtext(p_target_user_id::text) % 6)
    WHEN 0 THEN 'bg-blue-600'
    WHEN 1 THEN 'bg-emerald-600'
    WHEN 2 THEN 'bg-purple-600'
    WHEN 3 THEN 'bg-amber-600'
    WHEN 4 THEN 'bg-rose-600'
    ELSE 'bg-indigo-600'
  END;

  -- Se perfil privado para terceiros, encerra retornando apenas identificação
  IF v_is_private THEN
    RETURN jsonb_build_object(
      'id', p_target_user_id,
      'name', v_public_name,
      'avatarUrl', v_avatar_url,
      'initials', v_initials,
      'bgColor', v_bg_color,
      'targetContest', 'Concurseiro',
      'isPrivate', true,
      'isSelf', false,
      'stats', NULL,
      'topDisciplines', '[]'::jsonb,
      'recentActivities', '[]'::jsonb
    );
  END IF;

  -- 4. Janelas de tempo para evolução semanal
  v_start_this_week := date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo');
  v_start_last_week := v_start_this_week - interval '7 days';

  -- 5. Métricas agregadas de estudo
  SELECT
    COALESCE(SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)), 0),
    COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0),
    COALESCE(SUM((sh.metadata->>'questions_correct')::int), 0),
    COALESCE(SUM(CASE WHEN sh.started_at >= v_start_this_week THEN COALESCE(sh.active_minutes, sh.duration_minutes, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN sh.started_at >= v_start_last_week AND sh.started_at < v_start_this_week THEN COALESCE(sh.active_minutes, sh.duration_minutes, 0) ELSE 0 END), 0),
    AVG(CASE WHEN COALESCE(sh.focus_percentage, sh.focus_score, (sh.metadata->>'focus_percentage')::int) > 0 THEN COALESCE(sh.focus_percentage, sh.focus_score, (sh.metadata->>'focus_percentage')::int) ELSE NULL END)
  INTO
    v_total_minutes,
    v_total_questions,
    v_correct_questions,
    v_this_week_minutes,
    v_last_week_minutes,
    v_avg_focus
  FROM public.study_history sh
  WHERE sh.user_id = p_target_user_id;

  -- Top 5 disciplinas
  SELECT COALESCE(jsonb_agg(d_row), '[]'::jsonb)
  INTO v_top_disciplines
  FROM (
    SELECT
      COALESCE(d.id::text, sh.discipline_id::text, 'geral') AS "disciplineId",
      COALESCE(d.name, 'Estudos Gerais') AS "disciplineName",
      SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0))::int AS "studiedMinutes",
      CASE
        WHEN SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) < 60
          THEN SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) || 'min'
        WHEN SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) % 60 = 0
          THEN (SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) / 60) || 'h'
        ELSE (floor(SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) / 60)) || 'h ' || (SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) % 60) || 'min'
      END AS "formattedDuration",
      COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0)::int AS "totalQuestions",
      COALESCE(SUM((sh.metadata->>'questions_correct')::int), 0)::int AS "correctQuestions",
      CASE
        WHEN COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0) > 0
          THEN round((COALESCE(SUM((sh.metadata->>'questions_correct')::int), 0)::numeric / SUM((sh.metadata->>'questions_answered')::int)::numeric) * 100)
        ELSE NULL
      END AS "accuracyPercentage"
    FROM public.study_history sh
    LEFT JOIN public.disciplines d ON d.id = sh.discipline_id
    WHERE sh.user_id = p_target_user_id
    GROUP BY d.id, d.name, sh.discipline_id
    HAVING SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) > 0 OR COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0) > 0
    ORDER BY "studiedMinutes" DESC
    LIMIT 5
  ) d_row;

  -- Últimas 5 atividades (somente campos públicos)
  SELECT COALESCE(jsonb_agg(act_row), '[]'::jsonb)
  INTO v_recent_activities
  FROM (
    SELECT
      sh.id,
      COALESCE(d.name, 'Estudos Gerais') AS "disciplineName",
      COALESCE(sh.active_minutes, sh.duration_minutes, 0)::int AS "studiedMinutes",
      CASE
        WHEN COALESCE(sh.active_minutes, sh.duration_minutes, 0) < 60
          THEN COALESCE(sh.active_minutes, sh.duration_minutes, 0) || 'min'
        WHEN COALESCE(sh.active_minutes, sh.duration_minutes, 0) % 60 = 0
          THEN (COALESCE(sh.active_minutes, sh.duration_minutes, 0) / 60) || 'h'
        ELSE (floor(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) / 60) || 'h ' || (COALESCE(sh.active_minutes, sh.duration_minutes, 0) % 60) || 'min'
      END AS "formattedDuration",
      CASE
        WHEN date_trunc('day', sh.started_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') THEN 'Hoje'
        WHEN date_trunc('day', sh.started_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('day', (now() - interval '1 day') AT TIME ZONE 'America/Sao_Paulo') THEN 'Ontem'
        ELSE to_char(sh.started_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
      END AS "relativeDateLabel",
      sh.started_at AS "dateIso"
    FROM public.study_history sh
    LEFT JOIN public.disciplines d ON d.id = sh.discipline_id
    WHERE sh.user_id = p_target_user_id AND COALESCE(sh.active_minutes, sh.duration_minutes, 0) > 0
    ORDER BY sh.started_at DESC
    LIMIT 5
  ) act_row;

  -- Monta objeto final
  v_stats := jsonb_build_object(
    'totalMinutes', v_total_minutes,
    'formattedHours', CASE
      WHEN v_total_minutes < 60 THEN v_total_minutes || 'min'
      WHEN v_total_minutes % 60 = 0 THEN (v_total_minutes / 60) || 'h'
      ELSE (floor(v_total_minutes / 60)) || 'h ' || (v_total_minutes % 60) || 'min'
    END,
    'currentStreak', 0,
    'longestStreak', 0,
    'totalQuestions', v_total_questions,
    'correctQuestions', v_correct_questions,
    'wrongQuestions', GREATEST(0, v_total_questions - v_correct_questions),
    'accuracyPercentage', CASE WHEN v_total_questions > 0 THEN round((v_correct_questions::numeric / v_total_questions::numeric) * 100) ELSE NULL END,
    'averageFocusPercentage', CASE WHEN v_avg_focus IS NOT NULL THEN round(v_avg_focus) ELSE NULL END,
    'thisWeekMinutes', v_this_week_minutes,
    'lastWeekMinutes', v_last_week_minutes
  );

  RETURN jsonb_build_object(
    'id', p_target_user_id,
    'name', v_public_name,
    'avatarUrl', v_avatar_url,
    'initials', v_initials,
    'bgColor', v_bg_color,
    'targetContest', 'Concurseiro',
    'isPrivate', false,
    'isSelf', v_is_self,
    'stats', v_stats,
    'topDisciplines', v_top_disciplines,
    'recentActivities', v_recent_activities
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_study_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_study_profile(UUID, UUID) TO anon;

COMMENT ON FUNCTION public.get_public_study_profile IS 'Retorna dados de desempenho de estudos públicos para exibição no ranking respeitando configurações de privacidade.';
