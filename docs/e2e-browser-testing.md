# Testes de interface em navegador (E2E) — NomeIA

Ferramenta: **Playwright** (`@playwright/test` 1.56.1, exata, só `devDependency`) com **Chromium**. Desde a G2.21 também usa o **axe-core** (`@axe-core/playwright` 4.13.0, exata, só `devDependency`) para a varredura automática de acessibilidade. É separado do `npm test` (unitário, node:test).

## Instalar (uma vez por máquina)

```bash
npm install                # já traz @playwright/test e @axe-core/playwright (devDependencies)
npm run test:e2e:install   # baixa o Chromium do Playwright (~150 MB)
```

Se a rede bloquear o download do navegador, o Chromium pode vir de outro caminho: `E2E_CHROMIUM_PATH=/caminho/do/chrome npm run test:e2e`. Não contorne a política de rede.

## Rodar

| comando | o que faz |
|---|---|
| `npm run test:e2e` | sobe um `next dev` isolado na porta 3100 e roda tudo em desktop e mobile |
| `npx playwright test --project=desktop` | só desktop (1280×800) |
| `npx playwright test --project=mobile` | só mobile (Pixel 5, toque) |
| `npx playwright test e2e/specs/simulados.spec.ts` | um arquivo |
| `npx playwright test -g "axe"` | só as varreduras de acessibilidade |
| `npx playwright test --ui` | modo visual, passo a passo |
| `npm run test:e2e:report` | abre o relatório HTML da última execução |

A primeira execução demora mais, porque o Next compila as páginas sob demanda. A suíte completa leva cerca de 9 minutos (256 testes, 2 workers).

## Isolamento (o que o servidor de teste usa)

O `playwright.config.ts` sobe o servidor com variáveis próprias. Elas têm prioridade sobre o `.env.local`, porque o Next não sobrescreve variáveis já definidas no processo:

| variável | valor no E2E | efeito |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | `http://127.0.0.1:54399` / valor fictício | nenhum dado real, nenhuma sessão |
| `NEXT_PUBLIC_SENTRY_DSN` | `http://e2e@127.0.0.1:9/0` | erros do servidor de teste não vão ao Sentry |
| `DATABASE_URL`, `RESEND_API_KEY` | fictícios | nada sai da máquina |
| `MENTOR_AI_ENABLED` | `false` | nenhuma chamada a LLM e nenhuma chave necessária |
| `NOMEIA_E2E_HARNESS` | `1` | liga as páginas de harness (abaixo) |

Nos testes (`e2e/support/test.ts`), **toda requisição que não vai para 127.0.0.1 é bloqueada**, inclusive o túnel `/monitoring` do Sentry no navegador. Service workers ficam bloqueados.

O servidor nunca é reaproveitado por padrão, para não rodar contra um `npm run dev` comum sem isolamento. Use `E2E_REUSE_SERVER=1` só se você mesmo subiu o servidor com as variáveis acima.

## Harness (páginas de teste)

`src/app/e2e-harness/**/page.e2e.tsx` renderiza **componentes reais** com dados sintéticos (`src/lib/testing`):

