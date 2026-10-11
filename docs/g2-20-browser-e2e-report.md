# G2.20 — Infraestrutura de testes E2E em navegador — relatório

**Status: AMARELO.** A infraestrutura existe e **executou**: 86 testes E2E passaram em Chromium real (headless), desktop e mobile, e repetiram sem falha. Testes unitários, TypeScript e build passam.

Ficam pendentes por ambiente, não por defeito:
- o fluxo **autenticado** (exige Supabase local, configuração manual documentada);
- a validação em **aparelho físico** (PWA e leitores de tela);
- a execução no **seu computador**: aqui a rede bloqueia o download do Chromium do Playwright, então a execução foi feita no ambiente de nuvem, que já tem o Chromium do Playwright instalado.

Guia de uso: [e2e-browser-testing.md](./e2e-browser-testing.md)

## 1. Ferramenta escolhida
**Playwright**. Não havia nenhuma ferramenta E2E no projeto (nem Playwright, Cypress, Puppeteer ou jsdom) e nenhum teste de interface. Motivos:
- suporte oficial a Next.js;
- Chromium com emulação mobile e toque;
- árvore de acessibilidade (`getByRole`);
- trace e screenshot em falha;
- servidor de teste gerenciado (`webServer`).

## 2. Dependências
- `@playwright/test` **1.56.1** (exata, só `devDependency`). Entram `@playwright/test`, `playwright` e `playwright-core`; `fsevents` é opcional e só para macOS.
- Nenhuma dependência de produção mudou.
- `npm audit --omit=dev`: **3 moderate** (inalterado: mammoth → argparse → sprintf-js). `npm audit`: **10** (inalterado). Playwright não adiciona alerta.
- Por que 1.56.1 e não a mais nova (1.64.0): é a versão estável cujo Chromium (revisão 1194) estava disponível para executar os testes aqui. Atualizar depois é simples: `npm i -D -E @playwright/test@latest && npm run test:e2e:install`.

## 3. Configuração
- `playwright.config.ts`:
  - projetos `desktop` (1280×800) e `mobile` (Pixel 5, toque);
  - `next dev` isolado na porta 3100, sem reaproveitar servidor por padrão;
  - timeouts de 60 s por teste e 10 s por ação/asserção;
  - screenshot e trace só em falha;
  - relatório HTML em `e2e/.report/`.
- **Isolamento:** Supabase apontando para um endereço local inexistente, Sentry descartável, Mentor IA desligado, banco e Resend fictícios, e bloqueio de toda requisição que não seja para 127.0.0.1.
- **Harness:** `src/app/e2e-harness/**/page.e2e.tsx` só vira rota com `NOMEIA_E2E_HARNESS=1` (`pageExtensions` no `next.config.ts`). Não existe no build normal nem na Vercel, e o build de produção da Vercel recusa a flag.
- `.gitignore`: `e2e/.results/`, `e2e/.report/` e `e2e/.auth/` ficam fora do git.

## 4. Comandos
`npm run test:e2e` · `npm run test:e2e:install` · `npm run test:e2e:report`. O `npm test` continua sem navegador (o teste unitário de isolamento garante isso).

## 5. Rotas testadas
| rota | como |
|---|---|
| `/login` | real: rótulos, validação, envio sem servidor de autenticação (erro tratado, e-mail preservado, botão volta a ficar ativo) |
| `/dashboard`, `/mentor`, `/simulados`, `/estatisticas`, `/dashboard/mentor` | reais, sem sessão: redirecionam para `/login?redirectedFrom=…`, sem conteúdo do aluno |
| `/manifest.webmanifest` + ícones | real: público, `scope`/`display`/`start_url` e PNGs 192/512 |
| cabeçalho e menu da conta | harness com o `AppHeader` real |
| `/mentor` (conteúdo e análise) | harness com `MentorOverview` + `MentorAnalysisPanel` reais, contexto sintético e respostas controladas |
| `/dashboard`, `/simulados` com conteúdo | **opcional** (`specs/authenticated`, Supabase local), não executado aqui |

## 6. Testes PWA
Todos os cenários **A–J** passaram. Os eventos do navegador são **simulados**; isso não é a instalação real.
- **A** evento disponível;
- **B** aceitar: prompt só após o toque, e o NomeIA não diz "instalado" antes do `appinstalled`;
- **C** cancelar: aviso discreto e o menu segue funcionando;
- **D** sem evento: instruções;
- **E** iPhone Safari e Chrome iOS;
- **F** Instagram;
- **G** standalone, por `display-mode` e por `navigator.standalone`;
- **H** `appinstalled`;
- **I** menu aberto e fechado 3 vezes: continua 1 ouvinte ativo;
- **J** dois eventos + toque duplo: só o mais recente, uma vez.

Também passaram o modal acessível (título, 3 passos, foco preso, Esc/Entendi) e a versão instalada sem ação redundante.

## 7. Desktop
43 testes no projeto `desktop` (1280×800).

## 8. Mobile
Os mesmos 43 testes no projeto `mobile` (Pixel 5, 393×851, toque), mais o modal PWA em **320×480**: cabe em 85 % da altura, rola por dentro, "Entendi" é alcançável e não há rolagem horizontal. É emulação, não aparelho físico.

