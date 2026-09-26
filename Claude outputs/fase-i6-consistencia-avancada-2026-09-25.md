# Fase I.6 — Consistência avançada e remoção de dados derivados falsos

Data: 25/09/2026 · Projeto: NomeIA (`mentor-concursos-ia`) · Trabalho **somente local**, sem commit/push.

Escopo executado: M1, M2, M3, M6, M7, M8, estado de erro do catálogo, auditoria **somente leitura** do M5 e
documentação do B13. Nenhum item B1–B14 foi corrigido, nenhuma funcionalidade nova foi criada, nenhuma
alteração de banco (DDL, RLS, índice, constraint) foi feita e nem o FSRS nem o Motor de Ciclos foram tocados.

---

## M1 — Global Score do Mentor: removido, não zerado

O Mentor exibia um "Global Score" composto por acurácia, retenção, consistência e volume. Nenhuma dessas
quatro parcelas era lida do banco: o `RuleEngine` devolvia um objeto com `trend: "STABLE"` e
`confidence: 85` fixos, e o score saía de uma média de zeros. Para o aluno, um número grande e preciso
("Score 0 · tendência estável · 85% de confiança") que não descrevia nada.

A correção não foi ajustar o cálculo, e sim remover o conceito: a interface `GlobalScore` deixou de existir
em `mentor-ai.models.ts`, `MentorResponse` não tem mais `globalScore`, o `RuleEngine.executeAll` agora
devolve apenas `{ insights }`, o `heuristic.provider` retorna só `feed` + `rawInsights` e o `mentor-feed`
não tem mais o cartão do score. O Mentor continua entregando o que ele de fato apura — os insights vindos
das regras sobre dados reais.

Um número que o produto queira mostrar no lugar disso precisa primeiro de uma fonte medida; enquanto não
houver, não há campo para preencher com zero.

## M2 — Meta semanal: 20 horas deixou de ser o padrão silencioso

`intelligence.hub.ts` inicializava `weeklyHoursTarget = 20` e só substituía o valor se o perfil tivesse
meta configurada. Quem nunca configurou meta nenhuma entrava no contexto do Mentor como se tivesse
escolhido 20 horas por semana, e todo raciocínio sobre carga (inclusive risco de burnout) passava a comparar
o estudo real contra uma meta inventada.

Agora `weeklyHoursTarget` é `number | null`: tem meta no perfil → usa a meta; não tem → `null`. O tipo em
`mentor-ai.models.ts` mudou junto, com o comentário explicando por quê, e o `prompt-builder` não escreve
mais linhas de meta quando não há meta. A ausência de configuração agora aparece como ausência.

## M3 — Estatísticas de revisão: erro deixou de virar zero

A seção de revisões do Centro de Estatísticas lia duas fontes (itens de revisão e contagem de revisões dos
últimos 30 dias) e, quando qualquer uma das duas falhava, mostrava a seção completa zerada — mesma tela que
um aluno sem nenhuma revisão cadastrada veria.

`statistics-center.action.ts` passou a declarar a falha: `reviewItems: ReviewItemRow[] | null` e
`reviewsCompletedLast30: number | null`; `loadReviewItems` começa em `null` e `loadReviewsCompletedLast30`
desestrutura `{ count, error }` e devolve `null` no erro e na exceção — nunca zero. Os `?? 0` que restam
nessas funções estão **depois** de um `if (error) return null`, cobrindo apenas o caso em que o PostgREST
responde com sucesso e `count` nulo (é default técnico, não conversão de erro).

Na `statistics-center-view.tsx`, `revisionStats` é `null` quando qualquer uma das leituras falhou, e a
`RevisionSection` tem três blocos separados e explícitos — erro, vazio e dados —, sem ternário encadeado.
`EMPTY_REVISION_STATISTICS` existe para o caso de vazio de verdade, com `completionRate: null`.

## M6 — Campo "Revisões concluídas" do cronômetro: removido

