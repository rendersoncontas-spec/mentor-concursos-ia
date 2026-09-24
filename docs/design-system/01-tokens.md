# Design System — Tokens e Diretrizes Visuais

> Documento oficial de padronização visual da plataforma **NomeIA**.
>
> **Atualizado no Redesign Profissional 2.0 (set/2026).** A identidade
> "Caderno de Estudos" (Fase 7/8) foi mantida; o Redesign 2.0 mudou a
> *linguagem*: menos cards, menos sombra, cantos mais retos, tipografia
> mais sóbria, dados em listas/tabelas e nenhuma referência decorativa a IA.
>
> **Fase E (set/2026) — refinamento de produto:** container único de página
> (`.page-container`, até 1760px), cabeçalho único (`PageHeader`), rótulos
> sem caixa alta, faixas de métricas (`MetricStrip`), listas com ações
> sempre visíveis, botões flutuantes que não cobrem o conteúdo no mobile e
> ícone do app na paleta do produto.
> A fonte de verdade dos valores é `src/app/globals.css` (bloco `@theme` e
> `:root`/`.dark`). Histórico: `fase7-auditoria-e-direcao-visual.md`,
> `fase8-implementacao.md`.

---

## 1. Princípios visuais

1. **Software profissional, não painel de IA.** A IA fica nos bastidores; a interface não anuncia "inteligência", não usa ícone de brilho como enfeite, não usa linguagem de marketing.
2. **Menos card, mais estrutura.** Antes de criar um card, pergunte: "isso precisa de uma superfície separada?". Prefira seções, divisórias, listas e tabelas. Nada de card dentro de card.
3. **Borda > contraste de fundo > sombra.** Sombra é exceção, reservada a elementos flutuantes (popover, dropdown, dialog, drawer).
4. **Cor com função.** Cada cor tem um significado (ver §2). Nada de uma cor por métrica ou por categoria sem motivo.
5. **Estado ativo sem glow.** Item atual = filete teal à esquerda + texto/rótulo; nunca brilho, pulsação ou anel colorido.
6. **Densidade e precisão.** Números tabulares, títulos contidos, sem "número gigante" para ocupar espaço.
7. **Evolução incremental.** Mudanças novas seguem este documento; não criar estética paralela por tela.

---

## 2. Cor

Paleta (light) — valores HSL em `globals.css`:

| Token | Valor | Uso |
|---|---|---|
| `--background` | `30 20% 98%` | Fundo off-white quente de todas as telas |
| `--foreground` | `220 20% 14%` | Grafite — texto principal |
| `--card` | `0 0% 100%` | Superfícies (cards, tabelas, popovers) |
| `--muted` | `30 10% 92%` | Fundos neutros: trilhos de progresso, segmented control, hover |
| `--muted-foreground` | `220 10% 40%` | Texto secundário, rótulos |
| `--border` / `--input` | `30 8% 88%` | Divisórias e bordas |
| `--primary` | `172 45% 24%` | Teal escuro — ação primária, item atual, progresso, foco |
| `--accent` | `28 65% 52%` | Terracota — destaque pontual (logotipo, sequência/streak). Nunca cor de hover |
| `--secondary` | `30 15% 35%` | Taupe (legado; o Button `secondary` agora é neutro) |
| `--success` | `142 45% 32%` | Concluído, acertos, meta cumprida |
| `--warning` | `38 75% 48%` | Pausado, pulado, pendência — **só em ponto/ícone/barra** |
| `--destructive` | `0 72% 51%` | Erro, atrasado, ação destrutiva |
| `--info` | `205 25% 45%` | Único azulado — informação neutra (ex.: "lançamento manual", manutenção) |

Regras:

- Azul e roxo não são identidade. Não usar `blue/indigo/violet/purple/sky/cyan` para decorar.
- **Texto em âmbar** usa `text-amber-700 dark:text-amber-400` (o token `--warning` não tem contraste suficiente para texto sobre fundo claro).
- Terracota nunca é hover nem seleção de lista (o hover de `ghost/outline/select/command` é `bg-muted`).
- Cores de dados legítimas continuam permitidas: cor escolhida pelo usuário para a disciplina, paleta de notas adesivas, heatmap de estudo, raridade de conquistas.
- Dark mode: grafite quente (`--background 220 15% 9%`), nunca preto/azul puro; `--primary` clareado para `172 40% 42%`.

---

## 3. Raio (border radius)

Definido no `@theme` (Tailwind v4). A escala foi achatada de propósito:

