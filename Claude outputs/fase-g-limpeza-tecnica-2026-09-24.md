# NomeIA — Fase G — Limpeza técnica, código morto e padronização interna

Data: 24/09/2026 · Escopo: só limpeza técnica. Não houve redesign, funcionalidade nova, mudança de schema, RPC nem mudança de comportamento visível.

Estado final: **1105/1105 testes passando** · `tsc --noEmit` 0 erros · `npm ci --ignore-scripts` OK · `npm run build` OK · ESLint (repo inteiro) **287 erros / 45 avisos → 93 / 43** · paridade md5 nuvem ↔ seu computador confirmada.

> **Ação sua:** 7 dependências saíram do `package.json`/`package-lock.json`. Rode `npm ci` (ou `npm install`) na sua máquina antes do próximo `npm run dev`/build para o `node_modules` ficar igual ao lock.

---

## 1. Método

Primeiro o inventário, depois a limpeza (o inventário completo está em `fase-g-inventario-2026-09-24.md`). Para cada candidato:

- `knip` (via `npx`, sem virar dependência) montou o grafo de imports.
- Um script próprio resolveu imports reais (`@/…`, relativos, `import()` dinâmico, `require`).
- Cada caminho e nome foi procurado em testes (inclusive testes de wiring com `readFileSync`), em `docs/`, `scripts/`, `supabase/` e nos relatórios.
- O `git log` confirmou quando o último import de cada arquivo foi removido.

Um arquivo só foi removido quando não sobrou nenhum import de produção e as referências restantes eram testes/docs que foram ajustados junto.

## 2. Componentes investigados

| Componente | Situação encontrada | Resultado |
|---|---|---|
| `QuickStartBar` | último import saiu em `04c0e4d`; só um teste de wiring lia o arquivo | **REMOVIDO** + teste ajustado |
| `StudyDock` | substituído por `StudyHeaderControl` + FAB; só o mesmo teste de wiring | **REMOVIDO** + teste ajustado |
| `StudyQuickAccess` | acesso rápido antigo ("Central Inteligente"); só o mesmo teste | **REMOVIDO** + teste ajustado |
| `CycleNextCard` | só era usado pelo `dashboard/loading.tsx` antigo (trocado na Fase E) | **REMOVIDO** + doc |
| `PendingReviewsWidget` | idem | **REMOVIDO** + doc |
| `RecentActivitiesList` | idem; era a única entrada para `/dashboard/analytics` | **REMOVIDO** + doc |
| `DashboardSection` | já estava apagado na árvore de trabalho **antes** da Fase G (aparece como `D` no `git status` inicial); não sobrou nenhuma referência | nada a fazer |

## 3. REMOVIDO: código morto (27 arquivos em `src`, todos versionados no git)

| Arquivo | Motivo |
|---|---|
| `components/study/study-dock.tsx`, `study-quick-access.tsx` | UI antiga de sessão, sem import |
| `features/dashboard/components/quick-start-bar.tsx`, `cycle-next-card.tsx`, `pending-reviews-widget.tsx`, `recent-activities-list.tsx`, `dashboard-floating-button.tsx`, `widget-error-boundary.tsx` | Dashboard antigo, sem import (o último nunca foi usado) |
| `features/study-cycle/components/study-cycle-widget.tsx` | trocado pelo `intelligent-cycle-widget` em `ed26309` |
| `features/study-cycle/lib/cycle-intelligence-engine.ts` | motor nunca chamado (o tipo `CycleIntelligence` em `domain/study-cycle` ficou: pasta protegida) |
| `features/study-history/components/active-session-manager.tsx` | trocado pelo `StudyProvider` |
| `features/study-session/components/driving-mode-view.tsx`, `hooks/use-study-timer.ts` | modo direção e hook de timer antigos |
| `application/study-session/study-session.actions.ts` | `finalizeSmartSessionAction` sem chamador (o `SessionOrchestrator` continua, usado pela homologação) |
| `application/study-history/study-history.analytics.ts` | `getStudyStats` etc., nunca chamados |
| `application/dashboard/greeting.service.ts`, `application/concursos/get-active-target.action.ts` | nunca chamados |
| `application/disciplines/update-status.action.ts` | o próprio arquivo dizia "sem nenhum caller hoje"; o `updateUserDisciplineStatus` que só ela usava também saiu de `disciplines.service.ts` |
| `application/study-cycle/feature-flags.ts` | flag com whitelist de usuários de teste, nunca lida (arquivo isolado; nenhuma lógica do ciclo tocada) |
| `config/brand.ts` | constante `BRAND` nunca importada |
| `domain/dashboard/user-dashboard.types.ts` | arquivo vazio |
| `utils/supabase/client.ts`, `server.ts` | **clientes Supabase duplicados** (usavam `PUBLISHABLE_KEY`); o app inteiro usa `infrastructure/supabase/*` |
| `components/ui/switch.tsx`, `table.tsx` | primitivos sem uso |
| `app/seed/page.tsx`, `seed.action.ts` | **rota pública** (fora de `(protected)`) que disparava a inserção de ~150 disciplinas no catálogo. Ferramenta de dev exposta em produção |

