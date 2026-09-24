import {
  STORE_NAMES,
  SYNC_QUEUE_BY_USER_INDEX,
  SYNC_QUEUE_BY_USER_STATUS_INDEX,
  deleteRecord,
  getAllByIndex,
  getRecord,
  putRecord,
} from "./indexeddb-client"
import { generateOperationId } from "./operation-id"
import type { EnqueueSyncOperationInput, SyncOperationRecord, SyncOperationStatus } from "./types"

/**
 * Fila de sincronização (itens 6-8, 11-12 do pedido). Só a infraestrutura é
 * construída nesta fase — QUEM chama saveStudySessionAction de verdade a
 * partir da fila é o worker de sincronização das próximas fases.
 */

async function getByUserAndStatus(
  userId: string,
  status: SyncOperationStatus,
): Promise<SyncOperationRecord[]> {
  return getAllByIndex<SyncOperationRecord>(STORE_NAMES.syncQueue, SYNC_QUEUE_BY_USER_STATUS_INDEX, [
    userId,
    status,
  ])
}

async function transitionStatus(operationId: string, status: SyncOperationStatus): Promise<void> {
  const record = await getRecord<SyncOperationRecord>(STORE_NAMES.syncQueue, operationId)
  if (!record) return
  await putRecord<SyncOperationRecord>(STORE_NAMES.syncQueue, {
    ...record,
    status,
    updatedAt: Date.now(),
  })
}

export const syncQueue = {
  /**
   * Enfileira uma nova operação. Por padrão gera um operationId novo (UUID).
   * Fase C.1: se o chamador já tinha gerado e enviado um operationId ANTES
   * de cair para a fila (ex.: a tentativa online original, cuja resposta se
   * perdeu por erro de transporte), `input.operationId` é reaproveitado em
   * vez de substituído — é o que garante que o retry carregue o MESMO
   * `client_operation_id` que o servidor pode já ter recebido.
   */
  async enqueue(input: EnqueueSyncOperationInput): Promise<string> {
    const now = Date.now()
    const record: SyncOperationRecord = {
      operationId: input.operationId ?? generateOperationId(),
      userId: input.userId,
      type: input.type,
      entity: input.entity,
      payload: input.payload,
      createdAt: now,
      updatedAt: now,
      status: "PENDING",
      retryCount: 0,
      lastError: null,
    }
    await putRecord<SyncOperationRecord>(STORE_NAMES.syncQueue, record)
    return record.operationId
  },

  async getPending(userId: string): Promise<SyncOperationRecord[]> {
    return getByUserAndStatus(userId, "PENDING")
  },

  async getByStatus(userId: string, status: SyncOperationStatus): Promise<SyncOperationRecord[]> {
    return getByUserAndStatus(userId, status)
  },

  async getAllForUser(userId: string): Promise<SyncOperationRecord[]> {
    return getAllByIndex<SyncOperationRecord>(STORE_NAMES.syncQueue, SYNC_QUEUE_BY_USER_INDEX, userId)
  },

  /** Conta operações que ainda não terminaram com sucesso (PENDING + SYNCING + FAILED) — usado pelo aviso de logout (Fase H) sem apagar nada aqui. */
  async getPendingCount(userId: string): Promise<number> {
    const [pending, syncing, failed] = await Promise.all([
      getByUserAndStatus(userId, "PENDING"),
      getByUserAndStatus(userId, "SYNCING"),
      getByUserAndStatus(userId, "FAILED"),
    ])
    return pending.length + syncing.length + failed.length
  },

  async hasPending(userId: string): Promise<boolean> {
    return (await syncQueue.getPendingCount(userId)) > 0
  },

  async markSyncing(operationId: string): Promise<void> {
    await transitionStatus(operationId, "SYNCING")
  },

  async markSynced(operationId: string): Promise<void> {
    await transitionStatus(operationId, "SYNCED")
  },

  /** Erro real ao tentar sincronizar. Sempre incrementa retryCount e grava lastError — nunca reinsere como PENDING sozinho (isso é `retryFailed`, uma decisão explícita do worker). */
  async markFailed(operationId: string, error: string): Promise<void> {
    const record = await getRecord<SyncOperationRecord>(STORE_NAMES.syncQueue, operationId)
    if (!record) return
    await putRecord<SyncOperationRecord>(STORE_NAMES.syncQueue, {
      ...record,
      status: "FAILED",
      retryCount: record.retryCount + 1,
      lastError: error,
      updatedAt: Date.now(),
    })
  },

  /** Volta operações FAILED de um usuário para PENDING (nova tentativa). Retorna quantas foram reenfileiradas. */
  async retryFailed(userId: string): Promise<number> {
    const failed = await getByUserAndStatus(userId, "FAILED")
    for (const record of failed) {
      await putRecord<SyncOperationRecord>(STORE_NAMES.syncQueue, {
        ...record,
        status: "PENDING",
        updatedAt: Date.now(),
      })
    }
    return failed.length
  },

  /** Remove definitivamente uma operação (ex.: já SYNCED e compactada). Nunca chamar para uma operação ainda PENDING/SYNCING/FAILED sem confirmação explícita. */
  async remove(operationId: string): Promise<void> {
    await deleteRecord(STORE_NAMES.syncQueue, operationId)
  },
}
