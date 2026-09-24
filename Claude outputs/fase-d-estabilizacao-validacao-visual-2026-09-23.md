# NomeIA — Fase D: estabilização técnica + validação visual (relatório)

Data: 2026-09-23 · Tudo local, sem commit/push.

## Resultado

| Critério | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 erros** (antes: 15) |
| `npm run build` | **Sucesso** (compilação, TypeScript e 39/39 páginas) |
| `npm ci` | **Funciona** (antes: recusava o lock) |
| `npm test` | **884 testes, 884 pass, 0 fail**, 88 suítes, 0 cancelados |
| Desktop | Verificado no navegador (limites abaixo) |
| Mobile (375px) | Verificado no navegador |

Onde rodou: `tsc`, `build`, `npm ci` e testes rodaram no ambiente de nuvem, sobre uma cópia do projeto (sem `.env*`). Conferi por hash MD5 que os arquivos de `src/` são idênticos aos da sua máquina, e o `package-lock.json` também. No ambiente local da pasta (OneDrive) o `tsc` não termina dentro do limite de tempo, igual às fases anteriores. O build precisou das variáveis públicas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; passei só como variável de ambiente na nuvem, nada foi gravado em arquivo. Na sua máquina, o `.env.local` já fornece essas variáveis. O `npm ci` foi validado com `--ignore-scripts` (o `prepare` do husky não rodou).

## 1–2. Erros de TypeScript e como foram corrigidos

Os 15 erros eram todos do código das Fases C/C.1. Nenhum usa `any`, `@ts-ignore`, `@ts-expect-error` ou cast novo, e o `tsconfig` não foi alterado.

- **`study-session-idempotency.ts` (3 erros):**
  - Campos opcionais (`code`, `error`, `onReplay`, `onLookupFailed`, `originalErrorCode`) agora declaram `| undefined` explicitamente, como exige `exactOptionalPropertyTypes`.
  - `insert`, `lookupByOperationId` e `lookup` passaram de `Promise<…>` para `PromiseLike<…>`. O query builder do Supabase é "thenable", não uma Promise nativa; é o tipo real que ele devolve.
- **`study-session.action.ts` (3 erros):** foram resolvidos pela mudança acima. `CycleRegistrationResultLike.error` aceita `undefined`, que é o tipo real de `RegisterStudyToCycleResult`. O arquivo do Ciclo não foi tocado.
- **`study-provider.tsx` (5 erros):**
  - `calculateTimes`/`totalPausedMsAt` passaram a receber só os três campos de tempo que usam (`Pick<StudySessionState, "startTime" | "totalPausedMs" | "lastPauseStartTime">`), que também existem no snapshot do IndexedDB.
  - `cycleId`/`cycleItemId` agora são `string | null | undefined`. O mesmo ajuste foi feito, só no tipo, em `ActiveSessionRecord` (`infrastructure/offline/types.ts`).
  - O tipo de retorno de `finalizeAndSaveSession` declara `| undefined` nos campos opcionais.
- **`study-register-modal.tsx` (2 erros):**
  - O modal lia `res.pendingSession` no retorno de `finalizeAndSaveSession`, mas essa função nunca devolve esse campo. O próprio StudyProvider já dispara `dispatchStudySessionQueued` quando o salvamento fica offline.
  - Removi esse bloco morto (sempre `undefined` em execução). O comportamento não muda.
  - O caminho manual, que recebe `pendingSession` de verdade de `saveStudySessionWithOfflineSupport`, continua igual.
- **`pending-study-session.test.ts` (2 erros):** o teste agora estreita `active_minutes !== null` antes de comparar. A asserção não mudou.

Nada foi alterado no motor de Ciclos, cursor, rounds, `study_history`, sync queue, idempotência, Supabase ou autenticação.

## 3. `package-lock.json`

