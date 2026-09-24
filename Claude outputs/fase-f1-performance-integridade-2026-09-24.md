# NomeIA — Fase F.1 — Performance profunda e proteção contra truncamento

Data: 24/09/2026 · Escopo: integridade das leituras (limite de 1.000 linhas do PostgREST), leituras redundantes, refresh duplicado, medição.

Nesta fase não houve redesign, nenhuma mudança visual e nenhum teste visual manual. Nada foi enviado ao GitHub: sem commit, push, add ou merge.

**O limite global do PostgREST NÃO foi alterado.** Continua em 1.000 linhas por resposta, como proteção do banco. Toda consulta que pode passar disso agora **pagina**: ordenação determinística (com a chave primária `id` como desempate), páginas de 1.000, leitura até o fim, junção antes do cálculo, sem perder nem repetir linhas.

## Validação

| Item | Resultado |
|---|---|
| `npm ci --ignore-scripts` | exit 0 |
| `npm test` | **1.007/1.007 passando, 0 falhas** (eram 919 no fim da Fase F; +88 testes) |
| `npx tsc --noEmit` | **0 erros** |
| `npm run build` | **sucesso**: compilado em 34,2 s, 36/36 páginas estáticas |
| ESLint | 271 erros / 42 avisos, **idêntico ao início da fase** (comparado regra por regra, arquivo por arquivo; nenhum problema novo) |
| Sincronização com a sua pasta | md5 de todo `src` = `4dab221c29d2e6f7a93448b6a62addd5` e `package.json` = `7e945814…` nos dois lados |

Os comandos rodaram na cópia de trabalho na nuvem, porque na pasta do OneDrive `tsc` e `build` não terminam no tempo do shell. O conteúdo foi provado idêntico por md5 antes e depois da sincronização.

---

# CORRIGIDO

## 1. Risco de truncamento em `study_cycle_sessions` (Prioridade 1)

**Onde:**

- `getCyclesAction`, `getActiveCycleAction` e `getCycleByIdAction` (em `study-cycle.actions.ts`);
- a contagem de sessões por ciclo em `study-cycle.actions.ts`;
- `get-disciplines.action.ts` (sugestão de disciplina da Central);
- `get-study-discipline-suggestions.action.ts`;
- o repositório da migração de ciclos (`fetchLegacySessions`).

Todas essas leituras eram **1 requisição sem paginação**. O ciclo ativo do usuário principal tem **933** sessões. Passando de 1.000, as linhas excedentes seriam descartadas em silêncio, e progresso da volta, tempo histórico e marcações de skip ficariam errados.

**Correção:**

- `src/application/study-cycle/cycle-sessions.reader.ts` (`fetchAllCycleSessions`) é o único ponto de leitura dessa tabela. Ele pagina com `ORDER BY id`.
- Em caso de erro, devolve `[]`, exatamente como antes (quando a consulta única falhava, o código usava `data || []`). Nunca devolve um conjunto parcial, que geraria números errados sem aviso.
- As três actions de leitura agora delegam para `cycle-overview.reader.ts`. As consultas são as mesmas de antes; só a de sessões passou a paginar.
- A matemática do Cycle Engine (`buildCycleOverview`, cursor, volta, progresso, skip) **não foi tocada**.
- Os skips de todas as voltas (lidos em `getCyclesAction`) também passaram a paginar, porque essa tabela cresce a cada skip.

**Números idênticos para o mesmo conjunto de sessões.** Um teste compara `buildCycleOverview` com a leitura paginada contra o cálculo com o conjunto completo. O resultado é igual objeto a objeto (`deepEqual`) para 0, 999, 1.000, 1.001, 1.500, 2.000, 2.500, 3.500, 5.000 e 10.000 sessões.

Uma observação honesta: a consulta antiga **não tinha ORDER BY**, então o banco devolvia as sessões na ordem física, que pode mudar. A soma de minutos fracionários (segundos/60) em ordens diferentes difere só na 12ª casa decimal (medido: 5491,85 × 5491,849999999999). Com `ORDER BY id`, a ordem agora é sempre a mesma e o resultado fica estável bit a bit. Esse campo não é exibido com essa precisão.

