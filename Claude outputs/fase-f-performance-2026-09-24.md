# NomeIA — Fase F — Performance, velocidade de navegação e carregamento de dados

Data: 24/09/2026 · Escopo: Dashboard, Ciclos, Histórico, Planejamento, Revisões, Estatísticas, Concursos e Biblioteca.

Não houve teste visual manual nesta fase, como o briefing pediu. Nada foi enviado ao GitHub: sem commit, push, add ou merge.

Nenhum arquivo de `src/application/study-cycle/**` ou `src/domain/study-cycle/**` foi alterado. Isso foi conferido por md5 contra o estado do início da fase. O Cycle Engine (cursor, rodada, progresso, `registerStudyToCycle`, `rebuildActiveCycleProgress`, reconciliação e skip) ficou intacto.

## Como ler os tempos

Os tempos abaixo são **estimativas feitas a partir do código, não medições**. Não rodei o app contra o banco com um usuário logado, porque isso exigiria digitar senha, e esta fase proíbe teste manual.

A unidade usada é a **ida e volta (RT)**: uma requisição do servidor Next ao Supabase (Auth ou PostgREST). Para a região do projeto, cada RT deve levar algo entre 50 e 150 ms, mas esse valor é uma suposição e não foi medido.

Dois fatos do Next.js pesam em todas as telas:

1. **Server Actions chamadas pelo navegador rodam em fila, uma de cada vez.** Um `Promise.all` de três actions no cliente vira três POSTs em sequência.
2. **Cada POST de action passa pelo middleware**, que chama `supabase.auth.getUser()` (1 RT ao Auth). Depois a própria action chama `getUser()` de novo (mais 1 RT).

Uma leitura feita no cliente depois da hidratação custa, portanto: download do JS, depois hidratação, depois (middleware 1 RT + auth 1 RT + queries) × número de actions em fila. A maior parte das correções desta fase elimina essa cadeia.

## Tabela de métricas (antes → depois)

