# NomeIA — Fase I.4: auditoria final de aceitação do sistema de revisões

**Data:** 25/09/2026
**Natureza:** auditoria somente de leitura. **Nenhuma linha de código foi alterada nesta fase**, nenhum DDL foi executado, nada foi commitado ou enviado.
**Base auditada:** Fases I.1 (implementação), I.2 (fechamento) e I.3 (consistência transversal).

---

## RESULTADO GERAL

> ## NÃO APROVADO — por 3 achados ALTO
>
> O núcleo do sistema está sólido: modelo de dados, RLS, idempotência, concorrência, paginação, isolamento entre alunos, FSRS isolado e determinístico, e nenhum dado falso na interface de Revisões. Não encontrei nenhum achado CRÍTICO, e D1–D9 estão todos cumpridos.
>
> O que bloqueia são três coisas pequenas de corrigir e grandes de consequência: **um texto que anuncia ao aluno uma escada de intervalos que não existe**, e **dois caminhos de erro que transformam falha de consulta em zero** — um deles perde, em silêncio e sem chance de recuperação, o registro de estudo de uma sessão de revisão já respondida. Como a premissa do módulo é "tempo de revisão é tempo de estudo" e a regra de produto é "nunca transformar ausência de dado em zero falso", os três precisam cair antes da próxima funcionalidade.
>
> Estimativa: as três correções são pontuais (uma string, uma reordenação de duas chamadas, um canal de erro). Todo o resto está aprovado.

---

## ACHADOS

### ALTO

| # | Arquivo | Problema | Evidência | Ação recomendada |
|---|---|---|---|---|
| A1 | `src/app/(protected)/dashboard/reviews/loading.tsx:13` | O esqueleto de carregamento anuncia **"Repetição espaçada: 24h · 7d · 15d · 30d · 60d"** — uma escada fixa que não existe em lugar nenhum do código. Quem abre a página lê isso antes do conteúdo. A página real diz o correto ("o intervalo de cada tópico é calculado pelas suas respostas"). | O texto está no arquivo; e `fase-h-dados-reais.test.ts:267` proíbe exatamente essa string — mas só verifica `page.tsx`, então `loading.tsx` escapou da guarda | Usar no esqueleto a mesma descrição da página real e estender a asserção do teste para `loading.tsx` |
| A2 | `src/application/review-engine/review.repository.ts:280` (`countActive`) | `return result.error ? 0 : (result.count ?? 0)` — falha de consulta vira **zero medido**. Alimenta as seis contagens da página: o aluno vê "Para revisar agora: 0", "0 atrasadas", e o botão "Iniciar revisão" fica desabilitado (`dueTotal === 0`), com a frase "Você não tem revisões agendadas". `ReviewsOverview` não tem nenhum campo de erro para distinguir "não há" de "não foi possível ler" | `review.repository.ts:280`; `ReviewsOverview` (`models.ts:132-143`) sem canal de erro; `reviews-view.tsx:126,135` | Propagar a falha (ex.: `counts: null` ou um `loadError` no `ReviewsOverview`) e a UI dizer "não foi possível carregar", em vez de zero |
| A3 | `src/application/review-engine/review.repository.ts:567` + `review.service.ts:437-450` | Em `finalizeSession` a sessão é marcada **COMPLETED antes** de ler as respostas. Se `listSessionAnswers` falhar, ela devolve `[]`, `answers.length === 0` e o `study_history` **não é gravado** — e como a sessão já não está ACTIVE, encerrar de novo retorna na guarda de idempotência: o tempo de estudo daquela sessão está perdido para sempre, e o relatório diz "Nenhum item respondido nesta sessão" | `listSessionAnswers` → `if (error) return []`; ordem das chamadas em `finalizeSession`; guarda `if (!claimedSession) return { cycleSyncError: null }` | Ler as respostas **antes** do compare-and-swap, ou propagar o erro de leitura (não tratar falha como sessão vazia). O caminho de erro não pode custar um registro de estudo real |