| rota | o que mostra |
|---|---|
| `/e2e-harness/account-menu` | cabeçalho real (`AppHeader`) com um aluno sintético |
| `/e2e-harness/mentor?state=…` | `/mentor` real com respostas controladas. Estados: `valid`, `low`, `empty`, `disabled`, `unavailable`, `rejected`, `timeout`, `rate`, `error` |
| `/e2e-harness/simulados?state=…` | **G2.21.** `SimuladosView` real (lista, métricas, filtros, evolução, modal de registro/edição, exclusão, detalhe, Estudo × desempenho). O **banco** é trocado por um duplo em memória; a validação, a gravação (idempotência por `requestId`), a exclusão, a leitura e o cálculo de Estudo × desempenho são as funções reais do servidor (`src/lib/testing/fake-simulados-backend.ts`). Estados: `data`, `empty`, `load-error`, `load-reject`, `save-error`, `save-reject`, `save-slow`, `delete-error`, `perf-error` |
| `/e2e-harness/dashboard?state=…` | **G2.21.** A mesma composição de `/dashboard` (`DashboardLayout` + `Suspense` + grade semeada por `InitialServerDataProvider`) com snapshot/layout sintéticos (`src/lib/testing/dashboard-fixtures.ts`). Estados: `data`, `empty`, `issues` (leituras que falharam), `loading` (esqueleto por 2,5 s) |
| `/e2e-harness/study-register` | **G2.21.** Central de estudos (`StudyRegisterModal`) real, aberta por um botão (para testar a devolução do foco) |
| `/e2e-harness/simulado-result?state=high\|low` | **G2.22.** `SimuladoResultView` (resultado do simulado interno) com payload sintético (`src/lib/testing/simulado-result-fixture.ts`), cobrindo acerto, erro, em branco, questão marcada, insights e tendências. Nenhuma página real importa esse componente hoje (Fase I.2), mas ele existe no código e foi auditado |
| `/e2e-harness/history?state=data\|empty\|error\|calendar-error` | **G2.23.** `HistoryView` real (Lista/Calendário) com ações do servidor trocadas pela fronteira `HistoryActionsProvider` (`src/features/history/history-actions.tsx`; o padrão de produção são as próprias Server Actions). Dados sintéticos em `src/lib/testing/history-planning-fixtures.ts` (9 sessões, 3 disciplinas, mesmo `packHistoryList` do servidor) |
| `/e2e-harness/planning?state=data\|empty\|error\|retry` | **G2.23/G2.24.** `PlanejamentoClient` real com plano sintético de 3 blocos. As visões (Dia, Semana, Ciclo, Mês, Metas) leem e gravam pela fronteira `PlanningActionsProvider` (`src/features/planejamento/planning-actions.tsx`), com ações sintéticas. `empty` mostra "Nenhum planejamento criado"; `error` falha todas as leituras; `retry` falha na primeira e acerta na segunda |
| `/e2e-harness/statistics?state=data\|empty\|partial\|error\|retry` | **G2.24.** `StatisticsCenterView` real (Visão geral, disciplinas, evolução, ordenação) pela fronteira `StatisticsActionsProvider`; dados em `src/lib/testing/statistics-fixtures.ts`. `partial` = plano indisponível, mas estatísticas de estudo presentes |
| `/e2e-harness/reviews?state=data\|empty\|error\|retry\|catalog-error\|session-error` | **G2.24.** `ReviewsView` real, com o modal de sessão de revisão (nota, devolução do foco) e "Adicionar à revisão", pela fronteira `ReviewActionsProvider`. A data de referência vem fixa do servidor (`nowIso`), evitando divergência de hidratação |
| `/e2e-harness/edital?state=data\|progress-error\|save-error` | **G2.24.** `EditalAccordion` real (concurso → disciplinas → tópicos, marcar tópico, progresso) pela fronteira `EditalActionsProvider`. `progress-error` = falha ao ler o progresso (aviso, nunca 0%); `save-error` = falha ao marcar/gravar |

Como o harness troca as dependências **sem tocar na rota real**:
- **Fronteira de ações (G2.23/G2.24: Histórico, Planejamento, Estatísticas, Revisões, Edital):** cada tela tem um contexto cujo valor padrão são as **Server Actions reais**. O hook `use…ActionsRef()` devolve um `useRef` do valor capturado na montagem, então as dependências de `useEffect`/`useCallback` e os nomes das chamadas não mudam. Só o harness passa um provedor com dados sintéticos (`src/lib/testing/*-fixtures.ts`).
- **Simulados:** os componentes chamam as Server Actions por uma fronteira (`src/features/simulados/simulados-actions.tsx`). O valor padrão do contexto **são as próprias Server Actions**, então a página real não muda. Só o harness passa um `SimuladosActionsProvider` com o backend em memória.
- **Dashboard:** o snapshot e o layout entram pelas mesmas props que `page.tsx` usa, e os dados dos widgets entram pelo mesmo `InitialServerDataProvider`. As poucas leituras que os widgets fazem sozinhos (cronograma do dia ao vivo, alvos) vão à Server Action real, que, sem sessão, devolve erro. Isso exercita o estado de erro recuperável. O cache local do cronograma (`mentor_replan_info_cache`) é semeado no navegador do teste.
- **Mentor:** a prop opcional `requestAnalysis` (G2.20).

