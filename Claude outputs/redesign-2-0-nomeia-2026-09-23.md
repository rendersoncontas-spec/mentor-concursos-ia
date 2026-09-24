# NomeIA — Redesign Profissional 2.0 (relatório)

Data: 2026-09-23 · Escopo: auditoria visual + design tokens + componentes globais + telas principais. Trabalho 100% local, sem commit/push.

## 0. Resumo honesto

- O redesign foi feito de forma incremental sobre a identidade "Caderno de Estudos" já existente (off-white, grafite, teal, terracota). Nenhuma cor nova de identidade foi criada.
- A maior parte do efeito vem de **mudanças centralizadas** (tokens de raio/sombra, componentes `ui/*`, um codemod de classes aplicado a 82 arquivos) e de **reestruturação real** das telas principais (Dashboard, Central, Ciclos, Histórico, Planejamento, Concursos, Biblioteca, Revisões, Login).
- Telas secundárias (Estatísticas, Simulados, Planos, Ranking, Conquistas, Admin, Perfil, Assinatura, Disciplinas, Edital) receberam **apenas** os ajustes globais (tokens, componentes, codemod), não uma reestruturação de layout. Ver seção 6.
- **Nenhum teste visual em navegador foi feito nesta fase.** Não há screenshots; a validação é de código (tsc, eslint, testes, build). Recomendo revisar as telas com `npm run dev` antes de publicar.
- **Achado crítico fora do redesign:** o projeto hoje **não passa no `tsc`** por causa de 15 erros de tipo nos arquivos das Fases C/C.1 (offline/idempotência). Isso **bloqueia o `publicar_mentor.bat`** (ele roda `tsc --noEmit` e aborta). Detalhes na seção 8.

## 1. Auditoria (antes → depois, contagem em `src/**/*.tsx`)

| Padrão | HEAD | Agora |
|---|---|---|
| `rounded-2xl` / `rounded-3xl` | 130 / 6 | 0 / 0 |
| gradientes (`bg-gradient`, radial, linear) | 4 | 0 |
| manchas desfocadas (`blur-xl/2xl/3xl`) | 5 | 0 |
| `backdrop-blur` (glass) | 28 | 0 |
| `font-black` / `font-extrabold` | 440 / 247 | 0 / 1 |
| `shadow-2xl` | 10 | 5 (e o token foi suavizado) |
| textos "Inteligente/inteligente" | 40 | 18 (restantes: componentes mortos, frases do banco de "mensagem do dia" e comentários) |
| ícone `Sparkles` | 46 | 28 (restantes: ícone escolhível de concurso/conquista, "Gerar com IA" de flashcards — função real, sem cor violeta — e componentes mortos) |

Outros achados da auditoria: a variante `ghost/outline` do Button usava `hover:bg-accent` (terracota) em **todo** hover; o botão de fechar do Dialog tinha fundo terracota quando aberto; o sino de notificações mostrava um ponto de "não lido" fixo, sempre; a sidebar tinha cabeçalho de 64px e o header de 56px (desalinhados); a tela de login exibia um depoimento sem fonte verificável ("Aluno Aprovado · 1º Lugar", 5 estrelas).

## 2. Design tokens (`src/app/globals.css`)

- **Raio:** escala definida no `@theme` e achatada: sm 4px, md 6px, lg 8px, xl 8px, 2xl 10px, 3xl 12px. Removida a segunda escala em `:root` que sobrescrevia o tema (deixava `rounded-xl` com 16px e `rounded-2xl` com 24px).
- **Sombras:** definidas no `@theme` (antes os valores em `:root` não tinham efeito nas utilities do Tailwind v4). Todas discretas; `shadow-xl/2xl` legados ficam suaves, reservados a flutuantes.
- **Tipografia:** escala única em `@layer components`: `.type-display` (36), `.type-h1` (26→28), `.type-h2` (20), `.type-h3` (15), `.type-body` (14), `.type-secondary` (13), `.type-caption` (11), `.type-label`. Utilitário `.num` (tabular). Headings com tracking -0.015em.
- **Movimento:** animações de entrada mais curtas (0.15–0.25s, deslocamento 4–6px); skeleton passou de "brilho varrendo" para variação lenta de opacidade (`animate-skeleton`); `prefers-reduced-motion` respeitado globalmente.
- Paleta preservada exatamente como pedida.

