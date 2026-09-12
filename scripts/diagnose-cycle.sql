-- ============================================================
-- DIAGNÓSTICO COMPLETO DO CICLO - SOMENTE LEITURA
-- Copie e cole cada bloco separadamente no Supabase SQL Editor
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- BLOCO 1: CICLO ATIVO
-- ════════════════════════════════════════════════════════════
SELECT
  id,
  name,
  created_at,
  status,
  current_item_index,
  current_round,
  total_rounds_done,
  current_item_progress_min,
  user_id
FROM study_cycles
WHERE status = 'ACTIVE'
ORDER BY created_at DESC
LIMIT 5;

-- ════════════════════════════════════════════════════════════
-- BLOCO 2: ITENS DO CICLO (substitua <CYCLE_ID> pelo id do Bloco 1)
-- ════════════════════════════════════════════════════════════
SELECT
  sci.id AS cycle_item_id,
  sci.discipline_id,
  sci."order",
  sci.planned_minutes,
  d.name AS discipline_name
FROM study_cycle_items sci
LEFT JOIN disciplines d ON d.id = sci.discipline_id
WHERE sci.cycle_id = '<CYCLE_ID>'
ORDER BY sci."order" ASC;

-- ════════════════════════════════════════════════════════════
-- BLOCO 3: SESSIONS ATUAIS DO CICLO
-- ════════════════════════════════════════════════════════════
SELECT
  scs.id,
  scs.cycle_item_id,
  scs.study_history_id,
  scs.round_number,
  scs.minutes_contributed,
  scs.extra_minutes,
  scs.discipline_id,
  scs.created_at
FROM study_cycle_sessions scs
WHERE scs.cycle_id = '<CYCLE_ID>'
ORDER BY scs.created_at ASC;

-- ════════════════════════════════════════════════════════════
-- BLOCO 4: TOTAL POR MATÉRIA NAS SESSIONS
-- ════════════════════════════════════════════════════════════
SELECT
  sci."order",
  d.name AS materia,
  sci.planned_minutes AS meta,
  COUNT(scs.id) AS num_sessoes,
  COALESCE(SUM(scs.minutes_contributed), 0) AS total_contribuido,
  COALESCE(SUM(scs.extra_minutes), 0) AS total_extra,
  COALESCE(SUM(scs.minutes_contributed + scs.extra_minutes), 0) AS total_geral
FROM study_cycle_items sci
LEFT JOIN disciplines d ON d.id = sci.discipline_id
LEFT JOIN study_cycle_sessions scs ON scs.cycle_item_id = sci.id
WHERE sci.cycle_id = '<CYCLE_ID>'
GROUP BY sci.id, sci."order", d.name, sci.planned_minutes
ORDER BY sci."order" ASC;

-- ════════════════════════════════════════════════════════════
-- BLOCO 5: HISTÓRICO REAL DE ESTUDOS (desde criação do ciclo)
-- Primeiro busque a created_at do ciclo:
-- ════════════════════════════════════════════════════════════
SELECT created_at FROM study_cycles WHERE id = '<CYCLE_ID>';

-- Agora busque os estudos (substitua <USER_ID> e <CYCLE_CREATED_AT>):
SELECT
  sh.id AS study_id,
  sh.started_at,
  sh.duration_minutes,
  sh.source,
  sh.type,
  sh.discipline_id,
  d.name AS discipline_name
FROM study_history sh
LEFT JOIN disciplines d ON d.id = sh.discipline_id
WHERE sh.user_id = '<USER_ID>'
  AND sh.duration_minutes > 0
  AND sh.started_at >= '<CYCLE_CREATED_AT>'
ORDER BY sh.started_at ASC;

-- ════════════════════════════════════════════════════════════
-- BLOCO 6: HISTÓRICO AGRUPADO POR MATÉRIA
-- ════════════════════════════════════════════════════════════
SELECT
  d.name AS materia,
  COUNT(sh.id) AS num_estudos,
  SUM(sh.duration_minutes) AS total_minutos
FROM study_history sh
LEFT JOIN disciplines d ON d.id = sh.discipline_id
WHERE sh.user_id = '<USER_ID>'
  AND sh.duration_minutes > 0
  AND sh.started_at >= '<CYCLE_CREATED_AT>'
GROUP BY d.name
ORDER BY total_minutos DESC;

-- ════════════════════════════════════════════════════════════
-- BLOCO 7: COMPARAÇÃO - HISTÓRICO vs SESSIONS
-- Mostra se existem discrepancies
-- ════════════════════════════════════════════════════════════
WITH historico AS (
  SELECT
    sh.discipline_id,
    SUM(sh.duration_minutes) AS hist_total
  FROM study_history sh
  WHERE sh.user_id = '<USER_ID>'
    AND sh.duration_minutes > 0
    AND sh.started_at >= '<CYCLE_CREATED_AT>'
  GROUP BY sh.discipline_id
),
sessoes AS (
  SELECT
    scs.discipline_id,
    SUM(scs.minutes_contributed + scs.extra_minutes) AS sess_total
  FROM study_cycle_sessions scs
  WHERE scs.cycle_id = '<CYCLE_ID>'
  GROUP BY scs.discipline_id
)
SELECT
  d.name AS materia,
  sci.planned_minutes AS meta,
  COALESCE(h.hist_total, 0) AS historico_minutos,
  COALESCE(s.sess_total, 0) AS sessions_minutos,
  CASE
    WHEN COALESCE(h.hist_total, 0) = COALESCE(s.sess_total, 0) THEN 'IGUAL'
    ELSE 'DIFERENTE'
  END AS status
FROM study_cycle_items sci
LEFT JOIN disciplines d ON d.id = sci.discipline_id
LEFT JOIN historico h ON h.discipline_id = sci.discipline_id
LEFT JOIN sessoes s ON s.discipline_id = sci.discipline_id
WHERE sci.cycle_id = '<CYCLE_ID>'
ORDER BY sci."order" ASC;

-- ════════════════════════════════════════════════════════════
-- BLOCO 8: DUPLICAÇÃO - Contar study_history_id duplicados nas sessions
-- ════════════════════════════════════════════════════════════
SELECT
  study_history_id,
  COUNT(*) AS vezes
FROM study_cycle_sessions
WHERE cycle_id = '<CYCLE_ID>'
  AND study_history_id IS NOT NULL
GROUP BY study_history_id
HAVING COUNT(*) > 1;

-- ════════════════════════════════════════════════════════════
-- BLOCO 9: TODAS AS SESSIONS BRUTAS (debug completo)
-- ════════════════════════════════════════════════════════════
SELECT
  scs.id AS session_id,
  scs.cycle_item_id,
  d.name AS materia,
  scs.round_number,
  scs.minutes_contributed,
  scs.extra_minutes,
  scs.study_history_id,
  sh.started_at AS study_date,
  sh.duration_minutes AS study_duration,
  sh.source AS study_source
FROM study_cycle_sessions scs
LEFT JOIN disciplines d ON d.id = scs.discipline_id
LEFT JOIN study_history sh ON sh.id = scs.study_history_id
WHERE scs.cycle_id = '<CYCLE_ID>'
ORDER BY scs.cycle_item_id, scs.created_at ASC;