Essas rotas **só existem** quando o servidor sobe com `NOMEIA_E2E_HARNESS=1`:
- o `next.config.ts` só aceita a extensão `e2e.tsx` nesse caso;
- o build normal e a Vercel não as geram;
- ligar a flag num build de produção da Vercel é recusado.

Os testes unitários `e2e-infra-g2-20.test.ts` e `e2e-coverage-g2-21.test.ts` garantem isso, e também que nenhum código de produção importa `@/lib/testing`.

O harness **não é atalho de autenticação**: não lê sessão, banco real nem LLM, e nenhuma rota real fica aberta.

## Acessibilidade automática (axe-core)

`e2e/support/axe.ts` → `expectNoAxeViolations(page, { include?, exclude?, exceptions? })`:
- verifica as regras **WCAG 2.0/2.1 nível A e AA**;
- espera as transições finitas (ex.: toast entrando) terminarem antes de medir contraste;
- mostra cada violação com seletor e motivo.

**Exceções:** nenhuma regra está desligada (`AXE_EXCEPTIONS` vazio). Para criar uma, é preciso:
- informar `rule` + `selector` + `reason`;
- registrar a justificativa no relatório da fase;
- nunca desligar a página inteira sem motivo.

**Tema escuro (G2.22):** `accessibility-dark.spec.ts` usa `test.use({ colorScheme: "dark" })`. O app usa `next-themes` com `defaultTheme="system"` e `attribute="class"`, então o navegador emulado preferindo o escuro faz o próprio app aplicar `.dark`. Não existe tema paralelo nem classe forçada. Cada teste confere `html.dark` antes de medir. O tema claro continua nos demais specs.

**Zero violações não prova acessibilidade completa.** O axe não avalia:
- ordem de leitura;
- clareza do texto;
- uso real com leitor de tela;
- boa parte do comportamento de teclado.

O teclado e o foco são cobertos por testes próprios (abaixo), e o leitor de tela continua como validação manual.

## Autenticação

Sem servidor de autenticação, os testes cobrem:
- a **proteção** das rotas reais (`/dashboard`, `/mentor`, `/simulados`, `/estatisticas`, `/dashboard/mentor` → `/login?redirectedFrom=…`, sem conteúdo do aluno na tela);
- o **formulário de login** real (validação, erro tratado sem servidor, dados preservados).

Fluxo **autenticado** (opcional, `e2e/specs/authenticated/`), **só contra Supabase local**:

1. `supabase start` (CLI do Supabase, exige Docker) e aplique as migrations no banco **local**.
2. Crie um usuário de teste **no Supabase local** (Studio local ou `supabase` CLI). Nunca em produção.
3. Gere a sessão:
   - num terminal, suba o app apontando para o Supabase local: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon local> npx next dev --port 3100`;
   - em outro terminal, rode `npx playwright codegen --save-storage=e2e/.auth/state.json http://127.0.0.1:3100/login` e entre com o usuário de teste;
   - feche o navegador e pare o servidor. `e2e/.auth/` fica fora do git.
4. Rode: `E2E_AUTH=1 E2E_SUPABASE_URL=… E2E_SUPABASE_ANON_KEY=… E2E_STORAGE_STATE=e2e/.auth/state.json npm run test:e2e`.

