# Fase I.9 — Fechamento Visual dos Data Issues do Dashboard

**Data:** 26/09/2026
**Escopo:** só apresentação (React) dos 6 widgets do Dashboard que a Fase I.8 deixou pendentes: `WidgetDesempenho`, `WidgetQuestoes`, `WidgetMetasEstudo`, `WidgetDesempenhoMateria`, `WidgetRanking`, `WidgetConquistas`. Nenhuma mudança em FSRS, Revisões, Cycle Engine, banco de dados, fórmulas de analytics/ranking, origem dos dados, cache ou arquitetura principal do Dashboard.

---

## 1. Contexto

A Fase I.8 corrigiu a camada de **dados** do Dashboard: `dashboard.service.ts` agora produz `snapshot.dataIssues` (8 flags booleanas: `profile`, `target`, `cycle`, `todayPlan`, `history`, `activities`, `attempts`, `disciplines`), distinguindo "a leitura falhou" de "o dado realmente está vazio". Cinco widgets já foram corrigidos para consumir isso (`WidgetTempoEstudo`, `WidgetConstancia`, `WidgetProgressoEdital`, `WidgetUltimasAtividades`, `WidgetDataProva`). Os outros 6 ficaram documentados como pendência conhecida — é exatamente essa pendência que a Fase I.9 fecha.

Nenhum novo flag foi criado. Todos os 6 widgets passaram a consumir exclusivamente o contrato `DashboardDataIssues` já existente.

---

## 2. WIDGETS

### 2.1 `WidgetDesempenho`

- **Mapeamento:** `totalQuestions`/`correctQuestions`/`wrongQuestions`/`accuracyPercentage` (em qualquer período, via `performanceByPeriod`) e o ranking de matérias por tempo (`analytics.rankings.disciplines`) vêm, em `dashboard.service.ts`, de `rawHistory` + `question_attempts` combinados. `dataIssue` correspondente: `history` **OU** `attempts`.
- **Antes:** os 4 números e o ranking eram exibidos direto do snapshot, sem nenhuma checagem — uma falha de leitura aparecia como "0 questões, 0% de acerto", indistinguível de um usuário que realmente não estudou.
- **Depois:** `desempenhoUnavailable = dataIssues.history === true || dataIssues.attempts === true`. Quando `true`: `accuracyText`, `totalDisplay`, `correctDisplay`, `wrongDisplay` viram `"—"` nas 3 variantes de `colSpan` (1, 2 e 3), e o bloco "Matérias mais estudadas" (`disciplineRanking`) é forçado a lista vazia (em vez de aparecer como "ranking vazio real"). A fórmula de acurácia/ranking em si não foi tocada.

### 2.2 `WidgetQuestoes` (o mais sensível — tinha o fallback cruzado)

- **Mapeamento:** `achieved` (semana) e `total`/`correct`/`wrong`/`accuracy` (histórico completo) vêm de `rawHistory` + `question_attempts` (`history`/`attempts`); `target` (meta semanal) vem do perfil (`profile`).
- **Fallback perigoso identificado:** quando `correct === 0 && wrong === 0`, o widget somava `rawDisciplines[].correctCount/wrongCount` como "segunda fonte" — mas essas colunas de `rawDisciplines` são calculadas, na mesma `dashboard.service.ts`, a partir das MESMAS leituras de `attempts`/`rawHistory`. Ou seja: se a leitura principal falhasse, o fallback "confirmaria" o mesmo zero fabricado, mascarando o erro com uma aparência de segunda fonte independente.
- **Depois:** `questoesUnavailable = dataIssues.history === true || dataIssues.attempts === true`; `metaUnavailable = dataIssues.profile === true`. O bloco do fallback cruzado agora só executa quando `!questoesUnavailable` — ou seja, nunca roda se a fonte principal falhou. `achieved`/`correct`/`wrong`/`accuracy`/`target` viram `"—"` (ou `"indisponível"` no caso da meta) em vez de números calculados; o cabeçalho ganhou um terceiro estado ("Indisponível", distinto de "Livre" e de "X% da meta"); `diff` e a barra de progresso ficam `null`/zerados quando indisponível.

### 2.3 `WidgetMetasEstudo`

- **Mapeamento:** Horas (`weekly.percentage`) e Dias Ativos (`studyDays.percentage`) cruzam `profile` (target) + `history` (achieved); Questões (`questions.percentage`) cruza `profile` + `history` + `attempts` (achieved vem de `performanceByPeriod.SEMANA.totalQuestions`, que já combina as duas leituras).
- **Antes:** `percentage === null` só cobria "sem meta configurada" (target ausente/zero) — se o achieved fosse fabricado como 0 por uma leitura quebrada e a meta existisse, o cálculo gerava um percentual real-parecendo (ex.: 0%), sem qualquer aviso.
- **Depois:** três flags — `hoursUnavailable`, `questionsUnavailable`, `daysUnavailable` — cada uma testando exatamente as leituras das quais depende. Quando `true`, o texto exibido é `"indisponível"`; quando `false` e a meta é `null`, continua `"—"` (ausência real, comportamento da Fase H preservado); a barra de progresso correspondente fica em 0% quando indisponível. Nenhuma fórmula de meta foi alterada.