### MÉDIO

| # | Arquivo | Problema | Evidência | Ação recomendada |
|---|---|---|---|---|
| M1 | `src/application/mentor-ai/engine/rule-engine.ts:24-27,39-40` | O `GlobalScore` do mentor tem `performance`, **`retention`** e `questions` todos iguais a `context.performance.overallAccuracy`, que é `0` fixo no hub; mais `trend: "STABLE"` e `confidence: 85` inventados. O componente chamado "retention" não mede retenção nenhuma. Não aparece na tela (a Fase H removeu o índice do feed), mas **é persistido inteiro** em `mentor_history` a cada sessão | `rule-engine.ts:25`; `intelligence.hub.ts:64-69`; `mentor-feed.tsx:10-13` (documenta a ocultação); `mentor-ai.service.ts` → `MentorHistoryService.logSession` grava `response` | Mesmo tratamento que a I.3 deu às revisões: remover os campos sem fonte do contrato, ou não persistir um score cujos componentes são fixos |
| M2 | `src/application/mentor-ai/hub/intelligence.hub.ts:45` | `let weeklyHoursTarget = 20` — meta semanal inventada quando o perfil não tem `weekly_study_hours`, entrando no contexto como se fosse a meta do aluno. A mesma classe de default já é proibida por teste em outro módulo | `intelligence.hub.ts:45`; `fase-h-dados-reais.test.ts:250` (proíbe `weekly_study_hours \|\| 10`) | Tratar ausência como ausência (campo opcional), não como 20h |
| M3 | `src/application/study-analytics/statistics-center.action.ts:363-378` e `:344-359` | `loadReviewsCompletedLast30` **nem checa `error`** e devolve 0; `loadReviewItems` em erro devolve `[]` sem sinalizar à UI. Vira "Concluídas 30d: 0" e o estado vazio "Sem revisões" — ausência de dado como "você nunca revisou" | os dois blocos citados | Checar `error` e diferenciar "sem dados" de "falha ao carregar" na página |
| M4 | `src/application/review-engine/review.repository.ts:551` | `countSessionAnswers` devolve 0 em erro, e esse 0 é **gravado** em `review_sessions.items_answered` | `repository.ts:551`; `review.service.ts:385-386` | Não persistir contador derivado de leitura que falhou |
| M5 | `src/application/review-engine/review.actions.ts` (`discardReviewSessionAction`) | A action existe, é testada no serviço e **nenhuma UI a chama** — o fluxo "descartar sessão" (T) não é alcançável pelo aluno. Como está num arquivo `"use server"`, é também um endpoint público sem consumidor | busca em `src/features/reviews/**` e na página: nenhuma referência | Ou expor "descartar" no modal, ou remover a action (o serviço pode ficar) |
| M6 | `src/application/study-session/session-orchestrator.ts:100-107` + `src/features/study-session/components/active-session-runner.tsx:603` | O runner de sessão de estudo (rota de produção `/dashboard/study-session`) coleta "**Revisões concluídas (tópicos)**" do aluno e chama `logReviewsToEngine`, que é um **stub com um `console.warn`**: nenhum item do motor de revisões é concluído. O número só vai para o `metadata` do histórico | o stub e o campo, ambos verificados | Renomear o campo para deixar claro que é anotação própria, ou remover o campo e o stub. Não integrar (D2 continua valendo) |
| M7 | `src/application/achievements/achievements.action.ts:177-179` | Quando `review_history` está vazio, sessões com `study_type = "REVISAO"` passam a contar como "revisões concluídas" na conquista. Com o sistema novo, a base do número muda sozinha na primeira resposta real | o `if` citado; `conquistas-view.tsx:350` exibe "Você já concluiu N revisões." | Escolher uma base só (eventos de revisão) e dizer na tela o que está sendo contado |
| M8 | `src/application/review-engine/review.service.ts:470` vs `:526-529` | A duração gravada usa `Math.max(1, …)` e a exibida `Math.max(0, …)`: uma sessão de 20 segundos grava **1 minuto** em `study_history`/ciclo/estatísticas e mostra **"0 min"** no resumo. Dois números para a mesma sessão, e o minuto gravado não foi medido | as duas linhas | Unificar o arredondamento nas duas pontas (e decidir se sessão de segundos vira estudo) |

