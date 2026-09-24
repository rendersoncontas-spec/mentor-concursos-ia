# NomeIA — Fase F.2 — Performance final sem mudança de schema

Data: 24/09/2026 · Escopo:
- refresh duplicado após salvar;
- payload do Histórico;
- histórico lido pelo Dashboard;
- reutilização de dados.

**O que não foi alterado:**
- banco: nenhuma migration, RPC, função SQL, índice ou alteração de tabela;
- limite do PostgREST (continua 1.000);
- Cycle Engine, cursor, volta e progresso;
- fila offline, `operationId`, idempotência;
- autenticação, login Google;
- design e layout.

Não houve teste visual manual. Nada foi enviado ao GitHub: sem commit, push, add ou merge.

## Validação

| Item | Resultado |
|---|---|
| `npm ci --ignore-scripts` | exit 0 |
| `npm test` | **1.033/1.033 passando, 0 falhas** (eram 1.007; +26 testes) |
| `npx tsc --noEmit` | **0 erros** |
| `npm run build` | **sucesso**: compilado em 35,2 s, 36/36 páginas |
| ESLint | 271 erros / 42 avisos, **idêntico ao início da fase** (comparado regra por regra; nenhum novo) |
| Sincronização com a sua pasta | md5 de `src` = `966b28559695b95e11259407d6364933` e `package.json` = `5474900c…` nos dois lados |

---

# CORRIGIDO

## 1. Refresh duplicado após salvar um estudo (Prioridade 1)

### 1.1 Auditoria dos emissores

| Emissor | Salvamento confirmado? | `router.refresh()`? (antes) | Dispara SAVED? | Observação |
|---|---|---|---|---|
| Modal de registro, **edição** | sim (`updateStudySessionAction`) | sim | sim | a action chama `revalidatePath` (HISTORY_PATHS) |
| Modal de registro, **criação com cronômetro** | sim, se não ficou pendente | sim (sempre) | sim, se não ficou pendente | pendente → só QUEUED |
| Modal de registro, **lançamento manual** | sim, se não ficou pendente | sim (sempre) | sim, se não ficou pendente | pendente → só QUEUED |
| Cronômetro (`active-session-runner`) | sim, se não ficou pendente | sim (sempre) | sim, se não ficou pendente | — |
| `study-provider` | enfileira ou salva (quem chama decide) | não | **não** (só QUEUED) | — |
| Ponte de sincronização offline | sim (ao sincronizar) | **não** | sim | a exceção pedida na fase |
| Planejamento diário (concluir bloco / puxar pendência) | não é um estudo; evento sem detalhe | não | sim | usado para recarregar replanejamento |

### Consumidores de `STUDY_SESSION_SAVED_EVENT`

| Consumidor | O que faz |
|---|---|
| Histórico | upsert local, sem ida ao servidor |
| "Foco de hoje" | `getActiveCycleAction` |
| "Estudos de hoje" | `getRecentStudyHistoryAction(14)` |
| Planejamento diário, semanal e calendário mensal | `getReplanInfoAction` e meta do período. **Esses dados não vêm da página no servidor**, então continuam sempre atualizando. |

### Duplicação encontrada (maior do que a registrada na F.1)

No Next 16.2.10, conferido no código-fonte instalado:
- `server-action-reducer.js`: `FreshnessPolicy.RefreshAll`;
- `action-handler.js`: `skipPageRendering` só quando nada foi revalidado.

Ou seja, uma Server Action que chama `revalidatePath` **já devolve a página atual re-renderizada na própria resposta**. Salvar e editar estudo sempre revalidam. Por isso, ao salvar um estudo online no Dashboard, acontecia:

1. **renderização nº 1** da página, na resposta da action (6 loaders, incluindo o histórico inteiro);
2. **renderização nº 2** da página, pelo `router.refresh()` do modal ou cronômetro (os mesmos 6 loaders de novo);
3. **Server Action extra** de "Foco de hoje" (`getActiveCycleAction`, que lê as 933 sessões do ciclo);
4. **Server Action extra** de "Estudos de hoje" (`getRecentStudyHistoryAction(14)`).

### Solução (pequena e retrocompatível)

- `dispatchStudySessionSaved(session, { serverRefresh: true })`: o detalhe do evento ganha **só** o campo `serverRefresh: true` quando o salvamento foi confirmado online.
  - Sem a opção, o evento é idêntico ao de sempre (`{ session }`).
  - A ponte offline não passa a opção.
  - Nenhum evento novo foi criado, e o `operationId` e a fila não mudaram.
