-- ============================================================
-- CORREÇÃO: Simulados salvos com user_id do admin no modo suporte
-- ============================================================
-- INSTRUÇÕES:
-- 1. Execute o BLOCO 1 para diagnosticar (ver os registros errados)
-- 2. Confirme que os registros são os esperados
-- 3. Execute o BLOCO 2 para corrigir (UPDATE)
-- 4. Execute o BLOCO 3 para validar
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- BLOCO 1: DIAGNÓSTICO
-- Mostra todos os simulados e seus user_id para identificar os errados
-- ──────────────────────────────────────────────────────────────

-- 1a. Listar os últimos 20 simulados com nome do usuário
SELECT
    s.id AS simulado_id,
    s.name,
    s.user_id,
    s.simulado_date,
    s.created_at,
    s.status,
    p.name AS usuario_nome,
    p.id AS usuario_id
FROM simulados s
LEFT JOIN profiles p ON p.id = s.user_id
ORDER BY s.created_at DESC
LIMIT 20;

-- 1b. Buscar o UUID da Lays (substitua 'Lays' pelo nome real se necessário)
SELECT id, name FROM profiles WHERE name ILIKE '%lays%' OR name ILIKE '%lay%';

-- 1c. Buscar o UUID do admin logado (substitua o e-mail se necessário)
-- SELECT id, name FROM profiles WHERE name ILIKE '%rende%' OR name ILIKE '%admin%';

-- 1d. Simulados que estão com user_id DIFERENTE do esperado
-- (.execute este depois de descobrir o UUID da Lays)
-- SELECT
--     s.id,
--     s.name,
--     s.user_id,
--     s.created_at,
--     'ERRADO - pertence ao admin' AS situacao
-- FROM simulados s
-- WHERE s.user_id = 'UUID_DO_ADMIN_AQUI'
--   AND s.created_at >= '2026-09-01';  -- ajuste a data se necessário


-- ──────────────────────────────────────────────────────────────
-- BLOCO 2: CORREÇÃO (UPDATE)
-- ATENÇÃO: Descomente e preencha os UUIDs antes de executar
-- ──────────────────────────────────────────────────────────────

-- 2a. Corrigir user_id na tabela simulados
-- UPDATE simulados
-- SET user_id = 'UUID_LAYS_AQUI'
-- WHERE user_id = 'UUID_ADMIN_AQUI'
--   AND created_at >= '2026-09-01';  -- ajuste a data se necessário

-- 2b. Corrigir user_id na tabela simulado_records (se existir)
-- UPDATE simulado_records
-- SET user_id = 'UUID_LAYS_AQUI'
-- WHERE user_id = 'UUID_ADMIN_AQUI'
--   AND created_at >= '2026-09-01';

-- 2c. Corrigir user_id na tabela simulado_disciplines
-- UPDATE simulado_disciplines
-- SET user_id = 'UUID_LAYS_AQUI'
-- WHERE user_id = 'UUID_ADMIN_AQUI'
--   AND simulado_id IN (
--       SELECT id FROM simulados
--       WHERE user_id = 'UUID_LAYS_AQUI'
--         AND created_at >= '2026-09-01'
--   );

-- 2d. Corrigir user_id na tabela simulado_questions
-- UPDATE simulado_questions
-- SET user_id = 'UUID_LAYS_AQUI'
-- WHERE user_id = 'UUID_ADMIN_AQUI'
--   AND simulado_id IN (
--       SELECT id FROM simulados
--       WHERE user_id = 'UUID_LAYS_AQUI'
--         AND created_at >= '2026-09-01'
--   );


-- ──────────────────────────────────────────────────────────────
-- BLOCO 3: VALIDAÇÃO
-- Confirma que a correção funcionou
-- ──────────────────────────────────────────────────────────────

-- 3a. Simulados da Lays agora devem aparecer
SELECT
    s.id,
    s.name,
    s.user_id,
    s.simulado_date,
    s.created_at,
    s.status
FROM simulados s
WHERE s.user_id = 'UUID_LAYS_AQUI'
ORDER BY s.created_at DESC;

-- 3b. Nenhum simulado deve ter o user_id do admin (após correção)
-- SELECT COUNT(*) AS simulados_errados_restantes
-- FROM simulados
-- WHERE user_id = 'UUID_ADMIN_AQUI'
--   AND created_at >= '2026-09-01';
