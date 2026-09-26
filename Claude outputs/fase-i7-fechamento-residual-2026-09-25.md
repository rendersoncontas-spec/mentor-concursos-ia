# Fase I.7 — Fechamento técnico residual do sistema de revisões

Data: 25/09/2026 · Projeto: NomeIA (`mentor-concursos-ia`) · Trabalho **somente local**, sem commit/push.

Escopo: eliminar o último fallback de erro das Estatísticas, auditar tecnicamente o descarte de sessão,
reavaliar o B13 e varrer erros silenciosos ligados a dados de estudo/revisão. Nenhuma funcionalidade nova,
nenhuma alteração de banco, FSRS e Motor de Ciclos intactos.

12 arquivos alterados ou criados, conferidos por md5 no seu repositório: **461 arquivos comparados, 0
divergências**.

---

## ESTATÍSTICAS — como `loadSessions` passou a tratar erro

O defeito era pior do que "erro virando lista vazia", e vale explicar por quê. A leitura de `study_history`
é paginada, e o paginador devolve, **junto com o erro**, as páginas que já tinham chegado. O código antigo
registrava o erro no console e seguia com esse conteúdo: uma falha na 3ª de 12 páginas produzia uma página
de estatísticas inteira construída sobre um histórico parcial — total de horas, sequência de dias, mapa de
calor, horas por disciplina, evolução e prioridades todos menores do que a realidade, sem nenhum aviso. Pior
do que não mostrar nada: o aluno decidiria o que estudar com base em números errados achando que estavam
certos. E, como o payload entra num cache de 5 minutos, a versão truncada ficaria servida por 5 minutos.

Três mudanças, todas pequenas:

`loadSessions` agora devolve `SessionRecord[] | null` e descarta as páginas parciais no erro. A decisão mora
numa regra única, `toStudySessions`, em `src/application/study-analytics/study-sessions-read.ts` — módulo
puro, sem banco e sem contexto de requisição, criado justamente para que essa decisão pudesse ser testada
por comportamento. Lista vazia passou a significar uma coisa só: o banco respondeu e não existe sessão
registrada.

`getStatisticsCenterAction` trata sessões nulas como falha da página: devolve `{ data: null, error: "Não foi
possível carregar seu histórico de estudos. Tente novamente." }` e **não grava no cache**. As sessões são a
fonte primária de tudo naquela tela; sem elas não existe página verdadeira para montar.

A tela não precisou de UI nova: ela já tinha o estado "Não foi possível carregar suas estatísticas" com botão
"Tentar novamente", que antes só aparecia quando a action falhava por completo. Agora a distinção é real e
visível: histórico vazio de verdade continua caindo nos estados "Nenhum estudo registrado no período" e "Sem
sessões"; falha de leitura cai no estado de erro, que não exibe número nenhum.

Os testes desta parte são de comportamento: usam o paginador real com uma fonte de páginas em memória que
falha onde o teste quiser, e compõem exatamente como `loadSessions` compõe. 17 testes cobrindo histórico
vazio real, histórico com registros, histórico grande lido por inteiro (95 sessões em 10 páginas), linha
inválida descartada sem virar erro, falha na primeira página, falha no meio da paginação (com assert de que
o paginador de fato entregou parciais e a regra as descartou) e exceção propagada. Mais a fiação: a guarda
vem antes do `cache.set`, e os dois textos — ausência e falha — existem em caminhos separados.

## M5 — auditoria do descarte de sessão

Auditado por comportamento, com 10 testes novos, sem criar botão e sem remover a action.

**Segurança.** A action exige usuário autenticado e respeita o modo de manutenção; o `UPDATE` filtra
`user_id` além do `id`. Comprovado: outro aluno chamando o descarte recebe `discarded: false` e a sessão do
dono permanece `ACTIVE`. Sessão inexistente não vira erro nem efeito.

**Concorrência.** A troca de status é compare-and-swap (`.eq("status","ACTIVE")`). Descartar duas vezes: a
segunda devolve `false` e **não reescreve** o `finished_at` da primeira. Descartar uma sessão já encerrada
não sobrescreve o encerramento. Descarte e encerramento disparados ao mesmo tempo terminam a sessão num
estado só — e o teste verifica a implicação completa: se ficou `DISCARDED`, existem 0 estudos; se ficou
`COMPLETED`, existe exatamente 1.

**Estado antes/depois.** Antes: `ACTIVE`, sem `finished_at`. Depois: `DISCARDED`, com `finished_at`. Como
`findActiveSession` filtra `status = 'ACTIVE'`, a sessão descartada deixa de ser encontrada — não sobra
sessão fantasma, e a busca por sessão ativa devolve nada.

