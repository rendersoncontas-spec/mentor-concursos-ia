-- ============================================================================
-- MIGRATION: Índice único parcial para prevenir duplicidade de importação
-- concorrente em study_history (Fase 14)
--
-- Problema: importHistoryChunkAction
-- (src/application/import-history/import-history.actions.ts) deduplica
-- registros importados carregando todos os fingerprints existentes do
-- usuário em memória (loadExistingFingerprints) e comparando com os do lote
-- atual, ANTES de inserir. Isso previne duplicidade dentro de uma única
-- requisição, mas não entre duas requisições concorrentes (ex.: duas abas
-- importando o mesmo arquivo ao mesmo tempo): ambas podem carregar o mesmo
-- snapshot "sem duplicata" e inserir a mesma linha duas vezes.
--
-- Fingerprint da aplicação (import-history.actions.ts, função fingerprint()):
--   v2|<epoch_segundos>|<discipline_id>|<duration_minutes>|<questions_answered>|<questions_correct>|<origin_source>
-- calculado por usuário (loadExistingFingerprints filtra por user_id).
--
-- Este índice reproduz EXATAMENTE essa mesma identidade lógica em nível de
-- banco, como UNIQUE INDEX parcial (só linhas de importação:
-- import_batch_id IS NOT NULL), para que uma segunda inserção concorrente do
-- mesmo registro seja rejeitada pelo Postgres (erro 23505) em vez de
-- duplicar silenciosamente.
--
-- Verificação feita antes desta migration (Fase 14, banco real de produção):
-- zero duplicatas encontradas ao agrupar por exatamente esta mesma expressão
-- sobre os dados reais (2677 linhas importadas, 2832 linhas totais em
-- study_history, no momento da verificação).
--
-- Detalhes da expressão:
-- - started_at truncado ao segundo em UTC:
--   floor(extract(epoch from (started_at AT TIME ZONE 'UTC'))).
--   extract(epoch from timestamptz) é STABLE (não pode ser usado direto em
--   índice); convertendo primeiro para timestamp via "AT TIME ZONE 'UTC'"
--   (a variante text+timestamptz de timezone() é IMMUTABLE) e só então
--   aplicando extract (também IMMUTABLE na variante text+timestamp), a
--   expressão inteira fica IMMUTABLE e pode ser indexada. Testado em
--   transação de rollback contra uma tabela temporária antes de aplicar.
-- - discipline_id: NOT NULL na tabela para todo registro (inclusive
--   importado) — comparado diretamente.
-- - duration_minutes, metadata->>'questions_answered',
--   metadata->>'questions_correct', origin_source: todos nullable —
--   usa-se COALESCE(..., '~null~') para que duas linhas com o mesmo NULL
--   colidam entre si, replicando o "?? ''" / "!== null ? String(x) : ''" da
--   função fingerprint() em TypeScript (NULL nunca é igual a NULL num
--   índice único comum do Postgres, o que deixaria passar duplicatas com
--   campos nulos sem o COALESCE).
--
-- Escopo: SOMENTE linhas de importação (import_batch_id IS NOT NULL) — nunca
-- afeta estudos manuais, sessões do timer, reviews ou registros do Ciclo.
-- Não altera nenhuma tabela do motor de Ciclos
-- (src/application/study-cycle/**, src/domain/study-cycle/** permanecem
-- intocados).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS study_history_import_fingerprint_idx
ON public.study_history (
  user_id,
  (floor(extract(epoch from (started_at AT TIME ZONE 'UTC')))),
  discipline_id,
  COALESCE(duration_minutes::text, '~null~'),
  COALESCE(metadata->>'questions_answered', '~null~'),
  COALESCE(metadata->>'questions_correct', '~null~'),
  COALESCE(origin_source, '~null~')
)
WHERE import_batch_id IS NOT NULL;

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION
-- ============================================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'study_history'
  AND indexname = 'study_history_import_fingerprint_idx';