## 9. Acessibilidade
Validado nos fluxos cobertos:
- nomes acessíveis (`getByRole`/`getByLabel`);
- teclado: avatar → Enter → Tab pelos itens;
- Esc fecha menu e modais;
- foco preso no modal e **retorno do foco** ao botão do menu;
- rótulos do login ligados aos campos;
- botões com nome durante o envio.

Não foi adicionada ferramenta de auditoria automática (axe): ficaria como dependência extra sem pedido explícito. Fica como próximo passo opcional.

## 10. Falhas encontradas (defeitos reais da aplicação)
1. **Foco perdido ao fechar modais abertos pelo menu da conta** ("Instalar aplicativo", "Pedir um edital", "Minha conta"). O foco ia para o `<body>`, porque o item que abriu o modal some quando o menu fecha. Confirmado: os 3 testes de foco falham sem a correção.
2. **Login: campos sem rótulo acessível.** O `FormControl` envolvia o `div` decorativo, não o `input`. Leitores de tela anunciavam o placeholder ("seu.email@exemplo.com", "••••••••") em vez de "E-mail"/"Senha", e a mensagem de erro não ficava ligada ao campo. `getByLabel("E-mail")` não encontrava o campo.
3. **Login: botão sem nome durante o envio.** Mostrava só o ícone de carregamento.

Problemas dos próprios testes, corrigidos nos testes (não na aplicação):
- clique "fora" no mobile caía em cima do menu;
- a simulação de `display-mode` usava objeto só-leitura.

## 11. Correções
| arquivo | correção |
|---|---|
| `src/components/layout/header.tsx` | `ref` no botão do menu; os 3 modais devolvem o foco a ele (`onCloseAutoFocus`) |
| `src/components/pwa/install-app-dialog.tsx` | aceita `onCloseAutoFocus` |
| `src/features/profile/components/account-settings-modal.tsx` | aceita `onCloseAutoFocus` (opcional; sem ele, comportamento igual) |
| `src/features/auth/components/login-form.tsx` | `FormControl` envolve o próprio `input` (rótulo + `aria-describedby`/`aria-invalid` corretos); `autoComplete` email/current-password; texto oculto "Entrando…" no botão durante o envio; ícones `aria-hidden` |
| `src/features/mentor/components/mentor-analysis-panel.tsx` | prop opcional `requestAnalysis` (padrão: a Server Action de sempre), usada só pelo harness |

Nenhuma regra de negócio, validação ou visual mudou. O login continua com as mesmas validações e mensagens.

## 12. Testes executados

| comando | resultado |
|---|---|
| `npm run test:e2e` | **86 passed** (43 desktop + 43 mobile) em ~3,2 min na execução completa após a última correção |
| estabilidade | `pwa-install` + `mentor` com `--repeat-each=3`: **126/126** |
| `npm test` | ver a seção de comandos (executado no seu computador após a cópia) |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK; o build normal **não** contém `/e2e-harness` |
| `npx eslint` (arquivos da fase) | 0 erros novos. Continuam os 3 erros que já existiam em `header.tsx` (2) e `account-settings-modal.tsx` (1), iguais aos originais |
| `npm audit --omit=dev` / `npm audit` | 3 moderate / 10 (inalterados) |

**Implementados e não executados:** `specs/authenticated/smoke.spec.ts`, que é pulado sem `E2E_STORAGE_STATE`.

**Bloqueados por ambiente:**
- download do Chromium no seu computador por este ambiente (a rede bloqueia `cdn.playwright.dev`);
- Supabase local para o fluxo autenticado.

## 13. Limitações
- O E2E roda com `next dev`. Mais lento na primeira compilação, mas não exige build especial nem toca o `.next` de produção.
- O log do servidor mostra `Error: aborted` quando o teste fecha uma página no meio de uma resposta. É ruído do `next dev`, não falha.
- Ao detectar um agente de IA, o `next dev` pode criar `AGENTS.md`/`CLAUDE.md` na raiz do projeto. Isso aconteceu na cópia de nuvem e os arquivos **não** foram trazidos para o seu projeto.
- `/simulados` e `/dashboard` com conteúdo dependem de sessão e de Server Actions reais: só no fluxo autenticado opcional.
- Só Chromium. Emulação mobile não substitui aparelho físico.
- A mesma estrutura de `FormControl` > `div` existe em `study-register-modal.tsx` (5 campos). Ali o problema de rótulo é **provável, mas não verificado** por teste nesta fase.

## 14. Validação manual pendente
- Roteiro PWA de 12 passos em aparelho real (Android Chrome, iPhone Safari/Chrome, navegador embutido, teclado, leitor de tela).
- Fluxo autenticado com Supabase local (dashboard, simulados e mentor com dados).
- Leitor de tela real nos formulários e modais corrigidos.

## 15. Próximos passos
1. No seu computador: `npm install`, `npm run test:e2e:install` e `npm run test:e2e`.
2. Opcional: Supabase local + usuário de teste → `specs/authenticated`.
3. Estender o harness para `/simulados` e para o dashboard (exige isolar as Server Actions dessas telas, como foi feito no painel do Mentor).
4. Verificar e corrigir os rótulos do `study-register-modal.tsx` com um teste E2E.
5. Opcional: auditoria automática com `@axe-core/playwright`.
6. Quando houver CI: usar o exemplo do guia.