**Efeito sobre as respostas e sobre o FSRS.** Nenhum. Os eventos continuam em `review_history` com o
`session_id` da sessão descartada, e o item mantém o `next_review_at` e o `review_count` que o agendador
calculou. Descartar não é desfazer.

**Efeito sobre o tempo de estudo.** Nenhuma linha em `study_history`, mesmo com respostas dadas.

### Decisão técnica que continua pendente

Se uma sessão com respostas já realizadas for descartada:

- as respostas continuam em `review_history`;
- o FSRS já foi alterado (o item já foi reagendado);
- mas o tempo da sessão não entra em `study_history`.

Ou seja: a revisão conta para a memória do aluno e não conta para as horas estudadas dele. Há pelo menos três
saídas defensáveis — registrar o tempo decorrido como estudo mesmo no descarte; oferecer o descarte apenas
enquanto não houver nenhuma resposta; ou manter como está e deixar claro na interface que descartar não
registra tempo. Qual delas vale é decisão sua, de produto, não minha. Um dos testes registra esse estado
resultante explicitamente, sem julgá-lo, para que a decisão seja tomada sobre fatos.

## B13 — foi possível melhorar a cobertura?

Sim, em parte, e por um caminho diferente do previsto. Avaliei as quatro opções do escopo antes de mexer.

**(A) extrair uma unidade pura testável** — feito onde havia o que extrair, mas não em `finalizeSession`: ao
mapear o caminho positivo descobri que a parte que eu esperaria extrair (a montagem da linha de estudo) já
era verificável, porque os testes chegam até depois do `insert`. O que fiz foi transformar essa
verificabilidade em cobertura de verdade: 14 testes novos inspecionam a linha gravada campo por campo depois
de rodar o serviço — origem, tipo, aluno, disciplina escolhida pela regra do mais revisado com desempate
determinístico, duração medida pela regra única, texto no singular e no plural, `duration_seconds` e
`review_session_id` nos metadados. A regra de desempate da disciplina, que antes só tinha teste de leitura de
código, agora é executada.

**(B) injetar o sincronizador de ciclo** e **(C) injetar o mecanismo de revalidação** — avaliadas e
**recusadas**, por duas razões. A primeira é de valor: um dublê provaria apenas que uma função foi chamada,
não que o ciclo avançou nem que a página revalidou — exatamente as duas coisas que o B13 diz não estar
provadas. A segunda é de custo: três testes de wiring existentes fixam hoje a forma real dessas chamadas
(`await registerStudyToCycle()`, `for (const path of HISTORY_PATHS) revalidatePath(path)`,
`await invalidateStatisticsCenterCache(userId)`); injetá-las exigiria reescrever essas asserções para
perseguir uma cobertura que não cobre o que interessa. Preferi não trocar teste real por teste aparente.

**(D) reduziria acoplamento sem mudar comportamento?** No `finalizeSession`, não o suficiente para
justificar. Em `loadSessions`, sim — e é lá que a extração foi feita.

**O que continua sem integração real:** exatamente as três chamadas que acontecem **depois** do insert —
`registerStudyToCycle()`, `revalidatePath()` e `invalidateStatisticsCenterCache()`. Elas dependem de contexto
de requisição do Next (`cookies()`) e de um Supabase real.

**Por quê:** fechá-las exige suíte de integração com banco de teste e contexto de requisição — infraestrutura
nova, desproporcional a esta fase. A proposta registrada para o futuro é essa suíte, separada dos testes de
unidade, e não o dublê dentro deles. O cabeçalho de `review-study-history-d4.wiring.test.ts` foi atualizado
com essa reavaliação: diz o que passou a ser coberto, o que exatamente falta e por que não foi feito. O vão é
menor do que na I.6, e continua declarado — nenhuma cobertura fingida.

## STUDY_HISTORY — auditoria ponta a ponta do estudo de revisão

**Criação.** Um único ponto no código inteiro grava estudo de revisão: `finalizeSession`, em
`review.service.ts`, com `study_source: "REVIEW"` e `study_type: "REVISAO"`. Comprovado por comportamento:
sessão com respostas gera **uma** linha; sessão sem nenhuma resposta não gera nada; sessão descartada não
gera nada; responder um card, isoladamente, não gera nada — o estudo é da sessão, não da resposta.

**Não duplicação.** Encerrar de novo depois de um encerramento bem-sucedido não grava segunda linha (a trava
de idempotência barra antes), e duas abas encerrando a mesma sessão respondida gravam uma linha só. Isso
antes estava testado apenas para sessões **sem** respostas, ou seja, justamente no caso em que nada seria
escrito de todo modo; agora está testado no caso que escreve.

