-- Auditoria Fase 1.5 — Resumo final (SOMENTE LEITURA, seguro)
-- Rode todos os blocos de uma vez no SQL Editor e cole o resultado aqui.

-- A) Visão geral da conta
SELECT
  (SELECT count(*) FROM study_history sh JOIN auth.users u ON u.id = sh.user_id
     WHERE u.email = 'rendersonluan@gmail.com') AS total_registros_conta,

  (SELECT count(*) FROM study_history sh JOIN auth.users u ON u.id = sh.user_id
     WHERE u.email = 'rendersonluan@gmail.com' AND sh.import_batch_id IS NOT NULL) AS com_lote,

  (SELECT count(*) FROM study_history sh JOIN auth.users u ON u.id = sh.user_id
     WHERE u.email = 'rendersonluan@gmail.com'
       AND sh.import_batch_id IS NULL
       AND sh.metadata->>'importer' = '1.0') AS legados_sem_lote;

-- B) Instantes de importação (cada linha = 1 importação em massa distinta)
SELECT
  sh.created_at AS instante_importacao,
  count(*) AS registros,
  min(sh.started_at) AS primeiro_registro_original,
  max(sh.started_at) AS ultimo_registro_original
FROM study_history sh
JOIN auth.users u ON u.id = sh.user_id
WHERE u.email = 'rendersonluan@gmail.com'
  AND sh.import_batch_id IS NULL
  AND sh.metadata->>'importer' = '1.0'
GROUP BY sh.created_at
ORDER BY count(*) DESC;

-- C) Sanidade: nenhum registro com marca do importador deveria ter lote/Origem
SELECT
  count(*) FILTER (WHERE sh.import_batch_id IS NOT NULL) AS marca_importer_COM_lote,
  count(*) FILTER (WHERE sh.origin_source IS NOT NULL)   AS marca_importer_COM_origem
FROM study_history sh
JOIN auth.users u ON u.id = sh.user_id
WHERE u.email = 'rendersonluan@gmail.com'
  AND sh.metadata->>'importer' = '1.0';
