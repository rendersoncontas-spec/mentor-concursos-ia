/**
 * Trava em memória contra sincronizações concorrentes do MESMO usuário
 * (item 11 do pedido: "Sync Queue precisa impedir duas rotinas de
 * sincronização rodarem simultaneamente para o mesmo usuário").
 *
 * Deliberadamente em memória (não em IndexedDB): o lock só precisa valer
 * dentro desta aba/processo — duas abas do mesmo usuário cada uma tentando
 * sincronizar é tratado pela idempotência da fila (operationId), não por
 * este lock. Isso evita a complexidade de um lock distribuído via
 * IndexedDB (que teria suas próprias condições de corrida).
 */
const syncInFlightByUser = new Set<string>()

/** Tenta obter a trava para `userId`. Retorna false se já houver uma sincronização em andamento. */
export function tryAcquireSyncLock(userId: string): boolean {
  if (syncInFlightByUser.has(userId)) return false
  syncInFlightByUser.add(userId)
  return true
}

export function releaseSyncLock(userId: string): void {
  syncInFlightByUser.delete(userId)
}

export function isSyncInFlight(userId: string): boolean {
  return syncInFlightByUser.has(userId)
}

/** Helper para não esquecer de liberar a trava em caso de exceção. */
export async function withSyncLock<T>(userId: string, fn: () => Promise<T>): Promise<T | { skipped: true }> {
  if (!tryAcquireSyncLock(userId)) {
    return { skipped: true }
  }
  try {
    return await fn()
  } finally {
    releaseSyncLock(userId)
  }
}
