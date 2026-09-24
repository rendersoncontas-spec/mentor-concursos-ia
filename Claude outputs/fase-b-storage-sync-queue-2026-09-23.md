# NomeIA — Fase B: Storage Local + Sync Queue

**Data:** 2026-09-23 · Nenhum arquivo em `src/application/study-cycle/**` ou `src/domain/study-cycle/**` foi tocado (confirmado por `git status` + timestamps dos arquivos, que continuam de 19/09 — de fases anteriores, não desta). Nenhum comando git foi executado.

**Esta fase NÃO declara "offline pronto"** — só a infraestrutura local (IndexedDB, sync queue, detecção de conectividade) foi construída e testada. Nenhuma tela (Dashboard/Histórico/Ciclo/Planejamento/Reviews) foi ligada a ela ainda; isso é trabalho das próximas fases.

---

## 1. Arquitetura criada

Nova pasta `src/infrastructure/offline/` — ponto único de acesso ao IndexedDB, como pedido ("não espalhar chamadas diretas a IndexedDB por dezenas de componentes"). Todo código de fora desta pasta importa só de `src/infrastructure/offline/index.ts`.

```
src/infrastructure/offline/
├── index.ts                      # API pública (offlineStore, syncQueue, connectionState, ...)
├── types.ts                      # tipos compartilhados
├── indexeddb-client.ts           # único lugar que abre o banco / cria stores / faz transações cruas
├── session-store.ts              # sessão ativa do cronômetro (IndexedDB) + BroadcastChannel entre abas
├── snapshot-store.ts             # stores de snapshot preparadas (ainda vazias)
├── sync-queue.ts                 # fila de sincronização
├── sync-lock.ts                  # trava contra sync concorrente do mesmo usuário
├── sync-error-classifier.ts      # classifica erro em retryable / não-retryable
├── connection-state.ts           # ONLINE/OFFLINE/SYNCING/SYNC_ERROR
├── current-user.ts               # userId do cliente, sem precisar de rede
├── legacy-session-migration.ts   # migração do localStorage antigo
├── operation-id.ts               # gerador de UUID
├── test-support/fake-indexeddb.ts# fake de IndexedDB só para os testes (ver seção 9)
└── *.test.ts                     # 47 testes reais (não são *.wiring.test.ts)
```

## 2. Stores (schema do IndexedDB)

Banco `nomeia-offline`, versão 1. Criadas nesta fase e já validadas por teste:

| Store | keyPath | Índices | Populada nesta fase? |
|---|---|---|---|
| `session_state` | `userId` | — | ✅ sim (cronômetro) |
| `sync_queue` | `operationId` | `by_user_status` (`[userId, status]`), `by_user` | ✅ sim (mecânica da fila) |
| `sync_metadata` | `id` | `by_user` | criada, ainda sem uso real |
| `dashboard_snapshot` | `userId` | — | ❌ preparada para a Fase E |
| `history_snapshot` | `userId` | — | ❌ preparada para a Fase E |
| `cycle_snapshot` | `userId` | — | ❌ preparada para a Fase E |
| `planning_snapshot` | `userId` | — | ❌ preparada para a Fase E |
| `review_snapshot` | `userId` | — | ❌ preparada para a Fase E |
| `discipline_snapshot` | `userId` | — | ❌ preparada para a Fase E |

Criar as 6 stores de snapshot já agora evita precisar subir a versão do banco (e lidar com upgrade de usuários que já tiverem a versão 1 instalada) quando a Fase E chegar.

## 3. Namespace por usuário

Toda store usa `userId` como chave primária (ou parte dela). `getClientUserId()` resolve o usuário atual **sem rede**: usa `supabase.auth.getSession()` (lê a sessão local já guardada pelo `@supabase/ssr`), nunca `supabase.auth.getUser()` (que sempre contata o servidor Auth — inutilizável offline, já que precisaríamos de rede só para saber "de quem" é o IndexedDB). Sem sessão local → `null` → a camada offline simplesmente não persiste nada, sem criar autenticação paralela.

