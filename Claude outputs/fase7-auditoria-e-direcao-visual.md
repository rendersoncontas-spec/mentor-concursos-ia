# NOMEIA — FASE 7: AUDITORIA VISUAL (Fase 1) + DIREÇÃO VISUAL PROPOSTA (Fases 2-4)

> Nenhum código foi alterado para produzir este documento. Toda evidência abaixo vem de leitura direta do código-fonte (componentes, `globals.css`, `docs/design-system/01-tokens.md`) e de buscas quantificadas (`grep`) no repositório — não de renderização ao vivo, já que o navegador desta sessão não consegue alcançar o `localhost:3000` do seu Windows (confirmado nesta mesma conversa). Onde a avaliação depende de ver a página renderizada (composição visual fina, alinhamento pixel a pixel), isso fica marcado como "requer confirmação visual".

---

## 1. Auditoria visual (Fase 1)

### 1.1 Achado central: o "DNA Azul" é uma decisão documentada, não um acidente

`docs/design-system/01-tokens.md` (documento já existente no projeto) tem uma seção literalmente chamada **"🎨 Paleta de Cores (DNA Azul)"**, definindo `#2563EB` como "identidade visual principal". Isso está refletido consistentemente em todo o código:

- `src/app/globals.css`: o token `--primary` É azul (`#2563EB`), o `--secondary` é azul-céu (`#0EA5E9`), o `--accent` é azul-céu claro (`#38BDF8`), o `--ring` (foco) é azul, e até o `--shadow-glow` é um brilho azul. Ou seja, a própria fundação de tokens não tem uma cor "fora do azul" — quando qualquer componente usa "a cor de destaque do sistema", o resultado é sempre azul.
- Contagem exata no código (`grep` em todo `src/**/*.tsx`): **483 ocorrências do hex literal `#2563EB`** e **58 de `#1D4ED8`** (hover), além de dezenas de classes Tailwind `text-blue-400/500/600/700`, `bg-blue-500/600`, `border-blue-*`, `shadow-blue-500`, `ring-blue-400` — em **56 arquivos diferentes**, espalhados por praticamente toda feature (Simulados, Ranking, Planejamento, Histórico, Estatísticas, Revisões, Biblioteca, Edital, Perfil, etc).

**Implicação prática para a Fase 5+:** o problema não é só "trocar o token `--primary`" — boa parte do azul está **hardcoded como hex literal dentro dos componentes**, não referenciando o token. Uma troca de tema não vai resolver sozinha; será necessário substituir esses hex literais pelos novos tokens, arquivo por arquivo.

Classificação: **B (excesso de azul) — confirmado e quantificado, severidade alta.**

### 1.2 Inconsistência de tokens (cores hardcoded fora do sistema)

Encontrado em pelo menos 2 pontos centrais de UI (não periféricos):
- `src/components/layout/header.tsx`: botão "Enviar Pedido" usa `bg-[#2563EB] hover:bg-[#1D4ED8]` em vez de `bg-primary hover:bg-primary/90`.
- `src/features/dashboard/components/dashboard-layout.tsx`: saudação usa `text-[#2563EB] dark:text-blue-400` em vez de `text-primary`; o botão principal "Adicionar Estudo" usa `hover:shadow-blue-500/20` (sombra colorida no hover) além do `bg-primary` correto.

Classificação: **D/J (hierarquia/identidade) — inconsistência de sistema, não segue os próprios tokens do projeto.**

### 1.3 "Aparência dashboard feito por IA" — confirmado no widget catalog do Dashboard

`src/features/dashboard/components/dashboard-widget-catalog.tsx` é um único arquivo de **80KB com 16 widgets**. O primeiro widget (`WidgetTempoEstudo`, representativo do padrão repetido nos demais) tem exatamente a assinatura visual que a Fase 14 pede para evitar:

- Badge pill arredondado com número + cor de destaque: `bg-[#2563EB]/10 ... rounded-full ... {pct}%`.
- Ícone Lucide + label uppercase pequena + número grande — três vezes na mesma tela (Hoje / Semana / barra de progresso), todos coloridos do mesmo azul.
- Barra de progresso azul (`bg-[#2563EB]`) dentro de um card com borda e sombra leve.

