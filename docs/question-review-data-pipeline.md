# Pipeline de dados de questões e revisões

Última verificação: 2026-10-03 (G2.9). Contrato conferido no banco de produção, somente leitura.

Este documento descreve de onde vêm — e de onde **não** vêm — os dados de `question_attempts` e `review_items`. Os dois são sistemas independentes: uma tentativa de questão nunca gera um item de revisão, e um item de revisão nunca nasce de uma tentativa.

## 1. Três fontes diferentes de "questões" no NomeIA

| Fonte | Onde fica | Granularidade | Usada hoje? |
|---|---|---|---|
| Questões registradas numa sessão de estudo ("fiz 30, acertei 22") | `study_history.metadata.questions_answered` / `questions_correct` | agregado por sessão | **Sim** — principal fonte real de desempenho |
| Simulado externo registrado à mão ("Registrar simulado") | `simulados` + `simulado_disciplines` | agregado por simulado e por disciplina | **Sim** |
| Simulador interno (banco de questões próprio) | `simulado_questions` → `question_attempts` | uma linha por questão respondida | **Não** — a interface foi removida em 16/09/2026 (commit `04c0e4d`); o módulo de questões está inativo desde então (registrado na Fase I) |

Por isso `question_attempts` vazio **não** significa que o app não tem dado de desempenho em questões: as estatísticas somam `study_history.metadata` + `question_attempts`, e a primeira parcela tem dado real.

## 2. `question_attempts`

### Contrato real (produção)

- PK `id uuid`; `user_id → profiles(id)` e `question_id → questions(id)`, ambas `ON DELETE CASCADE`.
- NOT NULL: `user_id`, `question_id`, `selected_answer`, `correct`, `response_time_seconds`.
- CHECK: `confidence_level` 1–5; `mistake_type` ∈ CONTENT/INTERPRETATION/DISTRACTION/TIME/GUESS ou NULL.
- Default `attempt_source = 'MANUAL'`, `answered_at = now()`.
- **Sem chave única** — idempotência é responsabilidade de quem grava (seção 6).
- Índices: `(user_id, answered_at desc)`, `(question_id)`.
- Sem triggers.

### RLS

- SELECT: o próprio usuário; admin/moderador também (diagnóstico).
- INSERT: só com `auth.uid() = user_id`.
- Sem UPDATE/DELETE para o usuário (append-only na prática).

### Quem grava

Único caminho em produção: `persistSimuladoFinalization` (`src/application/simulados/simulado-finalize.ts`), chamado por `finishSimuladoAction` → `buildResultPayload(finalizing=true)`. Grava uma linha por questão **respondida** do simulado interno, `attempt_source = 'SIMULADO'`.

Código sem chamador (não apagado, documentado): `registerAttempt` e `getUserAttempts` em `src/application/questions/question-attempt.service.ts`.

Sessões de estudo **não** gravam aqui de propósito: o registro é em lote ("N acertos, M erros") e a tabela exige `question_id` real (FK). Ver o comentário em `session-orchestrator.ts › logQuestionsToEngine`. Forçar esse fluxo exigiria inventar questões — não fazer.

### Quem lê

Dashboard (`dashboard.service.ts`), Estatísticas (`statistics-center.action.ts`), `study-analytics.actions.ts`, Conquistas, Disciplinas (`disciplines.service.ts`, `discipline-actions.ts`), `question-analytics/*` (radar, acurácia, insights), Admin (diagnóstico) e o próprio simulador (pool "só erradas"). Todas as leituras são paginadas ou limitadas e filtradas por `user_id`.

## 3. `review_items`

### Contrato real (produção)

- PK `id`; `user_id → profiles`, `discipline_id → disciplines` (CASCADE).
- `source_type` CHECK ∈ `EDITAL_TOPIC`, `EDITAL_SUBTOPIC` — **questões não são origem aceita**.
- `UNIQUE (user_id, source_type, source_id)` — "Adicionar à revisão" duas vezes não cria dois itens.
- `review_stage` CHECK ∈ NEW/LEARNING/REVIEW/RELEARNING (os mesmos valores que o adaptador FSRS produz).
- Estado de memória FSRS: `stability_score`, `difficulty`, `scheduled_days`, `learning_steps`, `review_count`, `lapses_count`, `last_review_at`, `next_review_at`; `suspended_at`/`archived_at` para suspender/arquivar.

