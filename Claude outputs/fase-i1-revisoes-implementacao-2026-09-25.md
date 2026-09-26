# NomeIA — Fase I.1: sistema real de revisões (FSRS)

**Data:** 25/09/2026
**Escopo:** implementação do sistema de repetição espaçada com biblioteca FSRS real, conforme as decisões D1–D9.
**Estado:** implementado e validado localmente. **Nada foi commitado nem enviado ao GitHub** — a revisão, o commit e o push são seus.

---

## 1. Biblioteca de agendamento escolhida (D7)

`ts-fsrs@5.4.2` — licença **MIT**, sem dependências, tipos inclusos, build dupla CJS/ESM, `engines.node >= 20` (o projeto roda em Node 22). É a implementação de referência do FSRS mantida pela organização open-spaced-repetition; internamente a versão 5.4.2 reporta usar o algoritmo **FSRS-6.0**.

A escolha foi verificada antes de escrever código, não depois: licença, versão, API pública (`fsrs`, `generatorParameters`, `createEmptyCard`, `next`, `repeat`, `State`, `Rating`), compatibilidade de Node e **determinismo** — o `enable_fuzz` da biblioteca é `false` por padrão e ficou desligado, e o instante da resposta entra sempre por parâmetro, nunca de `new Date()` dentro do agendador. Rodando duas vezes o mesmo estado, a mesma nota e o mesmo instante, o resultado é idêntico (há teste para isso).

O antigo `fsrs-engine.ts` (fórmula caseira, com pesos inventados) **não foi remendado**: foi removido junto com `queue-engine.ts` e `review-analytics.service.ts`.

Uma descoberta importante da verificação: o FSRS guarda o **passo de aprendizado** (`learning_steps`). Sem persistir esse campo, um item nunca gradua — com `learning_steps = 0`, responder "Bom" apenas reagenda em 10 minutos, para sempre; com `learning_steps = 1`, "Bom" gradua para REVIEW com intervalo em dias. Por isso a coluna existe na tabela, e existe um teste de regressão que falha se ela voltar a ser descartada.

## 2. Arquitetura: porta de domínio + adaptador

Nenhuma fórmula, peso ou constante do FSRS aparece em serviço, repositório, actions ou UI. A dependência fica isolada:

- `src/domain/reviews/review-scheduler.ts` — **porta** `ReviewScheduler` (`newMemory`, `schedule`, `forecast`) e o tipo do evento de agendamento. Não importa a biblioteca.
- `src/infrastructure/reviews/fsrs-scheduler.ts` — **adaptador** ts-fsrs: único arquivo do projeto que importa `ts-fsrs`. Traduz o estado guardado no banco para o formato da biblioteca e de volta.
- `src/domain/reviews/models.ts` — modelos de domínio (estado, nota, origem, memória, item, fila, sessão). Sem flashcards.
- `src/application/review-engine/review-queue.ts` — regras **puras** da fila (grupo, ordenação, distância até o vencimento, retenção medida). Sem I/O, sem relógio.
- `src/application/review-engine/review.repository.ts` — **única** camada que conhece colunas do banco.
- `src/application/review-engine/review.service.ts` — orquestração.
- `src/application/review-engine/review.actions.ts` — server actions; nenhuma recebe `userId` (o usuário efetivo vem de `getEffectiveUserId`, respeitando o modo suporte).
- `src/features/reviews/components/` — `reviews-view.tsx`, `add-to-review-modal.tsx`, `review-session-modal.tsx`.

Há teste que falha se `ts-fsrs` for importado fora do adaptador, e teste que falha se o serviço ou as actions consultarem `review_items`/`review_history` direto.

## 3. Migração aplicada e schema verificado no banco real

Arquivo: `supabase/migrations/20260925_review_system_fsrs.sql`, **aplicada** ao projeto de produção (`snlwfnwjrcqtlilhwgfm`) e depois **reconferida lendo o schema real** — não confiando no que o SQL dizia.