**Quantidade máxima suportada:** não há teto na leitura de sessões do ciclo. A leitura vai até o fim, em páginas de 1.000, no máximo 4 simultâneas. Os testes cobrem até 10.500 linhas.

## 2. `getCycleOverviewData` (Planejamento / Dashboard) (Prioridade 2)

- A leitura de `study_history` desde a criação do plano não paginava, então com mais de 1.000 sessões o "estudado" ficava subcontado.
- Agora ela pagina (`started_at` + `id`). Em caso de erro, fica sem histórico, como antes.
- Testes com 0, 999, 1.000, 1.001, 2.000, 2.500 e 5.000 sessões verificam três coisas: minutos por disciplina iguais à soma completa, histórico completo sem duplicar, e que outro usuário e sessões anteriores ao plano ficam de fora.
- Hoje o usuário principal **não tem plano ativo** (conferido no banco), então não há número atual que mude nesta tela.

## 3. Outras leituras truncadas encontradas na varredura

Fiz duas varreduras completas de `src` com um subagente, conferidas depois no código. Elas encontraram **leituras que já truncam hoje** fora do escopo original. Todas foram corrigidas com a mesma paginação:

| Tela | Função | Tabela | Situação antes |
|---|---|---|---|
| /disciplines | `getDisciplinesPageData` | study_history (+ question_attempts) | **truncava hoje**: 2.797 sessões → só 1.000 somadas |
| /planos | `listPlansAction` | study_history | **truncava hoje**: "estudado" e aderência dos cards |
| /planejamento (card de metas, abas "ano"/"total") | `getPeriodGoalData` | study_history | **truncava hoje** na aba "total" |
| /conquistas | `getAchievementsAction` | study_history (+ question_attempts) | **truncava hoje**: sequência, totais e horários sobre 1.000 linhas arbitrárias (sem ORDER BY) |
| /ranking (perfil público) | `getPublicStudyProfileAction` | study_history | **truncava hoje**: `.limit(1000)` → totais "de todo o tempo" só das 1.000 sessões mais recentes |
| /edital (importador) | `parseEditalFileAction` | subtopics (catálogo) | **truncava hoje**: `.limit(20000)` é cortado em 1.000 e o catálogo tem 1.136 subtópicos, então alguns apareciam como "novos" na prévia |
| admin (detalhe do usuário) | `getUserDetailsAdminAction` | study_history, question_attempts | **truncava hoje**: total de sessões travava em 1.000 |
| Histórico, "Gerenciar importações" | `listImportsAction` | study_history | contagem por lote podia sair menor |
| /ranking (caminho de fallback) | `getRankingViaDirectQuery` | study_history | período "geral" subcontado (só roda se a RPC falhar) |
| Replanejamento | `loadSessions`, `loadOverdueReviewsByDiscipline` | study_history, review_items | com plano antigo |
| Geração de plano | `generateStudyPlan` (90 dias) | study_history | com mais de ~11 sessões/dia |

Leituras de tabelas ainda vazias mas sem limite de crescimento também foram paginadas (question_attempts, review_items, review_history). Isso inclui os `.limit(10000/20000/50000/100000)`, que **nunca passavam de 1.000**:

- KPI "Revisões pendentes" do Dashboard;
- `getDashboardData` (acertos por período);
- Estatísticas (tentativas e itens de revisão);
- página de Revisões;
- `loadItemsBundle`;
- `getReviewDashboardSummary`;
- `getAverageRetention`;
- `refreshStatisticsCache`;
- `exportFlashcards`;
- `getDisciplineDetailStatsAction`;
- radar e acurácia (30 dias).

**Efeito visível esperado:** nas telas marcadas "truncava hoje", os números **vão mudar para o valor correto**. Exemplo real: 2.797 sessões e 110.194 minutos no total, contra 35.138 minutos nas 1.000 mais recentes. Isso é correção de dado, não regressão. Nas telas do escopo original (Dashboard, Ciclos, Histórico, Estatísticas), os números não mudam, porque elas já liam tudo paginado ou ainda não passavam de 1.000.

**Helper:** `src/lib/parallel-pagination.ts`:

- `fetchAllRowsPaged` exige ordenação determinística;
- a 1ª página traz a contagem e as demais saem em lotes de até 4;
- sem contagem, faz fallback sequencial;
- respeita `maxRows` onde havia um teto intencional.