## 3. Componentes globais alterados

- `ui/button` — primário teal sólido; secundário/outline/ghost **neutros** (hover `bg-muted`, não terracota); sem sombras; focus ring de 2px com offset; novo tamanho `icon-sm`.
- `ui/card` — borda em vez de sombra, `rounded-lg`, padding 20px, título 15px.
- `ui/badge` — pequeno (11px), sem sombra, variantes suaves: default, secondary, destructive, outline, **success**, **warning**, **solid**.
- `ui/progress` — 6px, trilho `muted`.
- `ui/skeleton` — `animate-skeleton`, `aria-hidden`.
- `ui/dialog` — overlay 50%, conteúdo `bg-card` `rounded-lg`, botão fechar neutro 32px com rótulo "Fechar".
- `ui/select`, `ui/command` — item em foco `bg-muted` (antes terracota); sem sombra no trigger.
- `ui/input`, `ui/slider`, `ui/popover`, `ui/table` (cabeçalho em rótulo 11px, células com mais respiro).
- **Novos:** `ui/empty-state` (usado em Ciclos, Planejamento, Biblioteca), `ui/section-header` (usado no Dashboard), `ui/page-header` e `ui/metric` (primitivos disponíveis, ainda sem uso — ver 9).

Codemod global (82 arquivos, apenas classes): `rounded-2xl/3xl → rounded-xl`, `font-black/extrabold → font-semibold`, `tracking-widest → tracking-wide`, textos de 8–9px → 10px, remoção de `hover:scale`/`active:scale`/`hover:translate` ornamentais, remoção de `backdrop-blur` com fundo tornado sólido, `font-mono` numérico → `tabular-nums` (exceto Admin/Testing, onde mostra e-mail/ID).

## 4. Shell

- **Sidebar:** fundo do token `sidebar-background`, cabeçalho 56px (alinhado ao header), logo 30px, sem slogan, rótulos de grupo `type-label`, itens 36px (40px no mobile), ativo = fundo teal 8% + filete lateral.
- **Header:** botões `rounded-md` com `aria-label`; removido o ponto de notificação falso; removido o toast ao trocar tema; menu do usuário mostra nome + e-mail (sem "Olá, Nome..."), itens com `role="menuitem"`.
- **Layout:** fundo `background` (antes `muted/30`); overlay mobile mais leve.
- **Botões flutuantes:** menores, borda neutra, sem anel de "brilho" nem ponto pulsante (`animate-ping`); textos "Central Inteligente" → "Registrar estudo / Sessão de estudo".
- **Indicador de conexão:** `role="status"` + `aria-live`; textos da Fase C preservados.
- **Cabeçalhos fixos de página** (12 páginas): ícone neutro 16px, título 16px semibold, padding responsivo.

## 5. Telas reestruturadas