- **Causa:** cinco dependências diretas estavam no `package.json` desde commits antigos, mas nunca tinham sido gravadas no lock: `@supabase/server`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `framer-motion` e `zustand`. Elas estão instaladas no seu `node_modules`, mas nenhuma é importada em `src/`.
- **Correção:**
  - Adicionei 46 entradas ao lock, fixadas nas versões que já estão instaladas no seu `node_modules`: `@supabase/server` 1.7.0, `@supabase/middleware` 0.5.0, `framer-motion` 13.4.0, `motion-dom` 13.3.0, `@tanstack/*` 5.103.2, `zustand` 5.0.15 e as transitivas.
  - Nenhuma versão existente mudou. Em 3 entradas só mudaram as marcações `dev`/`devOptional`.
  - O `package.json` não foi alterado.
- **Observação:** como essas 5 dependências não são usadas, removê-las do `package.json` seria uma decisão sua, fora deste escopo.

## 4. Testes

884 no total, 884 pass, 0 fail. Os dois arquivos que travavam no ambiente local (`get-disciplines`, `get-study-discipline-suggestions`) rodam normalmente aqui.

ESLint em `src/` inteiro: 288 problemas contra 278 no último commit. As 10 diferenças são todas código das Fases C/C.1: 9 `consistent-type-imports` nos testes do offline e 1 `set-state-in-effect` no indicador de conexão. Esta fase não adicionou nenhum.

## 5. Telas verificadas no navegador

O servidor `npm run dev` que já estava rodando na sua máquina foi aberto no navegador embutido do Claude, logado por você.

- **Mobile (375×812, emulado):**
  - Dashboard: rolado do topo ao calendário.
  - Central de estudos: modal na aba Cronômetro.
  - Ciclos: painel e tabela da sequência.
  - Histórico: resumo e lista.
- **Desktop (1062px, largura real do painel, sidebar recolhida):** Dashboard, Central (modal), Ciclos, Histórico, Planejamento, Concursos, Biblioteca, Revisões.
- **Desktop 1366px (emulado, print reduzido):** Dashboard com sidebar expandida.
- **Login:** visto só antes do login, pelo print inicial. Não voltei nele depois para não encerrar sua sessão.
- **Secundárias (desktop):** Estatísticas, Simulados, Planos, Ranking, Disciplinas, Edital e Conquistas.
- **Não abertas:** Perfil, Assinatura, Admin e Onboarding. A navegação para Assinatura falhou por instabilidade temporária da ferramenta.

Auditoria automática por DOM em cada tela principal (sem overflow horizontal em nenhuma):

- **Verificado:** overflow horizontal, texto cortado sem reticências, fonte menor que 10px e alvos de clique menores que 24px.
- **Não verificado sistematicamente:** hover, foco por teclado e modo escuro.
- **Sem dados reais para ver:** Planejamento e Biblioteca, porque sua conta não tem planejamento nem materiais; vi só os estados vazios.

## 6. Problemas encontrados e corrigidos

1. **Central de estudos:** havia **dois botões "Fechar" sobrepostos** no canto (o X padrão do Dialog e o do próprio modal). O `DialogContent` ganhou a prop `hideCloseButton`, usada na Central. Confirmado no navegador: agora há 1 botão.
2. **Dashboard, Metas semanais:** o botão de editar tinha 14×14px e nenhum rótulo acessível. Agora tem `aria-label` e 28px.
3. **Dashboard, calendário:** as setas de mês tinham 22px; agora têm 28px.
4. **Dashboard, seletor de período (Desempenho):** os botões tinham 19px de altura e texto de 10px; agora têm cerca de 24px e texto de 11px, no mesmo estilo de segmented control do resto do app.
5. **Dashboard, Lembretes:** era o único widget ainda com título em caixa alta ("LEMBRETES"), ícone teal e estado vazio com ícone em caixa. Agora segue o padrão dos outros widgets.
6. **Histórico (desktop médio):** as ações quebravam em duas linhas desalinhadas das abas. Agora ficam alinhadas à direita e ao topo.
7. **Histórico (mobile):** o nome da disciplina era cortado em uma linha muito curta. Agora mostra até 2 linhas no mobile.
8. **Disciplinas:**
   - O botão principal "Nova Disciplina" era verde-esmeralda, fora da cor primária; agora usa o botão padrão teal.
   - O bloco "Progresso da preparação" era um painel escuro invertido; virou uma superfície neutra com barra teal.
   - O título do modal era verde; agora é neutro.