O runner da sessão de estudo tinha um input onde o aluno digitava quantas revisões concluiu. Esse número
não tinha ligação nenhuma com o motor de revisões: não criava item, não respondia card, não alimentava o
FSRS, não aparecia na página de Revisões. Ele viajava pelo `study-provider`, pela action e pela sessão até
o payload como `reviews_completed`, e o resumo o exibia — dois conceitos com o mesmo nome e nenhuma relação
entre si, exatamente o que a D6 proíbe.

Retirados: o input (substituído por um comentário explicando a decisão), o estado `reviews`, o campo em
`FinalStats`, o `reviews_completed` do payload e dos metadados, o `reviewsCompleted` dos dois modelos de
sessão, o stub `logReviewsToEngine` do orquestrador e as ocorrências no serviço de homologação. Revisão se
responde na página de Revisões, e o tempo dela já entra como estudo pelo caminho da D4.

## M7 — Conquistas: uma fonte só para "revisões"

As Conquistas contavam `review_history` e, quando essa contagem vinha vazia, passavam a somar sessões de
estudo com `study_type = "REVISAO"`. São duas coisas diferentes: o aluno registrando manualmente que
estudou revisando, e uma resposta de revisão no motor de repetição espaçada. Pior, a base do número mudava
sozinha na primeira resposta real — o total podia cair de um dia para o outro.

`review_history` passou a ser a fonte canônica única, e o fallback por sessão de estudo foi removido. O
fallback equivalente de `SIMULADO` ficou intocado de propósito (não é objeto desta fase), e um teste prova
essa cirurgia. O texto da tela passou a dizer o que está sendo contado: "revisões respondidas", "Você já
respondeu…", "Responda sua primeira revisão na página de Revisões".

Confirmação no banco de produção: `review_history` tem 0 linhas e existem 4 linhas em `study_history` com
`study_source = 'REVIEW'`, todas criadas em 13/08/2026 por importação, com `started_at` de 2025 e maio/2026
— ou seja, anteriores ao próprio sistema FSRS (migração `review_system_fsrs`, de 25/09/2026). Eram
exatamente essas 4 que o fallback antigo somaria como "revisões respondidas". Hoje nenhum código as conta
como tal.

## M8 — Duração da sessão de revisão: uma regra só

Havia duas fórmulas para a mesma sessão: a gravação usava piso de 1 minuto e o resumo exibido ao aluno
usava piso de 0. Uma sessão de 20 segundos gravava 1 minuto em `study_history` (e no ciclo, e nas
estatísticas) e mostrava "0 min" na tela.

Criei `src/domain/reviews/session-duration.ts` com `reviewSessionSeconds(início, agora)` e
`reviewSessionMinutes(segundos)`, e tanto `finalizeSession` quanto `finishReviewSession` usam exatamente a
mesma composição. O piso de 1 minuto foi mantido porque é a semântica que o armazenamento já tinha:
registrar 0 perderia tempo de estudo real e o ciclo não receberia nada. O que mudou é que agora o valor
gravado e o valor exibido são o mesmo, por construção. Um teste trava a tabela de conversão e outro verifica
que o serviço não tem mais nenhum piso nem conversão de minutos solta.

## CATÁLOGO — modal "Adicionar à revisão" com estado de erro

`listUserDisciplines` fazia `if (error) return []`, e o modal então dizia "Nenhuma disciplina cadastrada"
para um aluno que tem disciplinas mas cuja consulta falhou — sugerindo que ele precisava cadastrar edital.
Era o último fallback desse tipo no módulo, e a I.5 o havia registrado como exceção conhecida.

Agora `listUserDisciplines` e `listTopicTree` devolvem `null` no erro e `[]` só quando o banco de fato
respondeu vazio; `getReviewCatalog` devolve `loadError: boolean`; a action propaga o campo; e o modal tem
três estados, com um `EmptyState` de erro ("Não foi possível carregar suas disciplinas") e botão "Tentar
novamente". O teste da I.5 que esperava "1 fallback remanescente" foi atualizado para esperar **zero**, com
o comentário registrando que a exceção foi fechada nesta fase.