## 4. Queries reduzidas e dados que deixaram de ser carregados

- **/ciclos:** o ciclo ativo agora sai da própria lista, pelo mesmo critério de `getActiveCycleAction` (status ACTIVE, `updated_at` mais recente) e com o mesmo `buildCycleOverview`, função pura em `pick-active-cycle.ts`. Antes, **as 933 sessões do ciclo ativo eram lidas duas vezes** a cada abertura e a cada "Atualizar". No navegador isso também elimina **1 Server Action da fila** em cada recarga da aba (criar, editar, ativar, pausar, excluir, pular).
- **`getCycleByIdAction`:** itens, sessões e skips passaram de 3 leituras em sequência para 3 em paralelo.
- **`listPlansAction`:** histórico e concurso ativo em paralelo (antes em sequência).
- **Detalhe do usuário (admin):** sessões, questões e plano em paralelo (antes 3 em sequência).

## 5. Refresh duplicado (Prioridade 5)

Mapeamento de quem ouve `STUDY_SESSION_SAVED_EVENT` e o que cada um atualiza:

| Consumidor | Ao receber o evento |
|---|---|
| Histórico (`history-view`) | upsert na lista local, sem ida ao servidor |
| "Foco de hoje" (`intelligent-cycle-widget`) | `getActiveCycleAction` |
| "Estudos de hoje" (`WidgetEstudosHoje`) | `getRecentStudyHistoryAction(14)` |
| Planejamento diário (`daily-planning-view`) | `getReplanInfoAction` + `getPeriodGoalAction("semana")` |
| Planejamento semanal (`weekly-planning-view`) | `getReplanInfoAction` |

Quem dispara o evento:

- o modal de registro, que também chama `router.refresh()`;
- o cronômetro, que também chama `router.refresh()`;
- a ponte de sincronização offline, que **não** chama `router.refresh()`;
- o próprio Planejamento diário, ao concluir um bloco.

**Duplicação comprovada e corrigida:** ao concluir um bloco, o Planejamento diário disparava o evento, e o próprio listener chamava `loadReplanInfo()`. Logo em seguida fazia `await loadReplanInfo()`. Eram **2 execuções idênticas de `getReplanInfoAction`**, e é uma action pesada (lê as sessões desde o plano). Agora chamadas simultâneas com a mesma disponibilidade compartilham a mesma busca. Uma chamada feita depois de a anterior terminar continua buscando normalmente.

A fila offline, o `operationId`, a idempotência e o evento **não foram alterados**.

## 6. Instrumentação de performance (Prioridade 7)

- `src/lib/perf/server-perf.ts` grava **uma linha `[perf]` em JSON** por página, só com durações e contagem de linhas/páginas.
- **Nunca** registra token, cookie, senha, id de usuário ou conteúdo.
- É ligada em `next dev` e, em produção, só com `NOMEIA_PERF_LOG=1`. Não muda nada na tela.
- Páginas medidas: /dashboard (resolução do usuário e cada um dos 6 loaders), /ciclos, /planejamento, /estatisticas.
- Leituras paginadas medidas, com duração, linhas e páginas: `study_history.historico_completo`, `study_history.analytics_dashboard`, `study_history.estatisticas`, `study_history.desde_o_plano`, `study_cycle_sessions`.
- O Histórico (/dashboard/history) carrega pela action `getAllHistoryAction`, que registra total, tempo de autenticação e linhas.
- `src/proxy.ts` registra quanto o proxy leva em cada requisição (com `getUser()` dentro). Indica se é POST de Server Action e mostra só o 1º segmento da rota. **A autenticação não foi alterada.**

Exemplo do que aparece no terminal do `npm run dev` ao abrir o Dashboard:

```text
[perf] {"kind":"page","route":"/dashboard","totalMs":…,"steps":[{"name":"auth.usuario","ms":…},{"name":"study_history.analytics_dashboard","ms":…,"rows":2790,"pages":3},…]}
```

## 7. Medições coletadas nesta fase (reais, com limites declarados)

