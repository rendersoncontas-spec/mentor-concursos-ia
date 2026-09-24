/**
 * Cliente IndexedDB centralizado da camada offline (Fase B).
 *
 * Objetivo explícito do pedido: "não espalhar chamadas diretas a IndexedDB
 * por dezenas de componentes" — este é o ÚNICO arquivo do projeto que abre o
 * banco, define stores e faz transações cruas. Todo o resto (session-store,
 * sync-queue, snapshot-store) usa só as funções genéricas daqui.
 *
 * Não usamos nenhuma biblioteca (idb/dexie) — o projeto não tinha nenhuma
 * instalada e a API necessária aqui é pequena o suficiente para um wrapper
 * fino e bem isolado sobre a IndexedDB nativa do navegador, como o próprio
 * pedido pede como alternativa.
 *
 * Estratégia de teste: os testes desta camada usam `fake-indexeddb` (devDependency,
 * não vai para o bundle de produção) para exercitar o banco de verdade em
 * Node — não apenas ler o código-fonte como os *.wiring.test.ts do projeto.
 */

export const OFFLINE_DB_NAME = "nomeia-offline"
export const OFFLINE_DB_VERSION = 1

/** Nome de todas as object stores conhecidas por esta fase (algumas ainda vazias — item 2 do pedido). */
export const STORE_NAMES = {
  sessionState: "session_state",
  syncQueue: "sync_queue",
  syncMetadata: "sync_metadata",
  dashboardSnapshot: "dashboard_snapshot",
  historySnapshot: "history_snapshot",
  cycleSnapshot: "cycle_snapshot",
  planningSnapshot: "planning_snapshot",
  reviewSnapshot: "review_snapshot",
  disciplineSnapshot: "discipline_snapshot",
} as const

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES]

/** Índice composto usado para buscar operações pendentes de um usuário sem varrer a store inteira. */
export const SYNC_QUEUE_BY_USER_STATUS_INDEX = "by_user_status"
export const SYNC_QUEUE_BY_USER_INDEX = "by_user"
export const SYNC_METADATA_BY_USER_INDEX = "by_user"

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined"
}

function ensureStore(
  db: IDBDatabase,
  name: StoreName,
  keyPath: string,
  indexes?: Array<{ name: string; keyPath: string | string[] }>,
): void {
  if (db.objectStoreNames.contains(name)) return
  const store = db.createObjectStore(name, { keyPath })
  for (const index of indexes ?? []) {
    store.createIndex(index.name, index.keyPath, { unique: false })
  }
}

/**
 * Abre (criando/atualizando se necessário) o banco offline. Chamado
 * internamente por toda operação de leitura/escrita — o navegador já
 * mantém a conexão eficiente, não é preciso cachear a instância aqui.
 */
export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(
      new Error(
        "IndexedDB indisponível neste ambiente (SSR ou navegador sem suporte) — a camada offline não pode ser usada aqui.",
      ),
    )
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      ensureStore(db, STORE_NAMES.sessionState, "userId")
      ensureStore(db, STORE_NAMES.syncQueue, "operationId", [
        { name: SYNC_QUEUE_BY_USER_STATUS_INDEX, keyPath: ["userId", "status"] },
        { name: SYNC_QUEUE_BY_USER_INDEX, keyPath: "userId" },
      ])
      ensureStore(db, STORE_NAMES.syncMetadata, "id", [
        { name: SYNC_METADATA_BY_USER_INDEX, keyPath: "userId" },
      ])
      // Stores preparadas para as próximas fases (Dashboard/Histórico/Ciclo/
      // Planejamento/Reviews/Catálogo) — ainda não populadas nesta fase.
      ensureStore(db, STORE_NAMES.dashboardSnapshot, "userId")
      ensureStore(db, STORE_NAMES.historySnapshot, "userId")
      ensureStore(db, STORE_NAMES.cycleSnapshot, "userId")
      ensureStore(db, STORE_NAMES.planningSnapshot, "userId")
      ensureStore(db, STORE_NAMES.reviewSnapshot, "userId")
      ensureStore(db, STORE_NAMES.disciplineSnapshot, "userId")
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o IndexedDB offline"))
    request.onblocked = () => {
      // Outra aba está segurando uma versão antiga aberta — não travamos a
      // Promise para sempre; o chamador recebe o erro e tenta de novo depois.
      reject(new Error("Abertura do IndexedDB bloqueada por outra aba com uma versão antiga aberta"))
    }
  })
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Falha na operação de IndexedDB"))
  })
}

export async function getRecord<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openOfflineDatabase()
  try {
    const tx = db.transaction(store, "readonly")
    const result = await wrapRequest<T | undefined>(tx.objectStore(store).get(key))
    return result
  } finally {
    db.close()
  }
}

export async function putRecord<T>(store: StoreName, value: T): Promise<void> {
  const db = await openOfflineDatabase()
  try {
    const tx = db.transaction(store, "readwrite")
    await wrapRequest(tx.objectStore(store).put(value))
  } finally {
    db.close()
  }
}

export async function deleteRecord(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openOfflineDatabase()
  try {
    const tx = db.transaction(store, "readwrite")
    await wrapRequest(tx.objectStore(store).delete(key))
  } finally {
    db.close()
  }
}

export async function getAllByIndex<T>(
  store: StoreName,
  indexName: string,
  query: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openOfflineDatabase()
  try {
    const tx = db.transaction(store, "readonly")
    const index = tx.objectStore(store).index(indexName)
    const result = await wrapRequest<T[]>(index.getAll(query))
    return result
  } finally {
    db.close()
  }
}

export async function getAllFromStore<T>(store: StoreName): Promise<T[]> {
  const db = await openOfflineDatabase()
  try {
    const tx = db.transaction(store, "readonly")
    const result = await wrapRequest<T[]>(tx.objectStore(store).getAll())
    return result
  } finally {
    db.close()
  }
}

/** Apaga TODAS as linhas de uma store cuja chave primária comece com o userId informado (stores com keyPath "userId"). */
export async function deleteRecordIfExists(store: StoreName, key: IDBValidKey): Promise<void> {
  await deleteRecord(store, key)
}
