# NomeIA — Fase I.2: fechamento e hardening do sistema de revisões

**Data:** 25/09/2026
**Escopo:** apenas as três pendências apontadas na Fase I.1. Nenhuma funcionalidade nova, nenhuma decisão D1–D9 alterada.
**Git:** nada commitado, nada enviado. Só `git status --short`, `git diff --stat` e `git diff --check` foram executados.

---

## ALTERADO

Nove arquivos, todos por causa das duas limpezas:

| Arquivo | O que mudou |
|---|---|
| `src/features/dashboard/components/dashboard-widget-catalog.tsx` | saiu o componente `WidgetRevisoes`, o registro `revisoes` do `WIDGET_REGISTRY` e o ícone `RotateCcw` (usado só por ele) |
| `src/application/dashboard/dashboard-layout.action.ts` | `revisoes` saiu do layout padrão; ordens renumeradas (6…16) |
| `src/application/dashboard/dashboard.service.ts` | saiu a leitura de revisões do snapshot do Dashboard (import, chamada e fallback) |
| `src/domain/dashboard/dashboard.types.ts` | saíram o campo `reviews` do `DashboardSnapshot` e a interface `PendingReviewsSummary` |
| `src/application/simulados/simulados.actions.ts` | saíram as duas ações legadas de questão → revisão/flashcard |
| `src/features/simulados/components/simulado-result.tsx` | saíram os dois botões que as chamavam e os imports correspondentes |
| `src/application/truncation-guard.pagination.test.ts` | a garantia de paginação de `review_items` foi repontada para a leitura que sobrou no produto |
| `src/application/performance-fase-f1.wiring.test.ts` | saiu o caso da função que deixou de existir |
| `src/application/review-engine/review-study-history-d4.wiring.test.ts` | teste novo: as duas ações legadas não voltam a existir em nenhum arquivo |

## REMOVIDO

- `src/application/review-engine/review-engine.service.ts` — arquivo inteiro (só continha `getPendingReviewsSummary`, consumida exclusivamente pelo widget).
- `WidgetRevisoes` (componente do Dashboard) e seu registro no catálogo.
- `PendingReviewsSummary` (tipo) e o campo `reviews` do `DashboardSnapshot`.
- `sendQuestionToReviewAction` e `createFlashcardFromQuestionAction`.
- A constante `REVIEW_FROM_QUESTION_UNAVAILABLE`, que existia só para elas.
- Os dois botões "Enviar para revisão" e "Criar flashcard" na view de resultado de simulado.

## MANTIDO

Nada de código legado de revisão ficou por ter caller — as duas ações não tinham nenhum. O que foi mantido de propósito:

- **`addQuestionToStudyListAction`** e o helper `assertOwnsQuestion`: não têm relação com revisões (gravam em `question_lists`/`question_list_items`) e continuam funcionando.
- **`question_attempts`**: intocado. O fim do simulado continua gravando as tentativas.
- **`SimuladoResultView` (`simulado-result.tsx`) e `getSimuladoResultAction`**: continuam existindo, agora sem os dois botões. Os dois são **órfãos** — nenhuma página importa o componente e nenhuma UI chama a action. Não removi porque isso é decisão de produto (a tela de resultado de simulado pode estar prevista para voltar), e o pedido desta fase era remover o que existia *exclusivamente* para as ações legadas.
- **Numeração dos comentários do catálogo de widgets**: o `// 7. WIDGET: Revisões` saiu e a numeração tem um vão (6 → 8). O arquivo já tinha um vão igual (16 → 18, de uma limpeza anterior), então renumerar geraria um diff grande sem ganho.
- **Dois erros de lint pré-existentes** (`no-nested-ternary`) em `dashboard-widget-catalog.tsx`: estão nos widgets de Desempenho e Estudos de Hoje, não têm relação com a remoção e ficaram como estavam.

## WIDGET DASHBOARD

O widget "Revisões" saiu do Dashboard inteiro, em cinco pontos:

1. **Componente** — `WidgetRevisoes` (as duas variantes, `colSpan === 1` e larga, com "N pendentes" e "Central de revisões").
2. **Registro** — a entrada `revisoes` do `WIDGET_REGISTRY`.
3. **Layout padrão** — a linha `{ widget_id: "revisoes", … }` em `getDashboardLayoutConfig()`. Isso importava: a função **re-adiciona** ao layout do usuário qualquer widget padrão que esteja faltando, então deixar a linha faria o widget voltar sozinho.
4. **Dados** — a leitura `getPendingReviewsSummary` no snapshot e o campo `reviews` do tipo.
5. **Serviço** — o arquivo `review-engine.service.ts`.

Nada foi posto no lugar: não há widget substituto, nem "0 pendentes", nem placeholder, nem métrica nova. A página `/dashboard/reviews` continua sendo o único lugar de revisão, e o link dela na barra lateral continua intacto.

**Quem já tinha o widget salvo não precisa de migração e não vai ver buraco na tela.** O layout do usuário (em `user_dashboard_layouts` e `profiles.preferences`) pode continuar guardando a linha `revisoes`: o Dashboard resolve cada item por `WIDGET_REGISTRY[item.widget_id]` e faz `if (!widgetInfo) return null` — tanto na grade quanto no modal de personalização. O id deixou de existir, então a linha salva é simplesmente ignorada. Nenhuma alteração de banco foi necessária para isso.