- **Dashboard** — cabeçalho editorial (data como contexto, "Olá, Nome" em grafite, mensagem do dia como linha secundária, concurso + "Adicionar estudo" à direita); seções "Foco de hoje" e "Visão geral" com `SectionHeader`; widgets com borda em vez de sombra. No catálogo de widgets: 22 títulos em caixa alta ("TEMPO DE ESTUDO") viraram títulos de 13px em sentence case; ícones coloridos (verde/laranja/roxo/âmbar/amarelo) viraram neutros; números menores (sem "número gigante"); caixas internas viraram faixas com divisórias; roxo de Revisões → teal. **Foco de hoje/Ciclo:** matéria em foco marcada por filete teal (sem caixa dentro de caixa), "Próxima" como linha simples, menu com `aria` e itens neutros. **Cronograma do dia:** 5 "pílulas" coloridas de métricas viraram uma faixa única com divisórias; tarefas viraram linhas; "Gerar Planejamento com IA" → "Gerar planejamento".
- **Central de estudos** — modal: título "Central de estudos" (antes "Centro Inteligente de Estudos", com ícone de brilho), seletor de modo como segmented control com `role="tablist"`, estado (Estudando/Pausado) como texto + ponto, cronômetro 44–48px (antes 58–64px), Pausar como outline (antes âmbar sólido). Página do cronômetro: hierarquia disciplina → estado → tempo → ações → secundário; relógio 48–60px (antes 72–96px); uma ação primária (Pausar/Retomar) + Encerrar; Minimizar e Resetar como ações discretas; som de foco como seção secundária.
- **Ciclos** — sequência do ciclo virou **tabela** (#, disciplina, progresso, meta, status); o item atual é indicado por filete teal + fundo sutil + "Atual" (`aria-current="step"`); estados concluída/pulada/parcial como texto. Barra de progresso monocromática (antes laranja→âmbar→lima→verde). Painel do ciclo ativo com uma superfície, métricas em faixa, ações ghost. Cards da lista sem pílulas "ATIVO/PAUSADO".
- **Histórico** — formato de diário: um bloco por dia, **linhas** com horário · disciplina · detalhes · duração · foco · ações (antes um card por registro). "Pendente de sincronização" virou linha discreta com ícone (texto preservado). Resumo em faixa sem card; segmented control acessível; botões neutros.
- **Planejamento** — título da página corrigido ("Planejamento", antes "Ciclo de Estudos Rotativo"); sem H1 duplicado; abas como segmented control (Ciclo/Dia/Semana/Mês/Metas e horas); métricas do ciclo em faixa (antes círculo com borda grossa); lista da sequência em linhas. O estado vazio tinha **dois cards ("Nomeia Inteligente" com robô/brilho e "Criar Manualmente") que chamavam exatamente a mesma função** — virou um estado vazio com uma ação.
- **Concursos** — cards viraram **linhas de uma lista de projetos** (nome, cargo/banca, status, data da prova, ações); menu de ações acessível.
- **Biblioteca** — cards viraram **tabela de documentos** (título, disciplina, tipo, adicionado, ações); busca e ações numa barra; o bloco tracejado de "Importar dados" virou um botão secundário; loading em skeleton.
- **Revisões** — resumo único (fila de hoje + retenção + dominados + estágios de memória), sem ícone de cérebro gigante nem caixas coloridas; lista em linhas; 6 cores de intervalo (azul/ciano/teal/roxo/rosa/âmbar) → neutro; botão "Revisar" agora sempre visível (antes só no hover — inacessível por teclado/toque).
- **Login** — painel sóbrio grafite; removidos gradiente, manchas desfocadas, selo com brilho, depoimento sem fonte e selo "Ambiente 100% Seguro".
- **Textos:** "Análise Inteligente" → "Análise de desempenho"; "Importador Inteligente de Editais" → "Importar edital"; onboarding sem "personalizar a Inteligência Artificial"; metadados do site sem "Plataforma inteligente".

## 6. Telas sem reestruturação (apenas ajustes globais)

Estatísticas (só texto da seção "Análise inteligente" → "Observações sobre seus dados" e ícones), Simulados, Planos, Ranking (removidos gradientes/manchas), Conquistas, Disciplinas, Edital verticalizado, Perfil/Conta, Assinatura, Admin, Onboarding. Continuam com cards próprios e podem ser o próximo passo.

## 7. Decisões de design

1. Borda > contraste de fundo > sombra.
2. Estado ativo por **filete teal + texto**, nunca por glow/pulso.
3. Cor só com função: teal = ação/atual; verde = concluído; âmbar = pausado/pendência (só em ponto/ícone — texto âmbar usa amber-700 por contraste); vermelho = erro/destrutivo. Terracota fica restrita ao logotipo e a destaques pontuais.
4. Listas e tabelas para dados repetidos; cards só para agrupar uma unidade.
5. Rótulos em sentence case; caixa alta só no `type-label` pequeno.
6. A IA não é anunciada na interface; funções reais que usam IA (gerar flashcards) mantêm o nome da função.

## 8. Validação (execução real)

O `tsc` e o `eslint` não terminam no ambiente da pasta conectada (OneDrive, mesmo limite das fases anteriores). Para validar de verdade, copiei o código (sem `.env*`) para o ambiente de nuvem, instalei as dependências e rodei lá. Conferi por hash MD5 que os 458 arquivos de `src/` são **idênticos** aos da sua máquina.

- **`npm test`:** 884 testes, 884 passando, 0 falhas (inclui `get-disciplines` e `get-study-discipline-suggestions`, que travavam no ambiente local e aqui rodaram). Uma falha apareceu durante o redesign — um teste de congelamento do motor de Ciclos que procura a palavra "cursor" no widget; eu tinha escrito "cursor" num comentário — e foi corrigida.
- **`npx tsc --noEmit`:** terminou. **HEAD (último commit): 0 erros. Árvore atual: 15 erros, todos nos arquivos das Fases C/C.1** (`study-session-idempotency.ts` 3, `study-session.action.ts` 3, `study-provider.tsx` 5, `study-register-modal.tsx` 2 — linhas 500/502, acesso a `pendingSession` —, `pending-study-session.test.ts` 2). Nenhum erro está em código do redesign. Quase todos vêm de `exactOptionalPropertyTypes` e do tipo do builder do Supabase. **Os relatórios das Fases C/C.1 registraram o tsc como "não concluído"; agora sabemos que ele falha.** Esses arquivos estão na lista do que o redesign não podia alterar, então não mexi. **Isso bloqueia o `publicar_mentor.bat`.**
- **`next build`:** compila (Tailwind/CSS OK) e falha na etapa de tipos, pelo mesmo erro de `study-session-idempotency.ts`.
- **ESLint (src inteiro):** HEAD 278 problemas, agora 288. As 10 a mais estão todas em arquivos da Fase C (`connection-status-indicator` 1, testes do offline 9). O redesign não adicionou nenhuma; uma que eu tinha introduzido (ternário aninhado em `active-cycle-panel`) foi removida.
- **`git diff --check`:** o comando completo acusa ~39 mil linhas porque ~200 arquivos estão com quebra de linha CRLF (ruído que já existia). Com `core.whitespace=cr-at-eol`, as ocorrências restantes são espaços no fim de linha que já existiam no HEAD (verificado linha a linha). **Nenhum espaço em branco novo foi introduzido.**
- **Observação:** o `package-lock.json` está fora de sincronia com o `package.json` (`npm ci` recusa). Na nuvem usei `npm install`; as versões podem diferir um pouco das suas.

## 9. Pendências e observações

- Revisão visual em navegador (desktop/tablet/mobile) ainda não foi feita. Os layouts têm variantes mobile (grids que viram 2–3 colunas, colunas escondidas, linhas secundárias), mas isso precisa ser visto na tela.
- `PageHeader` e `Metric` foram criados, mas ainda não são usados.
- Componentes aparentemente sem uso (nenhum `<Componente` renderizado): `QuickStartBar`, `CycleNextCard`, `PendingReviewsWidget`, `DailyMessageBanner` (como componente), `StudyDock`, `StudyQuickAccess`, `RecentActivitiesList`, `DashboardSection`. Não foram redesenhados nem apagados.
- Possível bug funcional (registrado, não corrigido): o botão "Cargo alvo" no Histórico não tem ação (`onClick` ausente).
- `docs/design-system/01-tokens.md` não foi atualizado com a nova escala de raio/sombra/tipografia.
- Arquivos temporários de verificação ficaram em `.next/` (pasta ignorada pelo git): `claude-verify.tgz`, `claude-headv.tgz`, `claude-head-src.tgz`. Pode apagar.

## 10. Git (somente leitura; nada commitado nem enviado)

- `git status --short`: 283 entradas (269 `M`, 14 `??`). A maioria dos `M` é o ruído de CRLF que já existia.
- `git diff --stat`: 269 arquivos, +22.377 / −22.243 (inflado pelo CRLF). Ignorando espaços (`-w`): 106 arquivos, +2.643 / −2.509 — inclui os 9 arquivos das Fases C/C.1 que ainda não foram commitados.
- Novos (`??`) do redesign: `src/components/ui/empty-state.tsx`, `metric.tsx`, `page-header.tsx`, `section-header.tsx`.
- Intocados: `src/application/study-cycle/**`, `src/domain/study-cycle/**`, `src/infrastructure/offline/**`, sync queue, Supabase/banco, autenticação, regras de lançamento manual.