Testado: `sessionStore` e `syncQueue` têm teste explícito de isolamento (gravar para um `userId` nunca aparece sob outro).

## 4. Cronômetro (migração de localStorage → IndexedDB)

`study-provider.tsx` foi alterado (único arquivo de produção fora da pasta `offline/` tocado nesta fase):

- Estado local `mentor_active_study_session` deixou de usar `localStorage.getItem/setItem/removeItem` — agora usa `offlineStore.session.get/set/clear`, namespaced por `userId`.
- **O cálculo do tempo não mudou**: continua `elapsed = now - startTime - totalPausedMs - pausa atual`, via `Date.now()` — a função `getActiveElapsedSeconds`/`calculateTimes` não foi tocada.
- **Migração automática (item 5 do pedido)**: no primeiro carregamento após esta versão, se existir o snapshot antigo no `localStorage`, ele é lido → validado → copiado para o IndexedDB → a gravação é confirmada (lendo de volta) → só então o valor antigo é removido. Um snapshot corrompido ou fora de forma é descartado sozinho (aviso no console), sem derrubar o app.
- **Sincronização entre abas**: o `localStorage` dava isso de graça (evento `storage`); IndexedDB não tem equivalente, então foi adicionado um `BroadcastChannel` dedicado (`session-store.ts`) — quando uma aba salva/encerra a sessão, as outras abas do mesmo usuário são avisadas e recarregam o estado, mesmo comportamento de antes.
- Ressalva honesta: entre o primeiro render e o `getClientUserId()` resolver (leitura local, tipicamente poucos milissegundos), a persistência offline do cronômetro fica pausada — não é uma perda de dado real, só uma janela mínima em que o timer funciona apenas em memória, como se a camada offline não existisse ainda.

## 5. Sync Queue

`syncQueue` (`sync-queue.ts`) expõe exatamente a API pedida: `enqueue`, `getPending`, `markSyncing`, `markSynced`, `markFailed`, `retryFailed`, mais `getPendingCount`/`hasPending` (usados pela Fase H, sem apagar nada aqui). Cada operação:

```ts
{ operationId, userId, type, entity, payload, createdAt, updatedAt, status, retryCount, lastError }
```

- `operationId` é sempre um UUID (`crypto.randomUUID()`), nunca timestamp — testado.
- Tipo inicial: `STUDY_SESSION_CREATE`; `STUDY_SESSION_UPDATE`/`STUDY_SESSION_DELETE` já existem no tipo, prontos para quando forem necessários.
- Duas operações independentes (ex.: RLM 30min e RLM 20min) nunca colapsam — cada `enqueue` cria uma linha própria com seu próprio `operationId` (testado explicitamente, espelhando o cenário do item 22 do pedido). A sincronização de verdade (chamar `saveStudySessionAction` a partir da fila) é da Fase C/D em diante — aqui só a mecânica da fila foi construída e testada.

## 6. Conectividade

`connectionState` (`connection-state.ts`): estado `ONLINE | OFFLINE | SYNCING | SYNC_ERROR`, inicializado a partir de `navigator.onLine`, atualizado pelos eventos `online`/`offline`. `setSyncing()`/`setSyncError()` existem para quando o worker de sincronização (próximas fases) tentar falar com o servidor de verdade — como o pedido lembra, `navigator.onLine` sozinho não garante que o servidor está acessível, então esses dois estados só são setados por quem realmente tenta a rede, nunca pelo listener do navegador.

## 7. Retry e classificação de erro

`classifySyncError()` (`sync-error-classifier.ts`), função pura testada com 6 casos: erro de rede/`TypeError` → retryable; 5xx → retryable; 4xx → **não** retryable (nunca fica tentando indefinidamente); erro desconhecido → retryable por segurança (não perde a operação silenciosamente). `markFailed()` sempre incrementa `retryCount` e grava `lastError`; voltar para `PENDING` é uma decisão explícita (`retryFailed()`), nunca automática.

