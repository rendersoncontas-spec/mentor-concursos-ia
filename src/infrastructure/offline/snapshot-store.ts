import { STORE_NAMES, deleteRecord, getRecord, putRecord } from "./indexeddb-client"
import type { SnapshotStoreName } from "./types"

/**
 * Helper genérico para as stores de "snapshot" (item 2 do pedido):
 * dashboard_snapshot, history_snapshot, cycle_snapshot, planning_snapshot,
 * review_snapshot, discipline_snapshot. As stores já existem no schema
 * (indeeddb-client.ts) mas NENHUMA delas é populada nesta fase — isso é
 * trabalho da Fase E. Aqui só preparamos a API para não exigir outra
 * migração de versão do banco quando essa fase chegar.
 */

const STORE_NAME_MAP: Record<SnapshotStoreName, SnapshotStoreName> = {
  dashboard_snapshot: STORE_NAMES.dashboardSnapshot,
  history_snapshot: STORE_NAMES.historySnapshot,
  cycle_snapshot: STORE_NAMES.cycleSnapshot,
  planning_snapshot: STORE_NAMES.planningSnapshot,
  review_snapshot: STORE_NAMES.reviewSnapshot,
  discipline_snapshot: STORE_NAMES.disciplineSnapshot,
}

export interface SnapshotRecord<T> {
  userId: string
  updatedAt: number
  data: T
}

export const snapshotStore = {
  async get<T>(store: SnapshotStoreName, userId: string): Promise<SnapshotRecord<T> | undefined> {
    return getRecord<SnapshotRecord<T>>(STORE_NAME_MAP[store], userId)
  },

  async set<T>(store: SnapshotStoreName, userId: string, data: T): Promise<void> {
    const record: SnapshotRecord<T> = { userId, updatedAt: Date.now(), data }
    await putRecord<SnapshotRecord<T>>(STORE_NAME_MAP[store], record)
  },

  async clear(store: SnapshotStoreName, userId: string): Promise<void> {
    await deleteRecord(STORE_NAME_MAP[store], userId)
  },
}

export const ALL_SNAPSHOT_STORES: SnapshotStoreName[] = [
  "dashboard_snapshot",
  "history_snapshot",
  "cycle_snapshot",
  "planning_snapshot",
  "review_snapshot",
  "discipline_snapshot",
]
