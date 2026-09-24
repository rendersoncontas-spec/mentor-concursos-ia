/**
 * Ponto único de entrada da camada offline (item 14 do pedido: "não
 * permitir que componentes conheçam detalhes do IndexedDB"). Todo código de
 * fora de `src/infrastructure/offline/**` deve importar só daqui.
 *
 * IMPORTANTE: `saveStudySessionAction` (uma Server Action "use server", que
 * puxa `next/headers`/Supabase/Sentry) só é importada AQUI, nunca em
 * `save-study-session.ts`/`sync-worker.ts` — importar aquele arquivo fora do
 * runtime do Next trava o processo (confirmado isoladamente: um `import()`
 * dele via `tsx -e` nunca resolve nem rejeita, só fica pendurado). Por isso
 * as fábricas testáveis (`createSaveStudySessionWithOfflineSupport`,
 * `createSyncPendingStudySessions`) vivem separadas da ligação com a action
 * real — os testes desta pasta importam só as fábricas, nunca este barrel.
 */
import { saveStudySessionAction } from "@/application/study-session/study-session.action"

import { syncQueue } from "./sync-queue"
import { sessionStore } from "./session-store"
import { ALL_SNAPSHOT_STORES, snapshotStore } from "./snapshot-store"
import { getClientUserId } from "./current-user"
import { createSaveStudySessionWithOfflineSupport } from "./save-study-session"
import { createSyncPendingStudySessions } from "./sync-worker"
import type { SaveStudySessionResult } from "./save-study-session"

export { connectionState } from "./connection-state"
export { getClientUserId } from "./current-user"
export { migrateLegacyActiveSession } from "./legacy-session-migration"
export { generateOperationId } from "./operation-id"
export { classifySyncError } from "./sync-error-classifier"
export { isSyncInFlight, releaseSyncLock, tryAcquireSyncLock, withSyncLock } from "./sync-lock"
export { syncQueue } from "./sync-queue"
export { classifySaveStudySessionResult } from "./classify-save-result"
export { createSaveStudySessionWithOfflineSupport } from "./save-study-session"
export type { SaveStudySessionResult } from "./save-study-session"
export { buildPendingStudySession } from "./pending-study-session"
export type { PendingStudySession } from "./pending-study-session"
export { createSyncPendingStudySessions } from "./sync-worker"
export type { StudySessionSyncSummary, SyncedStudySessionEntry } from "./sync-worker"

/** Versão "de produção" de `saveStudySessionWithOfflineSupport` — usa a action e o resolvedor de userId reais. */
export const saveStudySessionWithOfflineSupport = createSaveStudySessionWithOfflineSupport({
  saveFn: saveStudySessionAction as unknown as (
    payload: Record<string, unknown>,
  ) => Promise<SaveStudySessionResult>,
  getUserId: getClientUserId,
})

/** Versão "de produção" de `syncPendingStudySessions` — usa a action e o resolvedor de userId reais. */
export const syncPendingStudySessions = createSyncPendingStudySessions({
  saveFn: saveStudySessionAction as unknown as (
    payload: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: string | null; code?: string | null; session?: unknown }>,
  getUserId: getClientUserId,
})
export type {
  ActiveSessionRecord,
  ConnectionStatus,
  EnqueueSyncOperationInput,
  SnapshotStoreName,
  SyncOperationRecord,
  SyncOperationStatus,
  SyncOperationType,
} from "./types"

/**
 * Resultado de uma limpeza de dados privados de um usuário (logout, item
 * 13/19 do pedido). `pendingSyncOperationsRemaining` NUNCA é usado para
 * decidir apagar a fila sozinho — quem chama esta função decide o que
 * fazer com esse número (ex.: avisar o usuário antes de sair). A fila de
 * sincronização (`sync_queue`) nunca é limpa por esta função.
 */
export interface ClearUserDataResult {
  clearedSession: boolean
  pendingSyncOperationsRemaining: number
}

export const offlineStore = {
  session: sessionStore,
  snapshots: snapshotStore,

  /**
   * Limpa a sessão ativa e os snapshots locais de um usuário (dados que são
   * sempre reconstruíveis a partir do Supabase). NUNCA toca em
   * `sync_queue` — operações pendentes exigem uma decisão explícita de
   * quem chama (ver Fase H), nunca são descartadas silenciosamente aqui.
   */
  async clearUserData(userId: string): Promise<ClearUserDataResult> {
    await sessionStore.clear(userId)
    await Promise.all(ALL_SNAPSHOT_STORES.map((store) => snapshotStore.clear(store, userId)))
    const pendingSyncOperationsRemaining = await syncQueue.getPendingCount(userId)
    return { clearedSession: true, pendingSyncOperationsRemaining }
  },
}
