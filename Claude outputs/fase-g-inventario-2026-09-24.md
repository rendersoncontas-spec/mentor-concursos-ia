# NomeIA — Fase G — Inventário (etapa 1, antes de qualquer remoção)

Método: `knip` (análise de grafo de imports do projeto inteiro, rodado via `npx`, sem adicionar dependência) + um script próprio que, para cada candidato, resolve imports reais (`@/…` e relativos, `import()` dinâmico, `require`), procura o caminho/nome em testes (inclusive testes de wiring com `readFileSync`), em `docs/`, `README`, `scripts/`, `supabase/` e nos relatórios, e confere o histórico do git (se o arquivo era importado no último commit).

Categorias: **A** usado em produção · **B** só em testes · **C** só em documentação · **D** aparentemente morto · **E** legado/rota antiga · **F** não remover sem decisão.

## Arquivos em `src` sem nenhum import de produção

| Arquivo | Cat. | Referências (fora dele mesmo) | Uso | Risco | Ação proposta |
|---|---|---|---|---|---|
| `src/components/study/study-dock.tsx` | B | teste de wiring `study-provider-context-split` (lê o arquivo como texto) | dock antigo de estudo; substituído por `study-header-control` + FAB | baixo | **remover** + ajustar o teste |
| `src/components/study/study-quick-access.tsx` | B | mesmo teste de wiring | acesso rápido antigo ("Central Inteligente") | baixo | **remover** + ajustar o teste |
| `src/features/dashboard/components/quick-start-bar.tsx` | B | mesmo teste de wiring; comentários | barra antiga do Dashboard (último import removido no commit `04c0e4d`) | baixo | **remover** + ajustar o teste |
| `src/features/dashboard/components/cycle-next-card.tsx` | C | `docs/estudei/01-dashboard.md` | só era usado pelo `dashboard/loading.tsx` antigo (substituído na Fase E) | baixo | **remover** + doc |
| `src/features/dashboard/components/pending-reviews-widget.tsx` | C | `docs/estudei/01-dashboard.md`, relatório histórico fase 8 | idem | baixo | **remover** + doc |
| `src/features/dashboard/components/recent-activities-list.tsx` | C | `docs/estudei/01-dashboard.md` | idem (era a única porta de entrada para `/dashboard/analytics`) | baixo | **remover** + doc |
| `src/features/dashboard/components/dashboard-floating-button.tsx` | C | relatórios históricos | botão flutuante antigo; substituído pelo FAB global | baixo | **remover** |
| `src/features/dashboard/components/widget-error-boundary.tsx` | D | nenhuma | nunca usado | baixo | **remover** |
| `src/features/study-cycle/components/study-cycle-widget.tsx` | D | nenhuma (último import removido em `ed26309`) | substituído pelo `intelligent-cycle-widget` | baixo | **remover** |
| `src/features/study-cycle/lib/cycle-intelligence-engine.ts` | D | nenhuma | motor de "inteligência do ciclo" nunca chamado | baixo | **remover** (o tipo `CycleIntelligence` em `domain/study-cycle` fica — pasta protegida) |
| `src/features/study-history/components/active-session-manager.tsx` | C | `docs/estudei/03-study-session.md` | gerenciador de sessão antigo; substituído pelo `study-provider` | baixo | **remover** + doc |
| `src/features/study-session/components/driving-mode-view.tsx` | D | nenhuma (removido de uso em `b290a12 CRONO`) | modo direção antigo | baixo | **remover** |
| `src/features/study-session/hooks/use-study-timer.ts` | C | relatório histórico | hook de timer antigo; o timer vive no `study-provider` | baixo | **remover** |
| `src/application/study-session/study-session.actions.ts` | C | `docs/estudei/03-study-session.md` | `finalizeSmartSessionAction` — nenhum chamador (o `SessionOrchestrator` continua usado pela homologação) | baixo | **remover** + doc |
| `src/application/study-history/study-history.analytics.ts` | C | relatório F.1 (já listado como morto) | `getStudyStats` etc. — nunca chamados | baixo | **remover** |
| `src/application/dashboard/greeting.service.ts` | D | nenhuma | saudação nunca usada | baixo | **remover** |
| `src/application/concursos/get-active-target.action.ts` | D | nenhuma | action nunca chamada | baixo | **remover** |
| `src/application/disciplines/update-status.action.ts` | B | teste `security-ownership.wiring` | action sem chamador (o próprio arquivo diz "sem nenhum caller hoje") | baixo | **remover** + ajustar o teste |
| `src/application/study-cycle/feature-flags.ts` | D | nenhuma | flag com whitelist de usuários de teste, nunca lida | baixo (pasta protegida, arquivo isolado) | **remover** |
| `src/config/brand.ts` | D | nenhuma (os nomes "NomeIA" vêm de outros lugares) | constante `BRAND` nunca importada | baixo | **remover** |
| `src/domain/dashboard/user-dashboard.types.ts` | D | nenhuma | arquivo **vazio** (0 linhas) | nulo | **remover** |
| `src/utils/supabase/client.ts`, `server.ts` | D | nenhuma | clientes Supabase duplicados (usam `PUBLISHABLE_KEY`); o app usa `infrastructure/supabase/*` | baixo | **remover** (duplicação) |
| `src/components/ui/switch.tsx`, `table.tsx` | D | nenhuma | primitivos de UI sem uso | baixo | **remover** |
| `src/app/seed/page.tsx` + `seed.action.ts` | E | nenhuma | página **pública** (fora de `(protected)`) que dispara inserção de ~150 disciplinas no catálogo; ferramenta de desenvolvimento | médio (exposta em produção) | **remover** (rota) |
| `src/features/reviews/components/flashcard-library.tsx` (894 linhas) | F | nenhuma; nunca foi importado em nenhum commit | biblioteca de flashcards completa (busca, import/export) — funcionalidade pronta mas não ligada à UI | perder trabalho | **manter — decisão sua** |
| `src/features/simulados/components/simulado-result.tsx` + `src/application/simulados/simulados.actions.ts` (1.072 linhas) | F | teste `security-ownership` lê a action | fluxo antigo de resultado de simulado (desligado em `ed26309`) | perder trabalho | **manter — decisão sua** |
| `src/application/questions/*`, `question-analytics/{ai-insights,performance}.ts`, `domain/questions/types.ts` | F | `docs/estudei/06-questions.md` (roadmap) | esqueleto do banco de questões | perder planejamento | **manter — decisão sua** |
| `src/application/study-cycle/migration/cycle-migration.repository.ts` | F | relatório histórico | repositório da migração de ciclos (CLI com service role) | ferramenta operacional | **manter** |