**`review_items`** — colunas novas `difficulty`, `scheduled_days`, `learning_steps`, `suspended_at`, `archived_at`; removida a FK errada `review_items_topic_id_fkey` (apontava para `question_topics`); CHECKs `review_stage in ('NEW','LEARNING','REVIEW','RELEARNING')` e `source_type in ('EDITAL_TOPIC','EDITAL_SUBTOPIC')`; mantida a unicidade `UNIQUE (user_id, source_type, source_id)`; índice parcial `idx_review_items_active_due (user_id, next_review_at, id) WHERE suspended_at IS NULL AND archived_at IS NULL`.

Não existem estados `MASTERED`/`LAPSED` persistidos: "atrasado" e "maduro" são derivados na leitura.

**`review_history`** — virou **evento imutável**: `session_id`, `elapsed_days`, `scheduled_days`, `state_before/after`, `stability_before/after`, `difficulty_before/after`, `due_before/after`, `early`, `client_operation_id`. As colunas de antes/depois são `NOT NULL` **sem default** (a tabela estava vazia): um insert incompleto falha em vez de fabricar um evento pela metade. `grade` passou a aceitar 1..4. Índice único parcial `uq_review_history_user_operation (user_id, client_operation_id) WHERE client_operation_id IS NOT NULL`.

**`review_sessions`** (nova) — `status in ('ACTIVE','COMPLETED','DISCARDED')`, `started_at`, `finished_at`, `items_answered`, e índice único parcial `uq_review_sessions_one_active (user_id) WHERE status = 'ACTIVE'` — no banco, um aluno não consegue ter duas sessões abertas.

**RLS conferida no banco (não só escrita na migração):**

| Tabela | SELECT | INSERT | UPDATE/DELETE |
|---|---|---|---|
| `review_items` | `auth.uid() = user_id` | via política `ALL` com `with check` | via política `ALL` com `with check` |
| `review_history` | `auth.uid() = user_id` | `auth.uid() = user_id` **E** `EXISTS (select 1 from review_items ri where ri.id = review_item_id and ri.user_id = auth.uid())` | **nenhuma política** → append-only |
| `review_sessions` | `auth.uid() = user_id` | via política `ALL` com `with check` | via política `ALL` com `with check` |

O `EXISTS` é o ponto que a FK sozinha não garantia: sem ele, um usuário poderia gravar histórico apontando para o item de outra pessoa.

**Estado dos dados após tudo:** `review_items` 0, `review_history` 0, `review_sessions` 0. Nenhum dado de teste foi criado em produção. As estruturas legadas seguem intocadas e sem uso (D8): `review_queue` 0, `review_statistics` 0, `review_strategies` 2 linhas de configuração, campos SM-2 preservados.

## 4. Fluxo real, ponta a ponta

**Adicionar (D2 — manual, só isso).** "Adicionar à revisão" abre o catálogo do edital: disciplinas do aluno → tópicos → subtópicos. A origem é validada contra a hierarquia real e **a disciplina é derivada no servidor** (`topics.discipline_id`, ou `subtopics.topic_id → topics.discipline_id`), nunca aceita do cliente. O item nasce `NEW`, vencendo **agora** — sem intervalo inicial inventado. Clicar duas vezes devolve o mesmo item (idempotente pela unicidade); numa corrida, o erro 23505 é interpretado como "já existe".

**Fila.** Ordem: **atrasadas → vencidas hoje → novas**, com empate resolvido por vencimento mais antigo e, persistindo, pelo `id` (determinístico). Os grupos são disjuntos e comparados por **dia no fuso America/São Paulo**: um item que vence hoje às 23h ainda é "de hoje", mesmo que em UTC já seja o dia seguinte.

**Responder.** Cada resposta segue cinco passos: (1) checar `client_operation_id` — se a operação já existe, nada é reaplicado; (2) agendar pelo `ReviewScheduler`; (3) gravar o item com **controle otimista** (`.eq("review_count", esperado)`) — se outra aba respondeu no meio, a resposta tardia volta como **conflito controlado**, sem duplo agendamento e sem evento; (4) gravar o evento imutável (o índice único cobre a corrida); (5) recontar as respostas reais da sessão. Os quatro botões mostram a **previsão real** do agendador ("Errei / Difícil / Bom / Fácil" com o intervalo que cada nota produz), cada um com `aria-label` descrevendo nota e intervalo.

