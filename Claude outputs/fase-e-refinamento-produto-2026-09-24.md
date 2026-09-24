# NomeIA — Fase E: refinamento de produto, consistência visual e largura

Data: 24/09/2026. Tudo foi feito localmente, sem commit nem push.

## Resultado técnico

| Verificação | Resultado |
|---|---|
| `npm ci` | Funciona (código de saída 0, rodado com `--ignore-scripts`) |
| `npx tsc --noEmit` | **0 erros** |
| `npm test` | **884 testes, 884 passam, 0 falham**, 88 suítes |
| `npm run build` | **Sucesso**: compilação, TypeScript e 39/39 páginas |
| ESLint (`src/`) | 275 avisos (eram 288 no fim da Fase D); nenhuma regra nova foi violada |

**Onde rodou.** Os quatro comandos rodaram numa cópia do projeto na nuvem, com `node_modules` apagado e reinstalado por `npm ci`. Conferi por hash MD5 que todo o `src/`, `docs/design-system/01-tokens.md` e os ícones são idênticos aos da sua máquina. O build usou as variáveis públicas do Supabase só como variável de ambiente, sem gravar em arquivo.

---

## 1. Páginas auditadas

Mapeei o container, a largura máxima, as margens, as grades e o cabeçalho destas páginas:

Dashboard, Central, Disciplinas, Ciclos, Planejamento, Revisões, Histórico, Estatísticas, Concursos, Edital, Planos, Simulados, Biblioteca, Ranking, Conquistas, Administração (e detalhe de usuário), Perfil, Assinatura, Onboarding, Doação, Pedidos de editais e Cronograma (`/study-plan`).

Também revisei os esqueletos de carregamento de Dashboard, Planejamento e Revisões.

A auditoria mediu o DOM no navegador real, a 1920px, antes de qualquer alteração.

**O que ela mostrou**
- O layout do app não limitava a largura.
- Cada página definia a própria largura, e havia **quatro estratégias diferentes**:
  - **1440px centralizado:** Dashboard e Ciclos. A 1920px, com a sidebar aberta, sobravam faixas vazias de cerca de 135px de cada lado; com a sidebar recolhida, cerca de 200px.
  - **Largura total, sem limite:** a maioria das páginas.
  - **1280px centralizado** (`max-w-7xl`): Administração, com cerca de 190px vazios de cada lado.
  - **672px presos à esquerda** (`container max-w-2xl`): Perfil, com cerca de 1.000px vazios à direita.
- **Cabeçalhos em três padrões:**
  - Barra fixa (a maioria das páginas).
  - H1 editorial dentro da página (Dashboard, Ciclos, Estatísticas, Ranking, Conquistas, Admin).
  - Os dois ao mesmo tempo, com título duplicado: Simulados, Planos, Assinatura, Disciplinas e Edital.
- **Onboarding:** um segundo `<main>` dentro do layout, logo repetido e uma caixa de 768px no centro.

## 2. Páginas modificadas

Dashboard, Central, Disciplinas, Ciclos, Planejamento (cabeçalho, carregamento e agenda semanal), Revisões, Histórico, Estatísticas, Concursos, Edital, Planos, Simulados, Biblioteca (cabeçalho e container), Ranking, Conquistas, Administração, Perfil, Assinatura, Onboarding, Doação, Pedidos de editais e Cronograma.

## 3. Problema de largura por página e o que mudou

| Página | Antes (1920px, sidebar aberta) | Depois |
|---|---|---|
| Dashboard | 1440px, cerca de 135px vazios de cada lado | Container comum, 24px de margem |
| Ciclos | 1440px, igual ao Dashboard | Container comum; tabela da sequência redistribuída |
| Administração | 1280px, cerca de 190px vazios de cada lado | Container comum |
| Perfil | 672px presos à esquerda | Container comum; dados em 3 colunas |
| Onboarding | Caixa de 768px no centro | Formulário na coluna principal e lateral explicativa (a partir de 1280px) |
| Histórico, Planejamento, Revisões, Estatísticas, Concursos, Edital, Planos, Simulados, Biblioteca, Ranking, Conquistas, Disciplinas, Assinatura | Largura total sem limite | Container comum (mesma largura e margem) |
| Central | Modal fixo de 960px | 960px, 1080px a partir de 1280 e 1180px a partir de 1600 |

