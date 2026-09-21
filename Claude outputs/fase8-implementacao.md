# Fase 8 — Implementação da Nova Identidade Visual (NomeIA)

Data: 2026-09-20
Escopo: implementação da direção visual "Caderno de Estudos" aprovada após a Fase 7 (auditoria), cobrindo tokens, tipografia, remoção de azul hardcoded, composição do Dashboard, consolidação de duplicidade e remoção de emoji.

## 1. Direção visual implementada

Paleta aprovada, aplicada em `src/app/globals.css` (light + dark coerentes):

- `background`: hsl(30 20% 98%) — off-white quente
- `foreground`: hsl(220 20% 14%) — grafite
- `primary`: hsl(172 45% 24%) — verde-petróleo profundo (nova identidade, substitui o azul)
- `accent`: hsl(28 65% 52%) — terracota, usado como destaque pontual (ex.: "IA" no logotipo da tela de login)
- `secondary`: hsl(30 15% 35%) — taupe neutro
- `muted`: hsl(30 10% 92%) / `border`: hsl(30 8% 88%)
- `info`: hsl(205 25% 45%) — único tom azulado remanescente, reservado exclusivamente para estados "informativo/calmo" distintos de sucesso/erro (nunca usado como cor de ação ou decoração)
- Dark mode: equivalentes coerentes (`primary` mais claro para contraste — hsl(172 40% 42%) — `info` idem)

`docs/design-system/01-tokens.md` foi atualizado com a nova paleta e a escala tipográfica (Display/H1-H3/Body/Small/Caption/Mono).

## 2. Componentes base

Auditados nesta fase e em fases anteriores: Button, Card, Badge, Input, Select, Progress, Skeleton, Dialog, Table, Tooltip, Popover. Todos já usavam exclusivamente classes semânticas (`bg-primary`, `bg-muted`, `border`, etc.) — **zero alterações necessárias**: herdaram a nova identidade automaticamente ao trocar os tokens em `globals.css`.

Gap identificado (não resolvido, fora do escopo de "trocar cor"): não existem componentes centralizados de Tabs/Dropdown/Alert em `src/components/ui/` — cada feature reimplementa esses padrões manualmente. Registrado para eventual consolidação futura.

## 3. Substituição de azul hardcoded (Fase 6)

Varredura completa de `src/` com análise semântica ocorrência a ocorrência (sem replace cego). Resultado:

**~45 arquivos corrigidos**, convertendo `#2563EB`/`#1D4ED8`/`bg-blue-*`/`text-blue-*`/`border-blue-*` para tokens semânticos (`primary`, `info`, ou remoção de gradiente), entre eles: header, floating action button, dashboard (layout, widgets — 57 ocorrências em `dashboard-widget-catalog.tsx`), disciplinas, histórico, importação, edital, planejamento (6 arquivos), biblioteca, admin, simulados, estatísticas, sessão de estudo, perfil, assinatura, planos, ranking, conquistas, mentor-ai, concursos, doação, painel de testes, e a tela de login (`(auth)/layout.tsx` — hero antes 100% azul, agora grafite + verde-petróleo + um único destaque terracota no logotipo).

Também atualizado: `theme-color` do PWA (`layout.tsx` e `manifest.ts`) de `#2563EB` para `#225951` (equivalente hex do novo `primary`), já que essa é a cor mostrada na barra do navegador/app instalado — a "identidade" mais visível de todas.

**Estados semânticos genuínos** que precisavam de uma cor distinta de sucesso(emerald)/alerta(amber)/erro(rose) passaram a usar o token `info` (o único azul controlado que resta, por design): badge "Tranquilo" de revisões pendentes, badge de "Lançamento Manual" na central de estudo, seção "Esta Semana" do feed do Mentor IA, e status "PENDING" do painel de homologação.

**Gradientes removidos** (regra "não compensar troca de cor com gradiente"): barra de progresso geral de metas (`planning-goals-progress-card.tsx`) e barra de conquistas (`conquistas-view.tsx`), ambas convertidas para cor sólida condicional (primary → emerald ao completar).

