-- ============================================================================
-- AUDITORIA + LIMPEZA DO REPLANEJAMENTO (bug 457h54min)
-- ----------------------------------------------------------------------------
-- Rode no SQL Editor do Supabase, NA ORDEM:
--   1) SELECTs de auditoria (diagnóstico — não alteram nada)
--   2) SELECTs de duplicatas (revise os IDs antes de apagar)
--   3) DELETE de órfãos (remove APENAS REAJUSTE/CRITICO sem referência ao
--      bloco original — são blocos corrompidos criados pelo bug)
--   4) Deduplicação de REAJUSTE por (source_block_id, data)
--
-- NÃO apaga: blocos BASE (planejamento original), sessões, histórico,
-- eventos de reajuste. NÃO mexe em dados pessoais.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. VISÃO GERAL — quantos blocos e minutos existem por origem/status
-- ───────────────────────────────────────────────────────────────────────────
SELECT origin, status, count(*) AS blocks, sum(duration_minutes) AS planned_minutes
FROM study_plan_daily_blocks
GROUP BY origin, status
ORDER BY origin, status;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ÓRFÃOS — REAJUSTE/CRITICO SEM source_block_id (causa do bug)
--    Cada linha destas virou "pendência nova" em execuções antigas.
--    Estes blocos NÃO têm obrigação original e devem ser removidos.
-- ───────────────────────────────────────────────────────────────────────────
SELECT id, user_id, scheduled_date, duration_minutes, origin, status, created_at
FROM study_plan_daily_blocks
WHERE origin <> 'BASE' AND source_block_id IS NULL
ORDER BY scheduled_date;

-- Resumo dos órfãos por usuário (soma de minutos inflados)
SELECT user_id, count(*) AS blocks, sum(duration_minutes) AS inflated_minutes
FROM study_plan_daily_blocks
WHERE origin <> 'BASE' AND source_block_id IS NULL
GROUP BY user_id;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. DUPLICATAS — mesmo source_block_id + mesma data (re-execuções do bug)
-- ───────────────────────────────────────────────────────────────────────────
SELECT source_block_id, scheduled_date, count(*) AS n,
       sum(duration_minutes) AS total_minutes,
       array_agg(id) AS block_ids
FROM study_plan_daily_blocks
WHERE source_block_id IS NOT NULL
GROUP BY source_block_id, scheduled_date
HAVING count(*) > 1
ORDER BY n DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. BASE DUPLICADOS — mesmo item + mesma data (garante a janela, não remover
--    sem diagnóstico; o algoritmo de janela é idempotente)
-- ───────────────────────────────────────────────────────────────────────────
SELECT item_id, scheduled_date, count(*) AS n, array_agg(id) AS block_ids
FROM study_plan_daily_blocks
WHERE origin = 'BASE' AND item_id IS NOT NULL
GROUP BY item_id, scheduled_date
HAVING count(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- LIMPEZA — execute APÓS revisar os SELECTs acima
-- ═══════════════════════════════════════════════════════════════════════════

-- 5. REMOVER ÓRFÃOS (REAJUSTE/CRITICO sem bloco original)
--    Seguro: estes blocos não referenciam nada nem são referenciados como
--    origem por outros blocos (source_block_id só aponta para o ORIGINAL).
--    Para limitar a um usuário: adicione AND user_id = '<seu-user-id>'
DELETE FROM study_plan_daily_blocks
WHERE origin <> 'BASE' AND source_block_id IS NULL;

-- 6. DEDUPLICAR REAJUSTE por (source_block_id, scheduled_date)
--    Mantém o bloco mais antigo do grupo, soma os minutos nele e apaga os
--    demais. UM ÚNICO STATEMENT (atômico): o SQL Editor executa cada sentença
--    em sessão separada, então CTEs/tabelas temporárias não sobrevivem entre
--    statements — tudo aqui roda de uma vez.
WITH ranked AS (
  SELECT id, source_block_id, scheduled_date, duration_minutes,
         row_number() OVER (
           PARTITION BY source_block_id, scheduled_date
           ORDER BY created_at, id
         ) AS rn
  FROM study_plan_daily_blocks
  WHERE source_block_id IS NOT NULL
),
dups AS (
  SELECT source_block_id, scheduled_date, sum(duration_minutes) AS dup_minutes
  FROM ranked
  WHERE rn > 1
  GROUP BY source_block_id, scheduled_date
),
remove AS (
  DELETE FROM study_plan_daily_blocks b
  USING ranked r
  WHERE b.id = r.id AND r.rn > 1
)
UPDATE study_plan_daily_blocks b
SET duration_minutes = b.duration_minutes + d.dup_minutes
FROM dups d, ranked r
WHERE b.id = r.id
  AND r.rn = 1
  AND b.source_block_id = d.source_block_id
  AND b.scheduled_date = d.scheduled_date;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. VALIDAÇÃO FINAL — execute de novo após a limpeza
--    Esperado: 0 órfãos; nenhum grupo de duplicatas no SELECT 3.
-- ───────────────────────────────────────────────────────────────────────────
SELECT origin, status, count(*) AS blocks, sum(duration_minutes) AS planned_minutes
FROM study_plan_daily_blocks
GROUP BY origin, status
ORDER BY origin, status;