| O que | Resultado | Como foi medido |
|---|---|---|
| Execução no Postgres: página de 1.000 do histórico completo (com join de disciplinas, ORDER BY started_at, id) | **7,3 ms** | `EXPLAIN ANALYZE` no banco real, usuário de 2.797 sessões |
| Execução no Postgres: 1ª página do analytics, com contagem | **~98 ms** (varia; o planejamento levou 25 ms) | `EXPLAIN ANALYZE` |
| Execução no Postgres: sessões do ciclo ativo (933) | **17 ms** | `EXPLAIN ANALYZE` (usa `idx_study_cycle_sessions_cycle_id`) |
| CPU: `buildCycleOverview` com 933 sessões | **0,23 ms** | benchmark local (Node) |
| CPU: filtro do Histórico com 2.797 (disciplina / período no fuso de SP) | **0,08 ms / 3,5 ms** | benchmark local |
| CPU: analytics do Dashboard com 2.797 (contexto, base, heatmap, ranking, evolução) | **14 ms** | benchmark local |
| Tamanho do histórico completo em JSON (`select *`) | **~2,5 MB** para 2.797 sessões (~890 bytes/linha; metadados = 376 KB) | SQL `row_to_json` |
| Paginação paralela × sequencial | 2.797 linhas: **201 × 302 ms**; 10.000: **504 × 1.106 ms** | **SIMULAÇÃO** com ida e volta fixa de 100 ms, **não é medição de rede** |

**O que não consegui medir, e por quê:** a latência de rede até o Supabase. A rede de saída da nuvem e a do shell no seu computador bloqueiam o host do Supabase (`connect_rejected`), e não posso entrar como usuário para medir páginas reais. **Conclusão das medições:** o banco e a CPU são rápidos (unidades a dezenas de ms). O custo está no número de idas e voltas em sequência e no volume transferido. Os números reais de ponta a ponta aparecem nas linhas `[perf]` quando você rodar `npm run dev`.

## 8. Abrir /ciclos é somente leitura (Prioridade 8)

Um teste (`cycle-overview.reader.test.ts`) roda a leitura contra um banco falso com 2.500 + 300 sessões e confirma:

- **nenhuma escrita**;
- as tabelas ficam **idênticas** (cursor, volta, progresso e skips intactos);
- só são consultadas `study_cycles`, `study_cycle_items`, `study_cycle_sessions` e `study_cycle_item_skips`;
- **não lê `study_history`**, que um rebuild/reconcile leria.

Um teste de wiring garante ainda que `getCyclesAction`, `getActiveCycleAction` e `getCycleByIdAction` não contêm reconcile, rebuild, register, insert, update, upsert ou revalidate.

## 9. Testes adicionados

- `src/lib/testing/fake-postgrest.ts`: banco falso que **corta cada resposta em 1.000 linhas** e **embaralha a ordem quando não há ORDER BY**, como o PostgREST real.
- `cycle-sessions.reader.test.ts` (23 testes): `study_cycle_sessions` com 0, 999, 1.000, 1.001, 1.500, 2.000, 2.500, 5.000 e 10.000 linhas; vários ciclos; a prova de que a leitura antiga cortava e mudava o progresso; somente leitura.
- `cycle-overview.reader.test.ts` (12 testes): overview idêntico com mais de 1.000 sessões; lista com 2 ciclos (1.400 + 1.100); ciclo por id; somente leitura (item 8); páginas ordenadas.
- `cycle-overview-data.pagination.test.ts` (9 testes): `getCycleOverviewData` com mais de 1.000 sessões.
- `truncation-guard.pagination.test.ts` (10 testes):
  - Histórico completo com 999 a 10.000 sessões, incluindo empates de `started_at`, na ordem exata;
  - analytics do Dashboard com 2.797 (soma exata, nulos fora);
  - KPI de revisões com 1.500 itens vencidos.