## AÇÕES LEGADAS

Auditoria de referências de cada uma:

| Ação | Callers encontrados | Destino |
|---|---|---|
| `sendQuestionToReviewAction` | apenas `SimuladoResultView` (componente que **nenhuma página importa**) | **removida** |
| `createFlashcardFromQuestionAction` | idem | **removida** |

Não havia UI ativa, nenhum outro import, nenhum teste cobrindo-as e nenhum fluxo escondido — a auditoria varreu `src/` inteiro por nome, por `source_type` "QUESTION"/"FLASHCARD" e por escritas em `review_items`. Como o schema aceita apenas `EDITAL_TOPIC` e `EDITAL_SUBTOPIC`, manter as funções neutralizadas só deixaria duas mensagens de "não disponível" sem ninguém para lê-las.

Um teste novo em `review-study-history-d4.wiring.test.ts` varre todos os `.ts`/`.tsx` de `src/` e falha se qualquer um dos dois nomes reaparecer — junto com os testes que já garantiam que nem o fim do estudo nem o fim do simulado criam revisão.

Nada de flashcards, revisão de questões, revisão de erros ou criação automática foi implementado. Revisar questões segue no FUTURO e, quando existir, entra pelo módulo de revisões com origem própria no schema — não reativando este código.

## GIT / EOL

Nenhum arquivo foi alterado por fim de linha. Não rodei `dos2unix`, `unix2dos`, prettier global, `.gitattributes`, `reset` nem `checkout`. Só auditoria:

| Categoria | Arquivos |
|---|---|
| Total no `git status --short` | **234** |
| Modificados | 204 — sendo **161 apenas CRLF/LF** e **43 com mudança real** |
| Removidos (`D`) | 11 (10 das fases I.1/E/H + 1 desta fase) |
| Novos (`??`) | 19 |

Dos 43 modificados com mudança real, **8 são desta Fase I.2** (o nono arquivo que mexi, `review-study-history-d4.wiring.test.ts`, é novo da I.1, então aparece em `??`, não no diff). Os outros 35 são das fases anteriores, ainda não commitadas.

Os 161 arquivos "somente EOL" são de `docs/`, `.agents/skills/` e `.sql` — a pasta está com CRLF e o HEAD tem LF. **Nenhum deles foi tocado nesta fase nem na I.1.** Verifiquei também o contrário: nenhum arquivo da I.2 caiu nessa lista, ou seja, todo arquivo que eu mexi tem mudança real de conteúdo. `git diff --check` nos 9 arquivos da fase não aponta nada.

O que fazer com esses 161 é decisão sua: dá para commitar só os arquivos de código (`git add` seletivo) e deixar os de EOL de lado, ou resolver a diferença de fim de linha num commit separado só para isso.

## BANCO

- **Nenhuma migration nova criada.**
- **Nenhuma alteração de schema, RLS, índice ou constraint.**
- **A migration da I.1 não foi reaplicada.** Nenhum DDL rodou nesta fase.

Conferência de leitura no banco real, para confirmar que está como a I.1 deixou: `review_items` 23 colunas / 2 políticas / 5 índices / 7 constraints; `review_history` 25 / 2 / 5 / 8; `review_sessions` 7 / 2 / 3 / 3. A única migration em `supabase/migrations/` que aparece como nova continua sendo `20260925_review_system_fsrs.sql`.

O Cycle Engine também não foi tocado: nenhuma limpeza desta fase chegou perto de `registerStudyToCycle`, `study_cycles`, `study_cycle_sessions`, `study_cycle_items`, cursor, rounds ou reconciliação — e o teste que falha se o módulo de revisões escrever nessas tabelas continua passando.

## TESTES

| Comando | Resultado |
|---|---|
| `npm test` | **1205 testes, 1205 passando, 0 falhando** (167 suítes) |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | compilou com sucesso; `/dashboard/reviews` presente na lista de rotas |

Nenhum teste de segurança, idempotência, paginação, concorrência ou FSRS foi removido ou enfraquecido. O saldo: um teste novo (as ações legadas não voltam) e a cobertura de paginação de `review_items` **repontada** em vez de descartada.

O teste de truncamento existia para provar que o KPI do Dashboard contava todos os itens vencidos, e não só os 1.000 primeiros. Com o KPI removido, a função não existe mais — mas a garantia da Fase F.1 continua travada sobre a leitura paginada de `review_items` que sobrou no produto: descobrir quais conteúdos do edital o aluno já tem em revisão (modal "Adicionar à revisão"). São dois casos novos: 1.800 itens são todos reconhecidos, e a consulta não mistura itens de outro aluno nem de outra disciplina.

Varredura estática final, todas com zero ocorrências em código: `WidgetRevisoes`, `getPendingReviewsSummary`, `PendingReviewsSummary`, `review-engine.service`, `sendQuestionToReviewAction`, `createFlashcardFromQuestionAction`, `snapshot?.reviews`, `source_type "QUESTION"`, `source_type "FLASHCARD"`. Só sobraram menções em comentários que explicam o que saiu e por quê.