### RLS

SELECT/INSERT/UPDATE só do próprio usuário. Não há política de DELETE (itens são arquivados, não apagados).

### Ciclo de vida

| Etapa | Quem | Onde |
|---|---|---|
| Criar | o aluno, manualmente, em Revisões → "Adicionar à revisão" | `addTopicToReviewAction` → `addEditalContentToReview` → `insertItem` |
| Validar origem | o servidor resolve tópico/subtópico na hierarquia real (`topics`/`subtopics`) e deriva a disciplina — nunca confia na do cliente | `resolveEditalSource` |
| Responder | sessão de revisão, nota 1–4 | `answerReviewCardAction` → FSRS → `applyMemory` (controle otimista por `review_count`) + evento em `review_history` |
| Suspender/reativar/arquivar | o aluno | `setReviewItemFlagAction` |
| Sessão | uma ACTIVE por aluno (índice único parcial) | `review_sessions` |

Não existe criação automática (decisões D1/D2 da Fase I): nem a partir de sessão de estudo, nem a partir de erro de simulado.

## 4. Fluxo de uma questão (simulador interno)

```
criar simulado (createSimuladoAction)      → simulados (IN_PROGRESS) + simulado_questions
responder                                  → saveSimuladoAnswersAction: upsert em simulado_questions (só se IN_PROGRESS)
finalizar (finishSimuladoAction)
  └ corrige (correctAnswers, puro)
  └ persistSimuladoFinalization
       UPDATE simulados SET status=FINISHED ... WHERE status='IN_PROGRESS'  ← compare-and-set
       só quem mudou a linha:
         simulado_disciplines (delete + insert)
         question_attempts (insert em lote, uma linha por questão respondida)
         falhou? → status volta a IN_PROGRESS, erro devolvido, pode repetir
gerar revisão                              → NÃO existe (fora do escopo, decisão D1)
estatísticas                               → leem question_attempts na próxima consulta
```

Hoje o primeiro passo não tem interface, então o fluxo inteiro não é alcançável pelo usuário.

## 5. Estatísticas

As telas somam as duas fontes reais de questões (sessões + `question_attempts`). Se o simulador interno voltar, as tentativas de simulado entram como parcela adicional; o simulador não grava `study_history`, então não há contagem dupla entre as duas fontes.

## 6. Idempotência

- **Tentativas de simulado**: garantida pela transição condicional de status (G2.9). Duplo clique, retry depois de sucesso, timeout + clique manual, duas abas e simulado já CANCELED/FINISHED não geram tentativas extras.
- **Respostas em andamento**: `upsert` por `(simulado_id, order_index)`.
- **Itens de revisão**: `UNIQUE (user_id, source_type, source_id)`.
- **Respostas de revisão**: `UNIQUE (user_id, client_operation_id)` em `review_history` + controle otimista por `review_count`.

## 7. Pontos de falha conhecidos

- Em modo suporte (admin atuando como aluno), as actions usam o usuário efetivo, mas a RLS só aceita `auth.uid()`. Gravações nessas tabelas simplesmente não acontecem nesse modo; a finalização de simulado trata isso como "já encerrado" e não grava nada.
- `fetchLastAttemptMap` lê no máximo 50.000 tentativas por usuário (limite de projeto, irrelevante hoje).

## 8. Limitações históricas

- `question_attempts` nunca recebeu dados em produção (0 linhas em 2026-10-03). Não há histórico por questão anterior a uma eventual reativação do simulador, e ele **não deve** ser reconstruído a partir de `study_history` — os dados de sessão são agregados e não identificam questões.
- `review_items`, `review_sessions` e `review_history` também estão com 0 linhas: o sistema de revisões está implementado e o schema bate com o código, mas nenhum aluno adicionou tópico à revisão até esta data.
- O único registro em `simulados` é um simulado externo registrado à mão (sem `simulado_questions`), por isso não gerou tentativas — comportamento correto.