Pastas que ficaram vazias e saíram: `src/utils/supabase`, `src/app/seed`, `src/features/study-history`, `src/features/study-cycle/lib`.

Código morto dentro de arquivos vivos (sem mudar comportamento):

- `adaptive-replan.service.ts › pullPendingToToday`: o bloco "4. Calcular saldo semanal real" fazia **duas consultas** (`profiles` e `study_history` da semana) cujo único resultado, `remainingWeek`, nunca era lido. O bloco saiu inteiro. Isso também elimina uma leitura de `study_history` sem paginação.
- Variáveis, imports e estados nunca lidos em cerca de 25 arquivos (lista na seção 8).

## 4. REMOVIDO: arquivos temporários da raiz

`schema-probe.tmp.mts`, `seed-probe.tmp.mts`, `build_errors.txt` (log antigo em UTF‑16) e `lint-batch.mjs` (lia um relatório temporário de outra ferramenta em `%TEMP%`). Nenhum deles tinha referência.

## 5. Rotas fora da navegação

Nenhuma rota de produto foi removida às pressas. Só `/seed` saiu (seção 3).

| Rota | Classificação | Justificativa |
|---|---|---|
| `/dashboard/analytics` | **DEPRECAR**, mantida | sem links de entrada (o último era o `RecentActivitiesList` morto); várias actions ainda chamam `revalidatePath` nela; conteúdo equivalente em /estatisticas. Próximo passo sugerido: redirecionar para /estatisticas |
| `/dashboard/performance` | **DEPRECAR**, mantida | depende de `question_attempts`, hoje vazia |
| `/dashboard/questions` | **DEPRECAR**, mantida | casca com navegação antiga |
| `/dashboard/adaptive` | **DEPRECAR**, mantida | tem lógica própria ("saúde de aprendizado") |
| `/dashboard/mentor` | **MANTER** | feed do Mentor IA, lógica exclusiva |
| `/dashboard/homologation` | **MANTER** como ferramenta | painel E2E que grava dados de teste na conta de quem abre. Decisão sua: restringir a admin ou tirar de produção |

## 6. REMOVIDO: dependências

`npm uninstall --ignore-scripts` de 7 pacotes sem nenhum uso no repositório:

| Pacote | Tipo |
|---|---|
| `@supabase/server` | dependência |
| `@tanstack/react-query`, `@tanstack/react-query-devtools` | dependência |
| `framer-motion` | dependência |
| `zustand` | dependência |
| `eslint-config-next` | dev (o `eslint.config.mjs` usa `@next/eslint-plugin-next` direto) |
| `eslint-plugin-import` | dev (não é importado pelo config) |

O lock perdeu 102 entradas. Nenhuma versão de outro pacote mudou e nada foi atualizado. `@supabase/middleware` não estava no `package.json`; era só transitiva e saiu junto.

**MANTIDO:**
- `pg` (usado por `scripts/*.mjs`).
- `lint-staged` e `@commitlint/cli` (hooks do `.husky`).
- `postcss`, `@eslint/js` e `@commitlint/types` são usados sem estar listados; chegam por outras dependências. Não adicionei nada nesta fase.

## 7. Imports (`import type`)

- `consistent-type-imports` foi de **9 → 0**.
- Nos 4 testes do offline/bridge (`study-session-sync-bridge`, `connection-state`, `save-study-session`, `sync-worker`), `typeof import("./x").Y` virou `import type * as XModule from "./x"` + `typeof XModule.Y`.
- O restante saiu com os arquivos mortos.
- Só tipos mudaram nesses testes; os 37 testes passam iguais.

## 8. ESLint por categoria

Não usei `eslint-disable` global, não desliguei regras e não mudei a configuração. Os números são do repositório inteiro, via `eslint . -f json`, comparando com a árvore de antes da Fase G.