**Deixado intencionalmente intocado**, por não ser "identidade" e sim dado/paleta legítima:
- Cores padrão de disciplina/bloco quando o usuário não escolheu uma (`color_hex || "#2563EB"` em vários arquivos) — um fallback entre várias cores possíveis, não a cor da marca.
- `study-plan.service.ts`, `achievements.types.ts`: paletas de cores default para disciplinas/conquistas.
- Paleta de avatares por hash em `ranking-engine.ts` (`computeBgColor`) — rotação de 6 cores, blue é só uma delas.
- Escala "sky" de nota em `simulado-result.tsx` (Excelente/Bom/Regular/Baixo) — categórica, não identidade.
- Badge de raridade "rara" = azul em `conquistas-view.tsx` — convenção universal de UI de games (comum/raro/épico/lendário), preservada de propósito.
- `review-tabs.tsx` (intervalos 24h/7d/15d/30d/60d) — não alterado porque already usa "teal" em outro intervalo; mudar "24h" para primary (também um tom teal) criaria colisão visual entre dois intervalos distintos.
- `src/application/study-cycle/cycle-progress.service.ts` — dentro do caminho absolutamente proibido; não tocado.

## 4. Dashboard — composição editorial (Fase 5)

Reordenada a configuração **padrão** de widgets (`getDashboardLayoutConfig` em `dashboard-layout.action.ts`) para refletir a hierarquia pedida:

1. Estudo de hoje — Ciclo de Estudo, Estudos de Hoje
2. Progresso — Progresso no Edital, Tempo de Estudo, Constância
3. Próxima ação — Revisões, Metas de Estudo
4. Desempenho — Desempenho Geral, Desempenho por Matéria, Questões, Ranking
5. Planejamento — Calendário, Data da Prova
6. Informações secundárias — Conquistas, Últimas Atividades, Lembretes, Mensagem do Dia

**Importante**: isso só define o layout **padrão** (usado quando o usuário ainda não personalizou). A funcionalidade de arrastar-e-soltar/redimensionar/ocultar widgets do usuário permanece 100% intacta e sempre tem prioridade sobre esse padrão — nenhuma lógica do sistema de customização foi alterada.

**Decisão consciente não tomada sozinho**: a reestruturação mais profunda (tirar os widgets-âncora do grid arrastável para virarem uma seção "hero" fixa acima da grade, eliminando de vez a sensação de "grade de cards") entraria em conflito com o escopo da funcionalidade de customização existente. Prefiro sinalizar essa tensão do que decidir unilateralmente — se quiser que eu avance nessa direção, posso implementar mantendo os demais widgets customizáveis e fixando apenas os 2 widgets de "hoje" fora do grid.

## 5. Consolidação de duplicidade (Fase 9)

Confirmado que `src/features/dashboard/components/dashboard-header.tsx` tinha **zero usos** em todo o projeto — o cabeçalho realmente renderizado é o inline em `dashboard-layout.tsx`. Arquivo removido (com permissão de exclusão concedida por você), eliminando a arquitetura duplicada.

## 6. Emoji → Lucide (Fase 8/12)

Varredura de todo `src/**/*.tsx` por caracteres emoji reais (excluindo o caractere tipográfico "→", que é usado corretamente como separador em textos/rótulos e não é emoji). Encontrados e corrigidos:

- `statistics-center-view.tsx`: função `statusLabel()` — substituídas `"✅ Concluída"`, `"📘 Em estudo"`, `"🔁 Em revisão"`, `"⏳ Não iniciada"` por ícones Lucide reais (`CheckCircle2`, `BookOpen`, `RefreshCw`, `Clock`) renderizados junto ao texto, com cor semântica.
- `planning-view.tsx`: `"✓ Concluído nesta rodada"` → ícone `Check` do Lucide + texto.
- `doacao/page.tsx`: removidos 3 emojis decorativos (toast, título, parágrafo) para um tom mais editorial.

Confirmado também que não há bibliotecas de ícone misturadas (react-icons/heroicons/fontawesome) — o projeto já usa exclusivamente Lucide.

## 7. Ciclos (Fase 11) — confirmação de segurança

Nenhum arquivo em `src/features/study-cycle/**`, `src/application/study-cycle/**` ou `src/domain/study-cycle/**` foi alterado nesta fase. Auditoria confirmou que os componentes de Ciclos já usam extensivamente tokens semânticos (`bg-primary`/`text-primary`/`border-primary` — 16 a 4 ocorrências por arquivo) e **zero azul hardcoded** — ou seja, herdaram a nova identidade automaticamente ao trocar os tokens, sem precisar de nenhuma edição. Os símbolos de status (ex.: "▶ Em foco") permanecem exatamente como estavam. `git diff --ignore-all-space` confirma que o único diff real em Ciclos é o rename de hook pré-existente (`useGlobalStudy` → `useStudyActions`) já documentado no relatório da Fase 6 — nada novo nesta sessão.

## 8. Motion (Fase 13)

Auditoria de animações (`animate-spin`, `animate-pulse`, `animate-ping`, `animate-fade-in`, `animate-bounce`) confirmou uso já restrito a casos legítimos: spinners de carregamento, pontos de status "ao vivo", transições de entrada de modais/dropdowns. Único `animate-bounce` do projeto é a coroa do 1º colocado no Ranking — um único microinteração pontual e com propósito (celebração), não excessivo. Nenhuma alteração necessária.

