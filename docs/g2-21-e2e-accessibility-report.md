# G2.21 — Cobertura E2E e fechamento de acessibilidade

Data: 10/10/2026 · Escopo: evolução da infraestrutura E2E da G2.20. Tudo foi feito localmente: sem commit, push ou deploy, sem produção, sem LLM real, sem dados pessoais, sem APK/Capacitor e sem migration.

**Veredito: VERDE.**
- Os harnesses de Simulados e Dashboard passam.
- Os rótulos da Central de estudos estão corrigidos e validados.
- Teclado, foco e responsividade passam.
- Testes unitários, `tsc` e build passam.
- As rotas de teste não existem no build normal.

O que fica pendente depende só do ambiente ou de validação manual: fluxo autenticado com Supabase local, aparelho físico e leitor de tela.

---

## 1. Testes anteriores preservados

| suíte | antes (G2.20) | agora |
|---|---|---|
| `account-menu.spec.ts` | 9 × 2 | 9 × 2 ✅ (arquivo inalterado) |
| `pwa-install.spec.ts` | 11 × 2 | 11 × 2 ✅ (inalterado) |
| `mentor.spec.ts` | 10 × 2 | 10 × 2 ✅ (inalterado) |
| `routes.spec.ts` | 7 × 2 | 7 × 2 ✅ (inalterado) |
| `responsive.spec.ts` | 6 × 2 | 6 × 2 ✅ (inalterado) |
| unitários (`npm test`) | 2523 | 2538 (15 novos), todos passando |

A infraestrutura da G2.20 continua igual: `playwright.config.ts`, `e2e/support/test.ts`, `e2e/support/pwa.ts`, flag `NOMEIA_E2E_HARNESS`, bloqueio de rede e `next.config.ts`. Os testes unitários da G2.20 (`e2e-infra-g2-20.test.ts`) continuam passando sem alteração.

Nenhum teste antigo foi modificado. Dois testes antigos de fiação de código pegaram mudanças da G2.21, e o código foi ajustado para mantê-los válidos:
- `aria-label="Remover matéria"` foi mantido;
- as dependências `[period, refreshKey]` do efeito de Estudo × desempenho foram mantidas, com uma ref para a fronteira das actions.

O teste G1.9 ("nenhum `dangerouslySetInnerHTML`") barrou a primeira versão do harness do Dashboard, que gravava o cache local com um `<script>`. A versão final não usa esse recurso.

## 2. Harnesses criados

| rota (só com `NOMEIA_E2E_HARNESS=1`) | arquivos | como as dependências são trocadas |
|---|---|---|
| `/e2e-harness/simulados?state=…` | `src/app/e2e-harness/simulados/*` | Os componentes passaram a chamar as Server Actions por uma **fronteira** (`src/features/simulados/simulados-actions.tsx`). O **padrão do contexto são as próprias Server Actions**, então a página real `/simulados` não mudou. O harness injeta `src/lib/testing/fake-simulados-backend.ts`. **Banco** em memória (`FakeReviewDb`). **Reais:** validação, gravação com idempotência por `requestId`, matérias conferidas no catálogo, exclusão, leitura e cálculo de Estudo × desempenho (as mesmas funções das Server Actions, contrato G2.10). Estados: `data`, `empty`, `load-error`, `load-reject`, `save-error`, `save-reject`, `save-slow`, `delete-error`, `perf-error`. |
| `/e2e-harness/dashboard?state=…` | `src/app/e2e-harness/dashboard/*` | A mesma composição de `page.tsx` (`DashboardLayout` + `Suspense` + `DashboardWidgetsGrid` via `InitialServerDataProvider`), com snapshot, layout e dados semeados **sintéticos** (`src/lib/testing/dashboard-fixtures.ts`). As leituras que os widgets fazem sozinhos vão à Server Action real, que sem sessão devolve erro: é o estado de erro recuperável. Estados: `data`, `empty`, `issues`, `loading`. |
| `/e2e-harness/study-register` | `src/app/e2e-harness/study-register/*` | `StudyRegisterModal` real, aberto por um botão (para testar a devolução do foco). |

**Fixtures sem dado pessoal:** aluno "Estudante E2E", 5 disciplinas fictícias e números coerentes entre ciclo, ranking, desempenho por matéria e cronograma (identidade canônica preservada). O layout padrão do harness é conferido contra o de produção por teste unitário.

## 3. Rotas e componentes cobertos

