# NomeIA — Fase A: Auditoria da Arquitetura Atual (pré Offline-First)

**Data:** 2026-09-23 · Nenhum arquivo foi alterado nesta fase — apenas leitura/mapeamento, como pedido.

---

## Resumo executivo

Hoje o NomeIA é **instalável** (manifest válido, ícones prontos) mas **não tem nenhuma camada offline real**: zero Service Worker, zero IndexedDB, zero fila de sincronização, zero detecção online/offline em qualquer lugar do código (confirmado por busca no `src` inteiro — nenhuma ocorrência de `navigator.onLine`, `indexedDB`, `openDB(`, `SyncQueue` ou equivalente). Tudo precisa ser construído do zero, mas duas peças centrais já ajudam bastante: o cronômetro já é calculado por timestamps (não por `setInterval` acumulando) e o salvamento de estudo (cronômetro + manual) já passa por um único ponto de entrada. Isso reduz bastante o risco da Fase C/D.

## 1. PWA existente

- **Manifest:** real e funcional — `src/app/manifest.ts` (rota dinâmica do Next.js App Router, `MetadataRoute.Manifest`), servido em `/manifest.webmanifest` e referenciado em `src/app/layout.tsx` (`metadata.manifest`). `display: "standalone"`, `start_url: "/dashboard"`, ícones normais + maskable já existem em `public/`.
- **Service Worker:** **não existe.** Nenhum arquivo `sw.js`/`service-worker.*`, nenhuma chamada a `navigator.serviceWorker`, nenhuma dependência de PWA (`next-pwa`, `workbox`, `vite-plugin-pwa`) no `package.json`.
- **Conclusão:** o app é "instalável" (o navegador oferece "Adicionar à tela inicial" por causa do manifest), mas hoje, sem internet, ele se comporta como qualquer site comum — a navegação falha se o Next não conseguir responder.

## 2. Storage local existente

- **Nenhum IndexedDB.** Nenhuma lib (`idb`, `dexie`, `localforage`) instalada.
- **localStorage é usado, mas só para dois propósitos pontuais**, ambos dentro de `study-provider.tsx`:
  - `mentor_active_study_session` — snapshot da sessão de cronômetro ativa (ver seção 3).
  - `mentor-floating-timer-enabled` — preferência de UI (liga/desliga o timer flutuante).
- Não há "banco local" nenhum para histórico, ciclo, dashboard, planejamento ou catálogo de disciplinas. Tudo isso hoje vem sempre do servidor, a cada carregamento.

## 3. StudyProvider / StudyLiveContext / StudyActionsContext

Arquivo: `src/features/study-session/components/study-provider.tsx` (808 linhas). Já é dividido em dois contexts (otimização de re-render, não relacionada a offline):

- **`StudyLiveContext`** — só `session` (muda a cada segundo) e `formatTime`.
- **`StudyActionsContext`** — ações estáveis (`startSession`, `pauseSession`, `resumeSession`, `endSession`, `finalizeAndSaveSession`, etc.) + `sessionSummary` memoizado, que só muda quando algo relevante muda (não a cada tick).
- **`useGlobalStudy()`** combina os dois (compatibilidade); **`useStudyActions()`** é o hook enxuto para quem só precisa de ações/flags.

**Achado importante para a Fase C — o cronômetro já é "offline-safe" por design:**

```ts
// getActiveElapsedSeconds() — já é exatamente o modelo pedido no item 9 do brief
elapsed = now - startTime - totalPausedMs - (pausa em andamento)
```

O estado (`startTime`, `totalPausedMs`, `lastPauseStartTime`, `phase`) é persistido em `localStorage` a cada mudança e recalculado por `Date.now()` sempre que a página é lida — nunca por incremento de contador. Ou seja: fechar o navegador, ficar sem internet e reabrir **já não zera o tempo hoje**, porque o cronômetro nunca dependeu de rede nem de `setInterval` acumulando — só a persistência troca (de `localStorage` para IndexedDB, se optarmos por unificar o storage na Fase C).

**O que falta:** só o passo de **salvar** (`finalizeAndSaveSession`) depende de rede — ele chama uma Server Action que precisa de HTTP. É aqui que entra a fila de sincronização.

## 4. Ponto único de salvamento (cronômetro E lançamento manual)

`finalizeAndSaveSession()` (em `study-provider.tsx`) monta um snapshot e chama:

