-- ============================================================================
-- MIGRATION: Módulo de Simulados — novo conceito (REGISTRO de simulados externos)
--
-- O módulo deixa de ser um gerador de provas e passa a registrar simulados
-- feitos FORA do sistema (TEC, Gran, Estratégia, QConcursos, PDF, provas antigas).
--
-- Segurança: idempotente (IF NOT EXISTS). Nenhum dado é apagado.
-- Tabelas existentes (simulados, simulado_disciplines) são REUTILIZADAS.
-- ============================================================================

-- ▸ simulados: colunas do novo conceito de registro --------------------------------
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS source text DEFAULT 'OUTRO';
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS source_custom text;
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS scoring_rule text DEFAULT 'PERCENTUAL';
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS penalty_score numeric;

-- Registros externos são sempre "provas finalizadas" registradas manualmente.
-- (status/style continuam existindo; novos registros usam style='REGISTRO')

-- ▸ simulado_disciplines: coluna blank_count para em-branco por matéria -------------
ALTER TABLE simulado_disciplines ADD COLUMN IF NOT EXISTS blank_count integer DEFAULT 0;

-- ▸ Índices para performance do painel -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_simulados_user_date ON simulados(user_id, simulado_date DESC);
CREATE INDEX IF NOT EXISTS idx_simulado_disciplines_simulado ON simulado_disciplines(simulado_id);

-- ▸ Comentários de documentação -------------------------------------------------------
COMMENT ON COLUMN simulados.source IS 'Fonte onde o simulado foi feito: TEC, GRAN, ESTRATEGIA, QCONCURSOS, PDF, PROVA_ANTERIOR, OUTRO';
COMMENT ON COLUMN simulados.source_custom IS 'Nome digitado pelo usuário quando source = OUTRO';
COMMENT ON COLUMN simulados.scoring_rule IS 'Regra de pontuação: PERCENTUAL, PENALIZACAO ou PERSONALIZADO';
COMMENT ON COLUMN simulados.penalty_score IS 'Percentual final informado quando há penalização/personalizado';

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION (rodar e conferir que retorna 'true')
-- ============================================================================
SELECT 'simulados.source' AS col, EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'simulados' AND column_name = 'source'
) AS ok
UNION ALL
SELECT 'simulados.scoring_rule', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'simulados' AND column_name = 'scoring_rule'
)
UNION ALL
SELECT 'simulado_disciplines.blank_count', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'simulado_disciplines' AND column_name = 'blank_count'
);