- **Simulados** (`simulados.spec.ts`, 19 × 2):
  - lista, métricas, evolução geral, gargalo e Estudo × desempenho;
  - evolução por matéria (abre e fecha pelo teclado);
  - filtros de período, concurso, matéria e desempenho;
  - detalhe;
  - estado vazio;
  - formulário: rótulos, validações, registrar com carregando → sucesso, duplo clique, registrar por matéria;
  - editar;
  - excluir com confirmar e cancelar;
  - 6 estados de erro;
  - foco e teclado;
  - axe.
- **Dashboard** (`dashboard.spec.ts`, 9 × 2):
  - cabeçalho;
  - ciclo (volta, matéria atual, próxima);
  - Estudos de Hoje;
  - ranking e desempenho por matéria;
  - progresso no edital;
  - data da prova;
  - período do desempenho;
  - navegação de dia e de mês;
  - modais "Adicionar estudo" e "Metas";
  - estados vazio, leitura falha e carregando;
  - axe.
- **Central de estudos** (`study-register.spec.ts`, 7 × 2):
  - rótulos do modo Manual (regressão);
  - clique no rótulo foca o campo;
  - envio sem disciplina;
  - foco preso e devolvido;
  - abas por Enter e Espaço;
  - axe nos dois modos;
  - cabe na tela.
- **Acessibilidade transversal** (`accessibility.spec.ts`, 8 × 2):
  - axe em: login, menu da conta (fechado e aberto), "Pedir um edital", "Minha conta", modal PWA (iPhone), Mentor (válido, vazio, indisponível, limite);
  - teclado no painel do Mentor.
- **Responsividade** (`responsive-matrix.spec.ts`, 16, só no projeto desktop):
  - tamanhos: 320×480, 375×812, 768×1024, 1280×800;
  - telas: Simulados, Dashboard, Central de estudos, Mentor, menu e login.

## 4. Problemas de acessibilidade encontrados

Encontrados pelos testes, pelo axe (WCAG 2.0/2.1 A/AA) ou por inspeção. Todos foram confirmados no navegador antes da correção.

| # | onde | problema | gravidade |
|---|---|---|---|
| A1 | Central de estudos, modo Manual | **Defeito confirmado (prioridade 1):** Horas, Minutos e Segundos sem nome acessível (só o placeholder "0"/"30"). `FormControl` envolvia o `<div>`, então o `id` ia para o div. "Duração Estudada" não nomeava o grupo. | alta |
| A2 | idem | "Data do Estudo" e "Horário de Início" sem rótulo associado (axe `label`, **crítico**). | alta |
| A3 | Central de estudos, Cronômetro | Seleção "Técnica" sem nome (axe `button-name`, **crítico**). | alta |
| A4 | Central de estudos | O rótulo "Disciplina \*" apontava para um id inexistente, então o botão era lido só como "Selecione uma disciplina…". O asterisco de obrigatório não era anunciado. O rótulo "Tópico" também não estava associado (nome só pelo placeholder). | média |
| A5 | **Todos os modais controlados** (`components/ui/dialog.tsx`) | **Foco não voltava** ao botão que abriu o modal: o Radix só devolve o foco ao `DialogTrigger`, e quase todos os modais do app são abertos por botões comuns. Ao fechar, o foco caía no `<body>`. Visto em: registro e detalhe de simulado, "Adicionar estudo", "Metas", Central de estudos. | alta |
| A6 | Registro de simulado | "Fonte" sem `htmlFor`. "Banca" e "Cada erro desconta" com `htmlFor` para ids inexistentes. "Erros (auto)" era um `div` sem nome. Campos por matéria com nome só "Qtd/Acert/Bran" (sem dizer de qual matéria). Botões de modo e de regra de pontuação sem estado (selecionado só pela cor). | média |
| A7 | Lista de simulados | "Análise", "Editar" e o ícone "Excluir" (só `title`) repetidos em todas as linhas, sem dizer qual simulado. Contagens lidas como "28 0— 12". | média |
| A8 | Filtros de Simulados | `<select>` dentro de `<label>`: o nome incluía todas as opções ("Fonte Todos TEC Concursos…"). | baixa |
| A9 | `DisciplineSelector` ("+ Adicionar matéria") | `role="combobox"` não recebe nome do conteúdo, então o botão ficava sem nome. | média |
| A10 | Contraste (WCAG 1.4.3), Simulados e Dashboard | Texto pequeno em `emerald-600` (3,65:1), `amber-600` (3,19:1) e `rose-500` (3,75:1). Selos do ranking `amber-600` sobre âmbar (2,6:1). Células do calendário `emerald-900/70` (3,5:1). `muted-foreground/70` (3,1:1) no autor da frase do dia e em "Faltam X min". Terracota `accent` como texto (3,0:1) em Constância. Conquistas bloqueadas com `opacity-50` (3,1:1). | média |
| A11 | Toasts (sonner, `richColors`) | Cores padrão do tema claro abaixo de 4,5:1: erro 4,3; sucesso 4,3; aviso 3,1; info 4,4. | média |
| A12 | Login (rodapé do painel) | `white/45` com 4,4:1. | baixa |
| A13 | Dashboard, "Desempenho geral" | Período escolhido indicado só pela cor (sem `aria-pressed`) e sem anel de foco. | média |
| A14 | Dashboard, grade | **A alça de arrastar cobria parte dos botões do cabeçalho** de 5 widgets ("Editar metas semanais", "Criar lembrete", "Ver Todas", "Próximo mês", "Ver Histórico") e roubava o clique, no desktop e no celular. | alta |
| A15 | "Minha conta" (`account-settings-modal.tsx`) | 16 campos sem rótulo associado (axe `label` e `select-name`, **críticos**), em todas as abas. | alta |
| A16 | Painel do Mentor | Depois de "Gerar análise", o foco caía no `<body>` (o botão fica desabilitado durante a chamada). | média |
| A17 | Conquistas | Estado obtida/bloqueada perceptível só pela opacidade. | baixa |

