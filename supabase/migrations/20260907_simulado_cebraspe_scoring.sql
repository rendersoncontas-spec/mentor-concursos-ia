-- ============================================================================
-- MIGRATION: Regra de pontuação CEBRASPE/CESPE no módulo de Simulados
--
-- Adiciona colunas para guardar separadamente percentual bruto e líquido:
--   - net_score: pontuação líquida (ex: 70 acertos - 20 erros = 50 pontos)
--   - net_percentage: aproveitamento líquido (50%)
--   - penalty_per_wrong: penalização por erro (default 1 = 1 erro anula 1 acerto)
--
-- O percentual bruto (score_percentage) NUNCA é substituído.
-- Segurança: idempotente (IF NOT EXISTS). Nenhum dado é apagado.
-- ============================================================================

-- ▸ Novas colunas de pontuação líquida --------------------------------------
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS net_score numeric;
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS net_percentage numeric;
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS penalty_per_wrong numeric DEFAULT 1;

-- ▸ Novo valor possível para scoring_rule (text, sem constraint rígida) -----
-- Valores válidos: PERCENTUAL | CEBRASPE | PENALIZACAO | PERSONALIZADO
COMMENT ON COLUMN simulados.scoring_rule IS 'Regra de pontuação: PERCENTUAL, CEBRASPE, PENALIZACAO ou PERSONALIZADO';
COMMENT ON COLUMN simulados.net_score IS 'Pontuação líquida (acertos - erros x penalização). NULL quando regra PERCENTUAL.';
COMMENT ON COLUMN simulados.net_percentage IS 'Aproveitamento líquido (net_score / total_questions x 100).';
COMMENT ON COLUMN simulados.penalty_per_wrong IS 'Pontos descontados por erro na regra CEBRASPE (default 1).';

-- ▸ Índice para estatísticas separadas por regra ------------------------------
CREATE INDEX IF NOT EXISTS idx_simulados_user_rule ON simulados(user_id, scoring_rule);

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION (rodar e conferir que retorna 'true')
-- ============================================================================
SELECT 'simulados.net_score' AS col, EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'simulados' AND column_name = 'net_score'
) AS ok
UNION ALL
SELECT 'simulados.net_percentage', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'simulados' AND column_name = 'net_percentage'
)
UNION ALL
SELECT 'simulados.penalty_per_wrong', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'simulados' AND column_name = 'penalty_per_wrong'
);