Esse padrão (ícone + rótulo + número + badge percentual + barra azul, tudo dentro de uma caixa com borda e sombra) é exatamente a fórmula "card + ícone + título + número" citada na Fase 14 como sintoma de "AI look". Como o Dashboard tem 16 desses widgets, a primeira viewport tende a virar uma grade de caixas semelhantes em vez de uma composição com hierarquia (o que a Fase 7 do redesign pede para corrigir).

Classificação: **A + C (visual genérico / excesso de cards) — confirmado, é o achado mais importante para a Fase 7 (Dashboard).**

### 1.4 Cards: mais divs "fazendo cara de card" do que o componente `Card` de fato

- O componente `<Card>` centralizado (`src/components/ui/card.tsx`) é usado em apenas **17 lugares** em todo o `src/`.
- Mas o padrão visual "bloco com `bg-card` + borda + `rounded-xl`/`rounded-2xl`" (ou seja, "cara de card" sem usar o componente) aparece em **47 arquivos** de feature, incluindo Admin, Analytics, Biblioteca, Concursos, Conquistas, Dashboard, Disciplinas, Edital.
- `shadow-sm` sozinho aparece **104 vezes** no código — é praticamente o padrão default de qualquer superfície.

Isso confirma dois problemas ao mesmo tempo: (1) excesso de cards visualmente (C), e (2) cada feature reinventa sua própria versão de "card" em vez de usar um componente central (o problema que a Fase 5 do redesign pede para resolver com tokens/variantes centralizados).

Classificação: **C + (Fase 5) falta de centralização — confirmado.**

### 1.5 Ícones: uso já consistente de Lucide, mas com emoji misturado em pontos específicos

- Os arquivos de shell (sidebar, header) usam exclusivamente `lucide-react`, com um ícone por item de menu e função clara — **isso já está correto**, não precisa de correção estrutural, só reaplicar cor/peso no novo sistema.
- Emoji aparecem misturados com os ícones Lucide em pontos específicos: `statistics-center-view.tsx` (9 ocorrências), `history-view.tsx` (4), `doacao/page.tsx` (3), `flashcard-library.tsx` (2), e uma ocorrência cada em `study-provider.tsx`, `planning-view.tsx`, `daily-planning-view.tsx`, `import-history-modal.tsx`, `floating-action-button.tsx`, `dashboard/reviews/page.tsx`. `dashboard-header.tsx` também usa `greeting.emoji` (emoji vindo de dado/config, não hardcoded no JSX, mas ainda é emoji renderizado ao lado de texto).

Classificação: **G (ícones) — inconsistência real, mas localizada (poucos arquivos, não é generalizado como o problema de cor).**

### 1.6 Gradientes e efeitos "glassmorphism": definidos no CSS, mas pouco usados na prática

`globals.css` define utilitários `.glass`, `.glass-strong`, `.gradient-text`, `.gradient-border`, `.glow`, `.animate-pulse-glow` — todo o vocabulário visual "AI startup" que a Fase 14 pede para evitar. Na prática, porém:
- `.glass`/`.glass-strong`: só 3 referências em todo `src/`.
- Gradiente (`bg-gradient-to-*`): usado em apenas 4 arquivos (`conquistas-view.tsx`, `dashboard-widget-catalog.tsx`, `planning-goals-progress-card.tsx`, `ranking-view.tsx`).
- `.glow`/`animate-pulse-glow`: 0 ocorrências fora do próprio `globals.css`.

Ou seja: esses efeitos **existem como dívida no CSS global mas não são o problema principal na prática** — a prioridade é limpá-los do `globals.css` (remover a tentação/uso futuro) mas não é necessário caçar dezenas de usos espalhados.

Classificação: **A (visual genérico) — presente como capacidade, baixo impacto real hoje.**

### 1.7 Header, Sidebar, Layout global — estruturalmente já razoáveis