- `shouldWidgetRefreshOnSaved(event, serverBacked)`: o widget só dispensa a própria busca quando o dado dele vem da página no servidor **e** o evento avisou do refresh. Nos demais casos (sync offline, evento sem detalhe, chave ausente) ele atualiza sozinho, como antes.
- `useCachedServerAction` agora **adota** os dados novos que a página traz do servidor após uma re-renderização. Antes, só os usava na montagem. Também retorna `serverBacked`.
- `router.refresh()` foi removido **apenas** depois de um salvamento/edição **confirmado no servidor**. No caminho offline (pendente), continua exatamente como antes.
- `/ciclos` e `/estatisticas` passam a aceitar os dados novos da página re-renderizada (antes ficavam com os números antigos até recarregar).

### Chamadas duplicadas eliminadas (por estudo salvo online no Dashboard)

| Item | Antes | Agora |
|---|---|---|
| Renderizações completas da página (6 loaders cada) | 2 | **1** |
| Server Action "Foco de hoje" (`getActiveCycleAction`) | 1 | **0** (o dado chega na resposta da action) |
| Server Action "Estudos de hoje" (`getRecentStudyHistoryAction`) | 1 | **0** |
| Replanejamento e meta do período (Planejamento embutido) | 1 + 1 | 1 + 1 (não é duplicado; não vem do servidor) |

Em **qualquer outra página**, salvar ou editar online elimina 1 renderização completa (o `router.refresh()`).

No **Histórico**, fechar o modal (salvando ou cancelando) **não recarrega mais as ~2.800 sessões**. O estudo salvo entra pela lista via SAVED/QUEUED com a linha real do banco, o mesmo mecanismo que já valia para o botão flutuante global.

Efeito colateral positivo: o calendário do Dashboard passa a se atualizar após salvar. Antes ficava até 5 min com o cache antigo.

Estes números são **contagens de chamadas pelo código**, não tempos medidos.

### Testes

`study-session-refresh-dedupe.test.ts` (14 testes):
1. estudo online → o widget não repete a action;
2. estudo offline sincronizado → o widget atualiza 1×;
3. sync sem `router.refresh()` → o widget atualiza;
4. 1 estudo = 0 buscas extras nos 2 widgets.

Também cobre:
- evento sem detalhe (Planejamento) continua atualizando;
- widget sem dado do servidor continua buscando;
- evento retrocompatível;
- wiring: 3 SAVED com aviso no modal, 1 no cronômetro, ponte sem aviso, e `router.refresh()` só em `wasPending` / `res.pending`;
- Histórico e Planejamento continuam reagindo a todo SAVED;
- as actions de salvar e editar revalidam;
- um teste de **premissa do Next**: se uma atualização do Next mudar esse comportamento, o teste falha e o `router.refresh()` precisa ser reavaliado.

O teste de wiring existente do "Foco de hoje" foi ajustado para aceitar o import com um nome a mais.

**Ponto para o seu teste manual:** a remoção do `router.refresh()` foi comprovada pelo código-fonte do Next instalado, não observada em navegador. Confira depois de salvar um estudo no Dashboard:
- KPIs;
- Foco de hoje;
- Estudos de hoje;
- calendário.

Faça o mesmo em /ciclos e /estatisticas.

## 2. Histórico: payload enxuto (Prioridades 2 e 5)

**Campos da lista** (mapeados no código da tela, dos filtros, do agrupamento e dos totais):
- `id`, `started_at`, `duration_minutes`, `discipline_id`, `study_type`, `technique`, `origin_source`, `origin_source_name`, `import_batch_id`;
- `created_at` só quando `started_at` é nulo (é o fallback de ordenação; hoje nenhuma sessão tem `started_at` nulo);
- do `metadata`, só as chaves usadas: `focus_percentage`, `questions_answered`, `questions_correct`, `pages_read`, `imported_seconds`, `flashcards_reviewed`, `flashcards_correct`. Vêm do banco pelo caminho JSON (`metadata->chave`), sem o objeto inteiro;
- disciplina (`id`, `name`, `area`) **uma vez por disciplina**, num mapa. A tela remonta o mesmo objeto `disciplines` de cada linha.