### BAIXO (não corrigir automaticamente)

| # | Arquivo | Problema |
|---|---|---|
| B1 | `review.actions.ts:238` | Linha em branco extra no fim do arquivo — **o único apontamento de `git diff --check`** em toda a superfície de revisões (sobrou do `sed` da Fase I.2) |
| B2 | `src/domain/reviews/models.ts:32` | `REVIEW_GRADES` é exportado e não usado; o modal define o seu próprio `GRADE_ORDER` com o mesmo conteúdo |
| B3 | `review.repository.ts` | Exports usados só dentro do próprio arquivo (`ITEM_COLUMNS`, `mapItemRow`, `DueGroup`, `InsertItemInput`, `InsertEventInput`, `EditalSource`, `ExistingEvent`, `SessionAnswer`) — superfície pública maior que o necessário |
| B4 | `stats-engine.ts:63-68,654-663` | `ReviewItemRow.status` nunca é preenchido (o loader só seleciona `id, discipline_id, next_review_at`) — campo fantasma que sugere um status de revisão que a consulta não traz |
| B5 | `review.repository.ts:588` (`recentGrades`) | A retenção é calculada sobre no máximo 1.000 respostas; acima disso a UI diria "1.000 respostas (12 meses)" quando há mais |
| B6 | `review.actions.ts:163-178` | `durationSeconds` vem do cliente sem limite superior; entra no evento (`review_history.duration_seconds`) apenas como registro — não afeta o tempo de estudo, que é calculado no servidor |
| B7 | `src/lib/sao-paulo.ts` e `stats-engine.ts:477` | Duas implementações independentes do "dia em São Paulo". **Testei quatro casos de borda (23h, 00h30, virada de ano): concordam em todos** — é duplicação, não divergência |
| B8 | `stats-engine.ts:2172` | `completionRate` mistura eventos dos últimos 30 dias com itens pendentes agora, sob o rótulo "Taxa de conclusão" (a fórmula é divulgada no subtítulo da UI) |
| B9 | `src/domain/mentor-ai/mentor-ai.thresholds.ts:6,19-22` | Limiares de revisão (`reviewBacklog: 100`, `overdueWarning: 20`, `overdueCritical: 50`) sem nenhum consumidor, num módulo cujo contrato não tem dados de revisão |
| B10 | `mentor-ai/engine/explanation-engine.ts:17-20` | Mensagem `LOW_RETENTION` que nenhuma capability emite (código morto) e placeholder `[Insight não traduzido: …]` que seria renderizado cru no feed |
| B11 | `stats-engine.ts` (`computePriorities`) | Conselho fixo "revisões espaçadas a cada 7 dias" contradiz o discurso do módulo (intervalo calculado pelo FSRS) |
| B12 | `review.repository.ts:72-73` | `stability`/`difficulty` com default 0 em `mapItemRow`. **Conferi na biblioteca:** é exatamente o que `createEmptyCard` do ts-fsrs produz para item novo (verificado: `{"stability":0,"difficulty":0}`), então **não é valor inventado** nem falsifica agendamento; só teria efeito numa linha legada com coluna nula, e a tabela não tem nenhuma |
| B13 | cobertura de testes | O caminho positivo de `finalizeSession` (com respostas → grava estudo uma única vez) é coberto por testes de wiring, não de comportamento — limitação já documentada na I.1 (não há infra de integração) |
| B14 | RLS de `review_items` | A política `ALL` inclui DELETE: o app nunca apaga (suspende/arquiva), mas o aluno poderia apagar os próprios itens via API. Não é falha de segurança (dado próprio); é o append-only valendo só para o histórico |

