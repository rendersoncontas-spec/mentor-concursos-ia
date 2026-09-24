import type { StudySessionSyncSummary } from "@/infrastructure/offline"

import {
  dispatchStudySessionOfflineResolved,
  dispatchStudySessionSaved,
  type SavedStudySession,
} from "./study-session-events"

/**
 * Fase C, itens 7-8 e 13 — a "ponte" entre o worker de sincronização (que
 * mora na camada offline, sem saber nada de DOM/eventos de UI) e os eventos
 * que Dashboard/Histórico/Planejamento/Ciclo já escutam. O worker devolve só
 * dados (`syncedSessions`); as fábricas abaixo decidem o que a UI faz com
 * eles — mantendo `src/infrastructure/offline/**` livre de conhecimento
 * sobre o formato de eventos de uma feature específica.
 *
 * IMPORTANTE: este arquivo NUNCA importa `syncPendingStudySessions` real
 * (nem qualquer coisa do barrel `@/infrastructure/offline` como valor) — só
 * o tipo `StudySessionSyncSummary`. A ligação com a versão real fica em
 * `study-provider.tsx` (quem de fato usa isto em produção), porque o barrel
 * importa `saveStudySessionAction` (uma Server Action "use server", que puxa
 * `next/headers`/Supabase/Sentry) e isso trava um processo Node fora do
 * runtime do Next — os testes deste arquivo importam só as fábricas puras
 * abaixo, com uma função de sincronização falsa injetada.
 */
type SyncFn = () => Promise<StudySessionSyncSummary>

export function createTriggerStudySessionSync(syncFn: SyncFn): () => Promise<void> {
  return async function triggerStudySessionSync(): Promise<void> {
    const summary = await syncFn()
    for (const entry of summary.syncedSessions) {
      if (entry.session) {
        // Mesmo evento de sempre (item 13: "usar STUDY_SESSION_SAVED_EVENT
        // com o mesmo formato esperado atualmente") — Dashboard/Histórico/
        // Planejamento/Ciclo atualizam sem nenhuma arquitetura nova.
        dispatchStudySessionSaved(entry.session as SavedStudySession)
      }
      // Permite ao Histórico remover o placeholder "pendente" local sem duplicar.
      dispatchStudySessionOfflineResolved(entry.operationId)
    }
  }
}

/**
 * Fábrica testável dos gatilhos (item 8): evento `online` do navegador e o
 * app voltar ao foreground (`visibilitychange`). Cada instalador criado por
 * esta fábrica guarda seu PRÓPRIO estado de "já instalado" (closure), então
 * um instalador de teste (com uma triggerFn falsa) nunca interfere no
 * instalador de produção nem vice-versa.
 */
export function createStudySessionSyncTriggersInstaller(
  triggerFn: () => Promise<void>,
): () => () => void {
  let cleanup: (() => void) | null = null

  return function installStudySessionSyncTriggers(): () => void {
    if (typeof window === "undefined") return () => {}
    // Evita instalar duas vezes (StudyProvider é global, mas React 18 Strict
    // Mode em desenvolvimento monta/desmonta efeitos duas vezes de propósito).
    if (cleanup) return cleanup

    const onOnline = () => {
      void triggerFn()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void triggerFn()
    }

    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibilityChange)

    // Tentativa inicial (não bloqueia, não precisa de await) — se estiver
    // offline, syncPendingStudySessions() só retorna { skipped: true } sem
    // tentar nada (item 2: "OFFLINE: não tentar Server Action").
    void triggerFn()

    cleanup = () => {
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      cleanup = null
    }
    return cleanup
  }
}