**Leitura e contagem.** Quem consome `study_type = "REVISAO"` / `study_source = "REVIEW"`:

As Estatísticas leem as duas colunas como rótulo de tipo de sessão ("Revisão" na composição por tipo de
estudo) — categoria estatística, sem relação com o motor FSRS. As Conquistas contam revisões só por
`review_history` desde a I.6, e o fallback por sessão de estudo foi removido lá. O Histórico exibe o tipo da
sessão. O Motor de Ciclos recebe o estudo pelo mecanismo central único, sem tratamento especial para
revisão. O registro manual continua tendo "Revisão" como tipo de estudo que o aluno pode lançar — isso é
legítimo e é outra coisa: é o aluno dizendo que estudou revisando em material próprio.

**Estado no banco de produção** (somente leitura): `review_items`, `review_history` e `review_sessions` com 0
linhas; `study_history` com 2.870 linhas, 4 delas com `study_source = 'REVIEW'`. Dessas 4, **nenhuma** tem
`review_session_id` nos metadados — o que confirma que nenhuma veio do motor FSRS (que sempre grava esse
campo). São linhas de importação de 13/08/2026, anteriores à própria migração do sistema de revisões.

## AUDITORIA DE DUPLO SIGNIFICADO

Classifiquei os usos de "revisão", `REVISAO`, `REVIEW`, "flashcards", `study_type` e `study_source`:

**(A) revisão real do FSRS:** `review_items` / `review_history` / `review_sessions` e tudo em
`src/application/review-engine`, `src/domain/reviews`, `src/infrastructure/reviews`, `src/features/reviews`;
a gravação de estudo em `finalizeSession`; a contagem das Conquistas; a contagem de 30 dias das Estatísticas.

**(B) estudo manual com material externo:** o tipo "Revisão" no registro manual e a cadeia
`flashcards_reviewed` / `flashcards_correct` (o aluno informa quantos flashcards revisou no Anki ou similar).
Não é FSRS — a D3 mantém flashcards fora do motor — e em nenhum ponto esse número é lido como resposta de
revisão.

**(C) estatística:** rótulos de tipo de sessão e agregações por tipo.