- `parallel-pagination.test.ts` (11 → 18 testes): 0 a 10.001 linhas iguais à leitura sequencial; no máximo 4 requisições simultâneas com 10.500; ordem mantida mesmo quando páginas posteriores respondem primeiro.
- `filter-history-sessions.test.ts` (7 testes): filtros do Histórico (movidos sem alteração para uma função pura) com 2.797 sessões. Cobre período no fuso de SP inclusivo nas pontas; disciplina; origem; tipo; técnica; faixas de duração e foco (partição exata); combinação; totais sobre todas as filtradas com a lista progressiva.
- `performance-fase-f1.wiring.test.ts` (20 testes):
  - nenhuma leitura direta de `study_cycle_sessions` fora do leitor paginado;
  - cada leitura corrigida usa `fetchAllRowsPaged`;
  - nenhum `.limit()` acima de 1.000 sobrou nessas leituras;
  - o refresh duplicado do Planejamento foi eliminado;
  - a instrumentação não registra dados sensíveis e não mexe na autenticação.

Três testes existentes foram ajustados, sem enfraquecer o que verificam:

- o wiring de Ciclos da Fase F agora espera o ciclo ativo derivado da lista;
- o teste de "review_history lido 1×" procura `.from("review_history")`, porque a consulta agora ocupa várias linhas;
- o mock de Supabase das sugestões ganhou `.range()`.

## 10. Rotas tecnicamente otimizadas nesta fase

- **/ciclos:** sessões do ciclo ativo lidas 1× em vez de 2×; 1 action a menos por recarga; sem truncamento.
- **/dashboard:** "Foco de hoje" sem truncamento; KPIs de revisões e acertos paginados; medição por loader.
- **/planejamento:** `getCycleOverviewData` e card de metas paginados; `getReplanInfoAction` não roda 2× ao concluir bloco.
- **/dashboard/history (Histórico):** filtros testados; medição da action.
- **/estatisticas:** tentativas e itens de revisão paginados; medição.
- **/disciplines, /planos, /conquistas, /ranking (perfil público), /edital, /dashboard/reviews, admin:** sem truncamento.

---

# POSSÍVEL MELHORIA FUTURA (não aplicada)

## A. Dashboard: histórico inteiro para agregar (Prioridade 3)

O que exige histórico completo hoje:

- acertos "Total" e "Ano" a partir do `metadata` das sessões;
- sequência mais longa;
- sessão mais longa;
- rankings por disciplina e área;
- heatmap;
- minutos por disciplina.

Os últimos 14 dias (61 sessões), os totais do mês e as estatísticas do mês **já são leituras limitadas**.

Custo medido: 2.790 linhas, cerca de 1,35 MB de JSON do banco para o servidor. O Postgres leva de 7 a 100 ms, e o cálculo em Node, cerca de 14 ms. O custo real está na transferência e nas 3 páginas.

A redução real exige **agregação no banco (RPC/migration)**, porque as somas saem de JSON (`metadata`) e dos dias no fuso de São Paulo. Conforme a regra da fase, **parei aqui: nenhuma migration criada.**

Proposta para você aprovar: uma RPC `dashboard_aggregates(user_id, tz)` devolveria por dia/disciplina minutos, sessões, questões e acertos (e a maior sessão). Isso trocaria cerca de 2.800 linhas por algumas centenas. Ganho esperado: cerca de 1,3 MB e 2 idas e voltas a menos a cada abertura do Dashboard e a cada refresh após salvar. Estimativa, não medição.

## B. Histórico com paginação real no banco (Prioridade 4)

Hoje ~2,5 MB (2.797 sessões, `select *` + disciplina) vão para o navegador a cada abertura. A lista já é desenhada aos poucos (Fase F). Paginação real exige:

1. totais do topo (minutos, questões, acertos, páginas) calculados no banco com **os mesmos filtros**. Vários dependem de `metadata` (JSON) e do dia no fuso de SP → precisa de **RPC**;
2. dropdowns de disciplina e origem vindos de uma consulta própria (hoje saem das sessões carregadas);
3. filtros de foco (JSON) e faixa de duração traduzidos para SQL;
4. manter o upsert dos eventos SAVED/QUEUED/OFFLINE_RESOLVED e as sessões pendentes offline mescladas na 1ª página.

**Não implementado**, porque exige RPC/migration e mudaria a arquitetura da tela. Proposta: RPC `history_page(filtros, cursor)` + RPC `history_totals(filtros)` com paginação por cursor (`started_at`, `id`). Uma melhoria sem migration também seria possível, mas o ganho é menor: reduzir as colunas do `select *` (cerca de metade do volume são nomes de colunas e campos não usados na lista). Isso exige separar os dados da lista dos dados de edição (o modal usa a linha inteira).