**Robustez e estados de erro** (fase 8):

| # | onde | problema |
|---|---|---|
| E1 | Simulados | Leitura que **rejeita** (rede caiu) deixava "Carregando seus simulados…" **para sempre**. |
| E2 | Simulados | Falha de leitura aparecia como **"Nenhum simulado registrado"** (erro ≠ vazio). |
| E3 | Simulados | Exclusão que rejeita deixava o botão em "carregando". |
| E4 | Estudo × desempenho | Chamada rejeitada deixava "Calculando…" para sempre. |
| E5 | Registro de simulado / cronograma do dia | Promessas rejeitadas sem tratamento (lista de matérias; meta do período em `DailyPlanningView`). |
| E6 | Central de estudos | O aviso de validação mostrava nomes internos dos campos ("discipline_name: …", "manual_minutes_field: …"). |

## 5. Correções aplicadas

Todas são mínimas, sem redesenho e sem mudança de regra de ciclo, planejamento, revisões ou métricas.

- **A1–A4** `study-register-modal.tsx`:
  - `FormControl` envolve só o `Input`;
  - "Horas/Minutos/Segundos" viraram `FormLabel` (mesmas classes visuais);
  - o grupo tem `role="group"` com `aria-labelledby` = "Duração Estudada";
  - "Data do Estudo" e "Horário de Início" entraram no `FormItem` como `FormLabel`;
  - ícones com `aria-hidden`;
  - "Técnica" associada ao `SelectTrigger`;
  - "Disciplina" com nome composto (rótulo + valor) e "(obrigatório)" para leitor de tela;
  - "Tópico" associado ao campo.

  Mudanças nos componentes compartilhados (props opcionais):
  - `discipline-popover.tsx`: `id`, `aria-labelledby` e `type="button"`;
  - `topic-autocomplete.tsx`: `inputId`.

  Ids gerados com `useId`, porque o modal pode existir em mais de um lugar.
- **A5** `components/ui/dialog.tsx`:
  - guarda o elemento focado na abertura (`onOpenAutoFocus` roda antes de o FocusScope mover o foco) e o foca de volta ao fechar;
  - quem já trata `onCloseAutoFocus` (header da G2.20) continua no controle;
  - se o elemento não existe mais, vale o padrão do Radix.
- **A6** `simulado-record-modal.tsx`:
  - ids nos `SelectTrigger` (Fonte, Banca, penalização);
  - "Erros (auto)" virou `<output>` rotulado;
  - campos por matéria com `aria-label` "Questões — {matéria}" etc.;
  - `aria-pressed` nos botões de modo e de regra;
  - grupo "Regra de pontuação" nomeado.
- **A7–A8** `simulados-view.tsx`:
  - `aria-label` "Análise de {nome}", "Editar {nome}", "Excluir {nome}";
  - contagens com texto para leitor de tela ("acertos/em branco/erros");
  - `aria-label` nos filtros.
- **A9** `discipline-selector.tsx`: `aria-label={buttonLabel}`.
- **A10** `dashboard-widget-catalog.tsx`, `simulados-view.tsx`, `simulado-record-modal.tsx`, `domain/simulados/types.ts`, `dashboard-layout.tsx`, `daily-planning-view.tsx`:
  - mesmos matizes, um tom mais escuro no tema claro (emerald/amber 600→700, rose 500→600, selos do ranking amber-800);
  - o tema escuro mantém as cores anteriores;
  - opacidade removida dos textos.

  Novo token **`--accent-text`** (terracota para texto pequeno, ≥ 4,9:1) em `globals.css`. O `--accent` continua para fundos e ícones.
