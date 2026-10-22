# Harness E2E (G2.20 / G2.21 / G2.23 / G2.24)

Páginas de teste de interface usadas só pelo Playwright (`npm run test:e2e`).

- Os arquivos de página se chamam `page.e2e.tsx` e **só viram rota** quando o servidor sobe com `NOMEIA_E2E_HARNESS=1` (ver `next.config.ts`). Em `npm run dev`/`npm run build` normais e na Vercel, essas rotas **não existem**.
- Não acessam banco real, não usam sessão e não chamam LLM: renderizam os componentes reais com dados sintéticos (`src/lib/testing`).
- Não é um atalho de autenticação: nenhuma rota real fica acessível sem login.

| pasta | tela real | como as dependências são trocadas |
|---|---|---|
| `account-menu/` | cabeçalho (`AppHeader`) | aluno sintético por props |
| `mentor/` | `/mentor` | contexto sintético + `requestAnalysis` controlado |
| `simulados/` (G2.21) | `/simulados` | `SimuladosActionsProvider` com o banco em memória (`fake-simulados-backend.ts`); gravação/leitura/validação reais |
| `dashboard/` (G2.21) | `/dashboard` | snapshot/layout sintéticos (`dashboard-fixtures.ts`) pelas mesmas props de `page.tsx` |
| `study-register/` (G2.21) | Central de estudos | nenhuma (sem sessão, a lista de disciplinas vem vazia) |
| `history/` (G2.23) | `/historico` (`HistoryView`) | `HistoryActionsProvider` com ações sintéticas (`history-planning-fixtures.ts`); padrão de produção = Server Actions reais |
| `planning/` (G2.23, ampliado na G2.24) | `/planejamento` (`PlanejamentoClient`: abas, Dia, Semana, Ciclo, Mês, Metas) | plano sintético pela mesma prop `initialData` de `page.tsx` + `PlanningActionsProvider` (`src/features/planejamento/planning-actions.tsx`) com ações sintéticas. Estados: `data`, `empty`, `error`, `retry` |
| `statistics/` (G2.24) | `/estatisticas` (`StatisticsCenterView`) | `StatisticsActionsProvider` (`src/features/statistics/statistics-actions.tsx`); dados em `src/lib/testing/statistics-fixtures.ts`. Estados: `data`, `empty`, `partial` (plano indisponível), `error`, `retry` |
| `reviews/` (G2.24) | `/revisoes` (`ReviewsView` + modais de sessão e de adicionar) | `ReviewActionsProvider` (`src/features/reviews/review-actions.tsx`); `reviews-fixtures.ts` recebe `nowIso` fixo do servidor (sem divergência de hidratação). Estados: `data`, `empty`, `error`, `retry`, `catalog-error`, `session-error` |
| `edital/` (G2.24) | `/edital` (`EditalAccordion`) | `EditalActionsProvider` (`src/features/edital/edital-actions.tsx`); `edital-fixtures.ts`. Estados: `data`, `progress-error`, `save-error` |

**Fronteira de ações (padrão G2.23/G2.24).** Cada tela com leitura/gravação própria tem um contexto cujo valor padrão são as **Server Actions reais**; só o harness injeta o provedor com dados sintéticos. O hook `use…ActionsRef()` devolve um `useRef` do valor capturado na montagem, então as dependências de `useEffect`/`useCallback` não mudam e a produção se comporta como antes. Nenhum arquivo do harness pode conter `createClient`, `supabase`, `.from(`, `service_role`, `process.env`, `cookies(`, `dangerouslySetInnerHTML`, `fetch(` nem URLs `http(s)` — verificado por `src/application/e2e-hardening-g2-24.test.ts`.

Detalhes, estados e comandos: [docs/e2e-browser-testing.md](../../../docs/e2e-browser-testing.md).