**Campos removidos da listagem:**
- `user_id`, `finished_at`, `active_minutes`, `paused_minutes`, `planned_minutes`;
- `completed`, `interrupted`, `energy_level`, `difficulty`, `focus_score`, `mood`, **`notes`**;
- `study_source`, `origin_imported_at`, `client_operation_id`, `study_plan_item_id`;
- o **`metadata` completo**: tópico, áudio, linha bruta de importação etc.;
- a disciplina repetida em cada sessão.

**Payload:** medido com SQL no banco real, sobre as 2.797 sessões do usuário principal, montando o mesmo JSON que cada versão envia:

| | Bytes (JSON) |
|---|---|
| **Antes**: `select *` + disciplina por linha | **2.809.166** (~2,8 MB) |
| **Agora**: linhas enxutas + mapa de disciplinas | **1.085.433 + 4.393** (~1,09 MB), **−61%** |

A medição cobre o conteúdo JSON. O tamanho exato no fio (codificação RSC e compressão) aparece na linha `[perf]` da action (`payloadBytes`) quando você rodar `npm run dev`. Esse número eu não tenho.

**Edição:** ao clicar em "Editar", a tela chama `getHistorySessionForEditAction(id)`. Ela busca **a linha completa daquela sessão** (`*` + disciplina, só do próprio usuário) e só então abre o modal. Se a busca falhar, o modal **não abre com dados parciais**, porque o modal espalha o `metadata` inteiro no update, e salvar com dados parciais apagaria campos. Custo: 1 leitura pequena ao clicar em Editar, em vez de trazer 2.797 linhas completas para permitir edições futuras.

**Preservado:**
- filtros, ordenação (`started_at` desc, `id` desc), agrupamento por dia, totais;
- renderização progressiva (~150 registros, "Mostrar dias anteriores");
- itens pendentes offline;
- SAVED/QUEUED/OFFLINE_RESOLVED;
- exclusão.

**Testes:** `history-list-payload.test.ts` (9 testes), com as mesmas 2.797 sessões nas duas versões:
- mesma ordem, mesmos campos exibidos, mesmos totais e mesmos grupos por dia;
- **12 combinações de filtros** dão as mesmas sessões e os mesmos totais;
- payload menos da metade, sem `notes`, sem `metadata` completo e sem `user_id`;
- o SELECT não pede `*`;
- paginação acima de 1.000;
- a edição recebe a linha completa e só do próprio usuário;
- a tela não abre o modal com dados parciais;
- pendentes e eventos continuam tratados.

O banco falso dos testes passou a projetar colunas e caminhos JSON como o PostgREST.

## 3. Dashboard sem RPC (Prioridade 3)

**Já limitados:**
- últimos 14 dias (61 sessões);
- totais diários do mês;
- estatísticas do mês;
- atividades recentes (5).

**Exigem histórico completo** (sem RPC não há como evitar):
- acertos "Total" e "Ano";
- maior sequência;
- maior sessão;
- rankings por disciplina e área;
- heatmap;
- minutos e acertos por disciplina.

**Otimização segura aplicada:**
- do `metadata` dessas ~2.790 sessões, o Dashboard só usa `questions_answered` e `questions_correct`. O Analytics Engine não lê `metadata` (verificado por teste);
- a leitura passou a pedir só essas duas chaves (opção `metadataKeys` em `getStudyHistoryForAnalytics`). Sem a opção, os outros usos (análises, Mentor) não mudam;
- medido no banco real: **1.532.819 → 1.301.897 bytes (−15%)**, do banco para o servidor. Esse volume não chega ao navegador;
- testes (`dashboard-analytics-metadata.test.ts`, 3 testes) cobrem mesmas linhas, ordem e campos, e acertos por período e por disciplina **idênticos**.

## 4. Reutilização de dados (Prioridade 4)

**Corrigido:**
- widgets do Dashboard reutilizam os dados da página re-renderizada, em vez de buscá-los de novo (item 1);
- /ciclos e /estatisticas reutilizam os dados que a própria página já traz após salvar;
- o Histórico não recarrega tudo ao fechar o modal.

**Auditado sem duplicação relevante:**
- **Sessão:** usuário e perfil da sessão são resolvidos 1× por requisição (React `cache`, Fase F).
- **Layout:** não dispara nenhuma action ao montar.
- **Ciclos:** o ciclo ativo sai da lista (F.1); as disciplinas do autocomplete não releem o ciclo.
- **Planejamento:** as visões diária, semanal, mensal e de metas não ficam montadas ao mesmo tempo, então cada uma faz suas próprias leituras sem repetir.
- **Estatísticas:** carregam no servidor e não repetem no cliente.