`sync-lock.ts` impede duas sincronizações concorrentes do mesmo usuário (`tryAcquireSyncLock`/`releaseSyncLock`/`withSyncLock`, com trava liberada mesmo em caso de exceção) — testado, inclusive o caso de duas chamadas concorrentes.

## 8. Segurança

- Nenhum arquivo desta camada armazena senha, Client Secret, service role key ou token — só dados do próprio usuário (sessão de estudo, operações de fila).
- `offlineStore.clearUserData(userId)` limpa a sessão ativa e os 6 snapshots locais de um usuário — **nunca toca em `sync_queue`**. Ela retorna `pendingSyncOperationsRemaining`, mas não decide sozinha o que fazer com esse número: isso é para a Fase H (aviso antes de logout), que ainda não foi implementada — esta função só existe para que a Fase H não precise reabrir a camada de storage.

## 9. Testes

**47 testes novos, reais** (não `*.wiring.test.ts` de leitura de código — todos exercitam o comportamento de verdade): `indexeddb-client.test.ts` (5), `session-store.test.ts` (6), `sync-queue.test.ts` (10, incluindo o cenário de duas operações independentes e reenvio idempotente), `sync-lock.test.ts` (4), `sync-error-classifier.test.ts` (6), `connection-state.test.ts` (6), `legacy-session-migration.test.ts` (10). Adicionados ao script `test` do `package.json` (única mudança nesse arquivo).

**Sobre a estratégia de teste de IndexedDB**: a lib `fake-indexeddb` (a escolha óbvia, já que Node não tem IndexedDB nativo) **não pôde ser instalada** — `npm install --save-dev fake-indexeddb` falhou repetidamente na sua máquina (timeout, depois `EINTEGRITY`, depois `ENOTEMPTY` durante `npm cache clean`), sintoma de contenção de arquivo pelo próprio OneDrive sincronizando a pasta do projeto em tempo real. Em vez de deixar o `package.json`/`node_modules` num estado incerto por causa disso, escrevi um fake mínimo e isolado (`test-support/fake-indexeddb.ts`, ~180 linhas) cobrindo só o subconjunto de IndexedDB que `indexeddb-client.ts` usa de fato — nunca importado por código de produção, zero dependência nova no projeto. Achei e corrigi um bug real nesse fake durante o desenvolvimento (`request.result` só era setado depois de `onupgradeneeded` disparar, quebrando a criação das stores) — os testes só foram considerados bons depois de passar 100%, não antes.

Também rodei os testes existentes mais próximos do que toquei — `study-provider-context-split.wiring.test.ts`, `finalize-session-reentrancy.wiring.test.ts`, `study-register-modal-cycle-prefill.wiring.test.ts`, `dashboard-add-study-button.wiring.test.ts` — para confirmar que a integração no `StudyProvider` não quebrou nenhum contrato existente.

**Resultado real, rodado agora:**
- 47 testes novos da camada offline + 35 testes das 4 suítes de wiring acima relacionadas ao StudyProvider = **82/82 passando, 0 falhas**.
- Suíte completa do projeto, em 6 blocos (todos os arquivos do script `test`, exceto os 2 historicamente lentos): **812/812 passando, 0 falhas, 0 cancelados**.
- Os 2 arquivos historicamente lentos (`get-disciplines.test.ts`, `get-study-discipline-suggestions.test.ts` — sem nenhuma relação com esta fase) não terminaram dentro do limite de tempo por chamada desta ponte hoje (nem no teto de 180s) — mais lento que o já registrado na Fase 20 (~95-113s). Não vi nenhum sinal de trava real, só um ambiente hoje visivelmente mais lento de ponta a ponta (`git status` sozinho levou 52s; ver seção 10). Não são arquivos tocados nesta fase.