| ROTA | AÇÃO | TEMPO APROX. (estimado) | QUERIES | SEQUENCIAIS (profundidade) | PARALELAS | DADOS CARREGADOS | GARGALO | CORREÇÃO |
|---|---|---|---|---|---|---|---|---|
| todas (layout + página) | resolver usuário | 6 RT → 2 RT | 6 → 3 | 6 → 2 (layout e página repetiam `getUser`, papel e perfil) | 0 → 2 (papel ∥ perfil) | igual | sessão resolvida 2× por requisição, com papel e perfil em sequência | `createClient` e `getEffectiveSessionUser` em React `cache()`; papel e perfil em `Promise.all` |
| /dashboard | abrir | antes: RSC (≈4–5 RT) + depois da hidratação 4 actions em fila (≈4 × 3–5 RT ≈ 12–20 RT); depois: RSC ≈ 4 RT, 0 actions | ≈ 20 → ≈ 14 | ≈ 16–25 → ≈ 4 | snapshot e layout em sequência → 6 loaders juntos | igual (mesmas chaves e mesmos dados) | "Foco de hoje", "Estudos de hoje" e "Calendário" só buscavam dados depois da hidratação, e em fila | 6 loaders em um `Promise.all` no servidor + `InitialServerDataProvider` semeando o cache dos widgets |
| /dashboard | histórico completo (analytics) | 3 RT → 2 RT | 3 → 3 | 3 → 2 | 0 → 2 páginas | 2.790 linhas (igual) | páginas de 1.000 lidas em sequência | `fetchAllPagesInParallel` |
| /dashboard | 2ª renderização do layout | 1 render extra → 0 | — | — | — | — | layout inicializado vazio e trocado em efeito | inicializador do `useState` usa `initialLayout` |
| /ciclos | abrir | antes: HTML → JS → 3 actions em fila (≈3 × 3–5 RT) com "Carregando seus ciclos de estudo…"; depois: dados no RSC, esqueleto instantâneo | igual | ≈ 9–15 → ≈ 3–4 | 3 actions em fila → 3 loaders juntos no servidor | igual | leitura só depois da hidratação e em fila | página servidor com `Promise.all` + `initialData` + `loading.tsx` |
| /ciclos | disciplinas do autocomplete | 2 RT → 1 RT | 2 → 2 | 2 → 1 | 0 → 2 | igual | plano ativo e catálogo em sequência | `Promise.all` em `getDisciplinesForAutocomplete` |
| /historico | abrir (leitura) | 3 RT → 2 RT (+ action no cliente, inalterada) | 3 → 3 | 3 → 2 | 0 → 2 | 2.797 linhas (igual) | páginas em sequência | `fetchAllPagesInParallel` + desempate por `id` |
| /historico | abrir (renderização) | ≈ 2.797 linhas no DOM → ≈ 150 | — | — | — | totais sobre todas as sessões (igual) | lista inteira desenhada de uma vez | dias inteiros progressivos + "Mostrar dias anteriores" |
| /planejamento | abrir | 3 RT → 2 RT | 3 → 3 | 3 → 2 | 0 → 2 (itens ∥ histórico) | igual | itens e histórico em sequência | `Promise.all` em `getCycleOverviewData` |
| /dashboard/reviews | concluir sessão de revisão | recarga completa do app → re-render do servidor | todas as do app → só as da página | — | — | igual | `window.location.reload()` | `router.refresh()` (mesmo padrão do `StartReviewButton`) |
| /estatisticas | abrir | antes: HTML → JS (tela de 2.320 linhas + recharts) → 1 action com ≈ 11–13 RT em sequência; depois: RSC com ≈ 3–4 RT de profundidade, esqueleto instantâneo | ≈ 12–14 (igual) | ≈ 13–15 → ≈ 3–4 | 0 → 7 blocos + páginas | igual | 5 blocos independentes em fila, página a página, só após hidratação | blocos em `Promise.all`, páginas em paralelo, dados no RSC + `loading.tsx` |
| /biblioteca | abrir | antes: HTML → JS → action (≈3 RT); depois: RSC ≈ 2 RT, esqueleto instantâneo | 1 (igual) | ≈ 3 → ≈ 2 | — | igual | leitura só depois da hidratação | lista carregada no servidor + `loading.tsx` |
| /concursos | abrir | inalterado (≈2 RT) | 1 | — | — | — | nenhum relevante | nenhuma (já carregava no servidor, 1 query) |
| widgets (cliente) | refresh após salvar estudo | spinner no lugar do conteúdo → conteúdo mantido | igual | — | — | igual | `loading` voltava a `true` e a mesma action podia disparar em duplicidade | hook estável + dedupe de buscas simultâneas |

## 1. Gargalos encontrados

1. **Leituras disparadas pelo navegador depois da hidratação**, em fila por causa do Next.js. Isso acontecia nos widgets do Dashboard, em Ciclos, Estatísticas e Biblioteca.
2. **Sessão do usuário resolvida mais de uma vez por requisição.** Layout e página chamavam `auth.getUser()` separadamente, e cada chamada ainda buscava papel e perfil em sequência.
3. **Leituras independentes em sequência.** Os casos eram Estatísticas (5 blocos, ≈ 11–13 RT), Planejamento, disciplinas do autocomplete e as páginas de 1.000 linhas do `study_history`.
4. **Histórico desenhando ≈ 2.797 linhas de uma vez.**
5. **Hook `useCachedServerAction` instável.** O `fetcher` inline recriava `load` a cada render, o que podia repetir a action enquanto a primeira ainda estava em andamento. Além disso, cada refresh trocava o conteúdo por um spinner.
6. **Recarga completa do app** ao terminar uma sessão de revisão.
7. **Dashboard renderizando duas vezes o layout** na montagem.

## 2. Causa

- A causa comum de (1) é o padrão "página estática + `useEffect` → Server Action". O dado só começa a ser buscado depois do HTML, do JS e da hidratação, e as actions do mesmo cliente são serializadas.
- (2) acontecia porque o `createClient` do servidor não era memoizado por requisição, então cada chamador criava o próprio cliente e resolvia a sessão de novo.
- (3) era um `await` após o outro, sem dependência real entre as leituras.
- (4) era um `dayGroups.map` sobre todo o histórico filtrado.
- (5) vinha de `load` depender do `fetcher` e da ausência de dedupe de buscas em andamento.
- (6) era um `window.location.reload()`.
- (7) era um `useState` inicializado vazio e preenchido em efeito.

## 3. Solução (otimização aplicada)