Diferentemente do Dashboard/widgets, a casca da aplicação (`sidebar.tsx`, `header.tsx`, `protected-layout-client.tsx`) está estruturalmente mais próxima do que se quer:
- Sidebar: uma única barra lateral com grupos nomeados ("Estudos", "Preparação", "Comunidade"...), indicador de item ativo discreto (barra de 3px), ícones consistentes, com colapso em telas médias — sem cards dentro de cards, sem gradientes.
- Header: uma única barra fixa, sem duplicar a identidade visual (o logo só aparece na sidebar), com o controle de estudo centralizado.
- O `ProtectedLayoutClient` é enxuto (sidebar + header + main), sem aninhamento excessivo.

O problema aqui não é estrutural, é só a **cor** (o item ativo da sidebar, o indicador, o anel de foco e o badge de notificação são todos azul) e o hardcode pontual já citado em 1.2.

Classificação: **B apenas (o resto já está OK) — risco baixo de retrabalho estrutural na Fase 6 do redesign.**

### 1.8 Divergência de componente entre páginas (achado extra, relevante para Fase 5)

`src/features/dashboard/components/dashboard-header.tsx` existe como componente de cabeçalho de página (saudação + chip de concurso + botão trocar concurso), mas `dashboard-layout.tsx` (que renderiza a Home de fato) **não o usa** — ele reimplementa seu próprio cabeçalho inline com uma saudação diferente (mensagem motivacional do dia, botão "Adicionar Estudo"). Ou seja, já existem duas versões divergentes de "cabeçalho de página" coexistindo no código. Isso é exatamente o tipo de duplicação que a Fase 5 (sistema de componentes) precisa consolidar — vale investigar se `dashboard-header.tsx` é usado em alguma outra página (ex.: Estatísticas) antes de decidir se ele deve virar o padrão único ou ser removido.

Classificação: **D/Fase 5 — divergência confirmada, decisão de qual vira o padrão fica para a fase de implementação.**

### 1.9 Áreas não verificadas diretamente nesta rodada (limitação honesta)

Por causa do volume (o app tem ~19 áreas listadas + modais + dropdowns + estados vazios/loading + navegação mobile), esta auditoria leu em profundidade: Sidebar, Header, Layout global, Dashboard (layout + 1 de 16 widgets em detalhe + amostragem dos demais), e fez varredura quantificada (grep) em **todo** o `src/` para cor/sombra/card/emoji — então os números acima (483 hex, 47 arquivos com card ad hoc, 104 `shadow-sm`, etc.) cobrem o projeto inteiro, não só as páginas lidas em detalhe. O que eu **não** li componente por componente ainda: Ciclos (fora do já visto no diff de uma sessão anterior), Histórico, Disciplinas, Planejamento, Estatísticas, Simulados, Ranking, Concursos, Biblioteca, Perfil, modais individuais, dropdowns, empty/loading states, navegação mobile — essas páginas **aparecem na varredura quantificada** (ex.: `simulados-view.tsx`, `ranking-view.tsx`, `history-view.tsx`, `planning-view.tsx` estão todas na lista de arquivos com hex azul hardcoded), mas a leitura estrutural detalhada de cada uma fica para o momento de implementação de cada página (Fase 13, item 9 "páginas internas"), quando poderei ler e redesenhar cada uma com o novo sistema já definido — em vez de auditar 19 páginas em detalhe agora e depois reabrir todas de novo para implementar.

---

## 2-4. Direção visual, sistema de cor e tipografia propostos

*(Proposta para validação — nenhum arquivo foi alterado. Ao aprovar, isso vira a base de `docs/design-system/01-tokens.md`, que precisará ser reescrito.)*

### Direção (Fase 2)

Nome de trabalho: **"Caderno de Estudos"** — a metáfora é a de um material de estudo premium (caderno/apostila de altíssima qualidade, não um SaaS corporativo): superfícies neutras e levemente quentes (não cinza-azulado frio), tipografia com peso editorial, uma cor de assinatura usada com intenção (não pintando tudo), e uso de espaço em branco como elemento de composição — não só "menos azul", mas menos elementos competindo por atenção ao mesmo tempo.

### Sistema de cor (Fase 3)