| Regra | Nível | Antes | Depois |
|---|---|---|---|
| `@typescript-eslint/no-non-null-assertion` | erro | 95 | 23 |
| `@typescript-eslint/no-unused-vars` | erro | 59 | 2 |
| `no-nested-ternary` | erro | 36 | 26 |
| `no-console` | aviso | 29 | 29 |
| `no-undef` | erro | 28 | 21 |
| `no-empty` | erro | 24 | **0** |
| `react-hooks/set-state-in-effect` | erro | 21 | 18 |
| `react-hooks/exhaustive-deps` | aviso | 15 | 14 |
| `@typescript-eslint/consistent-type-imports` | erro | 9 | **0** |
| `@typescript-eslint/no-explicit-any` | erro | 6 | **0** |
| `eqeqeq` | erro | 3 | **0** |
| `@typescript-eslint/no-require-imports` | erro | 2 | 2 |
| `prefer-const` | erro | 2 | **0** |
| `react-hooks/immutability` | erro | 1 | **0** |
| `no-control-regex` | erro | 1 | 1 |
| diretiva `eslint-disable` sem uso | aviso | 1 | **0** |
| **Total** | | **287 E / 45 W** | **93 E / 43 W** |

Só em `src/`: 252 E / 22 W → 68 E / 20 W.

O que foi feito em cada categoria:

- **no-unused-vars:** imports, variáveis, estados e parâmetros nunca lidos em:
  - layout protegido, `admin.actions`, `adaptive-replan`, `weekly-planner`;
  - `discipline-selector`, `logout-button`, `daily-message-banner`, `dashboard-dnd-context`;
  - telas de planejamento (diário, semanal, calendário, wizard, card de metas);
  - `account-settings-modal`, `ranking-view`/`ranking-engine`, `simulados-view`;
  - modais de ciclo (criar/editar), `discipline-popover`, `study-register-modal`, script `generate-topic-catalog-sql`.

  Parâmetros exigidos pela assinatura viraram `_nome`. Os 2 restantes estão na seção 16.
- **no-empty (24 → 0):** os `catch {}` vazios são intencionais (localStorage indisponível em modo privado ou cota cheia, áudio suspenso, falha de rede no replanejamento). Cada um ganhou um comentário explicando por que o erro é ignorado. A lógica não mudou.
- **no-nested-ternary fora de JSX (9 corrigidos):**
  - Os 5 cálculos idênticos de `weekStartDay` viraram `resolveWeekStartDay` (seção 9).
  - `simulado-stats.service`: as 2 tendências passaram a usar `trendFromDelta` e a mensagem, `TREND_MESSAGES`.
  - `email.service › maskEmail` usa um `if`.
  - Os testes novos de tendência também passam contra a implementação antiga, o que prova que o resultado é o mesmo.
- **eqeqeq:** `!= null` → `!== null && !== undefined` (`discipline-popover`).
- **no-explicit-any:** `as any` → `as DryRunReport` / `as ExecutionReport` no teste de migração de ciclos.
- **no-non-null-assertion nos testes (68):** novo helper `src/lib/testing/must.ts`. Ele falha com mensagem clara em vez de estourar `undefined` mais adiante. Aplicado em `ranking-engine.test` (37), `study-cycle.test` (25), `simulado-stats.test` (5) e `replan-engine.test` (1).
- **prefer-const:** `scripts/inspect_db.ts` e `study-cycle.test.ts`.
- **react-hooks/immutability:** em `support-mode-banner`, `handleLeave` subiu para antes do `useEffect` que o usa (só reordenado).

## 9. Duplicação

Só unifiquei duplicação real com comportamento idêntico:

- **UNIFICADO:** a resolução do primeiro dia da semana (preferência `"Domingo"` → 0, `"Segunda-feira"` → 1, senão `profiles.week_start_day ?? 0`) estava copiada em 5 lugares: `dashboard.service`, `adaptive-replan.service` ×3 e `weekly-planner.service`.
  - Agora é `resolveWeekStartDay` em `src/lib/study-time-calculator.ts`, ao lado do `getSaoPauloWeekRange` que consome o valor.
  - Um teste compara a função com a tabela da expressão antiga em 45 combinações.
- **MANTIDO separado:** `statistics-center.action › loadWeekStartDay` também aceita a chave `primeiroDia` e testa as condições em outra ordem. Não é o mesmo comportamento, então não entrou na função comum.
- **REMOVIDO:** os clientes Supabase duplicados em `src/utils/supabase` (seção 3).
- Não criei abstrações genéricas.

