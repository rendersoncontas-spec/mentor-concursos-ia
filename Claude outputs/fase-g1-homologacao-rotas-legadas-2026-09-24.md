# NomeIA — Fase G.1 — Segurança da homologação, rotas legadas e deprecation

Data: 24/09/2026 · Escopo: só a homologação, as rotas antigas do Dashboard, os redirects e as chamadas `revalidatePath` para essas rotas. O Cycle Engine, o `study_history`, o offline/sync, a idempotência, a autenticação geral, o design e a performance não foram tocados.

Estado final:
- **1128/1128 testes passando** (eram 1105; entraram 23 testes novos);
- `tsc --noEmit` sem erros; `npm ci --ignore-scripts` OK; `npm run build` OK;
- os arquivos tocados passam no ESLint sem nenhum erro;
- paridade md5 entre a cópia na nuvem e o seu computador confirmada.

---

## 1. Resultado por rota

| Rota | Antes | Depois | Ação | Motivo | Impacto |
|---|---|---|---|---|---|
| `/dashboard/homologation` | qualquer usuário logado abria a página e podia disparar as 2 Server Actions, que gravam dados de teste na própria conta | **só administradores**. Usuário comum ou moderador recebe **404**; sem sessão, vai para `/login`. As Server Actions negam no servidor | **PROTEGIDA** (página + actions) | ferramenta interna que grava dados, exposta a todos | usuário comum perde o acesso (nunca teve link); admin continua usando igual |
| `/dashboard/analytics` | página antiga sem links de entrada; 4 números + 3 gráficos | **307 → `/estatisticas`** | **REDIRECIONADA** (página e componentes exclusivos removidos) | os 4 números já estão em `/estatisticas`; dos 3 gráficos, 2 mostravam **dados fixos de exemplo** e o terceiro nunca recebia dados | nenhum conteúdo real perdido |
| `/dashboard/performance` | radar e acertos por disciplina a partir de `question_attempts`, mais um alerta "Assunto Crítico Detectado" com texto fixo | **307 → `/estatisticas`** | **REDIRECIONADA** (página removida) | `/estatisticas` já lê a mesma `question_attempts` (Desempenho, Mapa de erros, Desempenho por disciplina); o alerta era fabricado ("Remédios Constitucionais", igual para todo mundo) | nenhum conteúdo real perdido; some um alerta falso |
| `/dashboard/questions` | casca "em construção" com barra de navegação antiga | **307 → `/estatisticas`** | **REDIRECIONADA** (página removida) | nenhuma funcionalidade; os números de questões vivem em `/estatisticas` | nenhum |
| `/dashboard/adaptive` | página com lógica própria, sem links de entrada | **mantida**; a barra interna não aponta mais para rotas redirecionadas | **MANTIDA — DEPRECADA** (sem link no menu) | é a única tela que mostra o `adaptive_history` real (log do motor adaptativo gravado ao gerar cronograma); não há substituta | nenhum |
| `/dashboard/mentor` | feed do Mentor IA | **inalterada** | **MANTIDA** | lógica exclusiva (decisão da Fase G) | nenhum |

**As rotas antigas não desapareceram todas.** Três viraram redirect, `/dashboard/adaptive` continua existindo (deprecada, sem link) e `/dashboard/mentor` continua como estava.

## 2. Como a homologação foi protegida

**Auditoria:**
- **Arquivos:** a página `dashboard/homologation/page.tsx`; o componente `homologation-panel.tsx` (client), que chama 2 Server Actions de `homologation.actions.ts`; e `homologation.service.ts`, que as actions usam.
- **O que o serviço grava:** gera cronograma (`generateStudyPlan`) e grava sessões de estudo via `SessionOrchestrator.finalizeSession`, com resposta do Mentor, na conta de quem executa.
- **Checagem que existia:** tanto a página quanto as actions só verificavam `auth.getUser()`.
- **Mecanismo de papéis que já existe no projeto:**
  - tabela `user_roles`, lida no servidor por `getUserRole`;
  - funções `requireAdmin` e `requireModeratorOrAdmin` em `application/admin/auth-guard.ts`;
  - papéis `admin`, `moderator` (suporte) e `user`;
  - o painel `/admin` aceita admin e moderador.