Depois das mudanças, medi no navegador, a 1920px, as 18 páginas principais:
- Margens laterais de 24–30px em todas (os 6px de diferença são a barra de rolagem).
- Nenhum overflow horizontal.

Com a sidebar recolhida, o container chega a 1760px e sobram cerca de 66px de cada lado. Esse número é calculado, não medido.

## 4. Containers modificados

- **`.page-container` novo** (`globals.css`):
  - Largura 100%, com máximo `--content-max-width: 1760px`.
  - Centralizado, com 16px de margem lateral no mobile e 24px a partir de 640px.
  - Todas as páginas acima passaram a usar esse container.
- **`.prose-width` (72ch)**, para texto corrido.
- **`PageHeader`:** usa o mesmo container, então o título fica alinhado com o conteúdo.
- **`<main id="app-main">`:** reserva espaço no fim da página para os botões flutuantes. Por isso as páginas não precisam mais de `pb-24` próprio.

## 5. Grades modificadas

- **Dashboard:** a grade de 3 colunas já dividia o espaço por igual. Agora ela cresce junto com o container.
- **Ciclos (tabela da sequência):**
  - A coluna de progresso crescia só até 220px; agora é proporcional.
  - A partir de 1024px aparece a coluna "Estudado", com dado já existente.
- **Disciplinas:** a grade de cards virou uma tabela.
  - Colunas: Disciplina, Situação, Progresso, Questões, Acerto, Tempo, Área e Ações.
  - No mobile, cada disciplina vira uma linha compacta.
- **Planos:**
  - O plano atual ficou em duas regiões: dados à esquerda, maiores cargas à direita.
  - Os outros planos viraram tabela: Plano, Tipo, Status, Carga, Matérias, Criado em e Ações.
- **Concursos:** cabeçalho de colunas e coluna própria para Cargo · banca a partir de 1024px.
- **Simulados:** a lista e o desempenho por matéria ficam lado a lado a partir de 1440px.
- **Conquistas:** até 4 colunas a partir de 1600px.
- **Faixa de métricas:** o componente novo `MetricStrip` substitui os cards de KPI em Planos e Disciplinas.

## 6. Breakpoints ajustados

- **Estatísticas:** filtros e ações só ficam na mesma linha a partir de 1536px. Antes isso acontecia a partir de 1280px e o seletor de período quebrava.
- **Ciclos (coluna Estudado)**, **Concursos (coluna Cargo · banca)** e **Disciplinas (tabela)** mudam de layout a partir de 1024px.
- **Onboarding:** a lateral explicativa aparece a partir de 1280px.
- **Central:** a largura do modal sobe em 1280px e em 1600px.

## 7. Mobile

**Corrigido**

- **Botões flutuantes (Bloco de notas e Registrar estudo):**
  - No mobile, somem ao rolar para baixo.
  - Voltam ao rolar para cima, no topo, no fim da página e ao receber foco pelo teclado.
  - Respeitam a área segura da tela.
  - O `<main>` reserva espaço no fim, então nada fica coberto.
  - Testado a 375px no Histórico e a 390px no Dashboard: some ao rolar para baixo e volta ao subir e no fim da página.
- **Cabeçalho fixo:** a descrição some no mobile (antes o cabeçalho de Ciclos ocupava 3 linhas).
- **Histórico:**
  - A barra de ações ocupava 3 linhas.
  - Agora cabe em uma a 375px: "Adicionar estudo" mais Importar, Gerenciar e Filtros só com ícone (com `aria-label`).
- **Revisões:**
  - As abas mostravam só o número no mobile; agora mostram também o ícone.
  - Retenção e Dominados ficam lado a lado.
- **Disciplinas:** o filtro de situação ocupa a linha inteira, sem barra de rolagem aparente.

**Telas verificadas**
- 375px: Histórico.
- 390px: Dashboard, Disciplinas, Ciclos.
- 430px: Planos, Revisões, Central.

## 8. Desktop

**Corrigido**

- **Cabeçalho único `PageHeader`** em todas as páginas:
  - ícone igual ao da sidebar;
  - título;
  - descrição;
  - ações.