### 2.4 `WidgetDesempenhoMateria`

- **Mapeamento:** a LISTA de matérias vem de `getUserDisciplines` (`dataIssues.disciplines`); os números por matéria (`correctCount`/`wrongCount`/`tempoFormatted`/`accuracyPercentage`) vêm de `attempts` + `rawHistory` (`history`/`attempts`) — são leituras independentes, cada uma podendo falhar sem a outra falhar.
- **Depois:** `disciplinesUnavailable = dataIssues.disciplines === true` troca a mensagem de lista vazia ("Nenhuma matéria disponível ainda." → "Não foi possível carregar suas matérias agora.") quando a causa é falha de leitura. `statsUnavailable = dataIssues.history === true || dataIssues.attempts === true` troca o rótulo por linha ("Sem questões" → "Indisponível") sem inventar um novo dado por matéria e sem passar nada novo por `dashboard.service.ts`. Ordenação/pontuação das matérias não foi tocada.

### 2.5 `WidgetRanking`

- **Observação importante:** o brief da Fase I.9 presumia que este widget deveria respeitar o estado de erro do `getRankingViaDirectQuery`/`getGlobalRankingAction` (o ranking global de usuários da página `/ranking`, corrigido na Fase I.8). Uma checagem no código (confirmada por grep — zero ocorrências dessas funções em `src/features/dashboard/`) mostrou que **este widget do Dashboard é uma métrica diferente**: "matérias mais estudadas por tempo", vinda de `AnalyticsEngine.rankings.getDisciplineRanking(ctx)`, que usa **apenas `rawHistory`** — sem qualquer relação com o ranking global entre usuários.
- **Resolução:** a dependência real deste widget é `dataIssues.history`, e foi essa a flag usada: `rankingUnavailable = dataIssues.history === true`. Quando `true`, a mensagem passa a ser "Ranking indisponível no momento.", distinta de "Sem dados suficientes para o ranking." (ausência real). A ordenação por tempo/sessões/nome não foi alterada.

### 2.6 `WidgetConquistas`

- **Mapeamento:** `totalMinutes` e `consecutiveStreak` vêm de `rawHistory` (`dataIssues.history`); `totalQuestions` vem de `performanceByPeriod.TOTAL`, que combina `rawHistory` + `question_attempts` (`history`/`attempts`). Os três alimentam `dashboardMilestones(...)`, que decide quais badges estão desbloqueados.
- **Antes:** uma falha de leitura zerava os três números silenciosamente, e todos os badges apareciam "bloqueados" — indistinguível de um usuário que genuinamente ainda não alcançou nenhum marco.
- **Depois:** `conquistasUnavailable = dataIssues.history === true || dataIssues.attempts === true`. Quando `true`, `dashboardMilestones` não é chamado com números fabricados — os badges viram lista vazia e o corpo do widget mostra "Não foi possível carregar suas conquistas agora." no lugar da grade de badges; o contador do cabeçalho vira "—" em vez de "0 / N". A lógica de cálculo de marcos (`dashboardMilestones`) não foi alterada.

---

## 3. FALLBACKS (o que foi removido/modificado)

| Widget | Fallback perigoso | Ação |
|---|---|---|
| WidgetQuestoes | Soma de `rawDisciplines.correctCount/wrongCount` quando `correct===0 && wrong===0`, usada como se fosse segunda fonte independente — mas vem da mesma leitura de `attempts`/`rawHistory` | Gated com `!questoesUnavailable &&`: só roda quando a fonte principal não falhou |

Os demais `?? 0`/`|| []` encontrados nos 6 widgets (varredura da seção 16 do brief) foram classificados como defaults técnicos seguros (Categoria B/C) — cada um já protegido por um dos flags acima antes de chegar à tela (ex.: em `WidgetDesempenho`, `defaultPeriodData` só é usado quando o período estruturalmente não existe no objeto, e o valor final exibido passa por `desempenhoUnavailable ? "—" : ...` de qualquer forma). Nenhuma outra ocorrência de erro mascarado (Categoria D) foi encontrada nos 6 widgets — confirmado por varredura de `?? 0`, `|| 0`, `?? []`, `|| []` e `catch`/`error ?` no código-fonte de cada um.

---

## 4. STATES (os três estados visuais)

Cada widget agora distingue, sem redesenho:

1. **Dado real** — número/lista normal, como antes.
2. **Vazio real** — mensagem existente ("Sem meta configurada", "Nenhuma matéria disponível ainda.", "Sem dados suficientes para o ranking.", etc.), inalterada.
3. **Indisponível por erro** — texto curto novo ("—", "indisponível", "Indisponível", ou uma frase curta tipo "Não foi possível carregar suas matérias agora."), reaproveitando os componentes visuais existentes. Nenhum modal, card de erro grande ou ícone novo foi introduzido.

Cada widget continua renderizando de forma independente — a falha de um widget (ex.: `disciplines`) não afeta os outros 5 nem o restante do Dashboard, preservando a renderização proporcional já estabelecida na Fase I.8.

---

## 5. TESTS

Novo arquivo: `src/features/dashboard/components/dashboard-widgets-data-issues-i9.wiring.test.ts` — **20 testes**, registrado em `package.json`.

Como não existe harness de teste de componente React neste projeto (runner é `node:test` puro via `tsx --test`, sem jsdom/React Testing Library), os testes são de **fiação/estáticos**: leem o código-fonte de `dashboard-widget-catalog.tsx` como texto e verificam, por widget, que (a) a flag de `dataIssues` certa é lida, (b) o fallback cruzado do `WidgetQuestoes` está de fato condicionado por `!questoesUnavailable`, (c) os textos exibidos usam as variáveis "Display"/"Text" (nunca o número bruto), e (d) as mensagens de vazio-real vs. indisponível são de fato distintas. Contagem por widget:

- WidgetDesempenho: 4 testes (flag combinado, textos, ranking, uso das variáveis *Display na JSX)
- WidgetQuestoes: 5 testes (2 flags, fallback cruzado gated, textos, cabeçalho 3 estados, realPct/diff nulos)
- WidgetMetasEstudo: 3 testes (3 flags, 3 textos, uso na JSX)
- WidgetDesempenhoMateria: 3 testes (2 flags, mensagem de lista vazia, rótulo por linha)
- WidgetRanking: 2 testes (flag + fallback de array, mensagens distintas)
- WidgetConquistas: 3 testes (flag combinado, badges não calculados com dado fabricado, cabeçalho/corpo distintos)

Suíte completa: `npm test` → **1430 testes, 0 falhas** (nenhum teste existente foi removido ou enfraquecido).

---

## 6. LIMITATION

Este projeto não tem harness de teste de componente React (sem jsdom/React Testing Library instalado). Os testes acima são testes de fiação/estáticos sobre o código-fonte — garantem que a lógica condicional certa existe e usa as variáveis certas, mas **não renderizam o componente nem verificam o DOM/output visual real**. Essa é a mesma limitação documentada nas Fases I.7 e I.8 (`review-study-history-d4.wiring.test.ts`, `dashboard-widgets-data-issues.wiring.test.ts`). Uma verificação visual de fato exigiria instalar jsdom + React Testing Library — decisão fora do escopo desta fase.

---

## 7. BANCO

Nenhuma migration, DDL, alteração de schema, RLS, índice ou constraint foi feita ou é necessária nesta fase. Todo o trabalho foi só na camada de apresentação (`dashboard-widget-catalog.tsx`) e um novo arquivo de teste. `dashboard.service.ts` (camada de dados) não foi tocado.

---

## 8. GIT

Comandos executados no dispositivo do usuário (repositório em `mentor-concursos-ia`), escopados aos 3 arquivos desta fase:

```
$ git diff --stat -- src/features/dashboard/components/dashboard-widget-catalog.tsx package.json src/features/dashboard/components/dashboard-widgets-data-issues-i9.wiring.test.ts
 package.json                                                                       |   3 +-
 src/features/dashboard/components/dashboard-widget-catalog.tsx                    | 518 ++++++++++++---------
 2 files changed, 299 insertions(+), 222 deletions(-)

$ git diff --check -- src/features/dashboard/components/dashboard-widget-catalog.tsx package.json src/features/dashboard/components/dashboard-widgets-data-issues-i9.wiring.test.ts
(sem saída — sem erros de espaço em branco/CRLF)
```

`dashboard-widget-catalog.tsx` já tinha alterações não commitadas de fases anteriores (nunca commitadas, por instrução); o `diff --stat` acima reflete o acumulado, não só a Fase I.9. O novo arquivo de teste aparece como não rastreado (`??`) no `git status`, portanto fora do `diff` acima.

**NÃO foi feito commit. NÃO foi feito push.** Nenhuma configuração do git, remoto, branch ou normalização de fim de linha foi alterada. Os 3 arquivos foram sincronizados para a pasta conectada do usuário e verificados por `md5sum` idêntico entre o ambiente de nuvem e o dispositivo local.