## AUDITORIA DE ESCOPO (D1–D9)

| Decisão | Situação |
|---|---|
| **D1** — só `EDITAL_TOPIC`/`EDITAL_SUBTOPIC` | confirmado: CHECK no banco, tipo do domínio e teste; nenhum outro `source_type` no código |
| **D2** — adição manual, nada automático | confirmado por teste: nem `session-orchestrator`, nem `study-history.actions`, nem `study-session.action`, nem o fim do simulado tocam em `review_items` |
| **D3** — nenhum flashcard ativo | confirmado. Atenção: `study_type: "FLASHCARDS"` no histórico de estudo (e no importador) é **outra coisa** — é o aluno registrando que estudou com flashcards fora do app, com 320 sessões reais no banco. Isso não foi tocado |
| **D4** — sessão com respostas grava estudo; sem respostas não grava | inalterado; travado pelos testes de wiring e pelo teste de serviço |
| **D6** — revisões só na página de Revisões | **agora completo no Dashboard**: o widget saiu. Meu Dia, metas e planejamento continuam sem ler revisões (teste) |
| **D7** — só o adaptador importa `ts-fsrs` | confirmado: uma única importação, em `fsrs-scheduler.ts` |
| **D8** — legado no banco, sem reativar | nada foi reativado; `review_queue`, `review_statistics`, `review_strategies` e os campos SM-2 seguem intocados e sem uso |
| **D9** — sem limite diário | confirmado: nenhum teto de novos/dia nem de revisões/dia no código |

## O QUE ENCONTREI E NÃO MEXI (decisão sua)

Quatro coisas apareceram na auditoria e estão fora das três pendências desta fase. Não alterei nenhuma:

1. **`/estatisticas` conta item suspenso/arquivado como pendente.** `statistics-center.action.ts` lê `review_items` sem filtrar `suspended_at`/`archived_at` — colunas que só passaram a existir na I.1. Então suspender um tópico o tira da fila de Revisões, mas ele continua somando em "revisões pendentes" nas Estatísticas. É uma inconsistência real, de uma linha para corrigir (dois filtros na consulta), mas a página de Estatísticas não está entre as pendências nem na lista do D6.
2. **Mentor AI com revisões fixas em zero.** `intelligence.hub.ts` monta `reviews: { totalOverdue: 0, criticalOverdue: 0, itemsToReviewToday: 0 }` sem consultar nada, e `prompt-builder.ts` usa esses zeros no prompt. É um stub anterior à I.1 (o mesmo padrão já documentado para `overallAccuracy`), mas é um zero falso chegando ao mentor.
3. **E-mail de lembrete dormente falando de flashcards.** `email.templates.ts` tem o texto "N flashcards/tópicos aguardando revisão" no caso `pending_review`. `sendStudyReminderEmail` não tem nenhum caller — ninguém envia esse e-mail hoje —, mas se um dia for ligado, o texto promete um recurso que não existe.
4. **Órfãos de simulado.** `SimuladoResultView` e `getSimuladoResultAction` não são usados por nenhuma tela.

Se você quiser, o item 1 é o único que mostra número errado para você hoje, e é o mais barato de resolver.

## GIT

```
git status --short   → 234 entradas
                        204 M  (161 só CRLF/LF · 43 com mudança real, 8 desta fase)
                         11 D  (1 desta fase: review-engine.service.ts)
                         19 ?? (novos, das fases I.1/H)

git diff --stat      → 215 arquivos, 19.286 inserções, 22.978 remoções
                        (inclui os 161 de fim de linha e as fases anteriores)

git diff --stat dos 8 arquivos desta fase:
  src/application/dashboard/dashboard-layout.action.ts            |  44 ++--
  src/application/dashboard/dashboard.service.ts                  |  19 +-
  src/application/performance-fase-f1.wiring.test.ts              |  51 ++-
  src/application/simulados/simulados.actions.ts                  | 115 +---
  src/application/truncation-guard.pagination.test.ts             |  43 ++-
  src/domain/dashboard/dashboard.types.ts                         |  14 +-
  src/features/dashboard/components/dashboard-widget-catalog.tsx  | 211 +----
  src/features/simulados/components/simulado-result.tsx           |  24 --
  8 arquivos, 215 inserções, 306 remoções

git diff --check     → sem apontamentos nos arquivos desta fase
```

Nenhum commit. Nenhum push. Nenhuma alteração de remote.

## PARA VOCÊ FAZER

1. Se ainda não rodou desde a I.1: **`npm install`** (a dependência `ts-fsrs@5.4.2` está no `package.json`/`package-lock.json`).
2. `npm test`, `npx tsc --noEmit` e `npm run build` na sua máquina, para confirmar no seu ambiente.
3. Abrir o Dashboard e confirmar visualmente que a grade fechou sem vão onde estava o widget, e que `/dashboard/reviews` abre normalmente.
4. Revisar e commitar você mesmo — de preferência separando os arquivos de código dos 161 que só têm diferença de fim de linha.