O `playwright.config.ts` **recusa** `E2E_AUTH=1` com uma URL que não seja `localhost`/`127.0.0.1`. Na G2.21 o fluxo continuou **bloqueado pelo ambiente**: não há Docker nem Supabase CLI no ambiente de execução (ver relatório G2.21).

## O que está coberto

| arquivo | casos (× desktop e mobile, salvo indicação) |
|---|---|
| `account-menu.spec.ts` | abrir pelo avatar; itens e nomes acessíveis na ordem; fechar com Esc e com clique fora; teclado (Enter + Tab); "Pedir um edital" (vazio não envia, envio, Esc); "Minha conta" abre; "Minha assinatura" e "Editais cadastrados" navegam; foco volta ao botão do menu ao fechar os modais |
| `pwa-install.spec.ts` | A–J da diretiva UX-PWA-01: evento guardado, prompt só no toque, aceitar ≠ instalado, `appinstalled`, cancelar, sem evento, iPhone Safari/Chrome, Instagram, standalone, ouvinte sem duplicar, eventos duplicados + toque duplo, foco do modal |
| `mentor.spec.ts` | visão determinística, vazio, IA desligada, carregando → válida (duplo clique = 1 pedido), LOW, falhas → fallback sem detalhe técnico, timeout, limite |
| `routes.spec.ts` | rotas protegidas → login; formulário de login; manifest público e ícones |
| `responsive.spec.ts` | sem rolagem horizontal (login, harness); menu dentro da tela; modal PWA em 320×480 |
| `simulados.spec.ts` (G2.21) | **lista e análise:** lista + métricas + evolução + gargalo + Estudo × desempenho; evolução por matéria pelo teclado; filtros (período, concurso, matéria, desempenho); detalhe (Esc + foco volta); vazio. **Formulário:** todos os campos rotulados; validação antes de enviar (nome, soma, tempo); registrar com carregando → sucesso e duplo clique = 1 gravação; registrar por matéria; editar; excluir com confirmar/cancelar. **Erros:** falha ao carregar (erro ≠ vazio) com "Tentar novamente"; chamada rejeitada sem spinner preso; erro e rede ao salvar (dados preservados, retry); erro ao excluir; erro em Estudo × desempenho. **Acessibilidade:** foco preso no modal e devolvido; axe na página, nos modais, no vazio e no erro |
| `dashboard.spec.ts` (G2.21) | cabeçalho, ciclo (volta, matéria atual, próxima), Estudos de Hoje (cronograma com estudo distribuído), grade; ranking e desempenho por matéria com a mesma identidade; período do desempenho (`aria-pressed`), dia anterior/próximo, mês anterior/próximo; cronograma ao vivo indisponível → "últimos dados salvos"; modais (Adicionar estudo, Metas) com Esc + foco devolvido; vazio; leituras falhas → "indisponível"/"—" (nunca zero); carregando (esqueleto → grade); axe |
| `study-register.spec.ts` (G2.21) | modo Manual: Horas/Minutos/Segundos/Data/Horário rotulados (regressão do defeito G2.21), clicar no rótulo foca o campo, resumo atualiza; Disciplina e Tópico nomeados; enviar sem disciplina (sem nomes técnicos, dados preservados); foco preso/devolvido; abas por Enter/Espaço; axe nos dois modos; cabe na tela |
| `accessibility.spec.ts` (G2.21) | axe no login, menu da conta (fechado/aberto), "Pedir um edital", "Minha conta", modal PWA (iPhone), Mentor (válido, vazio, indisponível, limite); teclado no Mentor (Tab até "Gerar análise", Enter, foco não cai no `<body>`) |
| `responsive-matrix.spec.ts` (G2.21, só projeto desktop) | 320×480, 375×812, 768×1024, 1280×800: Simulados (página, gráfico, modal, detalhe), Dashboard (aguarda 1/2/3 colunas), Central de estudos (Manual), Mentor, menu e login. Asserções semânticas: sem rolagem horizontal, controles dentro da largura, modais cabem e o botão principal é alcançável |
| `dashboard-mobile-layout.spec.ts` (G2.22, só projeto desktop) | regressão do flash de 3 colunas: em 320/375/768/1280, mede a grade **antes da hidratação** (bundles JS bloqueados; o HTML e os scripts inline do streaming rodam, o React não hidrata) e depois; exige 1/1/2/3 colunas nos dois momentos, mesma distribuição dos cards e nenhum erro de hidratação |
| `dashboard.spec.ts` (G2.22, adição) | "75% Acurácia" em 320 px (valor e rótulo completos, uma linha, dentro do card) e em 1280 px (continua ao lado do seletor de período) |
| `study-register.spec.ts` (G2.22, adição) | padrão de abas: `aria-controls` → `tabpanel` rotulado pela aba ativa, `aria-orientation`, tabindex móvel, ← → Home End trocam e levam o foco, Tab vai da aba ativa para o painel |
| `accessibility-dark.spec.ts` (G2.22) | axe no **tema escuro**: login, menu da conta, "Minha conta", "Pedir um edital", modal PWA, Dashboard (dados, vazio, Central), Simulados (página, registro, detalhe, vazio, erro), Central (2 modos), Mentor (válido, vazio, indisponível), resultado de simulado |
| `simulado-result.spec.ts` (G2.22) | estados alto/baixo com texto (não só cor), questões correta/errada/em branco/marcada anunciadas, `aria-expanded`, axe no tema claro |
| `visual.spec.ts` (G2.22) | capturas localizadas com dados fixos (Dashboard topo e "Desempenho geral", 320 px, Central com foco nas abas, resultado de simulado claro/escuro, Simulados escuro, modal PWA) anexadas ao relatório e salvas em `e2e/.results/visual/`. Sem comparação pixel a pixel (ver abaixo) |
| `tabs-keyboard.spec.ts` (G2.23) | padrão APG de abas em **Histórico** (manual), **Planejamento** (manual) e **Minha conta** (vertical, automática): nomes, roving tabindex, Enter/Espaço, setas e Home/End só movem o foco nos modos manuais, `aria-controls` → `tabpanel` rotulado, foco visível, vazio/erro/calendário com falha, retorno de foco do modal ("Editar registro" e "Minha conta"), matriz 320/375/768/1280 (só projeto desktop) e axe nos temas claro e escuro. A exceção do axe para chips com cor do usuário existia na G2.23 e foi removida na G2.24 (ver abaixo) |
| `tabs-keyboard.spec.ts` (G2.24, ajuste) | os chips de disciplina com cor escolhida pelo usuário passam a ter **contraste calculado** (`src/lib/a11y/contrast.ts`, `chipColors`): a cor armazenada vira fundo, e o texto é branco ou grafite conforme o que atingir 4,5:1. A exceção do axe foi **removida** — a varredura não tem mais nenhuma exceção |
| `history-calendar.spec.ts` (G2.24) | calendário do Histórico: carregado; vazio (status, não erro); **erro anunciável** (`role=alert`, mês preservado, resumo "indisponível", nunca 0); nova tentativa; falha contínua sem empilhar avisos; erro após trocar o mês; foco/teclado durante o erro; axe claro/escuro; matriz 320/375/768/1280 |
| `planning-views.spec.ts` (G2.24) | **Dia** e **Semana** do Planejamento: dados, vazio, erro com "Tentar novamente", recuperação, botões com nome acessível, axe claro/escuro, matriz de tamanhos (só desktop), sem erros de página |
| `statistics.spec.ts` (G2.24) | Estatísticas: dados, vazio, parcial (plano indisponível ≠ zero), erro/nova tentativa, ordenação de disciplinas, regiões rolláveis focáveis, axe claro/escuro, matriz 320/375/768/1280 |
| `reviews.spec.ts` (G2.24) | Revisões: lista, vazio, erro/nova tentativa, erro de catálogo, sessão de revisão (nota, erro ao gravar, foco devolvido), "Adicionar à revisão", axe claro/escuro (inclui modais), matriz de tamanhos |
| `edital.spec.ts` (G2.24) | Edital: expandir/recolher, marcar tópico, progresso, falha ao ler o progresso (aviso, nunca 0%), falha ao gravar, teclado, axe claro/escuro, matriz de tamanhos |