## M5 — `discardReviewSessionAction` (auditoria somente leitura, sem UI)

Auditado sem alterar nada, como o escopo determina.

**Segurança.** A action chama `requireUser` e devolve "Não autenticado." sem usuário; respeita
`isMaintenanceMode()`; e o `UPDATE` no repositório filtra `.eq("user_id", userId)` além do `id`, então um
aluno não descarta a sessão de outro. Segue o mesmo padrão das demais actions do módulo.

**Não grava estudo.** `discardSession` só faz `UPDATE review_sessions SET status='DISCARDED',
finished_at=agora`. Não toca `study_history`, não chama `registerStudyToCycle`, não mexe em `review_items`
nem em `review_history`. Já existe teste executado provando que `study_history` fica vazio após o descarte.

**Não quebra o estado de sessão.** A troca de status é compare-and-swap (`.eq("status","ACTIVE")`), então um
segundo descarte devolve `false` em vez de sobrescrever uma sessão já encerrada, e `findActiveSession`
filtra `status='ACTIVE'`, de modo que a sessão descartada simplesmente deixa de ser encontrada — não sobra
sessão fantasma.

**Situação e decisão pendente.** Nenhuma tela chama `discardReviewSessionAction`: é uma action órfã, com o
serviço e o repositório completos e testados atrás dela. Ela **não foi removida** (o escopo proíbe) e **não
ganhou UI** (o escopo proíbe). A decisão de produto que falta é uma só: se o aluno pode abandonar uma sessão
de revisão pela metade e, nesse caso, o que acontece com as respostas que ele já deu — hoje elas
permanecem em `review_history` e já alteraram o agendamento FSRS dos itens respondidos, mas o tempo
decorrido não é registrado como estudo. Enquanto essa pergunta não for respondida, o caminho existe no
backend e não existe na interface.

## B13 — limitação documentada (não corrigida)

O caminho **positivo** do encerramento da sessão (gravou em `study_history`, avançou o ciclo, revalidou as
páginas) é coberto apenas por leitura de código, porque `registerStudyToCycle` e `revalidatePath` exigem
contexto de requisição do Next e um Supabase real, que o projeto não tem em teste. Documentei isso por
extenso no cabeçalho de `review-study-history-d4.wiring.test.ts`, incluindo o que **é** executado de verdade
nos testes que não são de wiring (ordem estudo-antes-do-ciclo e resiliência a falha do ciclo, sessão sem
resposta, sessão descartada, idempotência, e a igualdade entre duração gravada e exibida) e o que fica
faltando: a integração com banco e ciclo no sucesso. Fechar esse vão depende de infraestrutura de teste de
integração — decisão de projeto, não feita nesta fase.

## Varredura final de dados falsos

Padrões buscados em todo o `src`, fora de testes, e o que sobrou:

`error ? 0`, `trend: "STABLE"`, `weeklyHoursTarget = 20`, `totalOverdue`, `criticalOverdue`,
`itemsToReviewToday`: **zero ocorrências**. `if (error) return []` no repositório de revisões: **zero**.

`confidence: 85` — uma ocorrência, em `adaptive-learning.service.ts`. É outro motor (ALE), onde a confiança
é declarada por regra e está atrelada a uma condição de fato medida (queda de retenção com histerese de
duas janelas), ao lado de um `confidence: 90` para burnout. Fora do escopo desta fase; legítimo no seu
contexto, diferente do score fabricado do Mentor.

`?? 0` e `|| 0` — as ocorrências nos módulos desta fase são todas default técnico **posterior** a um
`if (error) return null` (contagens do PostgREST com `head: true`) ou soma de acumulador em `Map`. Nenhuma
transforma erro em zero.