---

## D1–D9

| Decisão | Veredito | Como foi verificado |
|---|---|---|
| **D1** — só `EDITAL_TOPIC`/`EDITAL_SUBTOPIC` | **OK** | tipo do domínio (`models.ts:39`), CHECK no banco, `isReviewSourceType` validando na action, e nenhuma outra origem no código (só menções em comentários) |
| **D2** — criação manual, nada automático | **OK** | teste varre `session-orchestrator`, `study-history.actions`, `study-session.action` e `simulados.actions`: nenhum escreve em `review_items`. Ressalva M6: o runner coleta um número de "revisões concluídas" que não chega ao motor — não cria revisão, mas engana o aluno |
| **D3** — nenhum flashcard ativo | **OK** | nenhuma tabela, player ou ação; `"FLASHCARD"` só em comentários. (`study_type: "FLASHCARDS"` no histórico é outra coisa: o aluno registrando estudo com cartões fora do app) |
| **D4** — sessão com resposta gera estudo; sem resposta não gera | **OK, com o risco A3** | wiring de D4 + teste de comportamento dos caminhos seguros. Em caminho de erro de leitura, A3 faz uma sessão **com** respostas se comportar como sem |
| **D6** — revisões só na própria área | **OK** | widget do Dashboard removido (I.2), replan devolve mapa vazio sem consultar, Meu Dia e metas não leem, Mentor sem bloco de revisões (I.3). Estatísticas e Conquistas leem dados de revisão — fora da lista do D6 e com dado real |
| **D7** — só o adaptador importa `ts-fsrs` | **OK** | uma única importação, em `fsrs-scheduler.ts:13`, com teste que falha se serviço, repositório, actions, fila ou UI importarem |
| **D8** — legado sem uso | **OK** | nenhuma referência no código a `review_queue`, `review_statistics`, `review_strategies`, `ease_factor`, `memory_strength`, `forget_probability`, `base_priority`. No banco: `review_queue` 0, `review_statistics` 0 linhas |
| **D9** — sem limite diário | **OK** | nenhum teto de novos/dia ou revisões/dia em nenhuma camada |

---

## SEGURANÇA

**RLS conferida no banco (leitura):** as três tabelas têm RLS ligada, sem nenhum trigger.

| Tabela | SELECT | INSERT | UPDATE/DELETE |
|---|---|---|---|
| `review_items` | `auth.uid() = user_id` | política `ALL` com `with check` | política `ALL` (inclui DELETE — ver B14) |
| `review_history` | `auth.uid() = user_id` | `auth.uid() = user_id` **E** `EXISTS (review_items ri WHERE ri.id = review_item_id AND ri.user_id = auth.uid())` | **nenhuma política** → append-only garantido pelo banco |
| `review_sessions` | `auth.uid() = user_id` | política `ALL` com `with check` | política `ALL` com `with check` |

O `EXISTS` na inserção de histórico é o ponto que a FK sozinha não garante: sem ele daria para gravar histórico apontando para o item de outra pessoa.

**Concorrência e unicidade, no banco:** `review_items_user_id_source_type_source_id_key` (um item por origem e aluno), `uq_review_history_user_operation` parcial (idempotência por `client_operation_id`), `uq_review_sessions_one_active` parcial (uma sessão ACTIVE por aluno). Em código: controle otimista por `review_count` na gravação do item (resposta tardia vira conflito controlado, com teste que simula a corrida no intervalo entre leitura e escrita) e compare-and-swap no encerramento da sessão (sem duplicar tempo de estudo).

**Identidade:** nenhuma das dez actions de revisão aceita `userId` do cliente — todas derivam o dono por `getEffectiveUserId` (com modo suporte) e devolvem erro claro se não houver sessão. Entradas validadas: `grade` por `isReviewGrade`, origem por `isReviewSourceType`, `clientOperationId` obrigatório. Única lacuna: `durationSeconds` sem limite superior (B6).