**PWA:** os eventos do navegador são **simulados** (`e2e/support/pwa.ts`). Isso valida a interface do NomeIA, **não** a instalação real, e a janela nativa do sistema não é automatizada.

## Escrevendo novos testes

- Prefira `getByRole`/`getByLabel`. Se um campo não é encontrado pelo rótulo, provavelmente o rótulo não está associado: é um defeito, não um motivo para trocar de seletor.
- Espere a hidratação antes de clicar em telas pesadas. No Dashboard, o helper `open()` espera o `DndDescribedBy-*`, que só existe depois que a grade monta no cliente.
- G2.24: `whenHydrated(locator)` (`e2e/support/hydration.ts`) espera o React assumir o nó (`__reactProps$…`). Use antes de clicar em ações **não idempotentes** (marcar/desmarcar): repetir o clique até "pegar" desfaz a ação. Datas e horas que aparecem na tela devem vir fixas do servidor do harness (`nowIso`), senão o minuto que vira causa divergência de hidratação.
- G2.24: o sonner pausa o aviso enquanto o ponteiro está sobre a lista; com toque emulado o `mouseleave` só vem ao tocar fora. Antes de esperar um aviso sumir (por exemplo, antes do axe), solte o ponteiro (`page.mouse.move(2, 600)`). Não abra exceção no axe para o aviso.
- Modais Radix com botão de dica (tooltip) focado: o 1º Esc fecha a dica e o 2º fecha o modal (camadas do Radix).
- Para acessibilidade, chame `expectNoAxeViolations` com o estado já estável (sem "Carregando…").

