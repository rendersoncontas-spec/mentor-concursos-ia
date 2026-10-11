# G2.22 — UX mobile, acessibilidade e integração contínua

Data: 10/10/2026. Tudo foi feito localmente: sem commit, push, deploy, workflow remoto, produção, LLM real ou dados pessoais.

> A diretiva recebida termina no meio da Fase 10 ("Preservar: harness apenas com `NOMEIA_E2E_HARNESS=`"). As fases seguintes não chegaram. Valeram as regras permanentes das fases anteriores: isolamento do harness, sem bypass de autenticação, sem segredo, sem produção, relatório, verificação completa e `git status`/`diff` ao final.

**Veredito: VERDE.** O que fica pendente:
- execução real do workflow no GitHub (depende do seu commit e push);
- aprovação visual humana;
- teste em aparelho físico.

---

## 1. Flash de 3 colunas no Dashboard (celular)

**Causa:** `dashboard-dnd-context.tsx` decide quantas colunas montar com `window.matchMedia` dentro de um `useEffect`. Como o servidor não sabe a largura da tela, o HTML do servidor e a primeira renderização do cliente usam a estrutura de desktop (3 colunas), e não havia CSS que a adaptasse.

O comportamento foi reproduzido de forma determinística bloqueando os bundles JS do Next. O HTML e os scripts inline do streaming rodam, mas o React não hidrata, que é exatamente o que aparece nos primeiros instantes.

| largura | antes da hidratação (antes da correção) | depois da hidratação |
|---|---|---|
| 320 / 375 | **3 colunas** espremidas (x = 16, 134, 253) | 1 coluna |
| 768 | **3 colunas** | 2 colunas |
| 1280 | 3 colunas | 3 colunas |

Imagens: `docs/g2-22-visual/dashboard-375-primeiro-desenho-antes.png` e `…-depois.png`.

**Correção (só CSS, sem mudança de estado):**
- A estrutura inicial continua a mesma no servidor e no cliente, então **não há risco de hydration mismatch**.
- Abaixo de `xl`, as colunas viram `display: contents` e cada card recebe `order` igual à posição no layout salvo.
- O celular pinta 1 coluna, e o tablet uma grade de 2 colunas com a mesma distribuição (índice % 2) da grade do tablet.
- Depois da hidratação, o efeito troca para a estrutura do breakpoint real, que é visualmente a mesma.
- Preferências de layout (ordem, visibilidade, tamanho) são preservadas; métricas não foram tocadas.

**Diferença residual no tablet:** antes da hidratação os cards de uma mesma linha da grade têm alturas alinhadas; depois, cada coluna flui sozinha. A coluna de cada card e a ordem são idênticas (o teste confere).

**Regressão:** `dashboard-mobile-layout.spec.ts`. Em 320, 375, 768 e 1280 px, o teste mede a grade antes da hidratação (JS bloqueado) e depois. Ele exige 1/1/2/3 colunas nos dois momentos, a mesma distribuição de cards por coluna e nenhum erro de hidratação. Com o arquivo antigo, o teste falha (3 colunas em 320/375), conferido.

## 2. "75% Acurácia" em 320 px

**Causa:** no card "Desempenho geral" (`dashboard-widget-catalog.tsx`), o seletor de período e "75% Acurácia" ficavam numa linha sem quebra. Em 320 px o texto quebrava em duas linhas e estourava o card (borda direita do texto em 317 px, do card em 304 px).

**Correção:** o par passou a poder quebrar para a linha de baixo (`flex-wrap`), mantido inteiro (`whitespace-nowrap`). O mesmo ajuste foi aplicado à variante de 3 colunas ("Aproveitamento: …"). O valor e a palavra continuam completos, com o mesmo tamanho e cor. No desktop o par continua ao lado do seletor.

**Teste:** `dashboard.spec.ts`, em 320 px e 1280 px. Confere:
- texto completo "75% Acurácia";
- uma linha só;
- dentro do card;
- sem rolagem horizontal;
- no desktop, na mesma linha do seletor.

Imagens: `docs/g2-22-visual/dashboard-320-acuracia-antes.png` e `…-depois.png`.

## 3. Abas da Central de estudos

O projeto **não tem** um componente padrão de abas (nem `@radix-ui/react-tabs`). As três barras de abas existentes (Central, Histórico e Planejamento) usavam `role="tablist"`/`role="tab"`/`aria-selected`, sem painel associado e sem teclado.

