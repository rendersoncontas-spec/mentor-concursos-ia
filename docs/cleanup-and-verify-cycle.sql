-- ============================================================================
-- LIMPEZA E VERIFICAÇÃO - Ciclo RECEITA FEDERAL
--
-- PREREQUISITO: a migration fix-delete-policy-study-cycle-sessions.sql
-- deve ser executada ANTES deste script.
--
-- Este script Somente lê e limpa study_cycle_sessions.
-- NÃO altera study_history, study_cycles nem study_cycle_items.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════
-- PASSO 1: Contar sessões antigas (deve retornar ~774)
-- ══════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS sessoes_antes
FROM study_cycle_sessions
WHERE cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c';

-- ══════════════════════════════════════════════════════════════════
-- PASSO 2: Deletar TODAS as sessões derivadas deste ciclo
-- ══════════════════════════════════════════════════════════════════
DELETE FROM study_cycle_sessions
WHERE cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c';

-- ══════════════════════════════════════════════════════════════════
-- PASSO 3: Confirmar limpeza (deve retornar 0)
-- ══════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS sessoes_depois
FROM study_cycle_sessions
WHERE cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c';

-- ══════════════════════════════════════════════════════════════════
-- PASSO 4: Verificar que study_history não foi afetado
-- ══════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS historico_intacto
FROM study_history
WHERE user_id = 'cd6d166e-8cf6-4fe4-b88d-1a32556ae624'
  AND duration_minutes > 0
  AND started_at >= '2026-09-07T21:30:53.999584+00:00';

-- Esperado: 42 (o mesmo número anterior)

-- ══════════════════════════════════════════════════════════════════
-- PASSO 5: Recarregar /ciclos no navegador para trigger o rebuild
--          (o rebuild vai rodar automaticamente ao carregar a página)
--
-- Depois de recarregar, volte ao SQL Editor e execute os passos abaixo.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PASSO 6: Verificar sessões novas (deve ser ~42, uma por estudo)
-- ══════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS sessoes_novas
FROM study_cycle_sessions
WHERE cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c';

-- ══════════════════════════════════════════════════════════════════
-- PASSO 7: Verificartotais por matéria nas sessões novas
-- ══════════════════════════════════════════════════════════════════
SELECT
  sci."order",
  d.name AS materia,
  sci.planned_minutes AS meta,
  COUNT(scs.id) AS num_sessoes,
  COALESCE(SUM(scs.minutes_contributed), 0) AS contribuido,
  COALESCE(SUM(scs.extra_minutes), 0) AS extra,
  COALESCE(SUM(scs.minutes_contributed + scs.extra_minutes), 0) AS total_geral
FROM study_cycle_items sci
LEFT JOIN disciplines d ON d.id = sci.discipline_id
LEFT JOIN study_cycle_sessions scs ON scs.cycle_item_id = sci.id
WHERE sci.cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c'
GROUP BY sci.id, sci."order", d.name, sci.planned_minutes
ORDER BY sci."order" ASC;

-- ══════════════════════════════════════════════════════════════════
-- PASSO 8: Comparar com histórico real
-- ══════════════════════════════════════════════════════════════════
WITH historico AS (
  SELECT
    sh.discipline_id,
    SUM(sh.duration_minutes) AS hist_total
  FROM study_history sh
  WHERE sh.user_id = 'cd6d166e-8cf6-4fe4-b88d-1a32556ae624'
    AND sh.duration_minutes > 0
    AND sh.started_at >= '2026-09-07T21:30:53.999584+00:00'
  GROUP BY sh.discipline_id
),
sessoes AS (
  SELECT
    scs.discipline_id,
    SUM(scs.minutes_contributed + scs.extra_minutes) AS sess_total
  FROM study_cycle_sessions scs
  WHERE scs.cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c'
  GROUP BY scs.discipline_id
)
SELECT
  d.name AS materia,
  sci.planned_minutes AS meta,
  COALESCE(h.hist_total, 0) AS historico,
  COALESCE(s.sess_total, 0) AS sessoes,
  CASE
    WHEN COALESCE(h.hist_total, 0) = COALESCE(s.sess_total, 0) THEN 'IGUAL'
    ELSE 'DIFERENTE'
  END AS status
FROM study_cycle_items sci
LEFT JOIN disciplines d ON d.id = sci.discipline_id
LEFT JOIN historico h ON h.discipline_id = sci.discipline_id
LEFT JOIN sessoes s ON s.discipline_id = sci.discipline_id
WHERE sci.cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c'
ORDER BY sci."order" ASC;

-- Todas as linhas devem mostrar "IGUAL"

-- ══════════════════════════════════════════════════════════════════
-- PASSO 9: Verificar estado do ciclo (cursor)
-- ══════════════════════════════════════════════════════════════════
SELECT
  current_item_index,
  current_round,
  current_item_progress_min
FROM study_cycles
WHERE id = '0335c988-539b-4fe5-8237-dcf8786c0b0c';

-- Esperado:
-- current_item_index = 5 (RLM, primeira incompleta)
-- current_round = 1
-- current_item_progress_min = 10

-- ══════════════════════════════════════════════════════════════════
-- PASSO 10: Teste de idempotência
--           Recarregue /ciclos NOVAMENTE e volte aqui.
-- ══════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS sessoes_idempotencia
FROM study_cycle_sessions
WHERE cycle_id = '0335c988-539b-4fe5-8237-dcf8786c0b0c';

-- Deve ser o mesmo número do Passo 6