- **Sessão por requisição.** `createClient` e `getEffectiveSessionUser` passaram a usar React `cache()`. O layout e a página agora compartilham um único cliente e uma única resolução de usuário, com papel e perfil em paralelo. Dentro de Server Actions e Route Handlers o `cache()` do React não memoiza, então o comportamento ali é o mesmo de antes. A lógica de sessão de suporte (admin/moderador) não mudou.
- **Dashboard.** Um único `Promise.all` no servidor reúne snapshot, layout, ciclo ativo, estudos dos últimos 14 dias, totais diários do mês e estatísticas do mês. Os dados entram no `InitialServerDataProvider` com as **mesmas chaves** usadas pelos widgets (`activeCycleOverview`, `recentStudyHistory:14`, `monthlyCalendar:ano:mês`). Um dado que veio com erro não é semeado, e o widget busca sozinho como antes.
- **Ciclos.** A página agora é assíncrona no servidor e carrega ciclos, ciclo ativo e disciplinas em paralelo. A tela recebe `initialData` e não repete a carga no mount. Foi adicionado `loading.tsx` com esqueleto do painel e da tabela. As disciplinas só são recarregadas quando um ciclo é criado ou editado, ou quando o usuário pede "Atualizar". O `onRefresh` do painel continua recarregando ciclos e ciclo ativo, como antes. Nenhuma regra do Cycle Engine foi tocada, e a abertura da página só lê, pelas mesmas actions de sempre.
- **Estatísticas.** Os 5 blocos da action viraram funções executadas em `Promise.all`, cada uma com exatamente o mesmo tratamento de erro de antes. Concurso ativo e `user_disciplines` também passaram a sair juntos. As sessões vêm paginadas em paralelo. A página carrega o payload no servidor e ganhou `loading.tsx`; o horário de "atualizado às" usa `America/Sao_Paulo` para que o HTML do servidor e o do navegador sejam idênticos.
- **Biblioteca.** A lista agora é carregada no servidor e a página ganhou `loading.tsx`. Em caso de erro, a tela busca sozinha no navegador e mostra a mensagem, como antes.
- **Planejamento.** Itens do plano e histórico desde a criação do plano passaram a sair juntos.
- **Revisões.** `window.location.reload()` foi trocado por `router.refresh()`. As abas são 100% derivadas de `initialReviews`, então o dado atualizado chega do mesmo jeito.
- **Hook `useCachedServerAction`.** `load` e `refresh` ficaram estáveis, e o fetcher passou para uma ref. Buscas simultâneas da mesma chave agora compartilham uma única promessa, com o núcleo em `src/lib/server-action-cache.ts`. O refresh mantém o conteúdo atual na tela. O estado guarda a chave a que pertence, então ao trocar de mês o calendário não mostra o mês anterior como se fosse o novo.

## 4. Queries eliminadas

- **Por requisição de página protegida:** 1 `auth.getUser()` + 1 papel + 1 perfil (antes eram 2 resoluções, uma do layout e uma da página). No Dashboard também caem as resoluções repetidas feitas pelas actions chamadas dentro do RSC que usam `getEffectiveUserId`/`getEffectiveSessionUser`. As que chamam `supabase.auth.getUser()` diretamente continuam fazendo seu próprio RT ao Auth, já que o `getUser` do SDK não é memoizado; isso fica como possível otimização futura.
- **Dashboard (primeira abertura):** caem 4 POSTs de Server Action, e cada um levava middleware `getUser` + `getUser` da action. As queries de dados desses widgets continuam existindo, mas passam a rodar dentro do RSC, em paralelo e com sessão compartilhada.
- **Ciclos, Estatísticas e Biblioteca:** cai o par middleware + auth de cada action pós-hidratação (3 actions em Ciclos, 1 em Estatísticas e 1 em Biblioteca).
- **Revisões:** ao concluir uma sessão, caem todas as leituras que a recarga completa refazia (layout, providers, fila offline, bundles).

## 5. Queries paralelizadas

