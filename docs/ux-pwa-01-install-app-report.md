# UX-PWA-01 — "Instalar aplicativo" no menu da conta — relatório

**Status: AMARELO.** A parte implementável e automatizável está pronta: item no menu, fluxos Android, iOS e fallback, estado de instalado, manifest, testes, tipagem e build. Mas a **instalação real não foi testada em dispositivo**: não há navegador real neste ambiente. O roteiro manual está em [pwa-install-experience.md](./pwa-install-experience.md).

## 1. Componentes alterados / criados

| arquivo | mudança |
|---|---|
| `src/lib/pwa/install-prompt.ts` (novo) | controle puro: guarda `beforeinstallprompt`, chama o prompt, ouve `appinstalled` e `display-mode`, detecta plataforma, conta usos dos ouvintes |
| `src/lib/pwa/use-install-app.ts` (novo) | hook (`useSyncExternalStore`) sobre o controle único da página |
| `src/components/pwa/pwa-install-capture.tsx` (novo) | montado nos Providers; captura o evento cedo e mostra o aviso de sucesso só no `appinstalled` |
| `src/components/pwa/install-app-menu-item.tsx` (novo) | item "Instalar aplicativo" / "Aplicativo instalado" |
| `src/components/pwa/install-app-dialog.tsx` (novo) | modal de instruções (iOS e navegador) |
| `src/components/layout/header.tsx` | +1 item no menu, +1 estado e +1 modal; nada mais mudou |
| `src/components/providers.tsx` | + `<PwaInstallCapture />` |
| `src/app/manifest.ts` | `scope: "/"` explícito |
| `src/app/layout.tsx` | `appleWebApp` (gera `apple-mobile-web-app-title="NomeIA"` no HTML) |
| `src/lib/pwa/install-prompt.test.ts` (novo) | 24 testes |
| `package.json` | só o registro do teste no script `test` (nenhuma dependência) |

## 2. Item de menu
O item "Instalar aplicativo" (ícone `Smartphone` do lucide) fica logo após "Editais cadastrados", antes do bloco mobile (tema/ajuda) e de "Sair".
- Usa o mesmo padrão visual dos outros itens: `role="menuitem"`, `type="button"`, nome acessível pelo próprio texto.
- Fecha o menu ao ser tocado e funciona com toque e com teclado (Enter/Espaço).
- Quando o app já está instalado, vira "Aplicativo instalado" (`aria-disabled`, sem ação).
- Os 7 itens existentes continuam iguais (verificado por teste).

## 3. Fluxo Android
- `beforeinstallprompt` é capturado assim que o app carrega, guardado com `preventDefault` e nunca aberto sozinho.
- O toque no item chama o prompt e aguarda `userChoice`:
  - aceito → nada é afirmado até o `appinstalled`;
  - cancelado → aviso discreto;
  - falha → cai nas instruções.
- Toque duplo usa um único prompt, e o evento só serve uma vez.
- Os ouvintes são registrados uma vez e removidos quando o último componente desmonta.

## 4. Fluxo iOS
Sempre abre o modal "Adicione o NomeIA à tela inicial", com 3 passos numerados:
1. Compartilhar, com o ícone do sistema (lucide `Share`, rotulado).
2. Adicionar à Tela de Início.
3. Confirmar em Adicionar.

O modal tem botão "Entendi" e fechamento por Esc/"Fechar". Fora do Safari, sugere o Safari. Nunca afirma que o app foi instalado.

## 5. Manifest
O manifest é único (`src/app/manifest.ts`, servido em `/manifest.webmanifest`, público):
- `name` e `short_name`: NomeIA;
- `start_url`: `/dashboard`;
- `scope`: `/`;
- `display`: `standalone`;
- cores de tema e de fundo mantidas.

Não foi criado um segundo manifest nem Service Worker.

## 6. Ícones
Os ícones oficiais já existentes em `public/` foram mantidos: 192 e 512 `any`, 192 e 512 `maskable` e 180 Apple. Os tamanhos reais dos PNGs foram conferidos por teste. Nenhum ícone foi criado ou alterado.

## 7. Fallback
Navegador sem o evento, no Android ou no computador:
- O modal manda procurar "Instalar aplicativo" ou "Adicionar à tela inicial" no menu do navegador.
- Avisa que o nome da opção varia conforme o navegador.
- No computador, lembra também do ícone de instalação na barra de endereço.

Em navegador embutido (Instagram, Facebook, WebView), o modal pede para abrir no navegador.

## 8. Acessibilidade
- O item é um botão real dentro do menu, com texto visível como nome acessível e ícones `aria-hidden`.
- O modal usa o `Dialog` do projeto (Radix): foco preso, Esc fecha, título e descrição ligados ao diálogo e botão "Fechar" com rótulo.
- O modal tem altura máxima de 85 % da tela com rolagem interna, largura com margem no celular e passos com números visíveis.
- Os ícones de instrução têm `role="img"` + rótulo, e não há emoji.

## 9. Testes

| comando | resultado |
|---|---|
| `npm test` | **2516 pass, 0 fail** (+24 em `src/lib/pwa/install-prompt.test.ts`) |
| `npx tsc --noEmit` | 0 erros |
| `npm run build` | OK; `/manifest.webmanifest` gerado com `scope: "/"`; o item aparece no código do cliente; nenhuma referência a `serviceWorker.register` |
| `npx eslint` (arquivos novos) | 0 problemas. `header.tsx` tem 2 erros **anteriores** a esta fase (`setState` em `useEffect`, linhas do avatar e do `mounted`), iguais no arquivo original; não foram alterados |

Cobertura automatizada, com janela e eventos falsos:
- evento recebido;
- prompt aceito, cancelado e com falha;
- toque duplo;
- navegador sem suporte;
- evento inválido;
- navegador embutido;
- iOS, iPadOS e Chrome iOS;
- já instalado (`display-mode` e `navigator.standalone`);
- user-agent sozinho não marca instalado;
- mudança de `display-mode`;
- `appinstalled`;
- ouvintes duplicados e limpeza;
- snapshot estável;
- servidor (sem `window`);
- posição do item e itens do menu intactos;
- modal (título, passos, "Entendi", altura, sem emoji, sem prometer instalação ou offline);
- manifest e ícones;
- manifest fora da proteção de rotas;
- nenhum Service Worker.

**Não automatizado** (sem navegador real nem biblioteca de DOM no projeto): renderização do menu e do modal, foco, leitor de tela e o prompt real do navegador.

## 10. Limitações
- Num navegador comum não há sinal confiável de que o atalho já existe, então o item reaparece numa visita futura. Instalar de novo é inofensivo.
- iOS: o app instalado tem cookies e armazenamento separados do Safari, então pede login na primeira abertura.
- O login com Google dentro do app instalado no iOS precisa de validação.
- O prompt nativo depende dos critérios de cada navegador.
- Não há funcionamento offline novo.

## 11. Validações manuais pendentes
Os 12 itens do roteiro em [pwa-install-experience.md](./pwa-install-experience.md#roteiro-de-validação-em-dispositivo-real):
- Android Chrome: aceitar, cancelar e abrir pelo ícone instalado;
- navegador sem o evento;
- iPhone: Safari, ícone instalado e Chrome;
- navegador embutido;
- tela pequena;
- teclado;
- leitor de tela;
- computador.

## Preservado
Nada foi alterado em:
- autenticação, RLS e Supabase;
- dados, ciclo, planejamento, revisões e simulados;
- Mentor IA;
- Capacitor e APK;
- dependências.