- **Títulos duplicados removidos:** Simulados, Planos, Assinatura, Disciplinas, Edital (havia um segundo H1 dentro do conteúdo), Estatísticas, Ranking, Conquistas e Admin.
- **Heranças visuais removidas:**
  - Disciplinas, Planos, Assinatura:
    - banner escuro invertido do plano ativo (Planos);
    - bloco teal sólido com o nome do plano em 30px (Assinatura);
    - banners de cabeçalho (Planos, Disciplinas);
    - botões em caixa alta, como "CRIAR NOVO PLANO".
  - Simulados:
    - caixas rosa e âmbar;
    - azul nos percentuais "Bom" e em "Brancos";
    - títulos em caixa alta.
  - Ranking e Conquistas:
    - pedestais dourado, prata e bronze de 176px, agora baixos e neutros;
    - blocos de ícone coloridos;
    - selos de raridade azul, roxo e âmbar;
    - animações de pulo e pulsação.
  - Admin: selos e botão roxos.
- **Caixa alta:**
  - `.type-label` deixou de ser em maiúsculas.
  - Cerca de 36 rótulos com `uppercase` foram normalizados.
  - Textos escritos em maiúsculas no código foram corrigidos: "ORDENAR TÓPICOS", "CARREGANDO...", "CHAVE PIX" e outros.
- **Botões:** 30 botões com classes próprias (`bg-primary text-white rounded-xl font-semibold`) voltaram a usar o componente padrão.
- **Esqueletos de carregamento:** Dashboard, Planejamento e Revisões seguem a composição real da página, com o mesmo cabeçalho.
- **Nome antigo no título do navegador:** "Mentor Concursos IA" foi removido de Admin e do detalhe de usuário.

## 9. Componentes removidos

- **`DashboardSection`:** nenhuma referência no código, nem uso dinâmico. Era substituído pelo `SectionHeader`.
- **Botão "Cargo alvo" (Histórico):**
  - Nunca teve ação; entrou sem `onClick` no commit `5acd970`.
  - O Histórico não tem filtro nem vínculo por cargo ou concurso que ele pudesse acionar.
  - Como não havia arquitetura clara para integrar, foi removido.
- **Agenda semanal do Planejamento:** as setas de mês e o botão "Semanal ▾" não tinham ação e foram removidos.
- **Edital:** o rodapé "TOTAL / PROGRESSO" repetia os números do cabeçalho de cada disciplina e foi removido.

## 10. Componentes mantidos

- **`PageHeader`:** reescrito como a barra fixa de página e usado em cerca de 20 páginas. Tirou markup duplicado de 12 arquivos.
- **`Metric`:** agora usado em Planos, Disciplinas e Conquistas.
- **`MetricStrip`:** componente novo, usado em Planos e Disciplinas. Os dois reduzem duplicação.
- **`DailyMessageBanner`:** o arquivo não tem mais componente, só `getDailyMessage`, usado pelo Dashboard. Mantido.
- **`QuickStartBar`, `StudyDock` e `StudyQuickAccess`:**
  - Não aparecem em nenhuma tela.
  - Mas o teste `study-provider-context-split.wiring.test.ts` lê esses arquivos.
  - Removê-los exige ajustar esse teste. Mantidos para você decidir.
- **`CycleNextCard`, `PendingReviewsWidget` e `RecentActivitiesList`:**
  - Eram usados só pelos esqueletos do carregamento antigo do Dashboard, que foi reescrito.
  - Não têm mais referência no código.
  - Mantidos porque `docs/estudei/01-dashboard.md` os descreve como widgets planejados.
  - Hoje o conteúdo deles já aparece em outros widgets. Remover é uma decisão sua.

## 11. Acessibilidade

- **Botões com rótulo acessível** (`aria-label`), que antes eram só ícone:
  - ações das linhas em Disciplinas, Planos e Edital;
  - Importar/Gerenciar/Filtros no mobile;
  - fechar o modal de Concursos;
  - datas personalizadas em Estatísticas.
- **Controles segmentados** anunciam o item selecionado (`aria-pressed` ou `role="tab"` com `aria-selected`): Estatísticas, Ranking, Conquistas, Disciplinas, Simulados e o seletor Cronômetro/Manual da Central.
- **Menu de Concursos:** itens com `role="menuitem"`.
- **Acordeão do Edital:** botão real com `aria-expanded` e ações sempre visíveis (antes só apareciam no hover).
- **Progress:** agora expõe o valor com `aria-valuenow`.
- **Foco visível:** adicionado nos botões flutuantes, no `Switch` e em selects de Planejamento, Edital e Disciplinas.
- **Linhas com ações só no hover** (inacessíveis por toque e teclado) foram trocadas por ações sempre visíveis: Planos, Disciplinas e Edital.
- **Estatísticas:** corrigido um botão dentro de um link (elemento interativo aninhado).
- **Animações contínuas removidas:** pulsação no cabeçalho de sessão ativa, no Ranking, no calendário e na agenda.