- **A11** `globals.css`: variáveis de texto dos toasts do sonner no tema claro (≥ 4,9:1).
- **A12** `(auth)/layout.tsx`: `white/45` → `white/55`.
- **A13** seletor de período com `role="group"`, `aria-pressed` e anel de foco.
- **A14** `sortable-widget.tsx`: a alça fica sobre a borda superior do card (metade no espaço entre cards), com fundo. Nenhum botão fica sob ela (verificado em 1280 e 393 px).
- **A15** `account-settings-modal.tsx`: `htmlFor`/`id` nos 16 campos; "Remover {categoria}" com nome; contraste do rótulo "Limite Regular".
- **A16** `mentor-analysis-panel.tsx`: ao terminar, devolve o foco ao botão se ele o tinha e o foco não foi para outro lugar.
- **A17** conquistas com "(conquistada)"/"(ainda bloqueada)" para leitor de tela.
- **E1–E4** `try/catch/finally` nas chamadas.
- **E2** Simulados ganhou um estado de erro próprio (`role="alert"`, mensagem e "Tentar novamente").
- **E5** `.catch` nas promessas soltas.
- **E6** o toast mostra só as mensagens.

## 6. Desktop

O projeto `desktop` (1280×800) roda 102 testes, todos passando, inclusive os 16 da matriz de responsividade.

## 7. Mobile

O projeto `mobile` (Pixel 5, toque) roda 86 testes, todos passando. Os 16 da matriz são pulados de propósito: a matriz define o próprio tamanho e roda uma vez.

A matriz cobre 320×480, 375×812 e 768×1024 com `isMobile` e toque:
- sem rolagem horizontal;
- controles dentro da largura;
- modais cabem;
- "Salvar simulado" e "Salvar estudo" alcançáveis;
- gráfico de evolução dentro do card.

**Observado e não corrigido (fora do escopo, sem redesenho):**
- A grade do Dashboard chega do servidor com 3 colunas e passa para 1 ou 2 só depois da hidratação (`dashboard-dnd-context.tsx`, Fase F). No celular há um instante com 3 colunas espremidas e um deslocamento de layout. O teste espera a troca; a correção (renderizar o breakpoint certo sem JS) fica como próximo passo.
- Em 320 px, o texto "75% Acurácia" do card "Desempenho geral" encosta na borda direita do card.

## 8. Erros simulados

| cenário | onde | resultado verificado |
|---|---|---|
| envio inválido (nome vazio, soma ≠ total, tempo inválido, sem disciplina) | Simulados, Central de estudos | não envia (0 chamadas), mensagem clara, dados preservados, modal aberto |
| erro devolvido pela Server Action (salvar, excluir, carregar, Estudo × desempenho) | Simulados | toast/alerta, dados preservados, botão reabilitado, registro mantido |
| chamada **rejeitada** (rede/servidor fora) | Simulados (carregar, salvar) | sem spinner preso, mensagem genérica, sem stack trace, retry funciona (2ª chamada registrada) |
| resposta vazia | Simulados `empty`, Dashboard `empty` | estados vazios explícitos, sem números inventados |
| leitura parcial falhou | Dashboard `issues` | "indisponível"/"—", nunca zero |
| leitura ao vivo indisponível com cache | Dashboard (cronograma do dia) | "Exibindo os últimos dados salvos", nunca "sem plano" |
| timeout | Mentor (G2.20) | fallback com explicação |
| duplo clique / botão travado durante o processamento | Simulados (salvar), Mentor | 1 chamada; botão "Salvando..." desabilitado |
| sucesso só depois da confirmação | Simulados | o toast de sucesso só aparece com a resposta; em erro, nunca aparece |

## 9. Segurança e isolamento

- Build normal (`npm run build`): nenhuma rota `/e2e-harness` gerada.
- Harnesses: só extensão `page.e2e.tsx`, sem Supabase, sessão, `process.env`, cookies ou service role (teste unitário).
- Nenhum código de produção importa `@/lib/testing`: só harness e testes (teste unitário varre `src`).
- Simulados em produção: o padrão do contexto são as Server Actions reais, e a página `/simulados` não usa o provider (teste unitário).
- Middleware, proxy, rotas protegidas e Server Actions não foram alterados. Nenhum bypass foi adicionado.
- Rede: toda requisição fora de 127.0.0.1 bloqueada nos testes. O servidor de teste usa Supabase inexistente e Sentry descartável.
- Nenhum usuário criado, em produção ou em qualquer lugar. Nenhum segredo lido ou impresso. Nenhum `.env` transferido.

