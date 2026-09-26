# NomeIA — Fase I.8: Integridade Transversal dos Dados (Estatísticas, Ranking e Dashboard)

Data: 2026-09-26

Escopo desta fase: corrigir, fora do módulo de Revisões, os pontos em que uma
falha de leitura no banco era tratada como se fosse ausência real de dado —
achados registrados na tabela de "erros silenciosos" da Fase I.7. Três áreas:
Estatísticas (`loadAttempts`, `loadDisciplines`, `loadActivePlan`,
`loadWeekStartDay`), Ranking (histórico do ranking) e Dashboard
(`dashboard.service.ts` por inteiro). Nenhuma mudança em FSRS, Cycle Engine,
schema/migração/RLS, ou fórmula de ranking/analytics — só tratamento de falha.

---

## 1. ESTATÍSTICAS

As quatro leituras já retornavam `null` distinto de `[]`/`0` (isto foi feito
nesta mesma fase, junto com o restante do trabalho). Estado final de cada uma:

**`loadAttempts`** (tentativas de questões) — `Promise<QuestionAttemptRecord[] | null>`.
- Antes: erro de leitura virava `[]`, e a tela mostrava "Sem questões
  registradas no período" — igual à tela de quem nunca respondeu nenhuma.
- Depois: `attempts` começa `null` e só é substituído por uma lista dentro do
  ramo de sucesso; o ramo de erro (`else`) não reatribui a variável. A action
  expõe o valor direto no payload (`attempts,` — sem `?? []`). A view mostra
  "Questões indisponíveis" (com nota explicando que não significa ausência
  real) em vez do gráfico/lista vazios quando `payload.attempts === null`.

**`loadDisciplines`** (disciplinas + status no edital) — `Promise<{...} | null>`.
- Antes: erro virava duas listas vazias, e a cobertura do edital dizia
  "Adicione um concurso" a quem já tinha edital cadastrado.
- Depois: uma flag `lida` só vira `true` dentro do ramo de sucesso; o retorno é
  `lida ? { userDisciplines, disciplines } : null`. A action deriva
  `userDisciplines`/`disciplines` com `?? null` (nunca `?? []`). A view mostra
  "Edital indisponível" em vez de "Sem edital" quando `userDisciplines === null`.
- Importante: essa falha **não derruba a página inteira** — os nomes de
  disciplina usados nas demais seções vêm do join das próprias sessões de
  estudo, então só a seção sobre o edital fica indisponível.

**`fetchActivePlan`/`loadActivePlan`** (plano de estudo ativo) — `Promise<{ plan: ActivePlan | null } | null>`.
- As três leituras internas (`study_plans`, `study_plan_items`, `profiles`)
  agora checam `error` e retornam `null` (falha) em vez de tratar erro como
  "sem plano". Ausência real continua sendo `{ plan: null }` — tanto para
  "não tem plano ativo" quanto para "tem plano mas nenhum bloco com duração".
- A action expõe os dois estados separadamente: `activePlan: activePlan?.plan
  ?? null` e `activePlanError: activePlan === null`. A view mostra "Plano
  indisponível" só quando `activePlanError`, preservando "Sem plano ativo"
  para a ausência genuína.