## Diagnóstico de falhas

Em `e2e/.results/` (fora do git), para cada teste que falha:
- screenshot;
- trace (`npx playwright show-trace …/trace.zip`);
- `error-context.md` com o snapshot acessível da página;
- `console-errors.txt` com os erros do console já saneados (sem JWT, tokens, cookies ou e-mails).

O relatório HTML fica em `e2e/.report/`.

## Capturas para conferência visual

`visual.spec.ts` gera imagens de trechos localizados das telas, sempre com dados sintéticos fixos. As imagens ficam em `e2e/.results/visual/` e anexadas ao relatório HTML.

**Não há comparação pixel a pixel** com imagem de referência (`toHaveScreenshot`). Fontes e antialiasing diferem entre Windows (desenvolvimento) e Linux (CI), e uma referência gerada numa máquina falharia na outra. As capturas servem para **conferência humana**: a aprovação estética continua manual.

As imagens "antes/depois" das correções da G2.22 estão em `docs/g2-22-visual/`.

## CI

Workflow: `.github/workflows/ci.yml` (GitHub Actions). Uma cópia idêntica fica em `docs/ci/github-actions-ci.yml`, e o teste unitário da G2.22 exige que as duas sejam iguais. Na G2.22 a pasta `.github` não pôde ser gravada pela ferramenta de sincronização, então copie a cópia para `.github/workflows/ci.yml` antes do commit.

**Ativar o CI (passo manual, uma vez):**

```powershell
New-Item -ItemType Directory -Force .github\workflows | Out-Null
Copy-Item docs\ci\github-actions-ci.yml .github\workflows\ci.yml
git add .github/workflows/ci.yml
```