**Regra adotada: só `admin`.** Moderador é o papel de suporte: cobre o painel `/admin` e o modo suporte, e nada no sistema atual dá a ele acesso a ferramentas que gravam dados de teste. Não criei nenhum sistema novo de permissões. A checagem usa o mesmo `getUserRole`, e falha fechada: se a leitura do papel der erro, o usuário conta como comum e é negado.

**Defesa em profundidade:**

1. Novo `src/application/testing/homologation-access.ts`, **sem** `"use server"`, então não vira endpoint:
   - `checkHomologationAccess(supabase)` devolve `admin` → permitido, com o id da sessão; `moderator`/`user`/sem linha → `FORBIDDEN`; sem sessão ou sessão inválida → `UNAUTHENTICATED`, sem nem consultar papéis;
   - `runHomologationGuarded(supabase, run)` autoriza primeiro e **só então** chama `run`. Sem permissão, nada da homologação é lido ou gravado.
2. **Server Actions protegidas:** `runHomologationFlow1Action` e `runHomologationMentorAction` agora passam por `runHomologationGuarded`. Chamando a action direto, sem permissão, a resposta é `{ data: null, error: "Acesso negado: ferramenta interna restrita a administradores." }` (ou `"Não autenticado"`). A checagem de manutenção continua antes de tudo.
3. **Página:** usa `checkHomologationAccess`. Sem sessão, vai para `/login`; sem permissão, `notFound()` (404, que não revela que a ferramenta existe). O painel só renderiza depois da checagem.
4. **Proxy:** a rota continua sob o prefixo protegido `/dashboard`, então um POST de Server Action sem sessão já é barrado antes de chegar à action (verificado no build, seção 6).
5. O `HomologationService` (código de escrita) é importado como valor só pelas actions protegidas; um teste garante isso.

## 3. Redirects: tipo e onde

- **Onde:** `redirects()` no `next.config.ts`, alimentado por `src/config/legacy-routes.ts` (arquivo sem imports, testável). O Next avalia essas regras **antes** do proxy de autenticação e antes de renderizar qualquer página, então a rota antiga não roda mais nenhuma consulta.
- **Tipo: 307** (`permanent: false`). São rotas internas autenticadas, sem SEO a preservar, e um 308 fica gravado no cache do navegador por tempo indeterminado. Se algum desses caminhos voltar a ser usado (por exemplo, um módulo de questões de verdade em `/dashboard/questions`), o 307 não prende ninguém no redirect antigo.
- A query string é preservada (`/dashboard/analytics?x=1` → `/estatisticas?x=1`).
- **Sem loop:** nenhum destino é origem de outro redirect, e `/estatisticas` é uma página real.

## 4. `revalidatePath` limpos

| Arquivo | Antes | Depois |
|---|---|---|
| `study-history/study-history.constants.ts` (`HISTORY_PATHS`, usada por toda mutação do histórico manual e pelas revisões) | incluía `/dashboard/analytics` | removida. `/estatisticas` e `/dashboard`, que mostram esses dados, continuam |
| `import-history/import-history.actions.ts` (`IMPORT_REVALIDATE_PATHS`) | incluía `/dashboard/analytics` | removida. `/estatisticas` continua |
| `concursos/concurso.action.ts` (`revalidateAll`) | `/dashboard/analytics` e `/dashboard/questions` | removidas. As demais (`/dashboard`, `/edital`, `/planejamento`, `/concursos`, `/disciplines`, `/dashboard/reviews`, `/dashboard/history`) continuam |
| `dashboard/target.action.ts` (`switchActiveTargetAction`) | `/ciclo`, `/analytics`, `/revisoes`, `/questoes` | removidas. **Nenhuma dessas rotas existe no app**, então as chamadas não faziam nada. `/dashboard`, `/planejamento` e `/edital` continuam |

Nenhuma rota nova passou a ser revalidada: o comportamento de atualização das telas que existem é o mesmo de antes. Revalidar uma rota que só redireciona, ou que não existe, era trabalho sem efeito.

## 5. Navegação e SEO