| Classe | Valor |
|---|---|
| `rounded-sm` | 4px |
| `rounded-md` | 6px — controles (botão, input, item de menu) |
| `rounded-lg` | 8px — superfícies (card, tabela, dialog, popover) |
| `rounded-xl` | 8px (achatado) |
| `rounded-2xl` | 10px (achatado; não usar em código novo) |
| `rounded-3xl` | 12px (achatado; não usar em código novo) |
| `rounded-full` | só avatar, ponto de status, botão flutuante, trilho de progresso |

---

## 4. Sombras

Definidas no `@theme`, todas discretas e neutras (sem cor, sem glow):

| Classe | Uso |
|---|---|
| `shadow-xs` / `shadow-sm` | Item selecionado em segmented control; nada além disso |
| `shadow-md` | Botões flutuantes (FAB) |
| `shadow-lg` | Popover, select, dropdown, menu |
| `shadow-xl` | Dialog, drawer mobile da sidebar |
| `shadow-2xl` | Legado — suavizado; não usar em código novo |

Card **não** tem sombra (só `border`).

---

## 5. Tipografia

Fonte: Inter (local, `next/font`). Escala única em `@layer components` (`globals.css`):

| Classe | Tamanho / peso | Uso |
|---|---|---|
| `.type-display` | 36px / 600 | Raríssimo (momento realmente importante) |
| `.type-h1` | 26px (28px ≥ md) / 600 | Título de página |
| `.type-h2` | 20px / 600 | Título de área (ex.: nome do ciclo, disciplina no cronômetro) |
| `.type-h3` | 15px / 600 | Título de seção ("Foco de hoje", "Sequência do ciclo") |
| `.type-body` | 14px | Texto padrão |
| `.type-secondary` | 13px, muted | Descrições, metadados |
| `.type-caption` | 11px, muted | Legendas |
| `.type-label` | 11px / 500, muted, **sem caixa alta** (Fase E) | Rótulo de grupo/coluna (sidebar, cabeçalho de tabela) |

Regras:

- Pesos: `font-semibold` para títulos e números; `font-medium` para rótulos/itens; `font-black`/`font-extrabold` não são usados.
- Números: `tabular-nums` (ou `.num`); `font-mono` só para código/IDs.
- Título de widget/seção em *sentence case* ("Tempo de estudo"), não em caixa alta. Caixa alta (`uppercase`) não é usada em rótulos, selos nem botões.
- Texto mínimo: 10px (legendas de calendário); corpo nunca abaixo de 13px.
- Cronômetro: 44–60px, `font-medium`, tabular — importante, mas não ocupa a tela.

---

## 6. Espaçamento e layout

- **Container das páginas (Fase E):** classe `.page-container` (`globals.css`) = `width: 100%`, `max-width: var(--content-max-width)` (**1760px**), centralizado, `padding-inline` 16px (24px a partir de `sm`). Todas as páginas usam o mesmo container — inclusive o cabeçalho fixo, para o título alinhar com o conteúdo. Não criar `max-w-*` próprio por página.
- **Largura por tipo de conteúdo:** estrutura (grades, tabelas, listas, painéis) ocupa a largura do container; texto corrido (descrições, ajuda, mensagens) usa `.prose-width` (72ch) ou `max-w-xl/2xl`. Formulários simples podem ficar numa coluna principal com uma lateral explicativa (ver Onboarding).
- **Espaço inferior:** o `<main id="app-main">` reserva espaço no fim da página para os botões flutuantes (`pb-[calc(6.5rem+safe-area)]` no mobile, `pb-20` no desktop). Páginas não precisam de `pb-24` próprio.
- Ritmo vertical: `space-y-5` entre blocos de página; `space-y-2`/`2.5` entre título de seção e conteúdo.
- Padding de superfície: `p-4` (widgets/listas) a `p-5` (Card padrão).
- Linhas de lista/tabela: `px-3 py-2.5` (tabela) / `px-4 py-3` (lista), separadas por `divide-y divide-border`.
- Faixa de métricas: `grid` com `divide-x` + `border-y`, célula `px-3/4 py-2/3` — em vez de N cards de KPI.
- Header global: 56px (`h-14`); cabeçalho da sidebar também 56px (alinhados).
- **Cabeçalho de página:** componente `PageHeader` (`sticky top-0`, borda inferior): ícone neutro 16px (o mesmo da sidebar) + título 16px semibold + descrição 12px + ações à direita. É o único título da página — a view não repete H1. Exceção: o Dashboard (Home) usa a saudação como cabeçalho editorial.
- **Barra de ferramentas:** filtros, busca e ações secundárias ficam numa única linha logo abaixo do cabeçalho (sem card em volta), quebrando de forma previsível no mobile.
- **Listas e tabelas:** coleções (disciplinas, concursos, planos, usuários) são linhas com colunas fixas no desktop e linhas compactas no mobile, com ações sempre visíveis (nunca só no hover). Cabeçalho de coluna em `.type-label` sobre `bg-muted/40`.

