# 🎨 Design System — Tokens e Diretrizes Visuais

> Documento oficial de padronização visual e tokens da plataforma **Mentor Concursos IA**.

---

## 🎨 Palette & Paleta de Cores (DNA Azul)

### Cores Primárias (Brand Blue)
- **Primary Main (`#2563EB` / HSL `205 89% 50%`):** Identidade visual principal para botões, destaques e links ativos.
- **Primary Hover (`#1D4ED8`):** Estado de hover e foco em elementos primários.
- **Primary Light (`#DBEAFE`):** Fundos sutis, cards com destaque suave e badges.
- **Primary Dark (`#1E3A8A`):** Textos em destaque e estados escuros.

### Cores Semânticas
- **Success (`#22C55E`):** Indicador de acertos, metas batidas e revisões em dia.
- **Warning (`#F59E0B`):** Indicador de atenção, prioridade média e revisões acumuladas.
- **Danger / Destructive (`#EF4444`):** Revisões atrasadas, erros de questões e alertas críticos.
- **Info / Secondary (`#6366F1`):** Progresso de edital e informações complementares.

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

## 🔤 Tipografia e Hierarquia

### Escala de Fontes
- **Título de Página:** `text-2xl font-bold tracking-tight` (`24px`).
- **Números de Destaque (KPIs):** `text-3xl font-extrabold tracking-tight` (`30px`) ou `text-4xl font-extrabold` (`36px`).
- **Títulos de Seção / Cards:** `text-sm font-semibold tracking-tight` (`14px`).
- **Corpo de Texto:** `text-xs` (`12px`) ou `text-sm` (`14px`).
- **Labels e Badges:** `text-[10px]` ou `text-xs` `uppercase font-bold tracking-wider`.

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
- **Dark Background:** `hsl(222 47% 6%)`.
- **Dark Card Background:** `hsl(222 47% 8%)`.
- Todos os ícones decorativos devem conter `aria-hidden="true"`.
- Todos os botões e áreas interativas devem possuir rótulos acessíveis (`aria-label` ou texto descritivo).
- Foco visível preservado com `focus-visible:ring-2 focus-visible:ring-ring`.