**Encontrado, não alterado** (ganho não comprovado, porque as consultas já rodam em paralelo):
- no Dashboard, o plano ativo é lido 2× em paralelo (`getCycleOverviewData` e `getTodayStudyItems`);
- os totais diários do mês e as estatísticas do mês leem a mesma janela do mês 2× em paralelo (~130 linhas cada);
- unificar essas leituras não reduziria o tempo de página, só a carga no banco.

## 5. Medições `[perf]` (Prioridade 6)

Não consigo gerar as linhas `[perf]` reais: exigem abrir as páginas logado, e não posso entrar como usuário. O acesso de rede ao Supabase a partir da nuvem e do shell do seu computador também está bloqueado. **Não há números de tempo antes/depois nesta fase.** O que há de medido:
- payload do Histórico: 2,81 MB → 1,09 MB, medido com SQL;
- leitura de analytics do Dashboard: 1,53 MB → 1,30 MB, medido com SQL;
- contagem de chamadas após salvar, pelo código: 2 renderizações + 2 actions → 1 renderização + 0 actions.

Como coletar os tempos reais: rode `npm run dev`, abra /dashboard e /dashboard/history e salve um estudo. O terminal mostra:
- `[perf] {"kind":"page","route":"/dashboard",…}`, com os loaders e as linhas;
- `[perf] {"kind":"action","action":"getHistoryListAction (/dashboard/history)",…,"rows":…,"payloadBytes":…}`;
- `[perf] {"kind":"proxy",…}`.

Após salvar, deve aparecer **uma** linha `kind:"page"` para /dashboard, em vez de duas, e nenhuma action de ciclo ativo ou de estudos de 14 dias.

## 6. Proteções que continuam valendo

- Nenhuma leitura nova ultrapassa 1.000 sem paginação. A lista do Histórico pagina (testado com 3.500 linhas).
- Os testes de truncamento da F.1 seguem verdes.
- Dados de ciclo: os mesmos leitores da F.1, com os testes de ciclo verdes. Nenhum arquivo do Cycle Engine foi alterado nesta fase.

---

# FUTURO — EXIGE BANCO/RPC

1. **Agregados do Dashboard no banco** (RPC `dashboard_aggregates(user, tz)`): minutos, sessões, questões e acertos por dia/disciplina e maior sessão. Trocaria ~2.790 linhas (~1,3 MB por abertura e por salvamento) por algumas centenas de linhas.
2. **Histórico paginado no banco:**
   - RPC `history_page(filtros, cursor)` + RPC `history_totals(filtros)`, com filtros de foco/duração e dia no fuso de SP em SQL, e paginação por cursor (`started_at`, `id`);
   - os dropdowns de disciplina e origem viriam de uma consulta própria;
   - só isso elimina de vez o 1,09 MB que ainda vai ao navegador.
3. **Janela do mês compartilhada**: uma única leitura/RPC para totais diários e estatísticas do mês. O ganho é pequeno, porque já rodam em paralelo.

# FUTURO — SEM BANCO (não feito, ganho não comprovado)

- **Replanejamento no Dashboard:** o Planejamento embutido no Dashboard ("Estudos de hoje") busca replanejamento e meta da semana no navegador depois de carregar. Poderia vir da página no servidor, mas `getReplanInfo` é pesado e deixaria a página esperar por ele.
- **Sincronização offline:** ao sincronizar, a action de salvar também revalida e re-renderiza a página, e os widgets ainda buscam por conta própria. Isso foi mantido de propósito, conforme a regra da fase.
- **Proxy `getUser()`** em toda requisição (registrado na F.1): não alterado, porque autenticação estava fora do escopo.

## Git (somente leitura, executado na sua pasta)

- `git status --short`: 384 entradas. Inclui as fases anteriores não commitadas; os 4 arquivos novos desta fase aparecem como `??`.
- `git diff --stat`: 342 arquivos, +26.190 / −24.954 (acumulado desde o último commit).
- `git diff --check`: 38.858 linhas, o mesmo ruído de CRLF das fases anteriores. Nos 21 arquivos desta fase **não há espaço em branco novo no fim de linha** (conferido arquivo a arquivo), e os arquivos CRLF continuam CRLF.