---

## 7. Componentes base (`src/components/ui`)

- **Button:** `default` (teal sólido), `outline` (borda neutra, fundo card), `secondary` (fundo muted), `ghost` (hover muted), `destructive`, `link`. Tamanhos `sm` (32px), `default` (36px), `lg` (40px), `icon` (36px), `icon-sm` (32px). Sem sombra; foco `ring-2` com offset.
- **Card:** `rounded-lg border bg-card`, sem sombra.
- **Badge:** 11px, `rounded-sm`, variantes suaves (`default` teal 10%, `secondary`, `outline`, `success`, `warning`, `destructive`, `solid`). Badge é status, não decoração.
- **Progress:** 6px, trilho `muted`, barra `primary`.
- **Dialog:** overlay 50%, `bg-card rounded-lg shadow-xl`; botão Fechar neutro 32px. `hideCloseButton` quando o modal já tem o próprio botão Fechar.
- **Table:** cabeçalho em `type-label`, linhas com hover `muted/40`.
- **Skeleton:** `animate-skeleton` (opacidade lenta), sem brilho varrendo.
- **EmptyState:** ícone pequeno opcional, título, uma frase, no máximo uma ação.
- **SectionHeader:** título de seção (H3) + ação opcional.
- **PageHeader:** cabeçalho fixo de página (ver §6). Aceita `icon`, `title`, `description` e `actions`; funciona em Server e Client Components.
- **Metric / MetricStrip:** métrica compacta (rótulo + valor + contexto) e a faixa que as agrupa numa única superfície dividida por linhas (2 colunas no mobile, todas lado a lado a partir de `lg`). Substitui grades de "cards de KPI".
- **Progress:** repassa o valor (0–100) ao Radix, expondo `aria-valuenow`; use `aria-label` quando não houver rótulo visível.
- **Botões flutuantes (FAB):** Bloco de notas + Registrar estudo, no canto inferior direito, respeitando `safe-area-inset-bottom`. No mobile escondem ao rolar para baixo e voltam ao rolar para cima, no topo e no fim da página (e ao receber foco pelo teclado).

---

## 8. Estados

| Estado | Tratamento |
|---|---|
| Hover | `bg-muted` (controles/linhas) ou `hover:bg-muted/30` (linhas de lista) — nunca terracota |
| Foco | `focus-visible:ring-2 ring-ring` (teal) com offset; nunca remover |
| Ativo / atual | filete `border-l-2 border-primary` + fundo `primary/5–8%` + rótulo "Atual"/"Em foco" |
| Selecionado (segmented) | `bg-card shadow-xs` sobre trilho `bg-muted` |
| Desabilitado | `opacity-50`, `pointer-events-none` |
| Carregando | skeleton discreto ou spinner pequeno (16–20px) + frase curta |
| Vazio | `EmptyState` (sem ilustração, sem emoji) |
| Erro | texto + ícone `destructive`, ação "Tentar novamente" |
| Offline/pendente | texto discreto com ícone ("Pendente de sincronização"), não alerta colorido |
| Concluído / pulado / pausado | texto + ponto/ícone (`success` / âmbar) |

Movimento: 150–250ms, sem animação ornamental nem efeitos contínuos; `prefers-reduced-motion` é respeitado globalmente.

---

## 9. Ícone do aplicativo

Fase E: o ícone passou a seguir a paleta do produto — quadrado teal (`#225951`, o mesmo `theme_color` do PWA), "N" geométrico off-white (`#fbfaf9`) e um traço terracota (`#d47f35`) como marca de nomeação. Sem gradiente, brilho ou seta. Os mesmos nomes de arquivo foram mantidos (`public/icon-*.png`, `icon-maskable-*.png` com área segura de 78%, `apple-touch-icon.png` e `src/app/apple-icon.png` sem transparência, `favicon.ico` 16/32/48, `public/branding/nomeia-icon.png`). `public/branding/nomeia-logo.png`, `public/logo.png` e `public/og-image.png` (logotipo horizontal azul) **não** foram trocados: não são usados nas telas do app, mas o `og-image` aparece em compartilhamentos e deve ser refeito na mesma linguagem.

---

## 10. Acessibilidade

- Contraste mínimo AA para texto (atenção ao âmbar — ver §2).
- Botões só com ícone precisam de `aria-label`; ícones decorativos com `aria-hidden`.
- Alvos de toque: mínimo 28–32px em controles compactos; 36–40px em ações principais e no mobile.
- Segmented controls com `role="tablist"`/`role="tab"`/`aria-selected`; menus com `role="menu"`/`menuitem`.
- Indicador de conexão com `role="status"` e `aria-live="polite"`.
