-- ============================================================================
-- G1.4 — unicidade de plano ACTIVE + RPC com archive-before-insert.
--
-- Bug comprovado (G1.4, teste em transação com rollback, app-equivalente):
-- `activatePlanAction`/`togglePausePlanAction` fazem
--   1) UPDATE todos → ARCHIVED;
--   2) UPDATE um → ACTIVE;
-- em DUAS escritas sem transação. O interleave A1,B1,A2,B2 de duas
-- ativações concorrentes termina com DOIS planos ACTIVE (demonstrado:
-- n_active=2, sem nenhum guard no catálogo).
--
-- Correção mínima, no banco (cobre RPC + actions sem refatorar código):
-- 1) índice único parcial: no máximo 1 ACTIVE por usuário. Corrida passa
--    a retornar 23505 honesto em vez de corromper estado;
-- 2) `generate_study_plan_atomic` arquiva ANTES de inserir (antes inseria
--    e depois arquivava — com o índice novo, a ordem antiga quebraria
--    TODA geração sequencial). Com archive-first, geração concorrente
--    converge deterministicamente: o primeiro a commitar vence, o outro
--    recebe 23505 e o retry funciona (G1.3.2 retry comprovado).
--
-- Pré-check executado: no máximo 1 ACTIVE por usuário (3 usuários × 1).
-- Idempotente.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_study_plans_single_active
  ON public.study_plans (user_id)
  WHERE active IS TRUE;

CREATE OR REPLACE FUNCTION public.generate_study_plan_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_user UUID := auth.uid();
  v_target_id UUID;
  v_profile JSONB;
  v_replace JSONB;
  v_plan JSONB;
  v_items JSONB;
  v_hours INT;
  v_exp TEXT;
  v_d JSONB;
  v_it JSONB;
  v_version INT;
  v_plan_id UUID;
  v_plan_name TEXT;
  v_target_exam TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'g21_not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
  END IF;

  IF (p_payload->>'target_id') IS NOT NULL THEN
    BEGIN
      v_target_id := (p_payload->>'target_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
    END;
    PERFORM 1 FROM public.user_targets WHERE id = v_target_id AND user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'g21_target_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 1) prefs do perfil (seção opcional; UPDATE own).
  v_profile := p_payload->'profile';
  IF v_profile IS NOT NULL THEN
    IF jsonb_typeof(v_profile) <> 'object' THEN
      RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
    END IF;
    IF (v_profile->>'weekly_study_hours') IS NOT NULL THEN
      v_hours := (v_profile->>'weekly_study_hours')::int;
      IF v_hours < 1 OR v_hours > 168 THEN
        RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
      END IF;
      UPDATE public.profiles SET weekly_study_hours = v_hours WHERE id = v_user;
    END IF;
    IF (v_profile->>'experience_level') IS NOT NULL THEN
      v_exp := btrim(v_profile->>'experience_level');
      IF v_exp NOT IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED') THEN
        RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
      END IF;
      UPDATE public.profiles SET experience_level = v_exp WHERE id = v_user;
    END IF;
  END IF;

  -- 2) troca de vínculos (seção opcional; exige target).
  v_replace := p_payload->'replace_disciplines';
  IF v_replace IS NOT NULL THEN
    IF v_target_id IS NULL OR jsonb_typeof(v_replace) <> 'array' THEN
      RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
    END IF;
    FOR v_d IN SELECT * FROM jsonb_array_elements(v_replace) LOOP
      IF jsonb_typeof(v_d) <> 'object' OR (v_d->>'discipline_id') IS NULL THEN
        RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
      END IF;
      PERFORM 1 FROM public.disciplines WHERE id = (v_d->>'discipline_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    DELETE FROM public.user_disciplines WHERE user_id = v_user AND target_id = v_target_id;
    INSERT INTO public.user_disciplines (user_id, target_id, discipline_id, status)
    SELECT v_user, v_target_id, (d->>'discipline_id')::uuid, 'STUDYING'
    FROM jsonb_array_elements(v_replace) AS d
    ON CONFLICT (user_id, target_id, discipline_id) DO NOTHING;
  END IF;

  -- 3) plano + itens (atômicos entre si e com o resto).
  v_plan := p_payload->'plan';
  v_items := p_payload->'items';
  IF v_plan IS NULL OR jsonb_typeof(v_plan) <> 'object'
     OR v_items IS NULL OR jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_items) < 1 OR jsonb_array_length(v_items) > 2000 THEN
    RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
  END IF;
  IF (v_plan->>'weekly_minutes')::int IS NULL
     OR (v_plan->>'weekly_minutes')::int <= 0 THEN
    RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
  END IF;
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_it->>'discipline_id') IS NULL
       OR (v_it->>'day_of_week')::int IS NULL
       OR (v_it->>'day_of_week')::int < 0 OR (v_it->>'day_of_week')::int > 6
       OR (v_it->>'duration_minutes')::int IS NULL
       OR (v_it->>'duration_minutes')::int <= 0 THEN
      RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.disciplines WHERE id = (v_it->>'discipline_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'g21_invalid_payload' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- G1.4: arquiva ANTES de inserir (antes era depois). Com o índice
  -- uq_study_plans_single_active, inserir ACTIVE com outro ACTIVE
  -- pendente violaria a unicidade até na geração sequencial — e em
  -- geração concorrente o perdedor recebe 23505 em vez de gerar
  -- meio-plano ou ACTIVE duplicado.
  UPDATE public.study_plans
  SET active = false, status = 'ARCHIVED', archived_at = timezone('utc', now())
  WHERE user_id = v_user AND active IS TRUE;

  SELECT count(*) + 1 INTO v_version FROM public.study_plans WHERE user_id = v_user;
  SELECT target_exam INTO v_target_exam FROM public.user_targets
  WHERE user_id = v_user AND is_active IS TRUE
  ORDER BY created_at DESC LIMIT 1;

  v_plan_name := COALESCE(v_target_exam, 'Plano de Estudos') || ' — v' || v_version::text;

  INSERT INTO public.study_plans (
    user_id, version, name, plan_type, status, weekly_minutes,
    generated_reason, active, start_date
  ) VALUES (
    v_user, v_version, v_plan_name,
    COALESCE(NULLIF(btrim(v_plan->>'plan_type'), ''), 'CRONOGRAMA_SEMANAL'),
    'ACTIVE',
    (v_plan->>'weekly_minutes')::int,
    COALESCE(NULLIF(btrim(v_plan->>'reason'), ''), 'manual'),
    true,
    NULLIF(v_plan->>'start_date', '')::date
  )
  RETURNING id INTO v_plan_id;

  INSERT INTO public.study_plan_items (
    study_plan_id, discipline_id, day_of_week, duration_minutes,
    priority, priority_score, recommended_sessions
  )
  SELECT
    v_plan_id,
    (i->>'discipline_id')::uuid,
    (i->>'day_of_week')::int,
    (i->>'duration_minutes')::int,
    COALESCE((i->>'priority')::int, 1),
    COALESCE((i->>'priority_score')::numeric, 0),
    COALESCE((i->>'recommended_sessions')::int, 1)
  FROM jsonb_array_elements(v_items) AS i;

  RETURN jsonb_build_object('plan_id', v_plan_id, 'version', v_version);
END;
$func$;

REVOKE ALL ON FUNCTION public.generate_study_plan_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_study_plan_atomic(JSONB) TO authenticated;