Os itens 1, 2, 4, 5, 7 e 8 foram conferidos no navegador depois da correção. O 3 e o ajuste final do 6 (alinhamento ao topo) foram validados só no código, com tsc, build e testes. No 6, a medição anterior mostrou que as ações já ficam alinhadas à direita, mas o botão "Filtros" ainda passa para uma segunda linha a 1062px.

## 7. Problemas que permaneceram (registrados, não corrigidos)

- **Botões flutuantes (mobile):** o Bloco de notas e o Registrar estudo cobrem a borda direita do conteúdo durante a rolagem. O padding inferior evita que cubram o fim da página, mas não o meio.
- **Widget "Desempenho por matéria":** tem espaço extra no topo por causa da alça de arrastar. No mobile, a tabela rola na horizontal dentro do widget, o que é intencional.
- **Histórico (mobile):** a barra de ações ocupa 3 linhas (5 botões).
- **Calendário (mobile):** o texto dentro dos dias fica em cerca de 10px.
- **Ícone do app:** `nomeia-icon.png` é azul (arquivo da marca, não alterado).
- **Telas secundárias com estética anterior (sem quebra de layout):**
  - Simulados, Planos, Edital e Estatísticas têm título duplicado (cabeçalho fixo + H1 da página).
  - Simulados mostra percentuais em azul/laranja e alerta rosa.
  - Planos tem banner cinza e botão em caixa alta.
  - Ranking e Conquistas usam blocos de ícone coloridos (estilo de gamificação); em Conquistas, os títulos dos cards são cortados.
  - Em Estatísticas, o seletor de período quebra em 3 linhas a 1062px.
- **Botão "Cargo alvo" (Histórico):** confirmado que não tem `onClick`, estado, modal nem rota ligados a ele. Como a intenção não está clara no código, **não inventei comportamento**. É preciso decidir entre ligá-lo a algo (por exemplo, ao concurso ativo) ou removê-lo.

## 8. Componentes globais

- `EmptyState`: usado em 4 lugares (Ciclos, Planejamento e duas vezes na Biblioteca). Agrega valor.
- `SectionHeader`: usado no Dashboard ("Foco de hoje", "Visão geral"). Agrega pouco, mas padroniza.
- **`PageHeader` e `Metric`: sem uso.** Os cabeçalhos das páginas usam o cabeçalho fixo existente, e as faixas de métricas foram feitas direto no markup. Não forcei o uso. Recomendo removê-los ou adotá-los numa próxima fase de padronização das telas secundárias.

## 9. Documentação

`docs/design-system/01-tokens.md` foi reescrito com:

- princípios visuais;
- regras de cor, incluindo contraste do âmbar e usos proibidos;
- escala de raio;
- sombras;
- escala tipográfica (`.type-*`);
- espaçamento e layout;
- componentes base;
- estados (hover, foco, ativo, vazio, erro, offline);
- acessibilidade.

O arquivo manteve a quebra de linha CRLF que já tinha na sua máquina.

## 10. Limpeza

- Apaguei de `.next/`, com sua permissão de exclusão, os 5 temporários que criei: `claude-verify.tgz`, `claude-headv.tgz`, `claude-head-src.tgz`, `claude-fixvis.py` e `claude-fixvis2.py`. Nada mais foi apagado.
- A chave temporária de auditoria que usei no `localStorage` do navegador embutido foi removida.

## 11. Git (somente leitura; nada commitado nem enviado)

- **`git status --short`:** 285 entradas.
  - 270 `M`: a maioria é o ruído de CRLF que já existia.
  - 15 `??`: arquivos das Fases C/C.1, os 4 componentes `ui/` novos e os relatórios em `Claude outputs/`.
- **`git diff --stat`:** 270 arquivos, +23.071 / −22.248 (inflado pelo CRLF). Ignorando espaços (`-w`): 108 arquivos, +3.439 / −2.616.
- **`git diff --check`:** aponta cerca de 39 mil linhas, todas do ruído de CRLF e de espaços que já existiam no último commit. Comparei linha a linha: **nenhum espaço em branco novo** foi introduzido em `src/` nem na documentação.