**Revisão antecipada.** "Revisar agora" num item futuro é permitido; o evento é marcado `early = true` e quem calcula o efeito é a biblioteca, não uma regra nossa.

**Encerrar (D4).** `finalizeSession` usa o próprio UPDATE como trava (`status = 'ACTIVE'` + `.select("id").maybeSingle()`): duas chamadas quase simultâneas — o botão "encerrar" numa aba e o encerramento automático na outra — não gravam duas linhas em `study_history`. Quando há pelo menos uma resposta, grava **um** registro real de estudo (`study_source: "REVIEW"`, `study_type: "REVISAO"`, duração medida do início da sessão até o encerramento, disciplina derivada dos itens respondidos), chama o **mecanismo central único** do ciclo (`registerStudyToCycle`), revalida `HISTORY_PATHS` e invalida o cache de Estatísticas. O Cycle Engine **não foi tocado**: há teste que falha se o módulo de revisões escrever em `study_cycles`, `study_cycle_sessions` ou `study_cycle_items`. Sessão sem resposta não gera estudo nenhum.

**Suspender / arquivar.** Saem da fila e das contagens ativas, e o histórico continua intacto — nada é destruído. Reativar e restaurar devolvem o item.

**Sem limites diários (D9).** Não existe teto de novos por dia nem de revisões por dia.

## 5. Honestidade do que a tela mostra

Sem respostas, a retenção é `—`, não 0%. Sem itens, a fila é vazia com texto explicando que nada é agendado sozinho a partir dos estudos. Sem fila para hoje, a próxima revisão é anunciada com a data real. Item cujo conteúdo saiu do edital aparece como "Conteúdo removido do edital", em vez de um título inventado. Não há "Revisão Inteligente" nem "IA de Revisão": a página se chama **Revisões**, usa o design system existente e o subtítulo diz o que o sistema faz — "Repetição espaçada: o intervalo de cada tópico é calculado pelas suas respostas".

## 6. Desempenho das leituras

Nada carrega milhares de linhas: as contagens usam `{ count: "exact", head: true }` (nenhuma linha trafega), as listas têm `.limit()` explícito e o catálogo de subtópicos passou a ser **paginado** (o `.limit(3000)` que eu havia escrito seria cortado em 1.000 pelo PostgREST, em silêncio — foi um teste novo que pegou isso). O limite global de 1.000 do PostgREST continua intocado. Há teste que falha se qualquer leitura de `review_items`/`review_history`/`review_sessions` no repositório ficar sem limite explícito.

## 7. Testes

Novos arquivos, todos com **datas fixas** e **sem `Math.random()`**:

- `src/infrastructure/reviews/fsrs-scheduler.test.ts` (15 testes) — contrato do agendador: item novo, primeira resposta, **graduação**, regressão do `learning_steps`, recaída, revisão antecipada, previsão das quatro notas (inclusive "a previsão é exatamente o que a nota agenda"), determinismo entre chamadas e entre instâncias, retenções diferentes não se contaminam, e ausência de aleatoriedade no código.
- `src/application/review-engine/review-queue.test.ts` (18 testes) — regras puras: grupos disjuntos, bordas de fuso (23h de hoje × 00h30 de amanhã), ordenação e empates, idempotência da ordenação, texto de intervalo, retenção medida.
- `src/application/review-engine/review.service.test.ts` (35 testes) — fluxo contra um banco em memória **com escrita** (`src/lib/testing/fake-review-db.ts`, novo) que reproduz os três índices únicos reais e devolve o mesmo código de erro do Postgres (23505): estado vazio, adicionar tópico e subtópico, hierarquia, origem inexistente, duplicação, isolamento entre alunos, ordem da fila, contagens, previsões no card, sessão única e retomada, revisão antecipada, gravação do item exatamente como o agendador calculou, evento com antes/depois, contador real da sessão, **idempotência** por `client_operation_id`, **concorrência** (a outra aba responde no intervalo entre a leitura e a gravação → conflito controlado), suspender/arquivar preservando histórico, encerramento sem respostas, catálogo com mais de 1.000 subtópicos.
- `src/application/review-engine/review-study-history-d4.wiring.test.ts` (14 testes) — trava D4 (study_history com valores reais, nunca constantes), D2 (nem estudo nem simulado criam revisão), D3 (nenhum flashcard) e D6 (replan, Meu Dia e metas não leem revisões).

