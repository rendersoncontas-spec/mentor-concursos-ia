# Harness E2E (G2.20 / G2.21 / G2.23)

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
| `planning/` (G2.23) | `/planejamento` (`PlanejamentoClient`) | plano sintético pela mesma prop `initialData` de `page.tsx` |

Detalhes, estados e comandos: [docs/e2e-browser-testing.md](../../../docs/e2e-browser-testing.md).