**Isolamento entre alunos:** testado em cinco situações (visão geral, abrir sessão em item alheio, responder em sessão alheia, suspender item alheio, encerrar sessão alheia) e reforçado pela RLS.

---

## PAGINAÇÃO

Mapeei **todas** as 26 consultas às três tabelas, em produção, e classifiquei cada uma:

| Tipo de leitura | Quantidade | Como é limitada |
|---|---|---|
| Contagens | 4 | `{ count: "exact", head: true }` — nenhuma linha trafega |
| Listas da fila e das seções | 6 | `.limit(...)` explícito, com `ORDER BY next_review_at, id` (desempate por id) |
| Buscas de um registro | 7 | `.maybeSingle()` |
| Leituras paginadas | 2 | `fetchAllRowsPaged` com ordenação determinística (catálogo de itens já em revisão; `review_items` das Estatísticas) |
| Escritas | 7 | insert/update (sem leitura) |

Nenhuma leitura sem limite explícito. Nenhuma depende do corte de 1.000 linhas do PostgREST, e o limite global **não foi alterado**. O catálogo grande foi testado com 1.800 itens e 1.200 subtópicos, sem truncar. `nextDueAfter` ordena só por `next_review_at` sem desempate, mas devolve apenas o valor da data — empate não gera ambiguidade. Dois tetos merecem registro (B5: retenção sobre até 1.000 respostas; e a lista de respostas da sessão em 1.000), ambos muito acima do uso humano de uma sessão.

---

## DADOS

**Papel de cada tabela, confirmado no código:** `review_items` guarda só o estado atual (12 consultas, todas no repositório); `review_history` só eventos — **não existe nenhum `update`, `upsert` ou `delete` de `review_history` em lugar algum do código**, e o banco também não permite; `review_sessions` só o agrupamento da sessão. Nenhuma faz o papel da outra: o contador da sessão é recontado a partir dos eventos, e o estado do item vem do agendador.

**Campos:** os nove campos de memória são gravados por `memoryColumns` e lidos por `mapItemRow` **um a um, simétricos** — `review_stage`, `stability_score`, `difficulty`, `scheduled_days`, `learning_steps`, `review_count`, `lapses_count`, `last_review_at`, `next_review_at`. Nenhum é ignorado, nenhum é calculado em dois lugares diferentes. Os campos legados SM-2 não são lidos nem escritos.

**FSRS:** verificado sem alterar nada — item novo nasce com o estado da própria biblioteca; "Bom" leva NEW a LEARNING no passo seguinte; o último passo gradua para REVIEW com intervalo em dias; "Errei" em REVIEW cai para RELEARNING, soma recaída, reduz estabilidade e aumenta dificuldade; revisão antecipada marca `early` e usa os dias reais decorridos; a previsão das quatro notas é crescente e **idêntica** ao que cada nota realmente agenda; o mesmo estado + nota + instante dá sempre o mesmo resultado, inclusive entre instâncias diferentes; `enable_fuzz` desligado; nenhum `Math.random()` e nenhum `new Date()` dentro da lógica determinística (o instante entra por parâmetro — os `new Date()` que existem são defaults de fronteira no serviço e nas actions). Há teste de regressão provando que, sem `learning_steps` persistido, o item nunca graduaria.