**Limite honesto:** o caminho de `finalizeSession` **com** respostas grava `study_history` e em seguida chama o ciclo e `revalidatePath`, que exigem contexto de requisição do Next e banco real — o projeto não tem infraestrutura de teste de integração. Os dois caminhos seguros (sessão já encerrada, sessão sem respostas) são testados de verdade; a gravação do estudo, a reconciliação do ciclo, a invalidação do cache e a trava de idempotência estão cobertas por testes de wiring (leitura do código-fonte), que é a prática já adotada no projeto. RLS, CHECKs e concorrência de duas conexões foram verificados no banco real.

Testes antigos atualizados porque o módulo mudou de forma (não porque a garantia mudou): `performance-fase-f.wiring.test.ts`, `performance-fase-f1.wiring.test.ts`, `performance-audit.wiring.test.ts`, `truncation-guard.pagination.test.ts`, `fase-h-dados-reais.test.ts`. Os testes do motor antigo (`fsrs-engine.test.ts`, `queue-engine.test.ts`) saíram com o motor.

## 8. Validação executada

| Comando | Resultado |
|---|---|
| `npm ci --ignore-scripts` | ok |
| `npm test` | **1204 testes, 1204 passando, 0 falhando** (167 suítes) |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | compilou com sucesso; `/dashboard/reviews` presente |
| `eslint` nos arquivos novos | sem erros |
| Schema/RLS/índices/constraints no banco real | conferidos após a migração |

## 9. Três pontos que precisam da sua decisão

**1. Widget "Revisões" no Dashboard × D6.** Já existia um widget de revisões no Dashboard, e a consulta dele (`getPendingReviewsSummary`) filtrava por `deleted_at` e `is_suspended` — colunas que **nunca existiram** em `review_items`. Ou seja: a consulta falhava e o widget mostrava "0 pendentes" para sempre. Corrigi as colunas (`suspended_at`/`archived_at`) e tirei o `difficulty ?? 4.93` que inventava dificuldade, porque deixar um número falso no Dashboard é pior. Mas o D6 diz que revisões vivem só na página de Revisões: **remover esse widget é decisão sua** — eu não removi nada que já estava na tela.

**2. Ações mortas do simulado.** `sendQuestionToReviewAction` e `createFlashcardFromQuestionAction` (acessíveis apenas por UI hoje desativada) gravavam `review_items` com `source_type` "QUESTION"/"FLASHCARD", que o schema não aceita mais. Elas agora respondem uma mensagem explícita ("não disponível nesta versão") **sem tocar no banco**, em vez de estourar violação de CHECK. No fechamento do simulado, o bloco que criava revisão a partir dos erros foi removido (D1/D2) — ele já falhava em silêncio; as tentativas continuam sendo gravadas em `question_attempts`, nada do simulado foi perdido.

**3. Fim de linha no repositório (não é desta fase).** O `git status` mostra 214 arquivos modificados, mas **161 deles diferem apenas por fim de linha** (CRLF na pasta × LF no HEAD): `docs/`, `.agents/skills/`, `.sql` — arquivos que esta fase não tocou. Vale olhar antes de commitar, senão o commit fica enorme e ilegível. Com mudança real de conteúdo são **53 arquivos** (Fase H + Fase I.1) e **18 novos**. Não mexi em nada disso: nenhum `git add`, `commit`, `push`, `reset` ou `checkout` foi executado.

## 10. O que você precisa fazer

1. **`npm install`** na sua máquina — a dependência nova (`ts-fsrs@5.4.2`) está em `package.json`/`package-lock.json`, mas o `node_modules` do seu computador ainda não a tem. Tentei instalar pelo acesso remoto e o npm falhou ao renomear pastas dentro de `node_modules` através do compartilhamento (limitação do acesso, não do projeto); conferi depois que `package.json`, `package-lock.json` e o `node_modules` ficaram intactos.
2. Rodar `npm test`, `npx tsc --noEmit` e `npm run build` localmente para confirmar no seu ambiente.
3. Revisar e **commitar você mesmo** — nada foi commitado nem enviado.
4. A migração **já está aplicada no banco de produção**. O arquivo `supabase/migrations/20260925_review_system_fsrs.sql` existe para o histórico versionado; não aplique de novo.