## 12–15. TSC, testes, build, npm ci

Ver a tabela no topo. Todos terminaram com código de saída 0.

## Também corrigido

- **Ícone do app:**
  - O PWA ainda usava o ícone da marca antiga (o "M" com cérebro) e o app usava um "N" azul com gradiente.
  - O novo ícone é um quadrado teal `#225951` com "N" off-white e um traço terracota.
  - Os mesmos nomes de arquivo foram mantidos: `public/icon-*.png`, `icon-maskable-*` (com área segura), `apple-touch-icon.png`, `src/app/icon.png`, `src/app/apple-icon.png`, `favicon.ico` (16/32/48) e `public/branding/nomeia-icon.png`.
  - Vários desses arquivos tinham tamanho errado (por exemplo, `icon-192.png` tinha 512px) e foram corrigidos.
  - `manifest`: `background_color` passou a off-white e a descrição perdeu "Plataforma inteligente".
- **Documentação:** `docs/design-system/01-tokens.md` agora registra o container, o cabeçalho, as regras de caixa alta, `Metric`/`MetricStrip`, o comportamento dos botões flutuantes e o ícone.

---

## Encontrado, mas não corrigido

- **Limites da validação visual:**
  - 1920px: todas as páginas só por medição do DOM; o print sai reduzido demais para ler detalhes.
  - 1280px: a maioria das páginas por print legível.
  - **Não verifiquei um a um:** 768, 1024, 1366, 1440, 1536, 1600 e 1728px. O comportamento nessas larguras vem do CSS (container e breakpoints), não de inspeção.
  - Não verifiquei o modo escuro.
- **Não revisei visualmente:**
  - Login: sua sessão está ativa e não saí para não encerrá-la.
  - O modal "Minha conta" (configurações do perfil).
  - A Central aberta no desktop depois do alargamento (vi só no mobile).
- **Sem dados reais:** Planejamento e Biblioteca, porque sua conta não tem planejamento nem materiais.
- **Histórico renderiza todas as 2.797 sessões** de uma vez: a página chega a cerca de 290.000px de altura. É desempenho, não visual; não mexi.
- **Rotas antigas fora da navegação**, com estilo antigo: `/dashboard/analytics`, `/performance`, `/questions`, `/adaptive`, `/mentor` e `/homologation`.
- **Arte da marca antiga:** `public/logo.png`, `public/branding/nomeia-logo.png` e `public/og-image.png` continuam com o logotipo horizontal azul. Não aparecem nas telas do app, mas o `og-image` aparece quando o link é compartilhado.
- **`dashboard-floating-button.tsx`** também não tem uso.
- **Ranking:** as linhas da classificação continuam como cartões arredondados e o painel "Sua classificação" ainda tem muito texto de incentivo.
- **Estatísticas:** o arquivo tem 2.300 linhas. Revisei cabeçalho, filtros, cartões e rótulos, mas não cada gráfico e tabela interna.
- **Edital:** os nomes de tópicos importados vêm em maiúsculas no próprio dado.
- **"Central Inteligente"** ainda aparece como texto, mas só nos componentes sem uso listados no item 10.

## Git (somente leitura; nada commitado nem enviado)

- **`git status --short`:** 331 entradas.
  - 314 modificados, 16 não rastreados e 1 removido (`dashboard-section.tsx`).
  - A maioria é o ruído de quebra de linha (CRLF) que já existia.
- **`git diff --stat`:** 315 arquivos, +25.006 / −24.556. Ignorando espaços (`-w`): 159 arquivos, +5.069 / −4.619.
- **`git diff --check`:** 39.230 linhas, todas do mesmo ruído de CRLF e de espaços que já existiam no último commit.
  - Comparei linha a linha com o último commit: nenhum espaço em branco novo em `src/` nem em `docs/design-system/`.
  - Encontrei 9 linhas em branco criadas pela troca de classes dos botões e as removi antes desta conferência.

**Limpeza:** os arquivos temporários que criei em `.next/` foram apagados. As chaves temporárias do `localStorage` do navegador embutido também foram removidas.