**Números falsos:** na interface de Revisões, **não encontrei nenhum**. Retenção sem respostas é `—` (nunca 0%), fila vazia tem três frases distintas conforme a situação real, próxima revisão usa a data agendada, o card mostra o grupo (Atrasada/Para hoje/Nova/Próxima) e os quatro botões mostram o intervalo real de cada nota, conteúdo saído do edital aparece como "Conteúdo removido do edital", e suspensas/arquivadas têm rótulo explícito de que o progresso e o histórico continuam guardados. Não existem `?? 4`, `?? 4.93`, `?? 2.5`, "0 pendentes" nem textos com "inteligente"/"IA" prometendo agendamento automático. Os zeros que encontrei são de duas naturezas: contadores que de fato começam em zero (legítimos) e os **erros silenciados** de A2, A3, M3 e M4 — a única categoria de dado falso que sobrou no módulo. Fora do módulo, os zeros fixos do Mentor (M1, M2).

---

## TESTES

| Comando | Resultado |
|---|---|
| `npm test` | **1227 testes, 1227 passando, 0 falhando** (172 suítes, 0 skipped) |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | compilou com sucesso; `/dashboard/reviews` e `/estatisticas` presentes |

Nenhum teste foi alterado nesta fase (não houve falha para investigar).

**Cobertura dos 24 fluxos pedidos:** A a X têm teste correspondente — adicionar tópico e subtópico, duplicidade, as três filas, revisão antecipada, as quatro notas (Errei/Difícil/Bom/Fácil, as duas últimas também pela previsão que percorre 1–4), aprendizado→revisão, recaída, suspender/reativar/arquivar/restaurar, encerrar, retomar, descartar, duas abas simultâneas, mesma operação repetida, estudo registrado uma única vez e isolamento entre alunos. Duas ressalvas: **R/W** têm o caminho positivo (com respostas) coberto por wiring, não por comportamento (B13), e **T** (descartar) é testado no serviço mas não tem UI (M5).

---

## BANCO

- **Nenhuma migration criada, nenhum DDL executado.** Só `SELECT` de verificação.
- Estado igual ao que a I.1 deixou: `review_items` 23 colunas / 2 políticas / 5 índices / 7 constraints; `review_history` 25 / 2 / 5 / 8; `review_sessions` 7 / 2 / 3 / 3; nenhum trigger.
- Dados: `review_items` 0, `review_history` 0, `review_sessions` 0 — nenhum dado de teste foi criado em produção em nenhuma das fases. `study_history` com `REVIEW`/`REVISAO`: 4 linhas (anteriores à Fase I). Legado: `review_queue` 0, `review_statistics` 0.

---

## GIT

```
git status --short   → 243 entradas
                        208 M  (160 só CRLF/LF · 48 com mudança real)
                         11 D
                         24 ?? (inclui os 4 relatórios em "Claude outputs/")

git diff --stat      → 219 arquivos, 19.286 inserções, 22.943 remoções
                        (inclui os 160 de fim de linha e as fases anteriores)

git diff --check     → um único apontamento em toda a superfície de revisões:
                        src/application/review-engine/review.actions.ts:238
                        "new blank line at EOF"  (achado B1)
```

Nenhum arquivo foi alterado nesta fase — os números acima são os mesmos da I.3, mais o relatório da I.3 que entrou em `Claude outputs/`. Não normalizei CRLF/LF. Nenhum commit, nenhum push, nenhuma alteração de remote.

---

## PARA DESBLOQUEAR (sugestão de Fase I.5, curta)

1. **A1** — trocar a descrição do esqueleto pela da página real e estender a asserção do teste para `loading.tsx`.
2. **A3** — em `finalizeSession`, ler as respostas antes do compare-and-swap (ou propagar o erro de leitura), para que falha de consulta nunca custe um registro de estudo.
3. **A2** — dar ao `ReviewsOverview` um canal de erro e a UI dizer "não foi possível carregar" em vez de zero; o mesmo tratamento cobre M3 e M4.

Feitos esses três, minha recomendação técnica passa a APROVADO. Os MÉDIOS (Mentor, contagem de conquistas, campo de "revisões concluídas" no runner, arredondamento da duração) podem entrar numa fase própria — nenhum deles bloqueia construir a próxima funcionalidade sobre Revisões. Os BAIXOS ficam como estão, conforme a regra desta auditoria.
