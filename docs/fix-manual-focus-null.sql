-- ========================================================================================
-- SCRIPT DE CORREÇÃO: FOCO 0% ARTIFICIAL → NULL
-- ----------------------------------------------------------------------------------------
-- Problema: sessões manuais/importadas (e cronômetros sem medição real) foram salvas no
-- passado com metadata.focus_percentage = 0. Ausência de dado NÃO é foco zero:
-- o correto é NULL (interface mostra "FOCO —").
--
-- REGRA DE EVIDÊNCIA: só removemos o 0 quando há prova de que ele foi criado
-- artificialmente. NUNCA alteramos:
--   - sessões com foco_score (autoavaliação real 1-5);
--   - cronômetros com pausas reais (active < duration → foco medido de verdade).
--
-- Obs.: (metadata->>'is_manual_mode') só existe em registros salvos após a action
-- passar a persistir essa flag; registros manuais antigos são capturados pela regra (c).
--
-- Execute no SQL Editor do Supabase (3 blocos, em ordem).
-- ========================================================================================

-- 1. PREVIEW: quantos registros serão corrigidos + amostra (SEM dados sensíveis)
SELECT
  count(*) AS registros_afetados,
  count(*) FILTER (WHERE origin_source IS NOT NULL) AS importadas,
  count(*) FILTER (WHERE (metadata->>'is_manual_mode') = 'true') AS manuais,
  count(*) FILTER (WHERE origin_source IS NULL AND (metadata->>'is_manual_mode') IS DISTINCT FROM 'true') AS outras_sem_medicao
FROM public.study_history
WHERE metadata IS NOT NULL
  AND (metadata->>'focus_percentage') ~ '^0(\.0+)?$'
  AND (
    -- Evidência de que o 0 é artificial:
    -- a) sessão importada (importações nunca gravam foco);
    -- b) sessão manual registrada;
    -- c) sem autoavaliação (focus_score NULL) E sem pausas (paused=0) E
    --    duração = tempo ativo → não houve medição de foco, só o "0" de criação.
    origin_source IS NOT NULL
    OR (metadata->>'is_manual_mode') = 'true'
    OR (
      focus_score IS NULL
      AND (paused_minutes IS NULL OR paused_minutes = 0)
      AND active_minutes = duration_minutes
    )
  );

-- 2. CORREÇÃO: remove a chave focus_percentage (ausência = NULL no frontend)
UPDATE public.study_history
SET metadata = metadata - 'focus_percentage'
WHERE metadata IS NOT NULL
  AND (metadata->>'focus_percentage') ~ '^0(\.0+)?$'
  AND (
    origin_source IS NOT NULL
    OR (metadata->>'is_manual_mode') = 'true'
    OR (
      focus_score IS NULL
      AND (paused_minutes IS NULL OR paused_minutes = 0)
      AND active_minutes = duration_minutes
    )
  );

-- 3. VERIFICAÇÃO FINAL (esperado: restantes_com_zero = 0)
SELECT
  count(*) FILTER (WHERE (metadata->>'focus_percentage') IS NOT NULL) AS sessoes_com_foco_informado,
  count(*) FILTER (WHERE (metadata->>'focus_percentage') ~ '^0(\.0+)?$') AS restantes_com_zero
FROM public.study_history;