| Papel | Proposta | Uso |
|---|---|---|
| Superfície base (`--background`) | Off-white quente `hsl(30 20% 98%)` (claro) / grafite `hsl(220 15% 9%)` (escuro) | Fundo geral |
| Superfície de card (`--card`) | Branco puro (claro) / grafite ligeiramente mais claro que o fundo (escuro) | Cards, modais |
| Texto (`--foreground`) | Grafite quase-preto `hsl(220 20% 14%)` / off-white | Texto principal |
| Cor principal profunda (`--primary`) | Verde-petróleo escuro (*deep teal*) `hsl(172 45% 24%)` | Ações primárias, ícone ativo, foco — **não** usada em fundos grandes |
| Cor de destaque controlada (`--accent`) | Terracota/âmbar queimado `hsl(28 65% 52%)` | Só para 1 elemento de destaque por tela (ex.: "próxima ação", streak) — nunca dois destaques na mesma viewport |
| Neutros (`--muted`, `--border`) | Cinza quente (não azulado) `hsl(30 10% 92%)` / `hsl(30 8% 88%)` | Divisores, fundos secundários |
| Semânticas (mantidas) | Verde sucesso, âmbar aviso, vermelho erro — já existem e não precisam mudar de família, só de saturação para combinar com a nova paleta neutra | Estados |
| Azul | Deixa de ser cor de identidade; pode sobrar em 1 uso muito pontual (ex.: um selo "verificado") só se fizer sentido semântico, nunca como cor de ação padrão | Uso mínimo, não estrutural |

Justificativa de "não simplesmente trocar por verde/roxo": a combinação verde-petróleo (frio, sério, "estudo/aprovação") + terracota (quente, humano, motivacional) é deliberadamente uma dupla que não aparece nos concorrentes óbvios de produtividade (Notion = quase monocromático, Linear = roxo/violeta, a maioria dos SaaS = azul), e a proporção de uso (principal só em texto/ícone/borda fina, nunca em fundo grande; destaque só 1x por tela) é o que evita que vire "SaaS genérico" mesmo com só 2 cores de marca.

Remoção do CSS: `.glow`, `.animate-pulse-glow`, `.gradient-border`, `--shadow-glow` saem do `globals.css` (zero uso real hoje, puro risco de reintrodução do "AI look"). `.glass`/`.glass-strong` ficam para avaliação caso a caso nos 3 usos existentes.

### Tipografia (Fase 4)

| Nível | Tamanho/peso | Uso |
|---|---|---|
| Display | `text-3xl md:text-4xl font-bold tracking-tight` (fonte display, se houver serifada/display distinta da UI) | Título da Home, telas de resultado (ex.: fim de simulado) |
| H1 | `text-2xl font-bold tracking-tight` | Título de página |
| H2 | `text-lg font-semibold tracking-tight` | Título de seção |
| H3 | `text-sm font-semibold` | Título de card/bloco |
| Body | `text-sm` | Texto padrão |
| Small | `text-xs text-muted-foreground` | Metadados, legendas |
| Caption | `text-[10px] uppercase tracking-wider font-semibold` | Rótulos de categoria/badge |
| Mono | `font-mono tabular-nums` | Timer, cronômetro, contadores numéricos (já existe `--font-mono` no token, só falta aplicar consistentemente — hoje vários números usam `font-black` sem mono) |

Isso já existe parcialmente em `docs/design-system/01-tokens.md` (a escala de tamanhos é razoável); a mudança real é reduzir a quantidade de pesos usados sem propósito (o código atual mistura `font-bold`, `font-extrabold`, `font-black` livremente até no mesmo widget) e reservar `font-mono` para números que o usuário vai "ler rápido" (tempo, contadores, percentuais).

---

## Próximo passo

Com direção, cor e tipografia aprovadas, a Fase 13 (implementação) segue a ordem já definida: tokens → tipografia → layout global → sidebar → header → buttons/forms → cards → dashboard → páginas internas → modais → mobile → polish. Ciclos (Fase 8) só recebe o novo verniz visual depois que o sistema de componentes (Fase 5) estiver pronto, e sem tocar em nenhuma lógica de `src/application/study-cycle/**` ou `src/domain/study-cycle/**`.