**`loadWeekStartDay`** (preferência de início de semana) — `Promise<number | null>`.
- A regra de negócio **não mudou**: quem nunca configurou continua começando
  no domingo (0). O que mudou é que erro de leitura agora devolve `null`
  *antes* de calcular esse padrão, em vez de aplicar o padrão e fingir que foi
  uma escolha do aluno. A view usa o número (`?? 0`, necessário para desenhar
  a grade do mapa de calor) e, separadamente, mostra uma nota ("não foi
  possível ler sua preferência...") quando `weekStartDay === null` — os dois
  nunca se confundem.

Testes (comportamentais onde deu, de fiação onde a função é interna a um
módulo `"use server"` — mesmo critério da Fase I.7 para `loadSessions`):
`statistics-loaders-error-vs-empty.test.ts` (28 casos, incluindo uma extensão
comportamental de `FakePostgrest` com injeção de erro por tabela).

---

## 2. RANKING

`getRankingViaDirectQuery` (`study-analytics.actions.ts`) tinha dois pontos que
tratavam erro como ausência:

- **Histórico do ranking**: `historyResult.error` era descartado
  (`historyData = historyResult.error ? null : historyResult.data`, e o `null`
  virava lista vazia adiante) — uma falha de leitura fazia todo mundo aparecer
  com 0 minutos, inclusive quem estudou bastante. Agora, `historyResult.error`
  interrompe com `{ data: null, error: "Não foi possível calcular o ranking
  agora. Tente novamente em instantes." }` antes de qualquer cálculo.
- **`public_study_stats`** (usada para enriquecer o ranking quando RLS limita o
  usuário a ver só as próprias linhas de `study_history`): o `error` dessa
  consulta nem era destruturado — agora é, com a mesma guarda de erro
  explícito.
- O caminho feliz (fórmula, posição, desempate, metas) **não foi alterado**; só
  o tratamento de falha nos dois pontos acima.
- **Cache**: não existe cache de servidor (nem `Map` com TTL, nem
  `useCachedServerAction` do lado do cliente) na rota do Ranking — confirmado
  por busca no arquivo e nos componentes de `features/ranking`. Não havia,
  portanto, risco de um payload degradado ficar servido por engano; nada
  precisou ser criado ou guardado aqui.

Testes: 4 casos de fiação em `statistics-loaders-error-vs-empty.test.ts`
(guarda de erro do histórico antes de qualquer leitura de dado, guarda de erro
de `public_study_stats`, e um teste de fumaça confirmando que a fórmula não foi
tocada).

---

## 3. DASHBOARD

`dashboard.service.ts` tinha oito leituras independentes dentro de um único
`Promise.all`, sete delas mascarando erro com `.catch(() => [])` /
`.catch(() => null)`, e um fallback externo (`catch` da função inteira) que
devolvia um snapshot inteiramente zerado — que, por causa do mascaramento
interno, era acionado só em falhas catastróficas, mas cujo *significado* ficou
mais preciso nesta fase (ver abaixo).

### Mapeamento loader → widget (feito antes de qualquer alteração de código, como pedido)

| Leitura | Alimenta | Widget consegue funcionar sem o dado? | Tinha estado de erro antes? |
|---|---|---|---|
| `profiles` (perfil, metas semanais) | saudação, metas configuradas | sim (mostra "Estudante"/"Não definida") | não |
| `user_targets` (meta ativa) | Data da prova, nome do concurso no cabeçalho | sim (mostra "Nenhuma prova cadastrada") | não |
| `getCycleOverviewData` (ciclo) | `cycleBlocks` → widget "Estudos de hoje" (hero) | widget inteiro some se vazio | não (Cycle Engine tem seu próprio widget "Ciclo de Estudo" com fetch independente e tratamento próprio) |
| `getTodayStudyItems` (plano de hoje) | `plannedById` (contexto de disciplinas) | sim | não |
| `getStudyHistoryForAnalytics` (histórico) | tempo de estudo, streak, questões, precisão, disciplinas mais estudadas, heatmap, evolução, rankings internos, metas semanais, conquistas | **não** — é a fonte primária de quase todos os números do Dashboard | não |
| `getRecentActivities` | widget "Últimas atividades" | sim (lista vazia é estado normal) | não |
| `question_attempts` (paginado) | precisão/acertos/erros | parcialmente (histórico também contribui) | sim, mas era descartado ao consumir |
| `getUserDisciplines` | Progresso no edital, "Desempenho por matéria" | não para essas duas seções | não |

Conclusão do mapeamento: nenhuma leitura isolada deveria derrubar o Dashboard
inteiro — cada uma tem no máximo 1–3 widgets que dependem dela. O tratamento
correto é por seção, nunca por página inteira.

### O que foi feito

Criado `dashboard-read-outcome.ts` (módulo puro, sem Supabase nem Next.js) com
dois helpers:

- `readOrFlag(promise, fallback)` — substitui `.catch(() => fallback)`
  preservando **se** a leitura falhou, não só o valor seguro.
- `resolveMaybeSingle(result)` — para `profiles`/`user_targets`
  (`.maybeSingle()`, que nunca lança: erro vem como `{ data: null, error }`).
  Antes esse `error` não era checado; agora falha e ausência real (`{ data:
  null, error: null }`) são distinguidas.

`dashboard.service.ts` agora usa os dois helpers nas 8 leituras e monta um
`dataIssues` (novo campo em `DashboardSnapshot`, opcional por compatibilidade)
com uma flag booleana por leitura. O `catch` externo da função — que antes
podia, na prática, ser o destino de qualquer uma das 7 falhas mascaradas —
agora só é alcançado por uma falha verdadeiramente inesperada no processamento
síncrono (um bug, não uma leitura isolada), e por isso marca as 8 flags como
`true`: não é mais "uma leitura isolada falhou", é "nada pôde ser processado".

**Cache**: `getDashboardData` não tem cache de servidor (nem `Map` com TTL). O
snapshot é gerado a cada carga da página (`force-dynamic`) e passado como prop
— não é seedado no cache client-side (`useCachedServerAction`). Esse cache
client-side É usado por outros três dados da página (ciclo ativo, histórico de
14 dias, calendário mensal), mas isso já era tratado corretamente **antes**
desta fase: a própria `page.tsx` só semeia o cache quando a leitura respectiva
veio sem erro, deixando o widget buscar sozinho quando falhou. Não havia nada
para corrigir no cache do Dashboard — nem para criar, porque o snapshot
principal nunca teve um.

**Tratamento por widget (proporcional, não a página inteira)**: aplicado nos
cinco widgets com um número isolado e sem lógica de fallback cruzado entre
fontes — os de maior risco de mostrar um "0" que parece real:

- `WidgetTempoEstudo` (tempo hoje/semana) — `dataIssues.history`
- `WidgetConstancia` (sequência de dias) — `dataIssues.history`
- `WidgetProgressoEdital` (cobertura do edital) — `dataIssues.disciplines`
- `WidgetUltimasAtividades` — `dataIssues.activities`
- `WidgetDataProva` — `dataIssues.target`

Cada um mostra "—"/uma mensagem de indisponibilidade distinta da mensagem de
ausência real (ex.: "Não foi possível carregar sua prova agora" vs. "Nenhuma
prova cadastrada").

**Limitação assumida, documentada aqui em vez de deixada silenciosa** (mesmo
critério usado para o achado B13 na Fase I.7): os widgets `WidgetDesempenho`,
`WidgetQuestoes`, `WidgetMetasEstudo`, `WidgetDesempenhoMateria`,
`WidgetRanking` e `WidgetConquistas` também dependem de `stats`/`analytics`
(portanto de `dataIssues.history`/`.attempts`/`.disciplines`), mas têm lógica
de fallback cruzado entre fontes dentro de si (ex.: `WidgetQuestoes` soma
`rawDisciplines` quando `correct`/`wrong` vêm zerados) e nenhum harness de
teste de componente React existe neste projeto para dar rede de segurança a
uma alteração dessas 3 variantes de coluna × 6 widgets sob pressão de tempo.
A camada de dados já está correta e honesta para esses seis widgets — o
`dataIssues` que os alimentaria já existe e é testado — falta só a
apresentação. Proposta técnica para uma fase futura: extrair um pequeno helper
compartilhado (`applyDataIssueFallback(value, unavailable)`) e aplicá-lo aos
seis widgets restantes numa passada dedicada, sem misturar com o resto desta
fase.

Testes:
- `dashboard-read-outcome.test.ts` — 11 casos comportamentais reais dos dois
  helpers (leitura ok, ausência real, erro, recuperação após erro).
- `dashboard-data-issues.wiring.test.ts` — 15 casos de fiação confirmando que
  `dashboard.service.ts` realmente usa os helpers nas 8 leituras, que não
  sobrou nenhum `.catch(() => [])`/`.catch(() => null)` solto, que o payload
  de sucesso expõe `dataIssues`, e que o catch-all marca as 8 flags como
  `true`.
- `dashboard-widgets-data-issues.wiring.test.ts` — 10 casos confirmando que os
  5 widgets tratados leem a flag certa e mostram a mensagem certa.

---

## 4. BUSCA FINAL (padrões de fallback e cache)

Varredura em `dashboard.service.ts`, `statistics-center.action.ts`,
`study-analytics.actions.ts` (Ranking), `dashboard-widget-catalog.tsx` e
`statistics-center-view.tsx` por `.catch(() => ...)`, `?? 0`, `|| 0`,
`error ? 0` e `cache.set`. Classificação:

- **(A) dado real / (B) default técnico legítimo**: a grande maioria — leitura
  de um campo numérico/opcional de uma linha **já lida com sucesso** (ex.:
  `Number(h.duration_minutes) || 0`, `meta["questions_correct"] || 0`,
  `snapshot?.stats?.X ?? 0` para widgets onde `dataIssues` já é checado
  separadamente antes de exibir o texto). Nenhuma mudança necessária.
- **(C) ausência real**: `{ plan: null }`, listas vazias quando o banco
  respondeu e não há linha — mantidos como estão.
- **(D) fallback perigoso (mascara erro)**: os únicos encontrados eram
  exatamente os `.catch(() => [])`/`.catch(() => null)` do Dashboard e os dois
  pontos do Ranking descritos acima — todos corrigidos nesta fase. Os seis
  widgets do Dashboard listados na seção 3 ainda exibem um "0"/"—" sem
  distinguir erro de ausência **na apresentação** (a causa raiz nos dados já
  está corrigida) — classificados como D ainda pendente de tratamento visual,
  não de dado, e documentados acima como proposta futura em vez de deixados
  sem menção.
- **cache**: só existe cache de servidor com TTL em Estatísticas (já corrigido
  na Fase I.7/I.8 anterior a este resumo, gate `integro` antes de `cache.set`)
  e nenhum em Ranking ou Dashboard, como descrito nas seções 2 e 3.

---

## 5. BANCO

Nenhuma alteração de schema, migração, RLS, índice ou constraint nesta fase.
`mcp__Supabase__list_migrations` (projeto `snlwfnwjrcqtlilhwgfm`) confirma a
mesma lista de 7 migrações já existente ao final da Fase I.7 (a mais recente,
`review_system_fsrs`, de 2026-09-25) — nenhuma nova migração foi criada, e
nenhuma chamada de escrita foi feita ao banco nesta fase (só a leitura
read-only de verificação acima).

---

## 6. TESTES

- `npm test`: **1410 testes, 1410 passando, 0 falhas** (695 suítes).
- `npx tsc --noEmit`: limpo.
- `npm run build` (com variáveis de ambiente placeholder — nenhum arquivo
  `.env*` foi lido): build de produção concluída com sucesso, todas as 32
  páginas geradas.
- Nenhum teste existente foi removido ou enfraquecido. `FakePostgrest` (usado
  por 8 arquivos de teste diferentes) ganhou uma extensão aditiva
  (`failOn(table, times, message)`) que, sem ser chamada, mantém o
  comportamento idêntico ao de antes — confirmado rodando a suíte inteira.
- Arquivos de teste novos desta fase, registrados em `package.json`:
  `dashboard-read-outcome.test.ts`, `dashboard-data-issues.wiring.test.ts`,
  `dashboard-widgets-data-issues.wiring.test.ts`,
  `statistics-loaders-error-vs-empty.test.ts`.

---

## 7. GIT

Nenhum `git add`, `git commit`, `git push`, `git pull`, `git merge`, `git
rebase`, `git reset`, `git checkout`, alteração de remote, ou upload para
GitHub foi executado. Nenhuma normalização de CRLF/LF (`package.json`
confirmado LF-only antes e depois da edição). Todo o trabalho foi feito
localmente e sincronizado para a pasta do projeto no dispositivo do usuário
(13 arquivos, hash MD5 idêntico confirmado nos dois lados).

`git status --short` / `git diff --stat` / `git diff --check`, escopados aos
13 arquivos desta fase, rodados no dispositivo:

```
 M package.json
 M src/application/dashboard/dashboard.service.ts
 M src/application/study-analytics/statistics-center.action.ts
 M src/application/study-analytics/study-analytics.actions.ts
 M src/domain/dashboard/dashboard.types.ts
 M src/features/dashboard/components/dashboard-widget-catalog.tsx
 M src/features/statistics/components/statistics-center-view.tsx
 M src/lib/testing/fake-postgrest.ts
?? src/application/dashboard/dashboard-data-issues.wiring.test.ts
?? src/application/dashboard/dashboard-read-outcome.test.ts
?? src/application/dashboard/dashboard-read-outcome.ts
?? src/application/study-analytics/statistics-loaders-error-vs-empty.test.ts
?? src/features/dashboard/components/dashboard-widgets-data-issues.wiring.test.ts

 8 files changed, 730 insertions(+), 368 deletions(-)

git diff --check: sem erros de espaço em branco (exit code 0)
```

O restante do `git status` do repositório (centenas de arquivos) é o diff
acumulado de fases anteriores, ainda não commitado pelo usuário — não foi
tocado nesta fase. **Nenhum commit, nenhum push, nenhuma alteração de remote
foi feita.** O usuário fará o commit/push manualmente, quando desejar.