- Sidebar, header, FAB, atalhos, breadcrumbs e estados vazios **nunca apontaram** para essas rotas. As únicas referências vinham das barras internas das próprias páginas antigas: duas foram removidas junto com as páginas, e a de `/dashboard/adaptive` perdeu os links "Performance", "Questões" e "Analytics". "Analytics" virou "Estatísticas", com link direto para `/estatisticas`, que era para onde o link antigo já levaria.
- Um teste varre todo o código de produção (sem comentários) e falha se aparecer `href`, `push`, `revalidatePath` ou lista de rotas com `/dashboard/analytics`, `/performance` ou `/questions`.
- **SEO:** o app não tem `sitemap`, `robots`, Open Graph nem `canonical` para essas rotas. Eram páginas internas autenticadas só com `title`/`description`, que foram junto com as páginas removidas. Nenhuma página pública foi criada.
- **Docs:** `docs/estudei/07-analytics.md` e `12-roadmap.md` diziam que a página de Estatísticas era `/dashboard/analytics` e citavam os gráficos removidos; agora apontam para `/estatisticas`. `overnight-stability-report.md` é histórico e ficou como estava.

## 6. Validação das rotas no build de produção (`next build` + `next start`)

| Requisição (sem sessão) | Resultado |
|---|---|
| `GET /dashboard/analytics`, `/performance`, `/questions` | `307 → /estatisticas`, depois `307 → /login?redirectedFrom=%2Festatisticas`, final **200**; 2 saltos, sem loop, sem 500 |
| `GET /dashboard/analytics?x=1` | `307 → /estatisticas?x=1` |
| `GET /dashboard/homologation` | `307 → /login?redirectedFrom=…` → 200 |
| `GET /dashboard/adaptive`, `/dashboard/mentor` | `307 → /login` → 200 (mantidas, protegidas como antes) |
| `POST /dashboard/homologation` com o id real da action `runHomologationFlow1Action` | barrado pelo proxy: `307 → /login`; a action não roda |
| `POST /login` com o mesmo id de action | a action não está registrada nessa rota: resposta vazia, nada executado |

Os comportamentos **com sessão** (admin passa; moderador e usuário comum recebem 404 na página e "Acesso negado" na action) estão cobertos pelos testes da seção 7, com um cliente Supabase falso em memória. Não criei usuários de teste no banco real.

## 7. Testes

**Novo `src/application/testing/homologation-access.test.ts` (13 testes):**

| Caso | Teste |
|---|---|
| A. admin | permitido, com o id da própria sessão; o fluxo roda para esse id |
| B. moderador/suporte | negado (`FORBIDDEN`) |
| C. usuário comum | negado, tenha linha `user` em `user_roles` ou nenhuma linha |
| D. usuário comum chamando a action diretamente | rejeitado com a mensagem de acesso negado, para os dois fluxos |
| E. sem sessão ou sessão inválida | `Não autenticado`, sem nem consultar papéis |
| F. nenhuma escrita | com o `HomologationService` **real**, usuário comum, moderador e usuário sem papel: **0 escritas**, e a única ida ao banco é `select:user_roles` |
| falha fechada | erro ao ler `user_roles` conta como usuário comum |
| wiring | toda action exportada chama `runHomologationGuarded` antes do serviço; a página checa antes de renderizar o painel e usa `notFound()`; o serviço só é importado pelas actions; `homologation-access.ts` não é `"use server"` |

Contraprova: deixando a checagem de papel sempre liberar, 5 desses testes falham, incluindo o de "zero escrita".

**Novo `src/config/legacy-routes.test.ts` (9 testes):**
- as 3 rotas vão para `/estatisticas` com 307;
- não há loop e o destino é uma página real;
- as rotas redirecionadas não têm mais `page.tsx`;
- `adaptive`, `mentor` e `homologation` continuam como páginas e não são redirecionadas;
- o `next.config.ts` aplica a lista;
- nenhuma referência de código às rotas redirecionadas;
- a barra de `/dashboard/adaptive` não linka mais para elas;
- **todo `revalidatePath("...")` e toda entrada de `HISTORY_PATHS`/`IMPORT_REVALIDATE_PATHS` aponta para uma rota que existe.** A única exceção conhecida está listada explicitamente (`/home`, seção 9).

**Testes alterados:**
- `performance-audit.wiring.test.ts`: exigia `/dashboard/analytics` em `HISTORY_PATHS`; agora exige que **não** esteja lá e que `/estatisticas` e `/dashboard` estejam.
- `protected-routes.test.ts`: as 3 rotas saíram da lista de "páginas reais". Um teste novo garante que elas continuam sob o prefixo protegido, caso o redirect seja removido algum dia.

Os 2 arquivos novos foram incluídos no script `npm test`.

## 8. CORRIGIDO