## 11. Arquivos

**Criados (14):** `supabase/migrations/20260925_review_system_fsrs.sql`; `src/domain/reviews/review-scheduler.ts`; `src/infrastructure/reviews/fsrs-scheduler.ts` e `.test.ts`; `src/application/review-engine/review-queue.ts` e `.test.ts`; `src/application/review-engine/review.repository.ts`; `src/application/review-engine/review.service.test.ts`; `src/application/review-engine/review-study-history-d4.wiring.test.ts`; `src/features/reviews/components/reviews-view.tsx`, `review-session-modal.tsx`, `add-to-review-modal.tsx`; `src/lib/testing/fake-review-db.ts`.

**Reescritos (6):** `src/domain/reviews/models.ts`; `src/application/review-engine/review.service.ts`, `review.actions.ts`, `review-engine.service.ts`; `src/app/(protected)/dashboard/reviews/page.tsx`.

**Ajustados (7):** `package.json`, `package-lock.json`, `src/application/simulados/simulados.actions.ts`, `src/application/study-plan/replan/adaptive-replan.service.ts`, e os testes `performance-audit.wiring.test.ts`, `performance-fase-f.wiring.test.ts`, `performance-fase-f1.wiring.test.ts`, `truncation-guard.pagination.test.ts`, `fase-h-dados-reais.test.ts`.

**Removidos (9):** `review-engine/fsrs-engine.ts`, `fsrs-engine.test.ts`, `queue-engine.ts`, `queue-engine.test.ts`, `review-analytics.service.ts`; `features/reviews/components/flashcard-library.tsx`, `review-tabs.tsx`, `review-player-modal.tsx`, `start-review-button.tsx`.

---

## IMPLEMENTADO

- Agendamento por biblioteca FSRS real e validada (`ts-fsrs@5.4.2`, MIT), atrás de porta de domínio, determinístico.
- Revisão de **tópico e subtópico do edital**, criada **manualmente**.
- Migração formal aplicada e schema, RLS, índices e constraints conferidos no banco real.
- Fila com grupos disjuntos, ordem atrasadas → hoje → novas e desempate determinístico, em dia de São Paulo.
- Sessão de revisão com uma única sessão ativa por aluno, retomada, descarte e relatório real.
- Resposta com as quatro notas e previsão real de intervalo, acessível por teclado e leitor de tela.
- Idempotência por `client_operation_id` e controle otimista de concorrência com conflito controlado.
- `review_history` como evento imutável (append-only por RLS) com antes e depois de cada resposta.
- Tempo de revisão registrado como estudo real (`study_history`, `REVIEW`/`REVISAO`) com reconciliação pelo mecanismo central do ciclo, sem duplicar tempo.
- Suspender, reativar, arquivar e restaurar, preservando o histórico.
- Revisão antecipada.
- Estado vazio e retenção honestos; leituras limitadas, sem risco do corte de 1.000 linhas.
- 82 testes novos; suíte completa em 1204 testes passando.

## FUTURO (não entregue, e não foi prometido)

- **Flashcards** — decisão D3: nenhuma tabela `flashcards`, nenhum player, nenhuma biblioteca de cartões. Fora desta entrega.
- **Revisão de questões e de erros de simulado** — a origem aceita hoje é apenas tópico/subtópico do edital.
- **Criação automática de revisão a partir de sessões de estudo** — decisão D2: nada é agendado sozinho; é o aluno que adiciona.
- **Revisões em Meu Dia, metas, planejamento e indicadores do Dashboard** — decisão D6: fora, por ora (ver o ponto 1 da seção 9 sobre o widget que já existia).
- **Limites diários de novos itens e de revisões** — decisão D9: não existem.
- **Retenção configurável pelo aluno** — a porta já aceita o parâmetro; a interface não expõe.
- **Offline** — não foi tocado; revisões exigem conexão.
