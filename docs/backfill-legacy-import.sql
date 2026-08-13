-- ========================================================================================
-- FASE 2 — Lote retroativo para registros importados SEM lote nem origem
-- ========================================================================================
-- PROBLEMA: registros legados (metadata importer "1.0") não têm import_batch_id nem
--           origin_source → invisíveis em "Gerenciar Importações" e sem rastreabilidade.
-- SOLUÇÃO:  criar um lote retroativo e vincular esses registros a ele. Depois disso,
--           o lote aparece em "Gerenciar Importações" e pode ser excluído pela UI
--           (deleteImportBatchAction apaga os registros vinculados + o lote).
-- CRITÉRIO SEGURO: metadata->>'importer' = '1.0' é gravado SOMENTE pelo importador
--           (import-history.actions.ts:399) — sessões manuais nunca escrevem essa chave.
-- NOTA:     o lote é criado com source 'aprovado' (exemplo do usuário). Se a origem real
--           for outra (estudei/gran/tec/qconcursos/outra), basta trocar os 2 valores.
-- ========================================================================================

BEGIN;

-- 1) Cria o lote retroativo (a contagem é calculada automaticamente; guarda impede duplicar)
INSERT INTO public.study_imports (user_id, source, source_name, file_name, total_rows)
SELECT u.id,
       'aprovado'            AS source,
       'Importação antiga'   AS source_name,
       'LEGACY-IMPORT-2026-08-13' AS file_name,
       count(*)              AS total_rows
FROM auth.users u
JOIN public.study_history sh ON sh.user_id = u.id
WHERE u.email = 'rendersonluan@gmail.com'
  AND sh.import_batch_id IS NULL
  AND sh.metadata->>'importer' = '1.0'
  AND NOT EXISTS (
        SELECT 1 FROM public.study_imports si
        WHERE si.user_id = u.id AND si.file_name = 'LEGACY-IMPORT-2026-08-13'
      )
GROUP BY u.id;

-- 2) Vincula os registros legados ao lote recém-criado
UPDATE public.study_history sh
SET import_batch_id = (
      SELECT si.id FROM public.study_imports si
      WHERE si.user_id = sh.user_id
        AND si.file_name = 'LEGACY-IMPORT-2026-08-13'
      LIMIT 1
    ),
    origin_source = 'aprovado',
    origin_source_name = 'Importação antiga',
    origin_imported_at = sh.created_at
FROM auth.users u
WHERE u.id = sh.user_id
  AND u.email = 'rendersonluan@gmail.com'
  AND sh.import_batch_id IS NULL
  AND sh.metadata->>'importer' = '1.0';

COMMIT;

-- 3) Confirmação: total de registros no lote (e vinculados) + restantes (deve ser 0)
SELECT
  (SELECT si.total_rows FROM public.study_imports si
     WHERE si.file_name = 'LEGACY-IMPORT-2026-08-13' LIMIT 1) AS total_rows_lote,
  (SELECT count(*) FROM public.study_history sh
     JOIN auth.users u ON u.id = sh.user_id
     WHERE u.email = 'rendersonluan@gmail.com'
       AND sh.import_batch_id IS NOT NULL
       AND sh.metadata->>'importer' = '1.0') AS registros_vinculados,
  (SELECT count(*) FROM public.study_history sh
     JOIN auth.users u ON u.id = sh.user_id
     WHERE u.email = 'rendersonluan@gmail.com'
       AND sh.import_batch_id IS NULL
       AND sh.metadata->>'importer' = '1.0') AS legados_restantes;