Corrigido **somente na Central**, que é o escopo da diretiva, seguindo o padrão WAI-ARIA APG (horizontal, ativação automática):
- cada aba tem `id` e `aria-controls`;
- o card abaixo virou `role="tabpanel"`, rotulado pela aba ativa;
- `aria-orientation="horizontal"`;
- tabindex móvel: só a aba ativa entra no Tab, e o Tab seguinte vai para o painel;
- ← → circulam, Home e End vão às pontas, trocando o modo e levando o foco junto;
- anel de foco visível.

A lógica do teclado fica em `src/lib/a11y/tab-keyboard.ts` (função pura com teste unitário). Timer, ciclo, histórico e salvamento não foram alterados. Não houve persistência antes e nenhuma foi adicionada.

**Teste:** `study-register.spec.ts` (seleção, estado ativo, associação aba→painel, teclado e foco).

## 4. axe-core no tema escuro

**Mecanismo reaproveitado:** `next-themes` com `attribute="class"` e `defaultTheme="system"`. Com `colorScheme: "dark"` no Playwright, o próprio app aplica `.dark`, e cada teste confere `html.dark` antes de medir. Nenhum tema paralelo foi criado.

**Resultados por tema** (WCAG 2.0/2.1 A/AA, telas com harness):

| tela | claro | escuro (antes) | escuro (depois) |
|---|---|---|---|
| login | 0 | 1: botão "Entrar" branco sobre verde 3,5:1 | 0 |
| menu da conta (aberto) | 0 | 1: "Sair" `text-destructive` 3,5:1 | 0 |
| "Minha conta" | 0 | não medido antes; depois do novo `--primary`, 1: aba ativa com `text-white` fixo 2,8:1 (motivou a troca por `text-primary-foreground`) | 0 |
| "Pedir um edital" | 0 | não medido* | 0 |
| modal PWA | 0 | não medido* | 0 |
| Dashboard (dados, vazio, celular) | 0 | 18 nós: botões primários branco/verde 3,5:1; `text-primary` sobre `primary/10` 4,2:1; "hoje" no calendário 2,5:1 | 0 |
| Central de estudos (2 modos) | 0 | não medido* | 0 |
| Simulados (página, registro, detalhe, vazio, erro) | 0 | 5 nós (página): botão "Registrar simulado" 3,5:1; `text-rose-600` sem variante escura ("Fraco", 55%/59%) 3,7:1. Demais estados não medidos* | 0 |
| Mentor (válido, vazio, indisponível) | 0 | 0 (válido); demais não medidos* | 0 |
| resultado de simulado | 9 nós, ver item 5 | não medido* | 0 |

\* A primeira varredura do escuro cobriu login, menu da conta (fechado e aberto), Dashboard, Simulados (página) e Mentor (válido). As demais telas só foram medidas depois da correção do token `--primary`, que afetava todos os botões principais.

**Correções (tema escuro):**
- **Token `--primary` do `.dark`:** 42% → 48% de luminosidade, mesmo matiz. `--primary-foreground` passou de branco para grafite. Botão principal: 6,4:1. Texto primário sobre o card: 6,1:1, e sobre `primary/10`: 5,3:1. O tema claro não mudou.
- **`--destructive`** do escuro mais claro, com texto grafite: texto 4,8:1, botão 5,0:1.
- **`text-rose-600`** de Simulados (`accuracyColor` e faixa "Fraco") ganhou a variante `dark:text-rose-400`.
- **20 combinações `bg-primary text-white`** fixas (em 6 arquivos) trocadas por `text-primary-foreground`, que segue o tema. No claro continua branco.
- **Calendário:** dia de hoje com estudo usa a cor do dia estudado, e o anel continua marcando "hoje". Também passou a anunciar ", hoje" no nome acessível.

Nenhuma regra axe foi desligada; `AXE_EXCEPTIONS` continua vazio. Zero violações no axe **não** significa conformidade WCAG integral.

**Teste:** `accessibility-dark.spec.ts` (10 × 2).

## 5. Contraste em `simulado-result.tsx`

Nenhuma página importa esse componente hoje (resultado do simulado interno, ver Fase I.2), mas ele foi auditado com um harness novo (`/e2e-harness/simulado-result`, payload sintético `src/lib/testing/simulado-result-fixture.ts`).

**Encontrado (claro):**
- `text-emerald-600` sobre fundos tingidos (3,3–3,5:1);
- `text-amber-600` (3,1–3,2:1);
- `text-rose-600` (4,2:1 no tempo médio);
- barra de progresso sem nome (`aria-progressbar-name`);
- estado das questões (correta, errada, em branco) indicado só por cor e ícone;
- botão de expandir questão sem `aria-expanded`.

