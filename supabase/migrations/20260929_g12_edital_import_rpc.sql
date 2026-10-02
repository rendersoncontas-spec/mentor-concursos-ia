-- ============================================================================
-- G1.2 (G-26) — import de edital ATÔMICO via RPC transacional.
--
-- Problema: persistEditalImport + mergeCustomTopics eram N writes
-- independentes (meio-import possível; retry após merge falho caía em
-- "already imported" sem tópicos mesclados).
--
-- Arquitetura (decisão documentada):
-- - Fase 1 fica no JS: resolve/cria linhas GLOBAIS de catálogo
--   (disciplines/topics/subtopics, dedupe-safe, reaproveitáveis) e monta o
--   payload com IDs já resolvidos pela chave canônica exata do JS.
-- - Fase 2 é ESTA função: valida tudo de novo (nunca confia no cliente) e
--   executa os writes de USUÁRIO (links + user_editais + merge no target)
--   em UMA transação. Falha em qualquer ponto → rollback total, zero
--   estado parcial visível.
-- - SECURITY INVOKER (RLS do chamador vale para cada statement) +
--   checagem explícita auth.uid()/ownership. EXECUTE só para `authenticated`
--   (nenhuma policy depende desta função, ao contrário de get_user_role).
--
-- Payload p_payload:
-- {
--   "file_hash": "<sha256 hex>", "file_name": "...",
--   "edital": {"name","organizer","position_name","banca","exam_date",
--              "publication_date","registration_date","original_filename",
--              "structure": [...]},
--   "links": [{"discipline_id":"uuid","discipline_name":"...",
--              "topics":[{"topic_id":"uuid","title":"..."}]}]
-- }
-- Retorno: {"ok":true,"edital_id","disciplines","topics"} ou
-- {"ok":false,"code":"duplicate","edital_id"}. Demais falhas: EXCEPTION
-- g12_not_authenticated / g12_target_not_found / g12_invalid_payload.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_edital_import(p_target_id UUID, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_user UUID := auth.uid();
  v_links JSONB;
  v_edital JSONB;
  v_file_hash TEXT;
  v_existing_id UUID;
  v_editais_row JSONB;
  v_meta JSONB;
  v_custom JSONB;
  v_disc JSONB;
  v_topics JSONB;
  v_topic JSONB;
  v_title TEXT;
  v_existing_topics JSONB;
  v_titles TEXT[];
  v_raw TEXT;
  v_merged JSONB := '[]'::jsonb;
  v_n_topics INT := 0;
  v_n INT;
  v_sub JSONB;
  v_stitle TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'g12_not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.user_targets WHERE id = p_target_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'g12_target_not_found' USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_file_hash := NULLIF(btrim(p_payload->>'file_hash'), '');
  IF v_file_hash IS NULL OR v_file_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_links := p_payload->'links';
  IF v_links IS NULL OR jsonb_typeof(v_links) <> 'array'
     OR jsonb_array_length(v_links) < 1 OR jsonb_array_length(v_links) > 200 THEN
    RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_edital := COALESCE(p_payload->'edital', '{}'::jsonb);
  IF jsonb_typeof(v_edital) <> 'object' THEN
    RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
  END IF;

  -- Idempotência (UNIQUE(user_id, file_hash) torna a corrida segura: a
  -- segunda transação concorrente falha no INSERT e o chamador trata como
  -- duplicata; aqui o caminho normal retorna o id existente).
  SELECT id INTO v_existing_id FROM public.user_editais
  WHERE user_id = v_user AND file_hash = v_file_hash;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'edital_id', v_existing_id);
  END IF;

  -- Validação estrita de CADA link antes de qualquer write.
  FOR v_disc IN SELECT * FROM jsonb_array_elements(v_links) LOOP
    IF jsonb_typeof(v_disc) <> 'object'
       OR (v_disc->>'discipline_id') IS NULL
       OR (v_disc->>'discipline_id')::text !~ '^[0-9a-fA-F-]{36}$' THEN
      RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.disciplines WHERE id = (v_disc->>'discipline_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
    END IF;
    v_topics := COALESCE(v_disc->'topics', '[]'::jsonb);
    IF jsonb_typeof(v_topics) <> 'array' OR jsonb_array_length(v_topics) > 500 THEN
      RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
    END IF;
    FOR v_topic IN SELECT * FROM jsonb_array_elements(v_topics) LOOP
      v_title := NULLIF(btrim(v_topic->>'title'), '');
      IF v_title IS NULL OR char_length(v_title) > 320
         OR (v_topic->>'topic_id') IS NULL THEN
        RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
      END IF;
      v_sub := COALESCE(v_topic->'subtopics', '[]'::jsonb);
      IF jsonb_typeof(v_sub) <> 'array' OR jsonb_array_length(v_sub) > 300 THEN
        RAISE EXCEPTION 'g12_invalid_payload' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  -- 1) vínculos pessoais (idempotente por ON CONFLICT).
  INSERT INTO public.user_disciplines (user_id, target_id, discipline_id, status, mastery_level)
  SELECT v_user, p_target_id, (d->>'discipline_id')::uuid, 'NOT_STARTED', 0
  FROM jsonb_array_elements(v_links) AS d
  ON CONFLICT (user_id, target_id, discipline_id) DO NOTHING;

  -- 2) registro do edital importado.
  INSERT INTO public.user_editais (
    user_id, name, organizer, position_name, banca,
    exam_date, publication_date, registration_date,
    source, original_filename, file_hash, structure
  ) VALUES (
    v_user,
    COALESCE(left(NULLIF(btrim(v_edital->>'name'), ''), 255), 'Edital importado'),
    left(NULLIF(btrim(v_edital->>'organizer'), ''), 120),
    left(NULLIF(btrim(v_edital->>'position_name'), ''), 120),
    left(NULLIF(btrim(v_edital->>'banca'), ''), 120),
    NULLIF(v_edital->>'exam_date', '')::date,
    NULLIF(v_edital->>'publication_date', '')::date,
    NULLIF(v_edital->>'registration_date', '')::date,
    'edital_import',
    left(NULLIF(btrim(p_payload->>'file_name'), ''), 255),
    v_file_hash,
    COALESCE(p_payload->'structure', '[]'::jsonb)
  )
  RETURNING id INTO v_existing_id;

  -- 3) merge dos tópicos no customEdital do target (só ADICIONA o ausente;
  -- comparação por título aparado em minúsculas — aproximação documentada,
  -- autoconsistente a partir daqui, sem ressuscitar duplicata).
  SELECT main_study_source INTO v_raw FROM public.user_targets
  WHERE id = p_target_id AND user_id = v_user;
  BEGIN
    v_meta := NULLIF(v_raw, '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_meta := '{}'::jsonb;
  END;
  IF v_meta IS NULL OR jsonb_typeof(v_meta) <> 'object' THEN
    v_meta := '{}'::jsonb;
  END IF;
  v_custom := v_meta->'customEdital';
  IF v_custom IS NULL OR jsonb_typeof(v_custom) <> 'object' THEN
    v_custom := '{}'::jsonb;
  END IF;

  FOR v_disc IN SELECT * FROM jsonb_array_elements(v_links) LOOP
    v_existing_topics := v_custom->(v_disc->>'discipline_id');
    IF v_existing_topics IS NULL OR jsonb_typeof(v_existing_topics) <> 'array' THEN
      v_existing_topics := '[]'::jsonb;
    END IF;
    SELECT array_agg(lower(btrim(t->>'title'))) INTO v_titles
    FROM jsonb_array_elements(v_existing_topics) AS t;
    v_titles := COALESCE(v_titles, '{}');
    v_merged := v_existing_topics;
    v_n := jsonb_array_length(v_existing_topics);
    FOR v_topic IN SELECT * FROM jsonb_array_elements(COALESCE(v_disc->'topics', '[]'::jsonb)) LOOP
      v_title := btrim(v_topic->>'title');
      v_stitle := lower(v_title);
      IF NOT (v_titles @> ARRAY[v_stitle]) THEN
        v_n := v_n + 1;
        v_merged := v_merged || jsonb_build_object(
          'id', v_topic->>'topic_id',
          'number', v_n,
          'title', v_title,
          'correct', 0, 'wrong', 0, 'questions', 0, 'accuracy', 0,
          'lastStudy', NULL, 'studyCount', 0, 'link', NULL
        );
        v_titles := v_titles || v_stitle;
      END IF;
      v_n_topics := v_n_topics + 1;
    END LOOP;
    v_custom := jsonb_set(v_custom, ARRAY[v_disc->>'discipline_id'], v_merged);
  END LOOP;
  v_meta := jsonb_set(v_meta, '{customEdital}', v_custom);

  UPDATE public.user_targets
  SET main_study_source = v_meta::text
  WHERE id = p_target_id AND user_id = v_user;

  RETURN jsonb_build_object(
    'ok', true,
    'edital_id', v_existing_id,
    'disciplines', jsonb_array_length(v_links),
    'topics', v_n_topics
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.confirm_edital_import(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_edital_import(UUID, JSONB) TO authenticated;