## C. Refresh duplicado no Dashboard após salvar

**Comprovado, não corrigido.** No Dashboard, salvar um estudo dispara `router.refresh()`. Isso refaz no servidor os 6 loaders da página, inclusive ciclo ativo, estudos de 14 dias e calendário do mês. Ao mesmo tempo, os widgets recebem o evento e buscam os mesmos 3 dados de novo por Server Action. O `useCachedServerAction` usa os dados do servidor só na montagem.

Essa duplicação **foi introduzida pela Fase F**, quando os dados dos widgets passaram a vir no servidor.

Removê-la com segurança exige o emissor sinalizar "haverá refresh do servidor" (campo novo no detalhe do evento) ou o hook adotar os dados novos do servidor e os widgets deixarem de buscar. A ponte offline dispara o evento **sem** `router.refresh()`, então os widgets não podem simplesmente parar de ouvir. Como a regra da fase pede não mexer em `STUDY_SESSION_SAVED_EVENT` salvo se absolutamente necessário, fica como proposta.

## D. Proxy/middleware: `auth.getUser()` em toda requisição (Prioridade 6)

Estrutura atual:

- o proxy chama `supabase.auth.getUser()`, 1 ida e volta ao Auth, em **toda** navegação e em **todo POST de Server Action**;
- a action resolve a autenticação de novo;
- nas páginas, o React `cache()` da Fase F reduz layout + página a 1 resolução.

Quem mais sofre são as telas que ainda disparam várias actions em fila no navegador:

- Planejamento: replan info, meta do período, semanal;
- Histórico: action de carga;
- widgets do Dashboard após salvar.

Cada action paga proxy + autenticação antes da própria consulta.

Ganho estimado de trocar por `getClaims()` (validação local do JWT): cerca de 1 ida e volta ao Auth por requisição. A medição agora está no log `[perf] {"kind":"proxy",…}`.

**Não alterado** (regra da fase). Registrado como proposta.

## E. Outros riscos de truncamento encontrados e não corrigidos

Estão sem uso na UI hoje, ou sem crescimento relevante:

- **Fila de revisão:** `getActiveReviewSession`, `answerReviewCard` e `finalizeSession` usam `.in("id", queueIds)`. Nos modos diferentes de "ALL", a fila não tem teto. Com mais de 1.000 cartões na fila, o próximo cartão pode não vir e a sessão termina antes. Mexe na regra de revisão, então precisa de decisão.
- **Simulados** (`fetchLastAttemptMap`, `getSimuladorConfigAction`, `fetchEligible*`): `.limit(20000/50000)` cortados em 1.000. Não há chamadas na UI hoje.
- **Código sem uso:** `getStudyStats` (study-history.analytics), catálogo de tópicos (`topic-catalog.service`), `getCriticalTopics`, `getUserStatisticsAction`, `getStudiedByDiscipline`, `ai-insights`.
- **Baixa prioridade:** notas adesivas (`user_notes`, lista sem limite) e o catálogo global `disciplines` (123 linhas, sem limite) em importação/exportação de flashcards e em simulados.
- **Paginação por offset:** se uma linha for apagada entre a leitura de duas páginas, uma linha pode ser pulada. A leitura sequencial antiga tinha o mesmo comportamento. Paginação por cursor (keyset) eliminaria isso.

---

## Git (somente leitura, executado na sua pasta)

- `git status --short`: 379 entradas. Inclui as fases anteriores ainda não commitadas e os arquivos novos desta fase como `??`: `cycle-overview.reader*`, `cycle-sessions.reader*`, `pick-active-cycle.ts`, `src/lib/perf/`, `src/lib/testing/` e os testes novos.
- `git diff --stat`: 341 arquivos, +25.915 / −24.932 (acumulado desde o último commit).
- `git diff --check`: 38.788 linhas. É o mesmo ruído de CRLF das fases anteriores (eram 38.868). Nos 52 arquivos desta fase **não há espaço em branco novo no fim de linha** (conferido arquivo a arquivo contra o início da fase), e os arquivos CRLF continuam CRLF.
- Nenhum commit, push, add, merge ou alteração de remote.
