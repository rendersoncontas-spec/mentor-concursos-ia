-- ============================================================================
-- MIGRATION V2: Colunas faltantes no schema real do banco de desenvolvimento
-- Detectadas via probe do PostgREST em 2026-08-31
--
-- Contexto: o código (study-cycle.actions.ts, cycle-migration.service.ts) já
-- referencia colunas V2 com fallbacks defensivos, mas o banco de dev não as
-- possui. Esta migration as cria para habilitar:
--   1. O seed de teste com cenários de borda completos
--   2. O dry-run de migração (dry-run precisa LER minutes_contributed)
--   3. A idempotência via parent_cycle_id (rastreio ciclo → plano canônico)
--
-- Segurança: idempotente (IF NOT EXISTS). Rodar no SQL Editor do Supabase.
-- ============================================================================

-- ── study_cycles: cursor de rodadas (V2) ────────────────────────────────────
ALTER TABLE study_cycles ADD COLUMN IF NOT EXISTS current_round integer DEFAULT 1;
ALTER TABLE study_cycles ADD COLUMN IF NOT EXISTS total_rounds_done integer DEFAULT 0;
ALTER TABLE study_cycles ADD COLUMN IF NOT EXISTS current_item_progress_min integer DEFAULT 0;

-- ── study_cycle_items: dificuldade (V2) ─────────────────────────────────────
ALTER TABLE study_cycle_items ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'MEDIA';

-- ── study_cycle_sessions: rastreio de contribuição (V2) ─────────────────────
ALTER TABLE study_cycle_sessions ADD COLUMN IF NOT EXISTS round_number integer DEFAULT 1;
ALTER TABLE study_cycle_sessions ADD COLUMN IF NOT EXISTS minutes_contributed integer DEFAULT 0;
ALTER TABLE study_cycle_sessions ADD COLUMN IF NOT EXISTS extra_minutes integer DEFAULT 0;
ALTER TABLE study_cycle_sessions ADD COLUMN IF NOT EXISTS discipline_id uuid REFERENCES disciplines(id) ON DELETE SET NULL;

-- ── study_plans: idempotência da migração (parent_cycle_id) ─────────────────
-- Metadado de rastreio: qual ciclo legado gerou este plano canônico.
ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS parent_cycle_id uuid REFERENCES study_cycles(id) ON DELETE SET NULL;
ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS total_cycle_minutes integer;

-- ── study_plan_items: ordenação e status de bloco (V2) ──────────────────────
ALTER TABLE study_plan_items ADD COLUMN IF NOT EXISTS execution_order integer;
ALTER TABLE study_plan_items ADD COLUMN IF NOT EXISTS block_status text DEFAULT 'PENDENTE';

-- ── Índices para performance do dry-run em escala ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_study_cycles_user ON study_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_study_cycle_items_cycle ON study_cycle_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_study_cycle_sessions_cycle ON study_cycle_sessions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_parent_cycle ON study_plans(parent_cycle_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_plan ON study_plan_items(study_plan_id);
CREATE INDEX IF NOT EXISTS idx_study_history_user_discipline ON study_history(user_id, discipline_id);

-- ── Marca de migração no legado (read-only safeguard, sem DELETE) ───────────
-- A tabela legada nunca é deletada; a flag migrated_at sinaliza read-only.
ALTER TABLE study_cycles ADD COLUMN IF NOT EXISTS migrated_at timestamptz;

COMMENT ON COLUMN study_cycles.migrated_at IS 'Timestamp da migração para o modelo canônico (study_plans). NULL = ainda não migrado.';

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION (rodar e conferir que retorna 'OK' nas linhas)
-- ============================================================================
SELECT 'study_cycles.current_round' AS col, EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'study_cycles' AND column_name = 'current_round'
) AS ok
UNION ALL
SELECT 'study_cycles.migrated_at', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'study_cycles' AND column_name = 'migrated_at'
)
UNION ALL
SELECT 'study_cycle_sessions.minutes_contributed', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'study_cycle_sessions' AND column_name = 'minutes_contributed'
)
UNION ALL
SELECT 'study_plans.parent_cycle_id', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'study_plans' AND column_name = 'parent_cycle_id'
)
UNION ALL
SELECT 'study_plan_items.block_status', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'study_plan_items' AND column_name = 'block_status'
);