- Papel ∥ perfil na resolução do usuário.
- Os 6 loaders do Dashboard.
- Ciclos ∥ ciclo ativo ∥ disciplinas na página Ciclos.
- Plano ativo ∥ catálogo em `getDisciplinesForAutocomplete`.
- Em Estatísticas: sessões ∥ tentativas ∥ disciplinas (concurso ativo ∥ `user_disciplines`) ∥ itens de revisão ∥ contagem de revisões em 30 dias ∥ plano ∥ perfil.
- Itens do plano ∥ histórico no Planejamento.
- Páginas 2..N de `study_history` em Histórico, analytics do Dashboard, Estatísticas e `getTotalStudyMinutes`. A primeira página traz a contagem (`count: "exact"`) e as demais saem juntas: para 2.797 linhas, 3 RT em sequência viram 2.

## 6. Queries reduzidas

- **Profundidade:** Estatísticas passou de ≈ 13–15 RT para ≈ 3–4 RT. Leituras de `study_history` com mais de 1.000 linhas passaram de N RT para 2. Planejamento e disciplinas perderam 1 RT cada.
- **Colunas:** nenhum `select('*')` foi trocado nesta fase. Todos os que restam nas rotas auditadas alimentam objetos repassados inteiros para a tela, como Histórico, `study_plans` e `user_targets`. Reduzir colunas ali exigiria mapear cada consumidor, e isso fica registrado como possível otimização futura, sem ganho comprovado agora.

## 7. Dados sob demanda

- A lista do Histórico mostra dias inteiros aos poucos, começando com ≈ 150 registros e somando +300 por clique em "Mostrar dias anteriores". Ela volta ao início quando qualquer filtro muda. Ordem, filtros, contagens e totais continuam calculados sobre **todas** as sessões filtradas. Um dia nunca aparece partido.
- Continuam sob demanda, como já estavam e conferido na auditoria: notas adesivas (só ao abrir), seletor de concurso (só ao abrir) e modal de registro de estudo (sem busca quando fechado).

## 8. Componentes sem renderização desnecessária

- `DashboardLayout` não renderiza mais duas vezes na montagem.
- Os widgets com `useCachedServerAction` não refazem a busca a cada re-render do pai e não trocam o conteúdo por um spinner durante o refresh.
- O Histórico deixa de montar ≈ 2.650 linhas de lista na primeira pintura.
- `StudyCyclesView`, `StatisticsCenterView` e `BibliotecaView` nascem com dados, sem o ciclo carregando → dados → re-render.

## 9. Otimizações de rota

- Novos `loading.tsx` em Ciclos, Estatísticas e Biblioteca. Dashboard, Revisões e Planejamento já tinham. O esqueleto aparece no clique, enquanto o servidor carrega.
- Ciclos, Estatísticas e Biblioteca passaram a ser dinâmicas (`ƒ`). Antes eram "estáticas" só porque buscavam tudo no cliente. Por isso o build gera 36 páginas estáticas em vez de 39.
- Navegação: a sidebar já usa `<Link>` com prefetch padrão, e `router.push` só aparece em ações de menu (assinatura, pedidos de editais). Não houve alteração.

## 10. Otimizações do Histórico

- Leitura em páginas paralelas, com `id` desempatando `started_at` iguais. Na base real há 18 sessões com `started_at` repetido nesse usuário. Nenhum empate cai hoje na fronteira das páginas 1.000 e 2.000 (conferido via SQL), então os números atuais não mudam. O desempate impede que um empate futuro duplique ou esconda uma linha.
- Renderização progressiva (item 7). Os eventos `STUDY_SESSION_SAVED`, `QUEUED` e `OFFLINE_RESOLVED` continuam fazendo upsert na lista, sem recarregar tudo.

## 11. Otimizações de cache

Foram aplicados três caches. Para cada um estão as 5 perguntas do briefing: (1) o que é guardado, (2) por quanto tempo, (3) o que invalida, (4) risco de dado velho e (5) risco de vazar entre usuários.

**React `cache()` em `createClient` e `getEffectiveSessionUser`.**
1. Guarda o cliente Supabase e o usuário efetivo.
2. Dura uma requisição RSC.
3. Nada precisa invalidar: o cache morre com a requisição.
4. Não há risco de dado velho, porque o escopo é uma única renderização.
5. Não há risco de vazamento entre usuários, porque o escopo é por requisição. Em Server Actions o `cache()` não memoiza.

**Dedupe de buscas em andamento em `fetchWithCache`.**
1. Guarda a promessa em andamento de cada chave.
2. Dura até a promessa terminar.
3. `force` (refresh) ignora a promessa pendente.
4. Não há risco de dado velho: quem chega recebe o mesmo resultado que receberia um instante depois.
5. O cache vive no módulo do navegador de um único usuário.

