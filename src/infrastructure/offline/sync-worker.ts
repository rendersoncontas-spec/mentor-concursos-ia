import { classifySaveStudySessionResult } from "./classify-save-result"
import { classifySyncError } from "./sync-error-classifier"
import { connectionState } from "./connection-state"
import { syncQueue } from "./sync-queue"
import { withSyncLock } from "./sync-lock"
import type { SyncOperationRecord } from "./types"

/**
 * Fase C, item 7 — o primeiro worker de sincronização real. Só sabe
 * processar `STUDY_SESSION_CREATE` (o único tipo que a fila recebe nesta
 * fase); tipos futuros (`STUDY_SESSION_UPDATE`/`DELETE`) são ignorados por
 * enquanto, não removidos da fila.
 *
 * NUNCA chama o engine de Ciclos diretamente — `saveStudySessionAction` já
 * chama `registerStudyToCycle()` internamente (ver
 * src/application/study-session/study-session.action.ts linha ~218). Este
 * worker só decide QUANDO chamar essa action a partir da fila, nunca decide
 * o resultado do ciclo (item 12 do pedido).
 */

/** Depois de N tentativas automáticas, um erro "retryable" para de ser
 * reprocessado sozinho — evita um retry infinito silencioso caso o erro seja
 * na verdade permanente (item do pedido: "retry classifica... nunca fica
 * tentando indefinidamente"). A operação continua visível como pendente; uma
 * nova tentativa exige `syncQueue.retryFailed()` explícito (fora do escopo
 * de UI desta fase). */
const MAX_AUTO_RETRY_ATTEMPTS = 8

const RETRYABLE_PREFIX = "[retryable]"
const NON_RETRYABLE_PREFIX = "[non_retryable]"

function isAutoRetryEligible(record: SyncOperationRecord): boolean {
  if (record.retryCount >= MAX_AUTO_RETRY_ATTEMPTS) return false
  return (record.lastError ?? "").startsWith(RETRYABLE_PREFIX)
}

export interface SyncedStudySessionEntry {
  operationId: string
  /** Sessão REAL retornada pelo servidor (para os consumidores dispararem STUDY_SESSION_SAVED_EVENT). */
  session: unknown
}

export interface StudySessionSyncSummary {
  attempted: number
  synced: number
  failed: number
  skipped: boolean
  reason?: string
  syncedSessions: SyncedStudySessionEntry[]
}

interface SaveActionResultLike {
  success: boolean
  error?: string | null
  code?: string | null
  session?: unknown
}

type SaveActionFn = (payload: Record<string, unknown>) => Promise<SaveActionResultLike>
type GetUserIdFn = () => Promise<string | null>

async function collectSyncableOperations(userId: string): Promise<SyncOperationRecord[]> {
  const [pending, failed] = await Promise.all([
    syncQueue.getPending(userId),
    syncQueue.getByStatus(userId, "FAILED"),
  ])
  const retryableFailed = failed.filter(isAutoRetryEligible)
  return [...pending, ...retryableFailed].filter((op) => op.type === "STUDY_SESSION_CREATE")
}

/**
 * Reconfirma, imediatamente antes de processar, que a operação AINDA está no
 * status esperado. Protege contra o caso de outra chamada concorrente (ex.:
 * dois gatilhos disparando quase juntos) já ter processado a mesma
 * `operationId` entre a leitura da lista e agora (item 9: nunca processar a
 * mesma operationId duas vezes). A trava de `withSyncLock` já impede duas
 * RODADAS completas simultâneas para o mesmo usuário; esta checagem cobre a
 * janela entre ler a lista e começar a processar um item específico dela.
 */
async function isStillEligible(op: SyncOperationRecord): Promise<boolean> {
  const [pending, failed] = await Promise.all([
    syncQueue.getPending(op.userId),
    syncQueue.getByStatus(op.userId, "FAILED"),
  ])
  return [...pending, ...failed].some((r) => r.operationId === op.operationId)
}

async function processOperation(
  op: SyncOperationRecord,
  saveFn: SaveActionFn,
): Promise<{ ok: true; session: unknown } | { ok: false }> {
  await syncQueue.markSyncing(op.operationId)
  try {
    const payload = op.payload as Record<string, unknown>
    const res = await saveFn(payload)

    if (res.success) {
      await syncQueue.markSynced(op.operationId)
      return { ok: true, session: res.session }
    }

    const classification = classifySaveStudySessionResult(res)
    await syncQueue.markFailed(
      op.operationId,
      `${classification.retryable ? RETRYABLE_PREFIX : NON_RETRYABLE_PREFIX} ${res.error ?? classification.reason}`,
    )
    return { ok: false }
  } catch (err) {
    const classification = classifySyncError(err)
    await syncQueue.markFailed(
      op.operationId,
      `${classification.retryable ? RETRYABLE_PREFIX : NON_RETRYABLE_PREFIX} ${classification.reason}`,
    )
    return { ok: false }
  }
}

/**
 * Fábrica testável (mesmo motivo de `createSaveStudySessionWithOfflineSupport`):
 * recebe a action de salvar e o resolvedor de userId como dependências, para
 * que os testes exercitem o worker de verdade (fila, lock, retry, eventos)
 * sem precisar simular o runtime do Next/Supabase.
 */
export function createSyncPendingStudySessions(deps: {
  saveFn: SaveActionFn
  getUserId: GetUserIdFn
}): () => Promise<StudySessionSyncSummary> {
  return async function syncPendingStudySessions(): Promise<StudySessionSyncSummary> {
    const userId = await deps.getUserId()
    if (!userId) {
      return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: "no_user", syncedSessions: [] }
    }

    if (connectionState.get() === "OFFLINE") {
      return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: "offline", syncedSessions: [] }
    }

    const outcome = await withSyncLock(userId, async (): Promise<StudySessionSyncSummary> => {
      const operations = await collectSyncableOperations(userId)

      let synced = 0
      let failed = 0
      const syncedSessions: SyncedStudySessionEntry[] = []

      if (operations.length > 0) connectionState.setSyncing()

      for (const op of operations) {
        if (!(await isStillEligible(op))) continue
        const result = await processOperation(op, deps.saveFn)
        if (result.ok) {
          synced++
          syncedSessions.push({ operationId: op.operationId, session: result.session })
        } else {
          failed++
        }
      }

      const stillPending = await syncQueue.hasPending(userId)
      if (stillPending) {
        connectionState.setSyncError()
      } else {
        connectionState.refreshFromBrowser()
      }

      return { attempted: operations.length, synced, failed, skipped: false, syncedSessions }
    })

    if ("attempted" in outcome) return outcome
    return { attempted: 0, synced: 0, failed: 0, skipped: true, reason: "already_syncing", syncedSessions: [] }
  }
}
