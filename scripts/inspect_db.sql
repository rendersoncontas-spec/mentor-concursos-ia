-- ============================================================================
-- DIAGNOSTIC: Verificar estado real do banco para o ciclo de estudos
-- Cole este script no SQL Editor do Supabase e execute.
-- ============================================================================

-- 1. Todos os ciclos do usuário (troque o user_id abaixo pelo seu)
SELECT id, user_id, name, status, current_item_index, current_round, 
       total_rounds_done, current_item_progress_min, created_at
FROM study_cycles
ORDER BY created_at DESC;

-- 2. Todos os itens do ciclo
SELECT sci.id, sci.cycle_id, sci.discipline_id, sci."order", sci.planned_minutes, 
       sci.difficulty, sci.status, sci.created_at,
       d.name as discipline_name
FROM study_cycle_items sci
LEFT JOIN disciplines d ON sci.discipline_id = d.id
ORDER BY sci."order";

-- 3. Todas as sessões do ciclo (verificar colunas V2)
SELECT * FROM study_cycle_sessions LIMIT 10;

-- 4. Todas as disciplinas
SELECT id, name FROM disciplines ORDER BY name;

-- 5. Histórico de estudos recente (verificar se tem discipline_id correto)
SELECT sh.id, sh.discipline_id, sh.duration_minutes, sh.study_source, 
       sh.started_at, sh.completed,
       d.name as discipline_name
FROM study_history sh
LEFT JOIN disciplines d ON sh.discipline_id = d.id
WHERE sh.duration_minutes > 0
ORDER BY sh.started_at DESC
LIMIT 20;

-- 6. Verificar colunas V2 da tabela study_cycle_sessions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'study_cycle_sessions'
ORDER BY ordinal_position;

-- 7. MATCH: Cruzar study_history com study_cycle_items por discipline_id
--    para ver quais estudos dariam match no ciclo
SELECT sh.id as history_id, sh.started_at, sh.duration_minutes, 
       sh.discipline_id as history_disc_id,
       d.name as history_disc_name,
       sci.id as cycle_item_id, sci.cycle_id, sci."order",
       cd.name as cycle_disc_name
FROM study_history sh
JOIN disciplines d ON sh.discipline_id = d.id
JOIN study_cycle_items sci ON sci.discipline_id = sh.discipline_id
JOIN study_cycles sc ON sci.cycle_id = sc.id AND sc.status = 'ACTIVE'
JOIN disciplines cd ON sci.discipline_id = cd.id
WHERE sh.duration_minutes > 0
ORDER BY sh.started_at;