```ts
saveStudySessionAction(snapshot) // "use server", em src/application/study-session/study-session.action.ts
```

Essa mesma Server Action atende **os dois casos** — cronômetro (`is_manual_mode: false`, calcula minutos a partir de `sessionStartTime`/`sessionTotalPausedMs`) e lançamento manual (`is_manual_mode: true`, usa `activeMinutes`/`pausedMinutes` e `study_date`/`study_time` já prontos). Fluxo interno:

1. `supabase.auth.getUser()` (precisa de rede)
2. resolve `discipline_id` (busca por nome se necessário)
3. `insert` em `study_history`
4. `registerStudyToCycle()` — **motor oficial do ciclo, `src/application/study-cycle/**`, bloqueado pela regra absoluta**
5. `revalidatePath(...)` em 6 rotas

Chamadores confirmados: `study-provider.tsx` (cronômetro) e `study-register-modal.tsx` (lançamento manual — mesmo modal reaproveitado por Dashboard/Histórico/Disciplina/Edital/Planejamento, ver Fase 19). **Um único ponto de interceptação resolve cronômetro e lançamento manual ao mesmo tempo.**

## 5. `STUDY_SESSION_SAVED_EVENT`

`src/features/study-session/lib/study-session-events.ts` — evento DOM global (`window.dispatchEvent`) disparado após salvar/editar uma sessão com sucesso, carregando a sessão salva no `detail`. Consumido por:

- `dashboard-widget-catalog.tsx`
- `history-view.tsx`
- `daily-planning-view.tsx`, `study-calendar-view.tsx`, `weekly-planning-view.tsx`
- `intelligent-cycle-widget.tsx`

Esse é o mecanismo atual de "atualizar a tela sem F5" — cada view escuta o evento e recarrega seus próprios dados do servidor. Na Fase F, quando uma operação da fila sincronizar com sucesso, faz sentido disparar esse mesmo evento (ou um irmão dele) para essas telas se atualizarem também a partir da sincronização, não só do salvamento imediato.

## 6. Como cada tela busca dados hoje (importante para os "snapshots" da Fase E)

O padrão **não é uniforme** — duas estratégias coexistem:

| Tela | Estratégia | Implicação offline |
|---|---|---|
| **Dashboard** (`/dashboard`) | Server Component `force-dynamic`: busca tudo no servidor (`getDashboardData`, `getDashboardLayoutAction`) e passa como props para `DashboardLayout` (client) | A própria navegação para `/dashboard` é uma requisição ao servidor Next. Sem Service Worker com fallback de navegação, abrir o Dashboard offline falha antes mesmo do React rodar. |
| **Ciclos** (`/ciclos`) | Página server é só uma casca; `StudyCyclesView` (`"use client"`) busca tudo em `useEffect` via Server Actions (`getCyclesAction`, `getActiveCycleAction`, `getDisciplinesForAutocomplete`) | Mais fácil de interceptar: é uma chamada assíncrona client-side que já falha "normalmente" (promise rejeitada) quando offline — dá para envolver com fallback para IndexedDB sem tocar em SSR. |
| **Histórico** (`/dashboard/history`) | Mesmo padrão: casca de servidor + `HistoryView` (client) buscando via Server Action | Igual ao Ciclos. |
| **Planejamento / Reviews** | Ainda não confirmado em detalhe nesta auditoria (não lidos linha a linha), mas os consumidores de `STUDY_SESSION_SAVED_EVENT` (`daily-planning-view.tsx`, `weekly-planning-view.tsx`, `study-calendar-view.tsx`) sugerem o mesmo padrão client-side | A confirmar na Fase E antes de implementar o snapshot dessas telas. |

**Consequência de design:** o Dashboard é o único caso "difícil" — precisa de um Service Worker com estratégia de navegação (`NetworkFirst` com fallback para o último HTML/RSC em cache, ou um app-shell mínimo) para nem sequer abrir offline. As demais telas (Ciclos, Histórico, e provavelmente Planejamento/Reviews) só precisam que a própria chamada client-side tenha um fallback para IndexedDB — mais simples e mais seguro.

## 7. React Query — não é a camada de dados