**Semeadura com os dados do servidor (`InitialServerDataProvider`).**
1. Guarda os dados que a página acabou de ler.
2. Usa o mesmo TTL que já existia (2 a 5 minutos).
3. É invalidado pelos mesmos eventos de sempre (`STUDY_SESSION_SAVED` etc. → `refresh()` forçado).
4. O dado é tão novo quanto a própria página.
5. Vale o mesmo do dedupe: fica no navegador de um único usuário.

O cache em memória de Estatísticas (TTL de 5 min, invalidado explicitamente) **não foi alterado**.

## 12. Testes

Foram criados 4 arquivos de teste, todos incluídos no script `npm test`:

- `src/lib/server-action-cache.test.ts` (7 testes): dedupe de chamadas simultâneas, cache fresco, expiração, `force`, valor `null` semeado, erro não fica preso e chaves distintas.
- `src/lib/parallel-pagination.test.ts` (11 testes): mesmas linhas e mesma ordem que a leitura sequencial para 0, 1, 999, 1.000, 1.001, 2.797 e 3.000 linhas; 2.797 linhas = 1 página com contagem + 2 simultâneas; fallback sequencial sem contagem; `maxRows`; erro propagado.
- `src/features/history/lib/visible-day-groups.test.ts` (6 testes): dias inteiros, dia que cruza o limite entra inteiro, primeiro dia sempre visível, lista vazia, cenário de 2.800 sessões sem perder nem repetir dias.
- `src/application/performance-fase-f.wiring.test.ts` (11 testes). Verifica:
  - o `Promise.all` do Dashboard;
  - que as chaves semeadas no servidor são as mesmas usadas nos widgets;
  - as cargas paralelas de Ciclos e de Estatísticas;
  - que as telas não repetem a carga no mount;
  - a leitura do Histórico (desempate por `id` e erro ainda lançado);
  - a renderização progressiva com totais sobre todas as sessões;
  - que não há `reload` em Revisões;
  - o `cache()` da sessão.

**Resultado de `npm test`: 919/919 passando, 0 falhas** (eram 884 antes da fase). Os testes de wiring existentes seguem verdes, inclusive:

- o refresh do widget de ciclo por `STUDY_SESSION_SAVED`, sem `setInterval`;
- a separação `StudyLiveContext` / `StudyActionsContext`;
- a invalidação do cache de Estatísticas.

## 13. TSC

`npx tsc --noEmit`: **0 erros**.

ESLint (medido nesta fase na mesma cópia, antes e depois): **314 → 313 problemas** (272 → 271 erros, 42 avisos). Nenhum problema novo. O `set-state-in-effect` do hook já existia, e o de `study-cycles-view` foi removido.

## 14. Build

- `npm ci --ignore-scripts`: exit 0.
- `npm run build`: **sucesso**, compilado em 33,5 s, 36/36 páginas estáticas geradas. Ciclos, Estatísticas e Biblioteca agora são dinâmicas (ver item 9).

Os comandos rodaram na cópia de trabalho na nuvem, porque na pasta do OneDrive tsc e build não terminam no tempo do shell. Essa cópia foi sincronizada com a sua pasta e a paridade foi provada por md5 de todo o `src`: `664b702c7431e6f7d61786f46323f36a` nos dois lados, e `package.json` também idêntico.

## Arquivos da fase (29)

**Alterados (19):**

- `package.json` (só a lista de testes)
- `src/infrastructure/supabase/server.ts`
- `src/application/admin/auth-guard.ts`
- `src/app/(protected)/dashboard/page.tsx`
- `src/app/(protected)/ciclos/page.tsx`
- `src/app/(protected)/estatisticas/page.tsx`
- `src/app/(protected)/biblioteca/page.tsx`
- `src/application/study-analytics/statistics-center.action.ts`
- `src/application/study-analytics/study-analytics.service.ts`
- `src/application/study-history/study-history.service.ts`
- `src/application/study-plan/study-plan.service.ts`
- `src/application/study-session/get-disciplines.action.ts`
- `src/features/dashboard/components/dashboard-layout.tsx`
- `src/features/study-cycle/components/study-cycles-view.tsx` (pasta `features`, fora do Engine)
- `src/features/history/components/history-view.tsx`
- `src/features/statistics/components/statistics-center-view.tsx`
- `src/features/biblioteca/components/biblioteca-view.tsx`
- `src/features/reviews/components/review-tabs.tsx`
- `src/hooks/use-cached-server-action.ts`

