-- ========================================================================================
-- AUDITORIA (SOMENTE LEITURA) — registros importados antigos sem lote
-- ========================================================================================
-- FASE 1: NENHUMA exclusão acontece aqui. Este script só consulta (SELECT) e produz
-- um relatório para identificar registros que podem ter vindo de uma importação
-- anterior sem import_batch_id.
--
-- Os sinais usados (nunca um único):
--   A) origin_source preenchido SEM import_batch_id (importado antes do lote existir)
--   B) metadata com marcas do importador (importer / imported_topic / imported_seconds)
--      SEM import_batch_id
--   C) Picos de criação em lote: muitos created_at idênticos no mesmo segundo
--      (importação grava N linhas juntas; sessões manuais são espaçadas)
--   D) Disciplinas que só possuem registros suspeitos (criadas automaticamente)
-- ========================================================================================

-- 0. Colunas REAIS da tabela (não assumir nomes)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'study_history'
ORDER BY ordinal_position;

-- 1. Totais por usuário (email)
SELECT
  u.email,
  count(*)                                                          AS total_registros,
  count(*) FILTER (WHERE sh.import_batch_id IS NOT NULL)            AS com_lote,
  count(*) FILTER (WHERE sh.origin_source IS NOT NULL
                   AND sh.import_batch_id IS NULL)                  AS origem_sem_lote,
  count(*) FILTER (WHERE sh.import_batch_id IS NULL
                   AND sh.metadata IS NOT NULL
                   AND (sh.metadata->>'importer') IS NOT NULL)      AS marca_importer_sem_lote,
  count(*) FILTER (WHERE sh.import_batch_id IS NULL
                   AND sh.metadata IS NOT NULL
                   AND (sh.metadata ? 'imported_topic'))            AS marca_topic_sem_lote,
  count(*) FILTER (WHERE sh.import_batch_id IS NULL
                   AND sh.metadata IS NOT NULL
                   AND (sh.metadata ? 'imported_seconds'))          AS marca_seconds_sem_lote
FROM public.study_history sh
JOIN auth.users u ON u.id = sh.user_id
GROUP BY u.email
ORDER BY total_registros DESC;

-- 2. Picos de criação em lote (mesmo instante = forte sinal de importação em massa)
SELECT
  u.email,
  sh.created_at,
  count(*) AS registros_no_instante
FROM public.study_history sh
JOIN auth.users u ON u.id = sh.user_id
WHERE sh.import_batch_id IS NULL
GROUP BY u.email, sh.created_at
HAVING count(*) >= 4
ORDER BY registros_no_instante DESC, u.email, sh.created_at DESC;

-- 3. Chaves existentes no metadata de registros SEM lote
--    (descobre qualquer marca deixada pela implementação antiga)
SELECT key, count(*) AS ocorrencias
FROM public.study_history sh,
     jsonb_each_text(COALESCE(sh.metadata, '{}'::jsonb)) AS kv(key, value)
WHERE sh.import_batch_id IS NULL
  AND sh.metadata IS NOT NULL
  AND (sh.metadata ? 'importer' OR sh.metadata ? 'imported_topic'
       OR sh.metadata ? 'imported_seconds' OR sh.metadata ? 'source')
GROUP BY key
ORDER BY ocorrencias DESC;

-- 4. Registros suspeitos (origem identificada SEM lote) — amostra por usuário
SELECT
  u.email,
  sh.id,
  sh.started_at AS data_estudo,
  COALESCE(d.name, '(sem disciplina)') AS disciplina,
  sh.duration_minutes AS duracao_min,
  sh.study_type AS tipo,
  sh.origin_source AS origem,
  sh.origin_source_name AS origem_nome,
  sh.created_at AS criado_em,
  sh.metadata->>'importer' AS marca_importer,
  CASE
    WHEN sh.metadata ? 'imported_topic'   THEN 'imported_topic'
    WHEN sh.metadata ? 'imported_seconds' THEN 'imported_seconds'
    WHEN sh.origin_source IS NOT NULL     THEN 'origin_source'
    ELSE '?'
  END AS motivo_suspeita
FROM public.study_history sh
JOIN auth.users u ON u.id = sh.user_id
LEFT JOIN public.disciplines d ON d.id = sh.discipline_id
WHERE sh.import_batch_id IS NULL
  AND (
       sh.origin_source IS NOT NULL
    OR (sh.metadata IS NOT NULL AND (sh.metadata ? 'imported_topic'))
    OR (sh.metadata IS NOT NULL AND (sh.metadata ? 'imported_seconds'))
    OR (sh.metadata IS NOT NULL AND (sh.metadata->>'importer') IS NOT NULL)
  )
ORDER BY u.email, sh.started_at DESC
LIMIT 200;

-- 5. Disciplinas "fantasma": possuem registros SEM lote e nenhum registro COM lote
--    (forte sinal de disciplinas criadas automaticamente pela importação antiga)
SELECT
  u.email,
  d.name AS disciplina,
  count(*) AS registros_sem_lote
FROM public.study_history sh
JOIN auth.users u ON u.id = sh.user_id
JOIN public.disciplines d ON d.id = sh.discipline_id
WHERE sh.import_batch_id IS NULL
  AND sh.discipline_id NOT IN (
    SELECT discipline_id FROM public.study_history WHERE import_batch_id IS NOT NULL
  )
GROUP BY u.email, d.name
HAVING count(*) >= 5
ORDER BY registros_sem_lote DESC, u.email, d.name;

-- ========================================================================================
-- FIM DA AUDITORIA — nenhum dado foi alterado.
-- Leia o relatório e me envie as linhas antes de qualquer exclusão.
-- ========================================================================================