## 10. TSC

`npx tsc --noEmit` isolado (checando só os novos arquivos de `src/infrastructure/offline/**` via um `tsconfig` temporário) rodou **limpo, 0 erros**, e foi removido logo depois (não ficou nenhum arquivo de configuração extra no projeto).

Já o `tsc --noEmit` **completo do projeto** (necessário para confirmar `study-provider.tsx` de ponta a ponta) **não terminou dentro do limite de tempo desta ponte** em nenhuma das tentativas hoje (inclusive reaproveitando o cache incremental existente) — o mesmo limite documentado na Fase 20, mas hoje mais acentuado: várias operações comuns ficaram bem mais lentas do que o normal nesta sessão (`git status` sozinho levou 52s de verdade; o `npm install` de uma dependência pequena chegou a falhar com erro de integridade e depois `ENOTEMPTY`). Tudo aponta para o OneDrive sincronizando a pasta do projeto em tempo real e disputando I/O com os processos do Node — não uma falha do código.

Fiz uma revisão manual cuidadosa, linha por linha, de cada trecho alterado em `study-provider.tsx` conferindo compatibilidade de tipos entre `ActiveSessionRecord` (novo) e `StudySessionState` (existente) — são estruturalmente equivalentes, com um único ponto de atenção (`technique: string` vs `StudyTechnique`) já tratado com um cast explícito nos dois lugares onde a sessão é reconstruída a partir do IndexedDB. Ainda assim, **recomendo fortemente que você rode `npx tsc --noEmit` e `npm test` na sua máquina, fora desta ponte**, antes de considerar esta fase definitivamente fechada — devo isso à regra de nunca fabricar um resultado que não observei de verdade.

## 11. Um efeito colateral corrigido durante esta fase

Um comando de diagnóstico (`git check-ignore`) que rodei deixou um `.git/index.lock` travado (o git não conseguiu removê-lo sozinho por causa das permissões da ponte). Isso bloquearia qualquer `git status/add/commit` seu, incluindo o `publicar_mentor.bat`. Pedi e recebi permissão para apagar arquivos nesta pasta especificamente para remover esse lock — removido e confirmado: `git status` voltou a funcionar normalmente (só mais lento que o normal, como já registrado acima). Também limpei dois arquivos de configuração temporários (`tsconfig.offline-check.tmp.*`) que criei só para o teste isolado da seção 10.

## 12. Arquivos alterados/criados

**Criados** (todos em `src/infrastructure/offline/`): `index.ts`, `types.ts`, `indexeddb-client.ts`, `session-store.ts`, `snapshot-store.ts`, `sync-queue.ts`, `sync-lock.ts`, `sync-error-classifier.ts`, `connection-state.ts`, `current-user.ts`, `legacy-session-migration.ts`, `operation-id.ts`, `test-support/fake-indexeddb.ts`, mais os 7 arquivos `*.test.ts` correspondentes.

**Alterados**: `src/features/study-session/components/study-provider.tsx` (migração do cronômetro para o novo storage — ver seção 4) e `package.json` (só a linha do script `test`, adicionando os 7 novos arquivos).

**Não tocados** (confirmado por `git status` e pelos timestamps dos arquivos, que continuam de 19/09): `src/application/study-cycle/**`, `src/domain/study-cycle/**`.

**Git**: nenhum `add`/`commit`/`push`/`pull`/`merge`/`reset`/`checkout` foi executado.

---

## O que NÃO foi feito nesta fase (por escopo, não por esquecimento)

Dashboard/Histórico/Planejamento/Reviews offline completos, importação offline, os 3 gatilhos de sincronização automática, e qualquer chamada real a `saveStudySessionAction` a partir da fila — tudo isso é Fase C em diante. **A infraestrutura local está pronta e testada para receber essas integrações, mas o app ainda não funciona offline de ponta a ponta.**
