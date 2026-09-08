-- ============================================================================
-- SEED DE TESTE: Cenários de borda para estressar a migração de ciclos
-- ============================================================================ 
-- PRÉ-REQUISITO: rodar primeiro 20260831_cycle_migration_v2_columns.sql
--
-- CENÁRIOS (6):
--   A) Ciclo com 0 itens
--   B) study_cycle_items órfãos (cycle_id inexistente)
--   C) Ciclo parcialmente concluído (sessões iniciadas + pendentes)
--   D) Divergência proposital de minutos (legado ≠ canônico simulado)
--   E) Usuário com múltiplos ciclos simultâneos (2 ACTIVE no schema atual)
--   F) Ciclo grande (60 itens, 200 sessões) para performance do dry-run
--
-- USUÁRIOS FICTÍCIOS (auth.users não é populável via SQL Editor comum, então
-- criamos profiles sintéticos; o RLS de leitura de study_cycles por user_id
-- deve permitir o acesso do próprio usuário de teste — ver item 2 do plano):
--   u_seed_1 (flag ON na whitelist):  cenários A, C, E, F
--   u_seed_2 (flag OFF):              cenário B (órfãos)
--   u_seed_3 (flag OFF):              cenário D (divergência proposital)
--
-- LIMPEZA: rodar o bloco CLEANUP no final deste arquivo para re-executável
-- ============================================================================

-- ── CLEANUP (idempotente: roda antes para permitir re-execução) ──────────────
DELETE FROM study_cycle_sessions WHERE cycle_id LIKE 'seed-%';
DELETE FROM study_cycle_items    WHERE cycle_id LIKE 'seed-%';
DELETE FROM study_cycles         WHERE id      LIKE 'seed-%';
DELETE FROM study_plan_items     WHERE study_plan_id IN (SELECT id FROM study_plans WHERE parent_cycle_id LIKE 'seed-%');
DELETE FROM study_plans          WHERE parent_cycle_id LIKE 'seed-%';
DELETE FROM disciplines          WHERE id LIKE 'seed-disc-%';
DELETE FROM profiles             WHERE id IN ('11111111-1111-4111-8111-111111111111',
                                               '22222222-2222-4222-8222-222222222222',
                                               '33333333-3333-4333-8333-333333333333');

-- ── Usuários sintéticos (profiles) ──────────────────────────────────────────
INSERT INTO profiles (id, email, name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'seed-user-1@test.local',  'Seed User 1 (flag ON)'),
  ('22222222-2222-4222-8222-222222222222', 'seed-user-2@test.local',  'Seed User 2 (órfãos)'),
  ('33333333-3333-4333-8333-333333333333', 'seed-user-3@test.local',  'Seed User 3 (divergência)');

-- ── Disciplinas sintéticas ──────────────────────────────────────────────────
INSERT INTO disciplines (id, name, area, color_hex) VALUES
  ('seed-disc-0001', 'Seed Direito Constitucional', 'Direito', '#3b82f6'),
  ('seed-disc-0002', 'Seed Português',              'Humanas', '#10b981'),
  ('seed-disc-0003', 'Seed Raciocínio Lógico',      'Exatas',  '#8b5cf6'),
  ('seed-disc-0004', 'Seed Informática',            'Exatas',  '#f59e0b');

-- ============================================================================
-- CENÁRIO A: Ciclo com 0 itens (usuário 1)
-- Expectativa dry-run: processa sem crash, 0 divergência (nada a migrar)
-- ============================================================================
INSERT INTO study_cycles (id, user_id, name, status, current_item_index)
VALUES ('seed-cycle-a-empty', '11111111-1111-4111-8111-111111111111', 'A - Ciclo Vazio', 'ACTIVE', 0);

-- ============================================================================
-- CENÁRIO B: study_cycle_items órfãos (usuário 2)
-- cycle_id referencia ciclo que não existe — dry-run deve ignorá-los
-- graciosamente (não pertencem a nenhum ciclo listado) SEM crash
-- ============================================================================
INSERT INTO study_cycle_items (id, cycle_id, discipline_id, "order", priority, planned_minutes, completed_minutes, status)
VALUES
  ('seed-item-b-orphan-1', 'seed-cycle-fantasma-xxx', 'seed-disc-0001', 1, 'ALTA',  60, 0, 'PENDENTE'),
  ('seed-item-b-orphan-2', 'seed-cycle-fantasma-xxx', 'seed-disc-0002', 2, 'MEDIA', 45, 0, 'PENDENTE');