**(D) texto de UI:** rótulos e descrições. As descrições das conquistas ("Conclua 10 revisões agendadas pelo
sistema", "50 revisões concluídas") descrevem corretamente a fonte canônica; a I.6 alinhou o texto da tela
para "revisões respondidas". Deixei a redação como está — não há afirmação falsa, e mudar por mudar não se
justifica.

**(E) metadata:** `review_session_id`, `duration_seconds`, `reviews_completed` dentro do `metadata` da linha
de estudo. Servem para auditar a origem — e foram úteis nesta própria auditoria.

**(F) código morto:** nenhum novo. As estruturas legadas de flashcards seguem inertes, como a D8 determina.

**Um ponto que mistura os dois mundos de propósito, e que você deveria conhecer:**
`dashboard.service.ts:228` calcula `weeklyRevisions` com `study_type === "REVISAO" || study_source ===
"REVIEW"`, ou seja, soma numa mesma contagem as sessões que o aluno lançou como "Revisão" e as sessões
geradas pelo motor FSRS, para comparar com a meta semanal de revisões do perfil. Como a unidade é "sessões de
revisão na semana", somar as duas é defensável — não é o defeito que a I.6 corrigiu nas Conquistas, onde a
base do número mudava sozinha. Dois fatos relevantes: a meta é rotulada apenas "Revisões" no modal de metas,
sem dizer se conta sessões ou cards; e `goals.revisions` **não é exibido em lugar nenhum** hoje — é calculado
e descartado. Não alterei nada: decidir se essa meta conta sessões ou cards, e se volta a aparecer, é
decisão de produto.

## ERROS SILENCIOSOS

| Arquivo | Ocorrência | Risco | Ação |
|---|---|---|---|
| `study-analytics/statistics-center.action.ts` | `loadSessions` seguia com páginas parciais no erro | **Alto** — histórico truncado apresentado como completo, e cacheado 5 min | **Corrigido**: erro → `null`, erro de página, sem cache |
| `review-engine/review.service.ts` | `session?.itemsAnswered ?? 0` em `sessionState` | **Médio** — "0 respondidas" para quem acabou de responder, se a releitura da sessão falhar | **Corrigido**: → `null`, e o modal mostra "—" |
| `review-engine/review.repository.ts:296,594` | `count ?? 0` | Nenhum — vêm **depois** de `if (error) return null`; cobre só `count` nulo em resposta bem-sucedida | Mantido |
| `study-analytics/statistics-center.action.ts:380` | `count ?? 0` | Nenhum — idem, após `if (error) return null` | Mantido |
| `review-engine/review.service.ts:569` | `countByDiscipline.get(id) ?? 0` | Nenhum — acumulador de `Map`, não leitura de banco | Mantido |
| `study-session/get-disciplines.action.ts` (2×) | `catch { return [] }` | Baixo — listas de **sugestão** de disciplina; nenhum número de estudo, e o aluno pode escolher qualquer disciplina | Mantido |
| `study-session/study-session.action.ts`, `study-register-modal.tsx` (~20×) | `data["campo"] \|\| 0` | Nenhum — campos **do formulário** de registro manual, opcionais: vazio significa zero mesmo | Mantido |
| `study-analytics/statistics-center.action.ts` | `loadAttempts`, `loadDisciplines`, `loadActivePlan`, `loadWeekStartDay` caem em valor padrão no erro | **Médio** — mesma classe do defeito corrigido: falha em questões vira "Sem questões" | **Mantido — recomendado para a próxima fase**: cada um pede estado de erro da própria seção (decisão de UI), não erro da página inteira |
| `study-analytics/study-analytics.actions.ts:340-400` | leitura falha do histórico do ranking → usuários entram com 0 minutos | **Médio** — zero falso em dado de estudo, num quadro comparativo | **Mantido — recomendado**: exige contrato de erro próprio do ranking e UI correspondente |
| `dashboard/dashboard.service.ts:40-45, 422` | `.catch(() => [])` nas leituras e `catch` final devolvendo dashboard todo zerado | **Médio/Alto** — falha vira "você não estudou nada" | **Mantido** — fora dos diretórios desta fase; encontrado na auditoria de `study_source` e registrado aqui |

Nas cinco pastas que o escopo mandou varrer não sobrou nenhum `if (error) return []`, `if (error) return 0`
nem `error ? 0`.

## BANCO — nada foi alterado

Verificação somente por `SELECT`: última migração continua `20260925034938 review_system_fsrs` (da Fase I.1),
7 migrações no total. `review_items` 23 colunas, `review_history` 25, `review_sessions` 7; 13 índices e 6
políticas RLS nas três tabelas. Nenhuma migration criada, nenhum DDL executado, nenhum schema, índice,
constraint ou RLS alterado. O limite global de 1.000 linhas do PostgREST não foi tocado.

## TESTES

`npm test` — **1.356 testes, 204 suítes, 1.356 passando, 0 falhando**, em 106 arquivos.
`npx tsc --noEmit` — limpo.
`npm run build` — compila e gera todas as rotas (é preciso passar `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` na linha de comando, porque não leio seus arquivos `.env`).

45 testes novos, todos de comportamento onde o comportamento é alcançável:

`statistics-sessions-error-vs-empty.test.ts` (17) — a regra de leitura das sessões, com o paginador real.
`review-study-history-source-of-truth.test.ts` (14) — o estudo gravado pela revisão, campo por campo, mais
não-duplicação e tudo o que não deve gerar estudo. `review-discard-session-audit.test.ts` (10) — a auditoria
do M5. E 4 testes acrescentados ao arquivo de erro-não-é-zero da I.5, para o contador de respostas da sessão.

Nenhum teste foi removido ou enfraquecido. O banco falso (`fake-review-db`) ganhou uma opção **aditiva**
(`skip`), que faz a falha começar só depois de N consultas — foi o que permitiu testar o cenário em que a
primeira leitura da sessão passa e a releitura falha.

## GIT — nada além de leitura

Nenhum `add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`, alteração de remote ou upload.
Nenhuma normalização de CRLF/LF. `HEAD` continua em `a2292f5`.

`git status --short` — 128 modificados, 11 apagados e 29 não rastreados em `src`/`package.json`, acumulado
desde a Fase I.1 (você ainda não commitou). Dos 12 arquivos desta fase, 4 aparecem como modificados
(`package.json`, `review.service.ts`, `statistics-center.action.ts`, `models.ts`) e 8 como não rastreados —
estes últimos porque são novos ou porque o arquivo já era novo desde a I.1.

`git diff --stat` — acumulado: 139 arquivos, 12.309 inserções, 15.773 remoções. Restrito aos arquivos
rastreados que esta fase alterou: 4 arquivos, 856 inserções, 1.238 remoções.

`git diff --check` — **vazio** para os 12 arquivos desta fase. Os avisos de "trailing whitespace" que o
comando produz no repositório inteiro continuam sendo o `\r` dos arquivos CRLF que já divergiam do HEAD antes
desta fase: medição atual, idêntica à da I.6 — 224 arquivos modificados, **156 diferem somente por fim de
linha**, 68 têm mudança real de conteúdo. Os 12 arquivos desta fase são LF puro, nenhum com fim de linha
misto.

O commit e o push são seus.