Depois do commit e do push, a aba *Actions* do GitHub mostra os jobs `checks` e `e2e`. Nada é executado pelo agente: o workflow só roda quando você fizer o push. Se alterar um dos dois arquivos, altere o outro igual (o teste `mobile-a11y-ci-g2-22.test.ts` compara os dois). Dispara em push e PR para a `main` e manualmente. Tem dois jobs em paralelo:

| job | passos |
|---|---|
| `checks` | `npm ci` → `npm test` → `npx tsc --noEmit` → `npm run build` (variáveis públicas fictícias) → confere que o build não tem `/e2e-harness` |
| `e2e` | `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e` → em falha, envia `e2e/.results` e `e2e/.report` como artefato (7 dias) |

Segurança do workflow:
- só `permissions: contents: read`;
- nenhum segredo do repositório;
- nenhum deploy, publicação ou release;
- o Mentor IA continua desligado e nenhum Supabase real é usado (o servidor de teste usa o env isolado do `playwright.config.ts`);
- `HUSKY=0` evita instalar ganchos de git no runner.

Com `CI=true`, o Playwright usa 1 worker, 1 nova tentativa, `forbidOnly` e nunca reaproveita servidor. A suíte E2E leva cerca de 15 a 20 minutos nesse modo.

**O CI testa o que estiver commitado.** Arquivos ainda não versionados (por exemplo, docs e testes novos das fases recentes) precisam entrar no commit, senão os testes que dependem deles falham no runner. O lint não está no workflow: há erros de ESLint antigos (`header.tsx`, `account-settings-modal.tsx`) que o tornariam vermelho.

### Rodar no Windows

```powershell
npm ci
npx playwright install chromium
npm run test:e2e
```

Se a rede bloquear o download do Chromium, use um Chrome já instalado:

```powershell
$env:E2E_CHROMIUM_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:e2e
```

## Limitações e testes manuais restantes

- Emulação mobile ≠ aparelho físico. Continua valendo o roteiro manual de 12 passos do PWA em [pwa-install-experience.md](./pwa-install-experience.md#roteiro-de-validação-em-dispositivo-real).
- Conteúdo autenticado com dados reais do aluno exige o fluxo opcional com Supabase local. Os harnesses de Simulados e Dashboard cobrem a interface com dados sintéticos.
- Leitor de tela real (TalkBack/VoiceOver/NVDA) não é automatizado. Os testes validam papéis, nomes acessíveis e foco pela árvore de acessibilidade do Chromium.
- Apenas Chromium. Safari e Firefox não foram configurados.
- O axe roda nos dois temas (claro e escuro), **sem exceções**, em login, menu da conta, modais, Mentor, Simulados, Dashboard, Central de estudos, resultado de simulado, Histórico, Planejamento (abas, Ciclo, Mês, Metas, **Dia e Semana**), **Estatísticas, Revisões e Edital** (G2.24). Rotas reais continuam exigindo login, então a varredura é feita nos harnesses, com dados sintéticos.
- O que o axe e o Playwright **não** substituem: leitor de tela real; teclado virtual e gestos em aparelho físico; Safari/Firefox; PWA instalado de verdade; dados reais do aluno. Roteiro manual sugerido: abrir cada tela (Estatísticas, Revisões, Edital, Planejamento Dia/Semana, Histórico/Calendário) logado, no celular e no desktop, nos temas claro e escuro, e conferir contraste dos chips das próprias disciplinas.
- Não cobertos nos harnesses (G2.24): a Central de estudos embutida no Edital e o seletor de alvo (a Central tem harness próprio), e o autocomplete de tópicos, que ainda chama a ação real (sem sessão devolve erro tratado).
- Pontos observados e **não alterados** (fora de escopo — regras de planejamento/produto): datas fixas no mini-calendário da visão Semana; o subtítulo estático "Sem plano ativo…" aparece ao lado de "Plano indisponível" no estado parcial de Estatísticas; a exclusão no Edital usa `confirm()` nativo.