-- ============================================================================
-- CENÁRIO C: Ciclo parcialmente concluído (usuário 1)
-- 3 itens; item 1 totalmente estudado (sessão completa), item 2 parcial
-- (30 de 60 min), item 3 nunca iniciado. current_item_index aponta pro item 2.
-- Expectativa dry-run: 3 itens, 165 min planejados, sessões somam 90 min
-- ============================================================================
INSERT INTO study_cycles (id, user_id, name, status, current_item_index, current_round, total_rounds_done, current_item_progress_min)
VALUES ('seed-cycle-c-partial', '11111111-1111-4111-8111-111111111111', 'C - Ciclo Parcial', 'ACTIVE', 1, 1, 0, 30);

INSERT INTO study_cycle_items (id, cycle_id, discipline_id, "order", priority, difficulty, planned_minutes, completed_minutes, status)
VALUES
  ('seed-item-c-1', 'seed-cycle-c-partial', 'seed-disc-0001', 1, 'ALTA',  'DIFICIL', 60, 60, 'CONCLUIDO'),
  ('seed-item-c-2', 'seed-cycle-c-partial', 'seed-disc-0002', 2, 'MEDIA', 'MEDIA',   60, 30, 'EM_ANDAMENTO'),
  ('seed-item-c-3', 'seed-cycle-c-partial', 'seed-disc-0003', 3, 'BAIXA', 'FACIL',   45, 0,  'PENDENTE');

-- Sessão completa do item 1 (60 min) + sessão parcial do item 2 (30 min)
INSERT INTO study_cycle_sessions (id, cycle_id, cycle_item_id, round_number, minutes_contributed, extra_minutes, discipline_id)
VALUES
  ('seed-sess-c-1', 'seed-cycle-c-partial', 'seed-item-c-1', 1, 60, 0, 'seed-disc-0001'),
  ('seed-sess-c-2', 'seed-cycle-c-partial', 'seed-item-c-2', 1, 30, 0, 'seed-disc-0002');

-- ============================================================================
-- CENÁRIO D: Divergência proposital de minutos (usuário 3)
-- Ciclo legado com 3 itens = 300 min planejados. JÁ MIGRADO (migrated_at set)
-- mas o plano canônico correspondente tem apenas 240 min (items truncados
-- ou com minutos errados) → dry-run DEVE marcar DIVERGENCES_FOUND e
-- safeToExecute: false
-- ============================================================================
INSERT INTO study_cycles (id, user_id, name, status, current_item_index, migrated_at)
VALUES ('seed-cycle-d-drift', '33333333-3333-4333-8333-333333333333', 'D - Ciclo Divergente', 'PAUSED', 0, now());

INSERT INTO study_cycle_items (id, cycle_id, discipline_id, "order", priority, planned_minutes, completed_minutes, status)
VALUES
  ('seed-item-d-1', 'seed-cycle-d-drift', 'seed-disc-0001', 1, 'ALTA',  120, 0, 'PENDENTE'),
  ('seed-item-d-2', 'seed-cycle-d-drift', 'seed-disc-0002', 2, 'MEDIA', 100, 0, 'PENDENTE'),
  ('seed-item-d-3', 'seed-cycle-d-drift', 'seed-disc-0003', 3, 'BAIXA',  80, 0, 'PENDENTE');
-- TOTAL legado = 300 min

-- Plano canônico "migrado" com DIVERGÊNCIA: só 240 min (faltam 60)
INSERT INTO study_plans (id, user_id, version, plan_type, status, name, total_cycle_minutes, weekly_minutes, parent_cycle_id, generated_reason, active)
VALUES ('seed-plan-d-canonical', '33333333-3333-4333-8333-333333333333', 1, 'CICLO_ROTATIVO', 'PAUSED', 'D - Plano Migrado (com drift)', 240, 240, 'seed-cycle-d-drift', 'legacy_cycle_migration', false);

INSERT INTO study_plan_items (id, study_plan_id, discipline_id, day_of_week, duration_minutes, priority, priority_score, recommended_sessions, block_status, execution_order)
VALUES
  ('seed-planitem-d-1', 'seed-plan-d-canonical', 'seed-disc-0001', 0, 120, 1, 1.0, 1, 'PENDENTE', 1),
  ('seed-planitem-d-2', 'seed-plan-d-canonical', 'seed-disc-0002', 0,  70, 2, 0.8, 1, 'PENDENTE', 2),
  ('seed-planitem-d-3', 'seed-plan-d-canonical', 'seed-disc-0003', 0,  50, 3, 0.6, 1, 'PENDENTE', 3);
-- TOTAL canônico = 240 min (≠ 300 do legado → drift de -60 min DE LIBERADO)