## 10. MANTIDO: paginação e instrumentação

- `src/lib/parallel-pagination.ts`, `cycle-sessions.reader`, `cycle-overview.reader` e todos os `fetchAllRowsPaged`/`fetchAllPagesInParallel` estão intactos.
- Não criei outro helper de paginação.
- Todos os logs `[perf]` continuam.
- Nenhuma configuração do PostgREST ou do Supabase foi tocada.

## 11. MANTIDO: áreas protegidas

- **Cycle Engine** (`application/study-cycle/**`, `domain/study-cycle/**`): cursor, round, progress, skip, `registerStudyToCycle`, `rebuildActiveCycleProgress` e reconcile não foram tocados. As mudanças ali foram:
  - apagar o `feature-flags.ts` isolado;
  - tipar o `cycle-migration.test.ts`;
  - no `study-cycle.test.ts`, usar `must()` e tirar imports e variáveis sem uso.

  Os 265 testes do ciclo passam.
- **Skip do ciclo:** o `handleSkipStep` do `intelligent-cycle-widget` não é usado por nenhum botão. Mesmo assim, um teste de proteção exige a chamada `skipCycleCurrentItemAction`, então **o handler foi mantido** (as 2 violações de `no-unused-vars` que restam vêm daí). Só `totalRoundsDone`, nunca lido, saiu desse arquivo.
- **Offline, sync, `operationId`, idempotência:** nos testes, só tipos de import mudaram. Nenhum código de produção dessas áreas foi alterado.

## 12. Testes alterados (e por quê)

| Teste | Mudança | Motivo |
|---|---|---|
| `study-provider-context-split.wiring` | tirou as entradas `study-quick-access`, `study-dock`, `quick-start-bar` | os arquivos foram removidos; o resto da verificação continua |
| `security-ownership.wiring` | tirou o `describe` de `updateDisciplineStatusAction` | a action morta foi removida |
| `cycle-migration.test` | `as any` → tipos reais; helper `firstOf`; diretiva de disable sem uso removida | lint, sem mudar asserções |
| 4 testes offline/bridge | `import type * as` | `consistent-type-imports` |
| `ranking-engine.test`, `study-cycle.test`, `simulado-stats.test`, `replan-engine.test` | `x!` → `must(x)` | `no-non-null-assertion`, com mensagem de falha melhor |
| `study-cycle.test` | imports e locais sem uso | lint |
| `study-time-calculator.test` | +2 testes de `resolveWeekStartDay` | cobrir a unificação |
| `simulado-stats.test` | +1 teste de tendência (UP/DOWN/STABLE, limiar de 2 p.p., ramo com ≤ 3 simulados) | cobrir o refactor; também passa contra o código antigo |
| **`package.json › test`** | incluído `src/features/ranking/lib/ranking-engine.test.ts` | **76 testes existiam mas nunca rodavam** no `npm test` (todos passam) |

Contagem: 1033 → 1105. Entraram 76 do ranking e 3 novos; saíram 7 testes de código removido.

## 13. Documentação atualizada (só o que estava comprovadamente desatualizado)

- `docs/estudei/01-dashboard.md`: `CycleNextCard`, `PendingReviewsWidget` e `RecentActivitiesList` foram trocados pelos widgets atuais, com nota de remoção.
- `docs/estudei/03-study-session.md`: `ActiveSessionManager` e `finalizeSmartSessionAction` foram trocados por `StudyProvider`/FAB e pelo fluxo atual.
- Comentários de código que citavam componentes removidos: `study-provider.tsx` e `lib/format-duration.ts`.

## 14. Nomes antigos

"Mentor Concursos IA", "Central/Centro Inteligente", "Análise Inteligente" e "Plataforma inteligente" não aparecem em nenhum texto visível ao usuário.

- **REMOVIDO:** as ocorrências em arquivos mortos saíram com eles.
- **MANTIDO:** sobram só em:
  - comentários internos (cabeçalho do `globals.css`, comentários de actions, descrições de testes de wiring);
  - o nome da pasta do projeto.

  Renomear isso só geraria diff sem ganho, e as descrições de testes antigos documentam o fluxo pelo nome da época.

## 15. Formatação e fins de linha

Não houve reformatação global. Cada arquivo manteve o próprio padrão (LF, CRLF ou misto): para cada arquivo modificado, conferi que o número de linhas alteradas é o mesmo com e sem `--ignore-cr-at-eol`. Um arquivo misto (`format-duration.ts`, 59 linhas CRLF + 40 LF) foi editado byte a byte para não ser normalizado.

