/**
 * Tipos compartilhados da camada offline (Fase B — Storage local + Sync Queue).
 *
 * Esta camada NUNCA reimplementa regras do motor de Ciclos
 * (src/application/study-cycle/**, src/domain/study-cycle/**). Ela só
 * guarda localmente (IndexedDB) o que o usuário fez enquanto sem internet e
 * enfileira operações para serem reenviadas ao Supabase quando a conexão
 * voltar — o Supabase continua sendo a fonte oficial dos dados.
 */

/** Estado de conectividade exposto para o shell do app (item 8 do pedido). */
export type ConnectionStatus = "ONLINE" | "OFFLINE" | "SYNCING" | "SYNC_ERROR"

/** Estados possíveis de uma operação na fila de sincronização. */
export type SyncOperationStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED"

/**
 * Tipos de operação suportados pela fila. Começamos só com a criação de
 * sessão de estudo (cronômetro e lançamento manual passam pelo mesmo
 * `saveStudySessionAction`, ver auditoria da Fase A) — deixado extensível
 * para update/delete futuros sem precisar de migração de schema.
 */
export type SyncOperationType =
  | "STUDY_SESSION_CREATE"
  | "STUDY_SESSION_UPDATE"
  | "STUDY_SESSION_DELETE"

/** Nomes das object stores de "snapshot" preparadas nesta fase (ainda vazias). */
export type SnapshotStoreName =
  | "dashboard_snapshot"
  | "history_snapshot"
  | "cycle_snapshot"
  | "planning_snapshot"
  | "review_snapshot"
  | "discipline_snapshot"

/**
 * Uma operação pendente de sincronização. `operationId` é um UUID — nunca um
 * timestamp — porque ele precisa continuar identificando a MESMA operação de
 * forma estável mesmo depois de vários retries (idempotência).
 */
export interface SyncOperationRecord {
  operationId: string
  userId: string
  type: SyncOperationType
  entity: string
  payload: unknown
  createdAt: number
  updatedAt: number
  status: SyncOperationStatus
  retryCount: number
  lastError: string | null
}

/**
 * Entrada para enfileirar uma nova operação — os campos de controle são
 * calculados pela fila. `operationId` é opcional: por padrão a fila gera um
 * UUID novo (ver `generateOperationId`), mas quando o chamador já gerou um
 * (Fase C.1 — para que a MESMA tentativa que falhou por transporte antes de
 * chegar à fila reutilize o operationId que já tinha sido enviado ao
 * servidor como `client_operation_id`, e não um novo) ele é reaproveitado
 * em vez de substituído.
 */
export interface EnqueueSyncOperationInput {
  userId: string
  type: SyncOperationType
  entity: string
  payload: unknown
  operationId?: string
}

/**
 * Snapshot da sessão de cronômetro ativa, persistido no IndexedDB.
 * Mantém exatamente os mesmos campos que `StudySessionState` (StudyProvider)
 * já usa — esta camada não decide o que é uma sessão, só onde ela mora.
 */
export interface ActiveSessionRecord {
  userId: string
  isActive: boolean
  isMinimized: boolean
  phase: "IDLE" | "STUDYING" | "PAUSED" | "SHORT_BREAK" | "LONG_BREAK"
  disciplineName: string
  disciplineId: string | undefined
  topicName: string
  studyType: string
  technique: string
  notes: string
  startTime: number | null
  totalPausedMs: number
  lastPauseStartTime: number | null
  plannedSeconds: number
  activeSeconds: number
  pausedSeconds: number
  planItemId: string | null
  source: "PLAN" | "FREE" | "CYCLE" | null
  cycleId?: string | null | undefined
  cycleItemId?: string | null | undefined
}
