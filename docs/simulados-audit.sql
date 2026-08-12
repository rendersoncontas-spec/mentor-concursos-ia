-- ========================================================================================
-- AUDITORIA MÓDULO SIMULADOS (RODAR NO SQL EDITOR DO SUPABASE)
-- Cole tudo e execute. Copie o resultado completo de volta para o assistente.
-- ========================================================================================

-- 1. ESTRUTURA: tabelas do simulado existem? (sprint12/sprint13 foram aplicados?)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('simulados', 'simulado_disciplines', 'simulado_questions')
ORDER BY table_name;

-- 2. COLUNAS novas aplicadas em questions?
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'questions'
  AND column_name IN ('alternatives', 'explanation', 'difficulty_level');

-- 3. DADOS: pool do simulado
SELECT
  count(*)                                                            AS total_questoes,
  count(alternatives)                                                 AS com_alternativas,
  count(*) FILTER (WHERE correct_answer IN ('CERTO','ERRADO'))        AS certos_errados,
  count(*) FILTER (WHERE alternatives IS NOT NULL
                   OR correct_answer IN ('CERTO','ERRADO'))           AS pool_utilizavel
FROM public.questions;

-- 4. AMOSTRA: estrutura do JSON de alternatives (1 questão)
SELECT id, statement, correct_answer, alternatives
FROM public.questions
WHERE alternatives IS NOT NULL
LIMIT 2;

-- 5. TOP disciplinas com questões no pool (para conferir a distribuição da configuração)
SELECT d.name AS disciplina, count(*) AS questoes_pool
FROM public.questions q
JOIN public.disciplines d ON d.id = q.discipline_id
WHERE q.alternatives IS NOT NULL OR q.correct_answer IN ('CERTO','ERRADO')
GROUP BY d.name
ORDER BY 2 DESC
LIMIT 15;

-- 6. RLS: policies ativas nas tabelas novas?
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('simulados', 'simulado_disciplines', 'simulado_questions')
ORDER BY tablename;
