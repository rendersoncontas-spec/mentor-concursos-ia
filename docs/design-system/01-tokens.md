# 🎨 Design System — Tokens e Diretrizes Visuais

> Documento oficial de padronização visual e tokens da plataforma **NomeIA**.
>
> **Reescrito na Fase 7/8 do redesign visual.** A identidade anterior ("DNA
> Azul", `#2563EB` como cor principal) foi substituída pela identidade
> **"Caderno de Estudos"**: uma plataforma premium de preparação para
> concursos, com superfícies neutras e quentes, uma cor principal profunda
> usada com intenção (nunca em fundos grandes) e uma cor de destaque
> controlada (no máximo uma por tela). O azul deixou de ser a identidade da
> marca — ver `docs/design-system/fase7-auditoria-e-direcao-visual.md` para
> a auditoria completa que motivou a mudança (483 ocorrências de `#2563EB`
> hardcoded em 56 arquivos, entre outros achados).

---

## 🎨 Paleta de Cores ("Caderno de Estudos")

### Cor principal (`--primary`) — verde-petróleo profundo
- **Primary (`hsl(172 45% 24%)`):** Identidade visual principal — usada em texto de destaque, ícones ativos, bordas finas e botões de ação primária. **Nunca** em fundos grandes/hero.
- **Primary Hover (`hsl(172 45% 20%)`) / Pressed (`hsl(172 45% 16%)`):** Estados de hover e pressed.

### Cor de destaque (`--accent`) — terracota
- **Accent (`hsl(28 65% 52%)`):** Destaque controlado — no máximo **um** elemento de destaque por tela (ex.: "próxima ação", streak). Não é uma segunda cor de ação genérica.

### Cor secundária (`--secondary`) — taupe neutro
- **Secondary (`hsl(30 15% 35%)`):** Ações secundárias, nunca azul.

### Cores semânticas
- **Success (`hsl(142 45% 32%)`):** Acertos, metas batidas, revisões em dia.
- **Warning (`hsl(38 75% 48%)`):** Atenção, prioridade média, revisões acumuladas.
- **Destructive (`hsl(0 72% 51%)`):** Revisões atrasadas, erros, alertas críticos.
- **Info (`hsl(205 25% 45%)`):** Único tom levemente azulado que resta no sistema — reservado exclusivamente para informação neutra (nunca ação, nunca decoração, nunca cor padrão de botão/progresso/foco).

### Regras (Fase 8 do redesign)
- Azul não é mais a identidade da marca.
- Azul não aparece como cor padrão de botão, progresso ou foco (o token `--ring` agora usa `--primary`, o verde-petróleo).
- Não usar gradiente para compensar a troca de cor — `.glow`, `.gradient-border`, `.animate-pulse-glow` e `.glass`/`.glass-strong` foram removidos de `globals.css` (zero uso real no código antes da remoção).
- Terracota (`--accent`) é pontual: um destaque por tela, nunca uma segunda cor de ação genérica.

---

## 📐 Espaçamento e Ritmo Visual

### Grid e Layout Margins
- **Container Max Width:** `max-w-7xl` (`1280px`).
- **Outer Padding:** `p-4` (Mobile) / `p-6` (Desktop).
- **Section Gap:** `space-y-6` (Espaçamento vertical padrão entre grandes blocos).
- **Grid Gaps:** `gap-4` (KPIs pequenos) / `gap-5` (Cards principais do Dashboard).

### Internal Card Padding
- **Padding Padrão dos Cards:** `p-5` (`20px`).
- **Card Header Bottom Margin:** `pb-2` ou `pb-3` com `border-b` quando houver separação explícita.

---

## 🔤 Tipografia e Hierarquia (Fase 2 do redesign)

### Escala de Fontes
- **Display:** `text-3xl md:text-4xl font-bold tracking-tight` — título da Home, telas de resultado (ex.: fim de simulado).
- **H1:** `text-2xl font-bold tracking-tight` — título de página.
- **H2:** `text-lg font-semibold tracking-tight` — título de seção.
- **H3:** `text-sm font-semibold` — título de card/bloco.
- **Body:** `text-sm` — texto padrão.
- **Small:** `text-xs text-muted-foreground` — metadados, legendas.
- **Caption:** `text-[10px] uppercase tracking-wider font-semibold` — rótulos de categoria/badge.
- **Mono:** `font-mono tabular-nums` — reservado para números que o usuário precisa "ler rápido": timer, cronômetro, duração, contadores, percentuais/estatísticas. Usa o token `--font-mono` já existente em `globals.css`.

### Regra de pesos
Evitar misturar `font-bold`, `font-extrabold` e `font-black` sem propósito no mesmo componente (o padrão antigo fazia isso livremente até dentro do mesmo widget). Usar no máximo dois pesos por tela: um para hierarquia de título (`font-bold`/`font-semibold`) e um para números de destaque (`font-bold` com `font-mono`, não `font-black`).

---

## 🃏 Cards e Superfícies

### Padrão Visual Único
- **Raio de Borda (Border Radius):** `rounded-xl` (`12px`).
- **Borda:** `border border-border`.
- **Fundo:** `bg-card` com transparência suave no dark mode (`bg-card/60`).
- **Sombra:** `shadow-sm hover:shadow-md transition-all duration-200`.

---

## 🔘 Botões e Ações

### Padrão de Botões
- **Primary:** `bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs h-9 px-4 rounded-md`.
- **Outline:** `border border-input bg-background hover:bg-accent text-xs h-9 px-4 rounded-md`.
- **Destructive:** `bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs h-9 px-4 rounded-md`.

---

## 🌙 Dark Mode & Acessibilidade

### Diretrizes de Contraste e Leitor de Tela
- **Dark Background:** `hsl(220 15% 9%)` (grafite quente, nunca preto/azul puro).
- **Dark Card Background:** `hsl(220 14% 12%)`.
- Todos os ícones decorativos devem conter `aria-hidden="true"`.
- Todos os botões e áreas interativas devem possuir rótulos acessíveis (`aria-label` ou texto descritivo).
- Foco visível preservado com `focus-visible:ring-2 focus-visible:ring-ring`.