## 16. DEFERIDO (documentado, não corrigido nesta fase)

| Item | Qtde | Por que ficou |
|---|---|---|
| `no-nested-ternary` dentro de JSX | 26 | reescrever JSX de telas (planejamento, simulados, ciclo, FAB, admin) é mexer em renderização. Fica para uma fase com validação visual |
| `no-non-null-assertion` em produção | 23 (21 em `src`, 2 em script) | são acessos por índice já protegidos por checagem de tamanho. Trocar por `?? valor` esconderia um bug futuro em vez de acusá-lo |
| `react-hooks/set-state-in-effect` | 18 | mudar o fluxo de estado de componentes altera renderização e tempo; exige teste de UI |
| `react-hooks/exhaustive-deps` | 14 avisos | adicionar dependências muda quando efeitos e callbacks rodam |
| `no-undef` em `scripts/*.mjs` e `seed-disciplines.js` | 21 | `console`/`process`/`require` são globais do Node; o config não declara ambiente Node para esses arquivos. **Precisa da sua decisão:** adicionar um bloco `languageOptions.globals` de Node só para `scripts/**` e `*.js` da raiz. Não fiz porque a regra era não mexer em regras para esconder erro |
| `no-require-imports` em `seed-disciplines.js` | 2 | script CommonJS de banco (categoria F); converter para ESM muda como ele roda |
| `no-control-regex` em `domain/auth/auth-redirect.ts` | 1 | intencional: a regex bloqueia caracteres de controle em URLs de redirect (proteção contra open redirect). **Precisa da sua decisão:** um `eslint-disable-next-line` com justificativa, ou manter como está |
| `no-console` | 29 avisos | quase todos em scripts CLI e logs de auditoria (`[EmailService]`, `[perf]`), que são desejados |
| `no-unused-vars` em `intelligent-cycle-widget` | 2 | `handleSkipStep`/`isSkipping` presos pelo teste de proteção do skip (seção 11) |

## 17. Riscos não corrigidos e decisões pendentes

1. `/dashboard/homologation` está acessível em produção a qualquer usuário logado e grava dados de teste na própria conta. Recomendo restringir a admin.
2. As 4 rotas DEPRECAR (`analytics`, `performance`, `questions`, `adaptive`) continuam no build e ainda são revalidadas por actions. Sugiro redirecionar para `/estatisticas` numa fase própria.
3. Três funcionalidades prontas e desligadas foram mantidas (categoria F, decisão sua):
   - `flashcard-library.tsx` (894 linhas);
   - `simulado-result.tsx` + `simulados.actions.ts` (1.072 linhas);
   - o esqueleto do banco de questões (`application/questions/*`, roadmap em `docs/estudei/06-questions.md`).
4. O `tsconfig` inclui `**/*.ts`, então também checa tipos em `scripts/` e na pasta `Claude outputs/`. Essa pasta tem uma cópia antiga de um teste de wiring que não é executada. Não mexi.
5. Os ~23 itens de lint da seção 16 que dependem de validação visual ou de decisão de config.
6. `git diff --check` no seu computador lista milhares de "trailing whitespace". São os `\r` de arquivos que **já estavam** com fim de linha convertido na árvore de trabalho antes da Fase G (`.agents/`, `docs/`, `public/`, SQLs…). Nos arquivos alterados pela Fase G, o check com `core.whitespace=cr-at-eol` não acusa nada.

---

## Validação

| Comando | Resultado |
|---|---|
| `npm ci --ignore-scripts` | OK (699 pacotes) |
| `npm test` | **1105 / 1105**, 0 falhas |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK; `/seed` não aparece mais nas rotas |
| Paridade nuvem ↔ computador | `src/` (hash de todos os arquivos) `e450aeea…`; `package.json` `177c631b…`; `package-lock.json` `0212562c…`; docs e scripts idênticos |
| `git status --short` | 418 linhas. As da Fase G: 31 `D` (27 em `src` + 4 na raiz), os `M` da lista acima e o novo `src/lib/testing/must.ts` (em `src/lib/testing/`, que já estava como `??`). O resto já estava na árvore antes |
| `git diff --stat` | 374 arquivos no total da árvore de trabalho (inclui fases anteriores ainda sem commit) |
| `git diff --check` | ver risco 6 |

Nenhum `git add`, `commit`, `push`, `pull`, `merge`, `reset` ou `checkout` foi executado. Revisão, commit e push ficam com você.