`@tanstack/react-query` ainda está no `package.json`, mas foi **removido do provider tree** numa limpeza anterior (comentário no próprio `src/components/providers.tsx`: "nenhum componente do projeto usa useQuery/useMutation/useQueryClient"). Ou seja: **não existe cache client-side genérico hoje** — cada tela gerencia seu próprio `useState`/`useEffect`. Isso confirma a recomendação do próprio brief (item 2: não adicionar biblioteca grande sem necessidade) — vamos construir uma camada de sync **pequena e isolada**, sem reintroduzir React Query só para isso.

## 8. Supabase client / autenticação

- `src/infrastructure/supabase/client.ts` — `createBrowserClient` (`@supabase/ssr`), usado nas chamadas client-side.
- `src/infrastructure/supabase/server.ts` — `createServerClient` com cookies httpOnly, usado nas Server Actions.
- Sessão de autenticação é 100% gerida pelo Supabase Auth via cookies — **não existe e não deve existir** nenhuma autenticação paralela offline (alinhado ao item 17 do brief). Se o usuário está autenticado e fica offline, a sessão de cookie continua válida localmente; qualquer chamada que precisar validar contra o servidor (`auth.getUser()` dentro da Server Action) vai falhar por rede, não por sessão inválida — é esse tipo de falha que a fila de sync precisa distinguir de um erro "de verdade".

## 9. Engine de Ciclos (fronteira intocável, reconfirmada)

`src/application/study-cycle/cycle-study-registration.service.ts` → `registerStudyToCycle()` é chamado **de dentro** de `saveStudySessionAction`, depois do insert em `study_history`. Ele e todo `src/application/study-cycle/**` / `src/domain/study-cycle/**` continuam **fora de escopo** — a camada offline nunca chama isso diretamente nem reimplementa a lógica; ela só garante que, quando a operação da fila sincronizar (ou seja, quando `saveStudySessionAction` rodar de verdade contra o servidor), o motor oficial roda exatamente como já roda hoje. Offline, o que existe é uma **projeção local** do resultado esperado (ex.: "esse estudo deve ter contribuído com X minutos para a disciplina Y do ciclo"), nunca um segundo cálculo de cursor/rounds.

## 10. O que NÃO foi encontrado (e portanto não precisa ser preservado/migrado)

- Nenhum código de fila de sincronização, mesmo rudimentar.
- Nenhuma detecção de conectividade.
- Nenhum Service Worker.
- Nenhuma tabela `sync_queue`/`operations` no banco (nada a reconciliar de uma tentativa anterior).

---

## Mapa resumido (o que a camada offline vai envolver, sem tocar)

```
UI (StudyProvider, StudyRegisterModal, StudyCyclesView, HistoryView, DashboardLayout, planning views)
        │
        ├─ cronômetro: já timestamp-based, localStorage (candidato a migrar p/ IndexedDB) ── Fase C
        │
        ├─ salvamento (cronômetro + manual): finalizeAndSaveSession() → saveStudySessionAction()
        │        └─ ÚNICO ponto de interceptação para fila offline ── Fases B/C/D
        │
        ├─ leitura de telas: Ciclos/Histórico/(Planejamento/Reviews a confirmar) = client fetch via Server Actions
        │        └─ fallback IndexedDB quando a chamada falhar ── Fase E
        │
        └─ Dashboard: SSR force-dynamic, precisa de Service Worker p/ abrir offline ── Fase E/G

saveStudySessionAction()
        └─ insert study_history → registerStudyToCycle() [MOTOR OFICIAL, INTOCÁVEL] → revalidatePath
```

---

## Próximo passo

Fase A concluída — nenhum arquivo alterado. Antes de iniciar a Fase B (storage local + sync queue), preciso confirmar duas decisões de design que impactam o restante do trabalho:

1. **Cronômetro:** manter a persistência atual em `localStorage` (já funciona offline) ou migrar para IndexedDB já na Fase C para unificar com o resto do storage offline? Recomendo migrar, para ter um único lugar de verdade e um único mecanismo de limpeza no logout (item 18/19 do brief).
2. **Dashboard offline:** confirmar que vale a pena investir no Service Worker com fallback de navegação (mais complexo) já nas fases G, ou se, para a primeira versão, é aceitável que o Dashboard exija ter sido aberto pelo menos uma vez com internet nesta sessão do navegador antes de funcionar offline (o Ciclo, Histórico e o cronômetro funcionariam offline de qualquer forma, independente dessa decisão).

Posso seguir direto para a Fase B com as recomendações acima, ou você prefere decidir esses dois pontos antes?