-- ============================================================================
-- CENÁRIO E: Múltiplos ciclos simultâneos (usuário 1) — schema atual permite
-- 2 ciclos ACTIVE ao mesmo tempo (a action createCycleAction só evita na
-- criação via app, mas o banco não tem constraint UNIQUE partial)
-- ============================================================================
INSERT INTO study_cycles (id, user_id, name, status, current_item_index) VALUES
  ('seed-cycle-e-multi-1', '11111111-1111-4111-8111-111111111111', 'E1 - Ciclo Simultâneo 1', 'ACTIVE', 0),
  ('seed-cycle-e-multi-2', '11111111-1111-4111-8111-111111111111', 'E2 - Ciclo Simultâneo 2', 'ACTIVE', 0);

INSERT INTO study_cycle_items (id, cycle_id, discipline_id, "order", priority, planned_minutes, completed_minutes, status) VALUES
  ('seed-item-e1-1', 'seed-cycle-e-multi-1', 'seed-disc-0001', 1, 'ALTA', 60, 0, 'PENDENTE'),
  ('seed-item-e2-1', 'seed-cycle-e-multi-2', 'seed-disc-0004', 1, 'MEDIA', 60, 0, 'PENDENTE');

-- ============================================================================
-- CENÁRIO F: Ciclo grande (usuário 1) — performance do dry-run em escala
-- 60 itens × 60 min = 3600 min planejados; 200 sessões distribuídas
-- ============================================================================
INSERT INTO study_cycles (id, user_id, name, status, current_item_index)
VALUES ('seed-cycle-f-big', '11111111-1111-4111-8111-111111111111', 'F - Ciclo Grande', 'ACTIVE', 0);

-- 60 itens via generate_series (SQL puro, sem escrever 60 INSERTs)
INSERT INTO study_cycle_items (id, cycle_id, discipline_id, "order", priority, planned_minutes, completed_minutes, status)
SELECT
  'seed-item-f-' || lpad(g::text, 3, '0'),
  'seed-cycle-f-big',
  CASE (g % 4) WHEN 0 THEN 'seed-disc-0001' WHEN 1 THEN 'seed-disc-0002' WHEN 2 THEN 'seed-disc-0003' ELSE 'seed-disc-0004' END,
  g,
  CASE (g % 3) WHEN 0 THEN 'ALTA' WHEN 1 THEN 'MEDIA' ELSE 'BAIXA' END,
  60,
  0,
  'PENDENTE'
FROM generate_series(1, 60) AS g;

-- 200 sessões: cobre itens 1..50 com 4 sessões de 30 min cada
INSERT INTO study_cycle_sessions (id, cycle_id, cycle_item_id, round_number, minutes_contributed, extra_minutes, discipline_id)
SELECT
  'seed-sess-f-' || lpad(g::text, 3, '0'),
  'seed-cycle-f-big',
  'seed-item-f-' || lpad((((g - 1) % 50) + 1)::text, 3, '0'),
  1,
  30,
  0,
  CASE (g % 4) WHEN 0 THEN 'seed-disc-0001' WHEN 1 THEN 'seed-disc-0002' WHEN 2 THEN 'seed-disc-0003' ELSE 'seed-disc-0004' END
FROM generate_series(1, 200) AS g;

-- ============================================================================
-- VERIFICAÇÃO DO SEED (rodar após; cada linha deve conferir com o esperado)
-- ============================================================================
SELECT 'cycles' AS entidade, count(*) AS total FROM study_cycles WHERE id LIKE 'seed-%'
UNION ALL SELECT 'items', count(*) FROM study_cycle_items WHERE cycle_id LIKE 'seed-%' OR id LIKE 'seed-item-b-%'
UNION ALL SELECT 'sessions', count(*) FROM study_cycle_sessions WHERE cycle_id LIKE 'seed-%'
UNION ALL SELECT 'plans_canonicos', count(*) FROM study_plans WHERE parent_cycle_id LIKE 'seed-%'
UNION ALL SELECT 'plan_items', count(*) FROM study_plan_items WHERE study_plan_id LIKE 'seed-plan-%';

-- Resumo por usuário (para conferir o dry-run depois):
SELECT
  c.user_id,
  count(DISTINCT c.id) AS ciclos,
  count(DISTINCT i.id) AS itens,
  coalesce(sum(i.planned_minutes), 0) AS minutos_planejados,
  (SELECT count(*) FROM study_cycle_sessions s WHERE s.cycle_id LIKE 'seed-%' AND s.cycle_id IN (SELECT id FROM study_cycles WHERE user_id = c.user_id)) AS sessoes
FROM study_cycles c
LEFT JOIN study_cycle_items i ON i.cycle_id = c.id
WHERE c.id LIKE 'seed-%'
GROUP BY c.user_id
ORDER BY c.user_id;