## 9. Sombras e cards (Fase 7)

Auditoria de intensidade de sombra: `shadow-xs` (177×) e `shadow-sm` (104×) dominam — já são os níveis mais leves do Tailwind. As poucas ocorrências de `shadow-md/lg/xl/2xl` (39 no total) estão todas em superfícies que genuinamente precisam de elevação visual (modais, dropdowns, popovers, tooltips de gráfico) — removê-las prejudicaria a usabilidade, não a estética. Os efeitos de "glow" coloridos problemáticos (`hover:shadow-blue-500/20` etc.) já foram removidos durante a Fase 6.

**Não realizado nesta fase**: a consolidação de divs "card-like" ad-hoc (`rounded-xl border bg-card p-4 shadow-xs`) em um componente `<Card>` único, identificada na auditoria da Fase 7 (47 arquivos vs. 17 usos reais de `<Card>`). É uma refatoração estrutural de escopo maior, tocando múltiplas telas simultaneamente, e prefiro não fazer esse tipo de mudança em massa sem conseguir validar visualmente o resultado (o ambiente não tem acesso ao seu `localhost`, por instrução sua). Posso avançar nisso se você validar visualmente os resultados já aplicados e quiser que eu continue.

## 10. Validação

- `npx tsc --noEmit`: **0 erros** — checado repetidamente após cada bloco de mudanças ao longo de toda a fase.
- Testes executados nesta fase (todos passando, 0 falhas): dashboard (23), simulados/estatísticas/sessão de estudo (77), planejamento (22 + 3 + 20), ranking (96), spaced-repetition/importação (84), **Ciclos (130/130)**.
- Nenhum teste foi enfraquecido ou teve asserções removidas.

## 11. Arquivos alterados (Fase 7 + 8, resumo)

Tokens/docs: `globals.css`, `docs/design-system/01-tokens.md`, `docs/design-system/fase7-auditoria-e-direcao-visual.md` (novo).

Dashboard: `dashboard-layout.tsx`, `dashboard-widget-catalog.tsx`, `dashboard-layout.action.ts`, `sortable-widget.tsx`, `dashboard-customization-modal.tsx`, `dashboard-floating-button.tsx`, `reminders-widget.tsx`, `target-selector-dropdown.tsx`, `user-exam-modal.tsx`, `pending-reviews-widget.tsx`; `dashboard-header.tsx` (removido).

Layout global: `header.tsx`, `floating-action-button.tsx`, `(auth)/layout.tsx`, `layout.tsx`, `manifest.ts`.

Features: disciplinas (4 arquivos), planejamento (6), histórico (2), importação (2), edital (2), biblioteca (1), admin (2), simulados (2), estatísticas (2), sessão de estudo (3), perfil (1), assinatura (1), planos (1), ranking (2), conquistas (1), mentor-ai (1), concursos (1), doação (1), testes (1), páginas de dashboard analytics/reviews (2).

## 12. Arquivos NÃO alterados (por decisão consciente)

`src/application/study-cycle/**`, `src/domain/study-cycle/**`, `src/features/study-cycle/**` (zero necessidade — já tokenizados); paletas de dados (`study-plan.service.ts`, `achievements.types.ts`, `study-plan-shared.ts`, `ranking-engine.ts`, `discipline-selector.tsx`); esquemas categóricos legítimos (`review-tabs.tsx`, `simulado-result.tsx` SCORE_META, `conquistas-view.tsx` RARITY_LABELS); `edital/page.tsx` COLOR_PALETTE (paleta de cores oferecida ao usuário).

## 13. Confirmações finais

- Nenhuma lógica de Ciclos foi alterada (cursor, progresso, rounds, skip, reconciliação, sincronização, cálculo, engine, actions, banco) — confirmado por diff.
- Nenhuma migration foi criada. Nenhum dado foi apagado.
- Nenhum `git add`/`commit`/`push`/`pull`/`merge` foi executado — todas as mudanças estão no working tree, para você revisar e commitar manualmente.
- Nada foi inventado ou reportado como testado sem realmente ter sido.

## 14. Pendências em aberto (para próxima iteração, se desejar)

- Composição editorial mais profunda do Dashboard (extrair widgets-âncora do grid arrastável).
- Consolidação de divs "card-like" ad-hoc em `<Card>` (47 arquivos).
- Redesign página a página das telas internas (Fase 10) e passe específico de mobile (Fase 12) — ambos exigem validação visual real, que não está disponível neste ambiente no momento.