**Correção:**
- Tons centralizados num único mapa `TONE`, reutilizando as mesmas classes do resto do app: `emerald/amber/rose-700` no claro e `-400` no escuro. Isso dá ≥ 4,5:1 nos dois temas, inclusive sobre os fundos `-500/10`.
- `aria-label` na barra.
- Barra decorativa com `aria-hidden`.
- Texto para leitor de tela ("Correta", "Errada", "Em branco").
- `aria-expanded`/`aria-controls`.

**Teste:** `simulado-result.spec.ts`, com axe claro nos estados alto e baixo e estados anunciados com texto. O escuro está em `accessibility-dark.spec.ts`.

## 6. Conferência visual (Playwright)

`visual.spec.ts` gera capturas **localizadas**, sempre com fixtures fixas:
- Dashboard: topo e "Desempenho geral";
- 320×480;
- Central com foco nas abas;
- resultado de simulado, claro e escuro;
- Simulados no escuro;
- modal PWA.

Elas ficam em `e2e/.results/visual/` e anexadas ao relatório (15 imagens nesta execução).

**Não há comparação pixel a pixel** (`toHaveScreenshot`): fontes e antialiasing diferem entre Windows e Linux, e a referência ficaria frágil. O "antes/depois" das correções 1 e 2 está em `docs/g2-22-visual/`.

**Automatizado:** o layout foi medido pelos testes, e eu conferi as imagens geradas. **Pendente:** a aprovação visual humana.

## 7–8. CI

Não existia workflow (`.github/` ausente). Foi criado o workflow do GitHub Actions, que dispara em push e PR para a `main` e manualmente.

> **Ação necessária (manual):** a ferramenta que grava arquivos na sua pasta recusou o caminho `.github/workflows/ci.yml` ("protected file"), e essa proteção não foi contornada. O conteúdo está em **`docs/ci/github-actions-ci.yml`** (e foi enviado na conversa). Copie-o para `.github/workflows/ci.yml` antes do commit. O teste unitário da G2.22 valida a cópia em `docs/ci/` e, quando o arquivo em `.github/` existir, exige que os dois sejam idênticos.

Passos de cada job:

| job | passos |
|---|---|
| `checks` | `npm ci` → `npm test` → `npx tsc --noEmit` → `npm run build` (variáveis públicas fictícias) → falha se `.next/server/app/e2e-harness` existir |
| `e2e` | `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:e2e` → em falha, envia `e2e/.results` + `e2e/.report` (7 dias) |

**Segurança do workflow:**
- `permissions: contents: read`;
- nenhum `secrets.*`;
- sem deploy, publicação ou release;
- sem `NOMEIA_E2E_HARNESS` no build;
- Mentor IA desligado e nenhum Supabase real (o E2E usa o env isolado do `playwright.config.ts`);
- `HUSKY=0`.

**Dependências do runner verificadas:**
- `vendor/xlsx-0.20.3.tgz` e a pasta `android/` estão versionadas, então `npm ci` e os testes do Android rodam no runner;
- nenhum teste lê `.env.local`.

**Atenção:** o CI testa o que estiver commitado. Há muitos arquivos de fases anteriores ainda não versionados (ver `git status`), e eles precisam entrar no commit.

O lint ficou fora do workflow por causa dos 3 erros de ESLint antigos (`header.tsx` e `account-settings-modal.tsx`), que deixariam o CI sempre vermelho.

## 9. Browsers e rede

| verificação | situação |
|---|---|
| configuração validada (`playwright.config.ts`, env isolado, bloqueio de rede) | ✅ |
| workflow validado **estaticamente** (`actionlint` 1.7.12 sem erros; YAML; teste unitário dos passos) | ✅ |
| execução **real** do workflow no GitHub | ❌ não feita (proibido executar remotamente; depende do seu push) |
| execução local da suíte E2E | ✅ ambiente de nuvem, Chromium 1194 pré-instalado; nenhuma política de rede contornada |
| teste manual em aparelho físico | ❌ pendente |

Comandos para Windows (PowerShell) estão em `docs/e2e-browser-testing.md`, seção "Rodar no Windows":
- `npx playwright install chromium`;
- ou `$env:E2E_CHROMIUM_PATH` apontando para o Chrome instalado.

## 10. Autenticação e segurança (preservado)

- Harness só com `NOMEIA_E2E_HARNESS=1`. A extensão `page.e2e.tsx` é exigida e o build normal não tem nenhuma rota de harness (verificado neste build).
- Nenhum bypass no middleware, no proxy ou nas Server Actions. Nenhum usuário criado. Nenhuma service role e nenhum segredo lido ou impresso.
- O novo harness (`simulado-result`) segue as mesmas regras: os testes da G2.20 e da G2.21 que varrem `src/app/e2e-harness` continuam passando.
- Fluxo autenticado continua **bloqueado pelo ambiente**: não há Docker nem Supabase CLI.

