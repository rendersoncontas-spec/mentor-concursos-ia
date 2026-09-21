-- ============================================================================
-- MIGRATION: Índice único parcial para prevenir lançamento manual duplicado
-- concorrente em study_history (Fase 14)
--
-- Problema: saveManualStudyTimeAction
-- (src/application/study-history/study-history.actions.ts) já implementa um
-- padrão "buscar-ou-criar": antes de inserir, consulta se já existe um
-- lançamento manual (study_source = 'FREE' AND metadata contendo
-- manual_entry:true) para o mesmo usuário no mesmo dia (janela
-- [00:00,23:59] em América/São_Paulo) e, se existir, faz UPDATE em vez de
-- INSERT. Isso previne duplicidade dentro de uma única requisição, mas não
-- entre duas requisições concorrentes (duas abas salvando o mesmo dia ao
-- mesmo tempo): ambas podem ver "não existe" e inserir duas linhas para o
-- mesmo usuário/dia.
--
-- buildIsoFromSaoPauloDateTime(dateStr, "12:00") (src/lib/sao-paulo.ts)
-- SEMPRE produz um horário fixo de meio-dia (-03:00, sem horário de verão no
-- Brasil desde 2019) para uma data de calendário — ou seja, started_at já é,
-- por construção, uma chave 1:1 com a data do lançamento manual. Isso
-- simplifica o índice: basta (user_id, started_at) sob o mesmo escopo que a
-- própria action já usa na consulta "buscar-ou-criar".
--
-- Verificação feita antes desta migration (Fase 14, banco real de
-- produção): zero lançamentos manuais duplicados encontrados — mais
-- precisamente, ZERO lançamentos manuais existem no banco até o momento
-- desta verificação (study_source='FREE' AND metadata->>'manual_entry'=
-- 'true' não retornou nenhuma linha; feature ainda pouco usada). A ausência
-- de duplicatas aqui não é uma validação estatística forte — não há dados
-- reais para testar contra —, mas o índice é seguro por construção: replica
-- exatamente o mesmo escopo que a própria action já usa para decidir
-- "atualizar em vez de criar", então não pode conflitar com nada que a
-- aplicação já trata como "o mesmo lançamento".
--
-- Escopo: SOMENTE linhas com study_source = 'FREE' E
-- metadata->>'manual_entry' = 'true' — nunca afeta as sessões FREE normais
-- do cronômetro/timer (2239 linhas reais no momento da verificação, todas
-- sem esse campo em metadata), nem nenhuma outra origem (QUESTOES, VIDEO,
-- REVIEW, PLAN, importação). Não altera nenhuma tabela do motor de Ciclos
-- (src/application/study-cycle/**, src/domain/study-cycle/** permanecem
-- intocados).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS study_history_manual_entry_unique_idx
ON public.study_history (user_id, started_at)
WHERE study_source = 'FREE' AND metadata->>'manual_entry' = 'true';

-- ============================================================================
-- VERIFICAÇÃO PÓS-MIGRATION
-- ============================================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'study_history'
  AND indexname = 'study_history_manual_entry_unique_idx';