1. **Homologação restrita a administradores** na página (404 para quem não pode) e nas 2 Server Actions (negação no servidor, sem nenhuma leitura ou escrita da homologação).
2. `/dashboard/analytics`, `/dashboard/performance` e `/dashboard/questions` **redirecionam (307) para `/estatisticas`**.
3. **Removido o que só essas rotas usavam:** as 3 páginas e `features/analytics/components/{performance-chart,hours-distribution-chart}.tsx`, com gráficos e alerta de dados fixos.
4. **8 `revalidatePath` sem efeito removidos:** 2 entradas em listas, 2 em `concurso.action`, 4 em `target.action`.
5. **Nenhum link interno** para rotas redirecionadas.
6. **Docs** de Estatísticas apontam para a rota real.
7. **Testes de regressão** para autorização, redirects, links e `revalidatePath`.

## 9. DEFERIDO (decisão sua ou fase própria)

| Item | Por que ficou |
|---|---|
| **`/dashboard/adaptive`: a "Saúde de Aprendizado" é calculada com valores fixos** (desempenho 70, retenção 75, energia 3, sem backlog para toda disciplina); só o histórico `adaptive_history` é dado real | a página tem conteúdo exclusivo, então não removi. Caminhos: ligar o cálculo a dados reais, esconder o termômetro ou redirecionar e mostrar o `adaptive_history` em outro lugar. Não tem link de entrada |
| `application/question-analytics/{radar,accuracy}.ts` ficaram sem uso (eram só da `/dashboard/performance`) | fazem parte do módulo de questões mantido na Fase G (categoria F, com roadmap em `06-questions.md`). Ficaram junto com ele |
| Troca de concurso não revalida `/ciclos` nem `/dashboard/reviews`: os nomes errados `/ciclo` e `/revisoes` nunca revalidaram nada | passar a revalidar as rotas reais muda o comportamento da troca de concurso. Removi só as chamadas sem efeito e deixei um comentário no código |
| `study-session.action.ts` revalida `/home`, que não existe | é a action de salvamento de sessão (área protegida: sync/idempotência). Não mexi; o teste de `revalidatePath` lista essa exceção explicitamente |
| `auditSupportAction` é exportada de um arquivo `"use server"` (`admin.actions.ts`), portanto é chamável como endpoint | **não é explorável**: o 1º argumento precisa ser um cliente Supabase vivo, que não atravessa a fronteira da Server Action; qualquer chamada do cliente cai no `try/catch` e não faz nada. Tirar o `export` exige mexer em `study-cycle.actions.ts` (área protegida) |
| `metadata` da página de homologação (título "Homologação") | ao receber 404, o Next pode ainda aplicar o título estático da página. Risco baixo (não expõe dados nem ações). Dá para trocar por `generateMetadata` com a mesma checagem |

**Auditoria rápida de outras ferramentas internas:** não encontrei mais nenhuma exposta a usuário comum.
- `/admin` e `/admin/users/[id]` já checam admin/moderador na página, e as actions usam `requireAdmin`/`requireModeratorOrAdmin`.
- `/seed` foi removida na Fase G.
- A migração de ciclos com service role é só CLI; não é importada por nenhuma rota ou action.
- `src/app/api` está vazia.
- `sendTestEmailAction` é recurso do usuário (manda para o próprio e-mail, com limite de envios por minuto), não ferramenta interna.

## 10. Git

Rodei só `git status --short`, `git diff --stat` e `git diff --check` no seu computador. Nenhum `add`, `commit`, `push`, `pull`, `merge`, `reset` ou `checkout`.

- **Da Fase G.1 no `git status`:**
  - `M`: `next.config.ts`, `package.json`, os 2 docs, as páginas `adaptive` e `homologation`, `homologation.actions.ts`, `concurso.action.ts`, `target.action.ts`, `import-history.actions.ts`, `study-history.constants.ts` e os 2 testes alterados;
  - `D`: as 3 páginas e os 2 gráficos;
  - `??`: `homologation-access.ts` e `.test.ts`, `legacy-routes.ts` e `.test.ts`.
- `git diff --stat` mostra 379 arquivos: é o total da árvore de trabalho, incluindo as fases anteriores ainda sem commit.
- **`git diff --check`:** as ocorrências são os `\r` de fim de linha de arquivos que já estavam em CRLF na árvore de trabalho. Nos arquivos alterados nesta fase, o check com `core.whitespace=cr-at-eol` não acusa nada. `homologation.actions.ts` continua em CRLF como já estava; como o arquivo cresceu, entram 2 linhas a mais nessa contagem.