## Rotas fora da navegação

| Rota | Links de entrada | Proteção | Conteúdo exclusivo? | Classificação |
|---|---|---|---|---|
| `/dashboard/analytics` | só de outras rotas órfãs (e do `RecentActivitiesList` morto); é revalidada por várias actions | `/dashboard` protegido | gráficos antigos; conteúdo equivalente em /estatisticas | **DEPRECAR** (manter; decisão: redirecionar para /estatisticas) |
| `/dashboard/performance` | só das rotas órfãs | protegido | radar/acurácia por questões (`question_attempts`, hoje vazia) | **DEPRECAR** (decisão) |
| `/dashboard/questions` | só das rotas órfãs | protegido | casca com navegação antiga | **DEPRECAR** (decisão) |
| `/dashboard/adaptive` | só das rotas órfãs | protegido | "saúde de aprendizado" (lógica exclusiva) | **DEPRECAR** (decisão) |
| `/dashboard/mentor` | nenhum | protegido | feed do Mentor IA (lógica exclusiva) | **MANTER** (decisão) |
| `/dashboard/homologation` | nenhum | protegido | painel de testes E2E (grava dados de teste na própria conta) | **MANTER** como ferramenta (decisão: restringir a admin ou remover) |
| `/seed` | nenhum | **pública** | ferramenta de seed | **REMOVER** |

## Dependências

| Pacote | Uso encontrado (repo inteiro) | Proposta |
|---|---|---|
| `@supabase/server` | nenhum | **remover** |
| `@supabase/middleware` | não está no package.json | — |
| `@tanstack/react-query`, `@tanstack/react-query-devtools` | nenhum | **remover** |
| `framer-motion` | nenhum | **remover** |
| `zustand` | nenhum | **remover** |
| `eslint-config-next` (dev) | não é importado pelo `eslint.config.mjs` (que usa `@next/eslint-plugin-next` direto) | **remover** |
| `eslint-plugin-import` (dev) | não é importado pelo `eslint.config.mjs` | **remover** |
| `pg` | só `scripts/*.mjs` | manter |
| `lint-staged`, `@commitlint/cli` | `.husky/pre-commit`, `.husky/commit-msg` | manter |
| `postcss`, `@eslint/js`, `@commitlint/types` | usados mas não listados (vêm de outras dependências) | manter como está (não adicionar dependências nesta fase) |

## Arquivos na raiz

| Arquivo | Cat. | Ação |
|---|---|---|
| `schema-probe.tmp.mts`, `seed-probe.tmp.mts` | D (sondas `.tmp`) | **remover** |
| `build_errors.txt` | D (log de build antigo, UTF-16) | **remover** |
| `lint-batch.mjs` | D (lê um relatório temporário de outra ferramenta em `%TEMP%/opencode`) | **remover** |
| `*.sql` da raiz, `seed-disciplines.js` | F (scripts de banco) | manter |
| `*.bat`, `scripts/*`, `.agents/`, `skills-lock.json`, `.husky/` | A (ferramentas) | manter |
| `Claude outputs/` | pasta de entregas | não mexer (tem uma cópia antiga de um teste de wiring — não é executada) |

## Outros achados

- `src/features/ranking/lib/ranking-engine.test.ts` (76 testes, todos passando) **não estava no script `npm test`** → incluir.
- Nomes antigos ("Central Inteligente", "Plataforma inteligente") só aparecem nos arquivos mortos acima e em comentários internos; nada visível ao usuário.
