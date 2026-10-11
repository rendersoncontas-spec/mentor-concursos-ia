# Instalar o NomeIA na tela inicial (PWA) — UX-PWA-01

O NomeIA continua sendo o **site hospedado**. "Instalar aplicativo" só cria um atalho na tela inicial que abre o site em janela própria (sem barra do navegador). **Não é APK**, não passa por loja e **não funciona offline** além do que o site já faz hoje.

## Onde fica

Menu da conta (avatar no cabeçalho) → **Instalar aplicativo**, logo depois de "Editais cadastrados".

| situação | o que o item faz |
|---|---|
| navegador ofereceu a instalação (`beforeinstallprompt`) | abre o prompt **nativo** do navegador |
| iPhone / iPad | abre as instruções do "Adicionar à Tela de Início" |
| navegador sem o evento (ou ele ainda não veio) | abre instruções do menu do navegador |
| já rodando como app instalado | mostra "Aplicativo instalado", sem ação |

## Android (Chrome, Edge, Samsung Internet…)

1. Assim que o app carrega, `PwaInstallCapture` (nos Providers) começa a ouvir `beforeinstallprompt`. O evento é **guardado** com `preventDefault()`, para o navegador não mostrar o aviso automático.
2. Nada abre sozinho. Ao tocar em "Instalar aplicativo", o prompt nativo é chamado e a escolha do usuário é aguardada.
3. Se o usuário **cancelar**, aparece um aviso discreto ("Instalação cancelada…"). Se o navegador oferecer de novo, o item volta a usar o prompt.
4. Se o usuário **aceitar**, nada é afirmado ainda. O aviso "NomeIA instalado…" só aparece quando o navegador dispara `appinstalled`.
5. O evento só pode ser usado uma vez, e toque duplo não abre dois prompts.

**Fallback** (Android ou computador sem o evento): o modal pede para abrir o menu do navegador e procurar "Instalar aplicativo" ou "Adicionar à tela inicial", avisando que o nome varia conforme o navegador. No computador, a opção também pode ser o ícone na barra de endereço. Em navegador embutido (Instagram, Facebook, WebView), o modal pede para abrir no navegador do celular.

## iPhone e iPad

O iOS não tem `beforeinstallprompt`. O item sempre abre o modal **"Adicione o NomeIA à tela inicial"**:

1. Toque em **Compartilhar** (ícone do sistema).
2. Escolha **Adicionar à Tela de Início**.
3. Confirme em **Adicionar**.

No Chrome, Firefox ou Edge do iOS, o modal sugere usar o Safari caso a opção não apareça. O NomeIA nunca diz que foi instalado no iPhone: o iOS não informa isso ao site.

iPadOS que se apresenta como "Macintosh" é reconhecido pelo toque (`maxTouchPoints > 1`).

## Detecção de "já instalado"

- `display-mode: standalone`, `fullscreen` ou `minimal-ui`, com mudança ouvida em tempo real;
- `navigator.standalone === true` (iOS);
- evento `appinstalled`.

O user-agent **só** escolhe as instruções (iOS × outros). Nunca decide que o app está instalado.

**Limitação:** num navegador comum, depois de instalar, não existe sinal confiável de que o atalho existe (o `appinstalled` só vale na sessão em que aconteceu). Numa visita futura pelo navegador, o item volta a aparecer. Instalar de novo é inofensivo: o navegador reconhece o app.

## Manifest (`src/app/manifest.ts`, único)

| campo | valor |
|---|---|
| `name` / `short_name` | NomeIA |
| `start_url` | `/dashboard` (sem sessão, o login atende e volta) |
| `scope` | `/` (explícito nesta fase; antes era o padrão implícito) |
| `display` | `standalone` |
| `theme_color` / `background_color` | `#225951` / `#fbfaf9` |
| ícones | 192 e 512 (`any`), 192 e 512 (`maskable`), 180 (Apple); arquivos oficiais em `public/`, tamanhos conferidos por teste |

`/manifest.webmanifest` é público: a proteção de rotas não redireciona esse caminho. Isso importa porque o navegador busca o manifest **sem cookies**.

Para iOS, a metadata ganhou `appleWebApp: { capable: true, title: "NomeIA" }`. O Next gera `apple-mobile-web-app-title="NomeIA"`, para o atalho se chamar "NomeIA" e não o título da página, e `mobile-web-app-capable`. A abertura em tela cheia vem do `display: "standalone"` do manifest, que o iOS respeita.

**Sem Service Worker novo.** As versões recentes do Chrome e do Edge deixaram de exigir Service Worker para oferecer a instalação (a confirmar no roteiro, item 1). O projeto mantém a decisão G-57 (PWA sem SW). A sincronização offline existente não foi tocada.

## Requisitos de ambiente

- HTTPS: obrigatório para instalação (exceto em `localhost`). A produção na Vercel é HTTPS.
- O prompt nativo depende de critérios do próprio navegador (manifest válido, ícones, interação mínima com a página). Se o navegador decidir não oferecer, o fallback de instruções atende.

## Limitações conhecidas

- **iOS:** o app da tela inicial tem armazenamento e cookies **separados** do Safari. Na primeira abertura, o aluno faz login de novo.
- **Login com Google dentro do app instalado (iOS):** pode abrir fora da janela do app. Validar manualmente.
- O nome das opções nos menus dos navegadores varia e pode mudar com atualizações.
- Firefox no Android usa o próprio "Instalar"/"Adicionar à tela inicial" do menu, sem prompt programático.

## Roteiro de validação em dispositivo real

| # | dispositivo / navegador | passos | esperado |
|---|---|---|---|
| 1 | Android + Chrome atualizado | entrar, abrir o menu da conta, tocar em "Instalar aplicativo" | prompt nativo; ao aceitar, ícone na tela inicial e aviso "NomeIA instalado…" |
| 2 | idem | repetir e **cancelar** | aviso "Instalação cancelada…"; nada instalado |
| 3 | Android, abrir pelo ícone instalado | abrir o menu | item "Aplicativo instalado", sem ação; navegação normal |
| 4 | Android + Firefox (ou navegador sem o evento) | tocar no item | modal com instruções do menu do navegador |
| 5 | iPhone + Safari | tocar no item | modal com os 3 passos; seguir → ícone "NomeIA" na tela inicial |
| 6 | iPhone, abrir pelo ícone | entrar (pode pedir login) e abrir o menu | "Aplicativo instalado"; app em tela cheia |
| 7 | iPhone + Chrome | tocar no item | modal com a dica do Safari |
| 8 | Instagram/Facebook (link aberto dentro do app) | tocar no item | modal pede para abrir no navegador |
| 9 | celular pequeno, retrato | abrir o modal | cabe na tela (rola por dentro); "Entendi" e Esc/"Fechar" funcionam |
| 10 | teclado (computador) | Tab até o avatar, Enter, Tab até o item, Enter | prompt ou modal; foco preso no modal; Esc fecha |
| 11 | leitor de tela (TalkBack/VoiceOver) | navegar pelo menu e pelo modal | item lido como "Instalar aplicativo"; modal com título e descrição |
| 12 | Chrome no computador | menu → item | prompt nativo, ou instruções quando não oferecido |
