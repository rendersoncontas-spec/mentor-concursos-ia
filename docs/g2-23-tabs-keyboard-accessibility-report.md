# G2.23 — Abas, teclado e foco: relatório

Fase de conclusão do padrão de abas (WAI-ARIA APG "Tabs") no NomeIA. A G2.22 deixou a Central de estudos correta e apontou lacunas parecidas no Histórico e no Planejamento. Esta fase inventariou o repositório inteiro, reaproveitou o helper existente (`src/lib/a11y/tab-keyboard.ts`) e corrigiu só o que foi comprovado.

**Status: AMARELO.** Tudo o que dá para automatizar passou (ver seção 12 e o quadro final). Restam validações manuais com leitor de tela e aparelho físico (seção 17) e limitações conhecidas (seção 16). Nada foi commitado, enviado ou publicado.

## 1. Inventário de abas

Pesquisa feita por `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, `aria-labelledby`, `tabIndex`, Radix Tabs e por componentes de alternância customizados. Não há `@radix-ui/react-tabs` no projeto: todas as abas são botões próprios.

| Área | Implementação | Teclado | ARIA | Foco | Estado |
|---|---|---|---|---|---|
| Central de estudos (Cronômetro / Manual) | `role=tablist` + helper | ← → Home End, ativação automática | `aria-controls` → `tabpanel` rotulado | anel visível, tabindex móvel | **correto** (G2.22) — sem alteração |
| Histórico (Lista / Calendário) | botões com `role=tab`, mas sem painel e sem helper | só Tab | `aria-selected` sem `aria-controls` nem `tabpanel` | sem tabindex móvel | **incompleto → corrigido** |
| Planejamento (Ciclo / Dia / Semana / Mês / Metas e horas) | idem | só Tab | idem | idem | **incompleto → corrigido** |
| Minha conta (6 seções) | `<nav>` com botões soltos | só Tab | sem estado selecionado, sem painel; **diálogo sem nome acessível** | sem anel com recuo | **inconsistente → corrigido** |
| Filtros com `role=group` + `aria-pressed` (Estatísticas, Conquistas, Disciplinas, Ranking, Simulados, Estudo × desempenho, Revisões, período do Dashboard) | botões de alternância | Tab + Enter/Espaço | `aria-pressed` correto | foco nativo | **sem necessidade** — são filtros, não abas |
| Notas adesivas (troca de visão) | botões que trocam conteúdo | Tab | — | — | **sem necessidade** — não são abas |
| Criar ciclo (indicador de etapas) | lista estática | — | — | — | **sem necessidade** — não é navegável |
| Edital | accordion | Enter/Espaço | `aria-expanded` | foco nativo | **correto** |
| Mentor, Dashboard | sem abas | — | — | — | **sem necessidade** |

Regra seguida: botões de filtro **não** foram transformados em abas só para uniformizar.

## 2. Helper existente e alterações

`src/lib/a11y/tab-keyboard.ts` (G2.22) fazia só ← → Home End horizontais. Auditoria:

- compatível com o APG nas setas e em Home/End;
- **faltava**: orientação vertical (↑ ↓), pular abas desabilitadas, e um handler de DOM para barras que não guardam o índice focado em estado.

Os testes foram escritos **antes** (vermelho) e depois a implementação (verde). A API anterior continua igual (compatível):

- `nextTabIndex(key, current, count, { orientation?, isDisabled? })`;
- `handleTabListKeyDown(event, { activation: "automatic" | "manual", orientation? })`.

Comportamento do handler: parte da aba **com foco** (não da selecionada), move o foco, e só no modo automático também clica. Enter/Espaço ficam com o botão nativo. Combinações com Alt/Ctrl/Meta passam direto (atalhos do navegador).

## 3. Histórico

- `tablist` "Visualização do histórico" com Lista e Calendário.
- Cada aba tem `id`, `aria-controls`, tabindex móvel e anel de foco; ícones com `aria-hidden`.
- O conteúdo ganhou **um** `role=tabpanel` rotulado (`aria-labelledby`) pela aba ativa.
- **Ativação manual** (seção 6).
- Preservados: filtros, ordenação, paginação, dados e regras. Nada de regra de histórico foi tocado.
- **Defeito real achado e corrigido:** `loadMonthlyHistory` ficava preso em "carregando" quando a chamada rejeitava (sem `try/catch/finally`). Agora sai do carregamento, mostra o toast "Erro ao carregar calendário…" e o painel segue acessível. Também `handleEditSession` passou a tratar rejeição.
- Para permitir teste sem backend, as chamadas ao servidor passaram por uma fronteira (`src/features/history/history-actions.tsx`). **O padrão de produção são as próprias Server Actions** (mesmo desenho do Simulados); só o harness troca o valor.

## 4. Planejamento

- `tablist` "Visões do planejamento" com 5 abas, mesma estrutura do Histórico e **ativação manual**.
- Um `tabpanel` rotulado pela aba ativa envolve a visão escolhida.
- Motor de planejamento, ciclo, metas, disponibilidade e replanejamento **não foram tocados**; só a casca de abas da tela.
- Sem plano criado, a tela mostra "Nenhum planejamento criado" e **não renderiza abas vazias** (o teste confere `tablist` e `tabpanel` com contagem 0).

## 5. Outras áreas corrigidas

**Minha conta** (`account-settings-modal.tsx`): as 6 seções (Dados Pessoais, Preferências, Ranking, Categorias, Notificações, Segurança) viraram abas **verticais** (`aria-orientation="vertical"`, ↑ ↓ Home End), com `aria-selected`, `aria-controls` e painel rotulado.

- **Defeito real:** o diálogo não tinha nome acessível (o Radix exige um `DialogTitle`). O título visível "Minha Conta" passou a ser o `DialogTitle` (sem título duplicado).

Demais áreas: mantidas como estão (seção 1).

## 6. Modelo de ativação

| Componente | Modelo | Motivo |
|---|---|---|
| Central de estudos | automática | troca local e barata (G2.22) |
| Minha conta | automática, vertical | seções são formulários locais; troca imediata |
| Histórico | **manual** | Calendário busca o mês no servidor; uma seta por aba dispararia leituras em sequência |
| Planejamento | **manual** | Dia, Semana, Mês e Metas buscam dados ao abrir |

No modo manual ficam **separados**: aba com foco (setas), aba selecionada (Enter/Espaço/clique) e painel apresentado. O Tab entra na lista pela aba selecionada (roving tabindex) e sai para o painel, sem armadilha de foco.

## 7. Gerenciamento de foco

Testado: abertura da página, troca de aba (o foco **não** vai ao topo), modal aberto de dentro do painel, fechamento do modal, conteúdo vazio e carregado.

- "Editar registro" (dentro do painel do Histórico) → abre a Central de estudos → Esc → o foco volta ao botão que abriu.
- "Minha conta" fecha com Esc e o foco volta ao botão "Menu do usuário".
- O primeiro Esc pode apenas fechar a dica (tooltip) do botão focado; o segundo fecha o modal (mesmo comportamento já coberto em `study-register.spec.ts`).
- Não foram criados atalhos globais.

## 8. Acessibilidade

- Nomes acessíveis em todas as abas; ícones decorativos com `aria-hidden`.
- Foco visível conferido por `:focus-visible` + anel/contorno desenhado.
- Defeitos que o axe revelou **nos fluxos de abas** e que foram corrigidos (detalhes nas seções 13 a 15):
  - botões "Período anterior" e "Próximo período" (Metas e horas) **sem nome**;
  - `<select>` de escala do calendário **sem nome**;
  - vários contrastes insuficientes (texto verde/âmbar/rosa e chips rosa/verde em 10–12 px).

## 9. Responsividade

Em 320×480, 375×812, 768×1024 e 1280×800 (projeto desktop, tamanho definido pelo teste): sem rolagem horizontal da página; cada aba cabe na janela; alvo de toque com pelo menos 28 px de altura; painel visível após trocar de aba; "Minha conta" com as 6 seções alcançáveis. Nenhuma aba foi escondida para resolver overflow. Emulação de navegador não substitui aparelho físico.

## 10. Tema claro e escuro

O tema é o do próprio app (`next-themes`, `attribute="class"`, `defaultTheme="system"`): o navegador emulado com `colorScheme: dark` faz o app aplicar `.dark`. Cada teste confere a classe antes de medir. Foram usados tokens existentes (degraus `-700`/`-800` do Tailwind já em uso e variantes `dark:`); nenhuma cor nova foi introduzida.

## 11. Testes unitários (escritos e executados)

| Arquivo | Casos | O que cobre |
|---|---|---|
| `src/lib/a11y/tab-keyboard.test.ts` | 12 | setas, Home/End, circulação, vertical, desabilitadas, lista vazia, handler de DOM (manual não clica; automático clica), foco x selecionada, modificadores, tecla fora de uma aba |
| `src/application/tabs-a11y-g2-23.test.ts` | 12 | cada tela usa o helper com o modelo certo, N abas com `id`/`aria-controls`/`aria-selected`/tabindex, um único painel rotulado, Minha conta vertical com `DialogTitle`, harness sem banco/segredos |
| `src/features/ranking/lib/top1-counts-label.test.ts` | 3 | texto do Ranking (ver seção 15) |
| `src/application/study-history/history-list-payload.test.ts` (ajuste) | — | o teste de "fiação" passou a verificar a nova fronteira de ações (mesma intenção: buscar a linha completa antes de abrir o modal) |

## 12. E2E

`e2e/specs/tabs-keyboard.spec.ts` — **41 testes por projeto** (desktop: 41 executados; mobile: 33 executados e 8 da matriz de tamanhos pulados por desenho, pois a matriz define o tamanho e roda só no desktop).

Cobertura dos 12 itens da diretiva, em Histórico e Planejamento (e Minha conta quando aplicável):

1. nomes acessíveis; 2. seleção por teclado (Enter e Espaço); 3. setas; 4. Home/End; 5. `aria-selected`; 6. painel correspondente (`aria-controls` → `tabpanel` rotulado); 7. foco visível; 8. conteúdo vazio; 9. estado carregado; 10. mobile (matriz de 4 tamanhos); 11. tema escuro (axe); 12. nenhum painel ativo inacessível (visível, com área, sem ancestral `hidden`/`aria-hidden`/`inert`, sempre um só `tabpanel`).

Também: erro recuperável da lista, falha do calendário, retorno de foco do modal, Minha conta vertical.

## 13. Resultados do axe-core

WCAG 2.0/2.1 A/AA, claro e escuro, em Histórico (lista, calendário, vazio), Planejamento (Ciclo, Mês, Metas e horas) e Minha conta (inclusive a seção Preferências). **Zero violações** com uma única exceção, escopada por seletor e justificada:

- `color-contrast` nos chips de disciplina do calendário do Planejamento (`.shadow-2xs.gap-1.text-white`): o fundo é a **cor escolhida pelo usuário** para a disciplina, com texto branco. O contraste depende do dado, não das abas. Registrado em limitações. Nenhuma regra foi desligada por inteiro.

Zero violações no axe **não prova** conformidade WCAG integral.

## 14. Falhas encontradas

Defeitos reais do app (todos corrigidos): Histórico e Planejamento sem painel/teclado/`aria-controls`; Minha conta sem semântica de abas e sem nome do diálogo; calendário preso em "carregando" após falha; botões e `<select>` sem nome; contrastes baixos.

Falhas do **meu teste** durante a fase (corrigidas, não eram do app): contagem de seções (6, não 5); Esc fechando primeiro a dica; toast cobrindo o topo no mobile e fade do toast no meio da medição do axe.

Um teste de fiação existente (`history-list-payload.test.ts`) quebrou com a refatoração das chamadas e foi atualizado para a nova fronteira.

Instabilidades em specs **anteriores** que a suíte completa revelou (sem relação com as abas; nada de retry foi aumentado):

- `visual.spec.ts` (G2.22), card "Desempenho geral" no 320 px: falhava ~1 vez em 6 com "Element is not attached to the DOM". Medição: os cards do Dashboard são recriados ~2 s depois da hidratação sob `next dev`. Correção: o teste espera o card ser o mesmo nó por 1 s. Depois: 132/132 em 12 repetições.
- `simulados.spec.ts` (G2.21), "registrar detalhado por matéria": falhava ~1 vez em 12 porque o clique em "Análise" caía enquanto o modal de registro ainda fechava. Correção: espera o modal fechar. Depois: 40/40 em 20 repetições por projeto.

## 15. Correções

- helper com vertical e desabilitadas (+ testes antes);
- Histórico, Planejamento e Minha conta com semântica APG completa;
- `try/catch/finally` no calendário e na edição;
- nomes: `aria-label` "Período anterior", "Próximo período" e "Escala de trabalho";
- contrastes: `account-settings-modal.tsx` (barras Ruim/Bom e rótulo), `study-calendar.tsx` (Histórico), `planning-goals-progress-card.tsx` e `study-calendar-view.tsx` (Planejamento). Só classes de cor; nenhuma lógica;
- **Ranking (pedido seu durante a fase):** "40 dias e 7 semanas em 1º lugar (tempo estudado)" ficava estranho. O texto agora é "1º no tempo estudado: 40 vezes no dia · 7 vezes na semana" (singular "1 vez"; omite o período com zero). Lógica em `src/features/ranking/lib/top1-counts-label.ts`, com teste.
- Incorporei ao meu trabalho os arquivos novos que você alterou na pasta (`study-analytics.actions.ts` com `top1Counts` e a migration `20261010_ranking_top1_counts.sql`). **Não** apliquei migration alguma.

## 16. Limitações

- O calendário do Histórico **não tem estado de erro próprio**: com falha de rede mostra um calendário vazio e um toast. Já não trava, mas um aviso persistente no painel seria melhor (fora do escopo).
- Contraste de chips de disciplina depende da cor que o usuário escolhe (seção 13). Seria preciso escolher o texto (claro/escuro) pela luminância da cor.
- Dia e Semana do Planejamento mostram "Não foi possível atualizar o cronograma" no harness (sem sessão): é o estado de erro **real** da ação do servidor, útil como teste de erro recuperável, mas não exercita os dados dessas duas visões.
- O axe das visões Dia e Semana do Planejamento não foi coberto nos dados; em `weekly-planning-view.tsx` ainda há `text-emerald-600` sem variante de contraste revisada.
- A tela autenticada real não foi varrida (só harness com dados sintéticos).
- Apenas Chromium.
- O toast de erro pode cobrir temporariamente o topo no mobile (comportamento existente do app).

## 17. Validação manual pendente

- Leitor de tela (TalkBack, VoiceOver, NVDA): anúncio de "aba, 1 de 2, selecionada", troca de painel e nome do diálogo "Minha Conta".
- Aparelho físico: toque nas abas e no calendário em tela pequena, teclado externo no Android.
- Conferir visualmente as cores ajustadas (verde/âmbar/rosa escuros) nos dois temas.
- Navegação real autenticada: Histórico → editar → fechar; Planejamento → trocar de visão com dados reais.

## 18. Próximos passos

1. Estado de erro próprio no calendário do Histórico.
2. Texto do chip de disciplina escolhido pela luminância da cor do usuário.
3. Revisar contraste das visões Dia e Semana com dados reais e acrescentá-las ao axe.
4. Estender o harness para Estatísticas, Revisões e Edital, que ainda não são varridos pelo axe.
5. Copiar `docs/ci/github-actions-ci.yml` para `.github/workflows/ci.yml` (pendência da G2.22).

## Execução

| Verificação | Resultado |
|---|---|
| `npm test` (nuvem) | 2574 testes: 2571 passaram; 3 falham só na nuvem (Android gerado, ver abaixo) |
| `npx tsc --noEmit` | passou, 0 erros |
| ESLint (arquivos alterados vs. base) | nenhum erro novo; os 4 erros existentes continuam os mesmos |
| `npm run build` | passou; nenhuma rota `e2e-harness` gerada |
| `tabs-keyboard.spec.ts` | 41/41 desktop, 33/33 mobile executados (8 pulados por desenho) |
| Estabilidade | 4 repetições, sem retries: 296 passaram, 0 falharam, 32 pulados por desenho |
| `npm run test:e2e` (suíte completa) | 338 testes: **307 passaram, 0 falharam, 0 instáveis**; 31 pulados por desenho (matriz de tamanhos e specs de um só projeto) |

**Escritos / executados / bloqueados:** todos os testes escritos foram executados. Nenhum foi bloqueado por ambiente (Chromium disponível). Os 3 testes do Android (`android/` não existe na nuvem; arquivos gerados pelo Capacitor) falham só aqui e passam na sua máquina.

## Arquivos

Novos: `src/features/history/history-actions.tsx`, `src/lib/testing/history-planning-fixtures.ts`, `src/app/e2e-harness/history/*`, `src/app/e2e-harness/planning/page.e2e.tsx`, `e2e/specs/tabs-keyboard.spec.ts`, `src/lib/a11y/tab-keyboard.test.ts`, `src/application/tabs-a11y-g2-23.test.ts`, `src/features/ranking/lib/top1-counts-label.ts` (+ teste).

Alterados: `tab-keyboard.ts`, `history-view.tsx`, `study-calendar.tsx`, `planning-view.tsx`, `planning-goals-progress-card.tsx`, `study-calendar-view.tsx`, `account-settings-modal.tsx`, `ranking-view.tsx`, `history-list-payload.test.ts`, `e2e/specs/visual.spec.ts`, `e2e/specs/simulados.spec.ts`, `package.json` (testes registrados), `docs/e2e-browser-testing.md`, `src/app/e2e-harness/README.md`.

Não tocados: engine do ciclo, planejamento (motor), histórico de estudo (regras), timer, revisões, simulados, identidade canônica, Mentor, autenticação, RLS, Capacitor, migration G2.12.