## 11. Testes realmente executados

| verificação | resultado |
|---|---|
| `npm test` na sua máquina (cópia de build, em 3 partes por limite de tempo) | **2547/2547** (919 + 673 + 955) |
| `npm test` (nuvem) | 2544/2547; os 3 que faltam são do Android (a pasta `android/` não existe na cópia da nuvem) |
| teste unitário novo `mobile-a11y-ci-g2-22.test.ts` | 9/9, com e sem a pasta `.github` (registrado no `package.json`) |
| `npx tsc --noEmit` | sem erros |
| `npm run build` | sucesso; nenhuma rota `e2e-harness` |
| ESLint nos arquivos alterados/novos | 0 erros novos (24 pré-existentes nos mesmos arquivos, iguais à base) |
| `actionlint` | sem erros |
| `npm run test:e2e` (suíte completa, servidor novo) | **233 passaram, 23 pulados por desenho, 0 falhas, 0 instáveis** (256 testes, 9,2 min) |

**Por que 23 pulados:** estes testes definem o próprio tamanho de tela e rodam só no projeto desktop:
- matriz de responsividade (16);
- layout do Dashboard (4);
- "Acurácia" em 320/1280 (2);
- uma captura de 320 px (1).

**Por arquivo (desktop + mobile):**
- novos da G2.22:
  - `accessibility-dark` 20;
  - `dashboard-mobile-layout` 4;
  - `simulado-result` 4;
  - `visual` 11;
- ampliados:
  - `dashboard` 20 (+2);
  - `study-register` 18 (+2);
- da G2.20 e da G2.21, sem mudança e todos passando:
  - `accessibility` 16;
  - `account-menu` 18;
  - `mentor` 20;
  - `pwa-install` 22;
  - `responsive-matrix` 16;
  - `responsive` 12;
  - `routes` 14;
  - `simulados` 38.

## 12. Arquivos

**Alterados:**
- `dashboard-dnd-context.tsx`
- `dashboard-widget-catalog.tsx`
- `study-register-modal.tsx`
- `simulado-result.tsx`
- `simulados-view.tsx`
- `domain/simulados/types.ts`
- `globals.css`
- `account-settings-modal.tsx`
- `edit-discipline-modal.tsx`
- `edital-accordion.tsx`
- `planning-wizard-modal.tsx`
- `weekly-planning-view.tsx`
- `target-selector-dropdown.tsx`
- `package.json` (registro do teste)
- specs `dashboard`, `responsive-matrix` e `study-register`
- `docs/e2e-browser-testing.md`

**Novos:**
- `docs/ci/github-actions-ci.yml` (copiar para `.github/workflows/ci.yml`, ver item 7–8)
- `src/lib/a11y/tab-keyboard.ts`
- harness `simulado-result/*`
- `src/lib/testing/simulado-result-fixture.ts`
- specs `accessibility-dark`, `dashboard-mobile-layout`, `simulado-result` e `visual`
- `src/application/mobile-a11y-ci-g2-22.test.ts`
- `docs/g2-22-visual/*.png` (4)
- este relatório

Nenhuma dependência nova. Next, Playwright e Capacitor não foram atualizados.

## 13. Validações manuais pendentes

- **Aprovação visual humana:**
  - tema escuro com botões primários de texto grafite sobre verde-petróleo mais claro (mudança perceptível no escuro);
  - Dashboard no tablet antes da hidratação (alturas alinhadas por linha);
  - capturas em `e2e/.results/visual/`.
- Aparelho físico (Android e iPhone): Dashboard em 320–375 px e abas da Central com teclado físico/Bluetooth.
- Leitor de tela (NVDA, TalkBack, VoiceOver): abas da Central e resultado de simulado.
- Primeira execução real do workflow no GitHub após o seu commit/push.

## 14. Próximos passos

1. Copiar `docs/ci/github-actions-ci.yml` para `.github/workflows/ci.yml` e commitar junto com os arquivos não versionados das fases anteriores, para o CI ter tudo de que os testes dependem.
2. Aplicar o mesmo padrão de abas (`tab-keyboard.ts` + `tabpanel`) ao Histórico e ao Planejamento.
3. Resolver os 3 erros antigos de ESLint e então incluir `npm run lint` no CI.
4. Criar harness para Planejamento, Histórico e Estatísticas, para varrer com axe nos dois temas.
5. Avaliar Safari/WebKit no Playwright, já que o PWA no iPhone usa WebKit.