**Novos (10):**

- `src/lib/server-action-cache.ts` (+ teste)
- `src/lib/parallel-pagination.ts` (+ teste)
- `src/features/history/lib/visible-day-groups.ts` (+ teste)
- `src/application/performance-fase-f.wiring.test.ts`
- `loading.tsx` de Ciclos, Estatísticas e Biblioteca

## Git (somente leitura, executado na sua pasta)

- `git status --short`: 348 entradas. Isso inclui as fases anteriores ainda não commitadas. Os arquivos novos desta fase aparecem como `??`, e `src/features/history/lib/` aparece como pasta nova.
- `git diff --stat`: 322 arquivos, +25.453 / −24.689 (acumulado desde o último commit).
- `git diff --check`: 38.868 linhas. É o mesmo ruído de CRLF/whitespace das fases anteriores (eram 39.230 na Fase E). Nos arquivos desta fase **não há espaço em branco novo no fim de linha** (conferido arquivo a arquivo contra a versão do início da fase), e os arquivos CRLF continuam CRLF.
- Os `M` em `src/application/study-cycle/*` e `src/domain/study-cycle/*` são de fases anteriores. A comparação md5 prova que a Fase F não tocou nesses arquivos.

---

## Possíveis otimizações futuras (NÃO aplicadas)

1. **Middleware chama `auth.getUser()` em toda requisição**, inclusive nos POSTs de Server Action (1 RT ao Auth por navegação e por action). Trocar por `getClaims()` (verificação local do JWT) economizaria esse RT. Não foi feito porque altera autenticação, o que está fora do escopo.
2. **Risco de truncamento em `study_cycle_sessions` (bug latente, pasta proibida).** Em `getCyclesAction` e `getActiveCycleAction` a leitura de `study_cycle_sessions` não pagina. O PostgREST corta em 1.000 linhas, e o ciclo ativo desse usuário já tem **933**. Ao passar de 1.000, os números do ciclo seriam calculados sobre dados truncados. Precisa de correção dentro de `src/application/study-cycle/**`, com autorização explícita. Por esse mesmo motivo **não** derivei o ciclo ativo da lista de ciclos, e `getActiveCycleAction` continua sendo chamado.
3. **`getCycleOverviewData` (Planejamento)** lê `study_history` desde a criação do plano sem paginar. Com mais de 1.000 sessões nesse intervalo, o "estudado" do plano ficaria subcontado. Corrigir muda números, então exige validação própria.
4. **Dashboard lê o histórico inteiro (2.790 linhas) só para agregações.** Uma função SQL/RPC de agregação reduziria transferência e CPU. Não foi feito porque exige migration e revalidação de todos os números do Dashboard.
5. **Histórico ainda transfere todas as sessões para o navegador** (`select *` + disciplina), via action depois da hidratação. Carregar no servidor ou paginar no banco reduziria dados, mas os totais do topo hoje dependem de ter tudo no cliente.
6. **O payload de Estatísticas leva todas as sessões com `notes` e `metadata` completos.** Enxugar colunas exige mapear o que o motor de estatísticas usa.
7. **Salvar um estudo dispara `router.refresh()` e também os refreshes por evento.** No Dashboard isso é trabalho duplicado. Remover um deles mexe no fluxo de salvamento, que é crítico e não foi alterado.
8. **Streaming por widget no Dashboard (`Suspense`).** Hoje a página espera o mais lento dos 6 loaders. Com streaming, cada widget apareceria quando o próprio dado chegasse.
9. **Estatísticas: `fetchActivePlan` lê o perfil de novo**, já lido pelo bloco de início de semana, e faz 2–3 RT em sequência. O ganho é pequeno.
10. **Revisões: `disciplines` sem filtro por usuário.** Depende de RLS para reduzir o volume, e vale conferir o tamanho real.
11. **Bundle:** recharts só é importado em Estatísticas (onde é necessário) e em 2 componentes de analytics. Não há ganho comprovado em dividir mais.