## 10. Dependências

Adicionada **uma** `devDependency`: `@axe-core/playwright` **4.13.0** (exata).

Avaliação antes de instalar:
- **Compatibilidade:** peer `playwright-core >= 1.0.0`, e o projeto usa 1.56.1.
- **Dependência trazida:** `axe-core ~4.13.0`, publicada em 11/08/2026.
- **Licença:** MPL-2.0 nas duas, compatível com uso como ferramenta de teste (não vai para o bundle).
- **Lockfile:** +2 pacotes.
- **Auditoria:** `npm audit --omit=dev` continua com 3 moderadas e `npm audit` com 10; nenhuma delas é do axe.
- **Benefício:** encontrou A2, A3, A9, A10, A11, A12 e A15, que os testes de papel e nome não pegariam.

Next, Playwright e Capacitor não foram atualizados. Nenhum `npm audit fix` foi executado.

## 11. Testes realmente executados

| verificação | onde | resultado |
|---|---|---|
| `npm test` | máquina do usuário (cópia de build, em 3 partes por limite de tempo) | **2538/2538** (919 + 673 + 946) |
| `npm test` | ambiente de nuvem | 2535/2538 (os 3 que faltam são do Android: a pasta `android/` não é copiada para a nuvem; passam na máquina do usuário) |
| `npx tsc --noEmit` | nuvem | sem erros |
| `npm run build` | nuvem (variáveis públicas fictícias) | sucesso; nenhuma rota `e2e-harness` |
| `npm run test:e2e` (suíte completa, servidor novo) | nuvem, Chromium 1194 | **188 passaram, 16 pulados (matriz no projeto mobile, por desenho), 0 falhas, 0 instáveis** (6,1 min) |
| estabilidade do axe | nuvem, `-g axe --repeat-each=3` | 66/66 |
| ESLint nos arquivos alterados/novos | nuvem | nenhum erro novo (erros pré-existentes nos mesmos arquivos inalterados em quantidade) |

Durante o desenvolvimento, duas instabilidades de teste apareceram e foram corrigidas na causa:
- clique antes da hidratação no Dashboard: agora o teste espera a grade montar no cliente;
- axe medindo o toast no meio do fade: agora o helper espera as transições finitas.

## 12. Testes bloqueados pelo ambiente

- **Fluxo autenticado (fase 5):** exige Supabase local (`supabase start`, que usa Docker). Não há Docker em execução nem Supabase CLI, nem na nuvem nem na máquina do usuário (verificado). A preparação da G2.20 continua pronta (`e2e/specs/authenticated/`, `E2E_AUTH=1` recusa URL que não seja localhost). Nenhum usuário foi criado e nenhum bypass foi adicionado.
- `tsc` e `build` não cabem no limite de tempo do shell da máquina do usuário; foram verificados na nuvem com o mesmo código (conferido por md5).
- O E2E não foi executado na máquina do usuário (o navegador do Playwright não foi baixado lá); foi executado na nuvem.

## 13. Validações manuais pendentes

- Leitor de tela real (NVDA, TalkBack, VoiceOver): Central de estudos (modo Manual), registro de simulado, Dashboard.
- Aparelho físico (Android e iPhone): Dashboard em 320–375 px, modais com teclado virtual aberto.
- Aprovação visual:
  - nova posição da alça de arrastar (borda superior do card);
  - tons de verde, âmbar e vermelho um pouco mais escuros no tema claro;
  - `--accent-text` em Constância.
- Tema escuro: o axe só rodou no tema claro.
- Safari e Firefox.
- Fluxo autenticado com Supabase local (item 12).
- Abas restantes de "Minha conta" no leitor de tela (o axe varreu a aba inicial; os rótulos das outras abas foram associados pelo mesmo padrão).

## 14. Próximos passos

1. Renderizar no servidor a grade do Dashboard já no breakpoint certo (CSS em vez de troca por JS) para eliminar o flash de 3 colunas no celular.
2. Ajustar "75% Acurácia" em 320 px (quebra de linha ou abreviação).
3. Completar o padrão de abas da Central de estudos (setas ←/→, `tabpanel`/`aria-controls`) ou trocar `tablist` por um grupo de botões com `aria-pressed`.
4. Rodar o axe também no tema escuro (`colorScheme: "dark"`) e no fluxo autenticado quando houver Supabase local.
5. Conferir o contraste do player de simulado interno (`simulado-result.tsx`), que ainda usa `emerald-600`/`amber-600` e não tem harness.
6. Ligar `npm run test:e2e` num CI (exemplo em `docs/e2e-browser-testing.md`).