"a cada 7 dias" — uma ocorrência, em `stats-engine.ts`: texto de recomendação para disciplina classificada
como dominada. É conselho, não intervalo do FSRS, e não afeta agendamento. Registro como observação de
redação para uma fase futura; não faz parte do escopo de correção.

`catch` em `statistics-center.action.ts:loadSessions` ainda devolve `[]` no erro, com comentário explícito
de "mesmo comportamento de antes". É o conjunto geral de `study_history` da página de estatísticas, fora do
escopo de M3 (que trata da seção de revisões). Fica registrado como o próximo candidato natural à mesma
disciplina de erro-não-é-zero.

## BANCO — nada foi alterado

Verificação somente leitura no projeto de produção: última migração aplicada é `20260925034938
review_system_fsrs` (a da Fase I.1) — nenhuma migração nova. `review_items` 23 colunas, 13 índices e 6
políticas RLS nas três tabelas de revisão, todas intactas. `review_items`, `review_history` e
`review_sessions` com 0 linhas; `study_history` com 2.863 linhas, 4 delas com `study_source='REVIEW'`
(importadas, conforme M7). Nenhum DDL, RLS, índice ou constraint foi criado, alterado ou removido, e o
limite global de 1000 linhas do PostgREST não foi tocado.

## TESTES

Suíte completa: **1.311 testes, 103 arquivos, 1.311 passando, 0 falhando** (~39s). `npx tsc --noEmit` limpo.
`npm run build` compila e gera todas as rotas (é necessário fornecer `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` na linha de comando, porque não leio seus arquivos `.env`).

Cinco arquivos novos, 54 testes, todos registrados no script `test` do `package.json`:

`mentor-no-derived-fake-data.test.ts` (13) — o Global Score não existe mais em nenhuma camada, não há
`trend`/`confidence` fixos, a meta semanal não nasce 20 e o prompt do LLM não recebe bloco de performance.
`statistics-reviews-error-vs-zero.test.ts` (11) — leitura que falha vira `null` até a tela, e a seção mostra
erro em vez de seção zerada. `study-does-not-create-review.test.ts` (6) — a sessão de estudo não cria nem
responde revisão, e o campo removido não voltou por nenhum caminho. `session-duration.test.ts` (18) — tabela
de conversão e igualdade entre o valor gravado e o exibido. `achievements-review-source.test.ts` (6) — fonte
canônica única e remoção cirúrgica do fallback, com o de simulados preservado.

Dois testes existentes foram ajustados ao novo estado, sem enfraquecer nada: o de A2 passou a exigir **zero**
fallbacks de lista vazia (era 1, a exceção do catálogo, agora corrigida) e o de wiring da D4 passou a
conferir a duração pela regra única.

## GIT — nada foi executado além de leitura

Nenhum `add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`, alteração de remote ou upload.
Nenhuma normalização de CRLF/LF. Os 31 arquivos alterados/criados foram sincronizados no seu repositório e
conferidos por md5: **457 arquivos comparados, 0 divergências** entre o que validei e o que está no seu
disco.

`git status --short` — 139 arquivos modificados em `src`/`package.json`, 11 apagados e 25 não rastreados,
acumulado desde a Fase I.1 (você ainda não commitou).

`git diff --stat` — acumulado: 139 arquivos, 12.271 inserções, 15.733 remoções. Restrito aos arquivos desta
fase: 28 arquivos, 1.309 inserções, 1.669 remoções.

`git diff --check` — apontou uma linha em branco sobrando no fim de `review.actions.ts`; corrigi (sem tocar
no fim de linha do arquivo) e o comando voltou **vazio** para todos os arquivos desta fase. Os demais avisos
de "trailing whitespace" que o comando produz no repositório inteiro são o `\r` dos arquivos CRLF que já
divergiam do HEAD antes desta fase — medição atual: 224 arquivos modificados, **156 diferem somente por
fim de linha** e 68 têm mudança real de conteúdo. Nenhum dos 31 arquivos desta fase tem fim de linha misto:
todos são LF puro, como já eram.

O commit e o push são seus.
