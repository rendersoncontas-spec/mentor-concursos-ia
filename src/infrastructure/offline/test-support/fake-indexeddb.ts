/**
 * Fake mínimo de IndexedDB, só para os testes desta camada rodarem sob
 * Node (que não tem IndexedDB nativo).
 *
 * Por que isto e não a lib `fake-indexeddb`: tentamos instalá-la como
 * devDependency e a instalação falhou repetidamente na máquina do usuário
 * (pasta do projeto sincronizada pelo OneDrive — timeouts e um
 * `EINTEGRITY`/`ENOTEMPTY` durante `npm install`, sintoma conhecido de
 * lock de arquivo pelo próprio OneDrive durante a gravação do
 * node_modules). Em vez de deixar o `package.json`/`node_modules` num
 * estado incerto por causa disso, escrevemos aqui só o subconjunto da API
 * de IndexedDB que `indexeddb-client.ts` realmente usa (open, stores,
 * índice composto, get/put/delete/getAll) — helper isolado, nunca
 * importado por código de produção, com zero dependência nova.
 */

type RequestEventHandler = ((event: { target: unknown }) => void) | null

class FakeRequest<T> {
  result: T | undefined = undefined
  error: Error | null = null
  onsuccess: RequestEventHandler = null
  onerror: RequestEventHandler = null
  private settled = false

  resolve(value: T): void {
    if (this.settled) return
    this.settled = true
    this.result = value
    queueMicrotask(() => this.onsuccess?.({ target: this }))
  }

  reject(error: Error): void {
    if (this.settled) return
    this.settled = true
    this.error = error
    queueMicrotask(() => this.onerror?.({ target: this }))
  }
}

function keyEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index])
  }
  return a === b
}

class FakeIndex {
  constructor(
    private readonly records: Map<string, Record<string, unknown>>,
    private readonly keyPath: string | string[],
  ) {}

  private extractKey(record: Record<string, unknown>): unknown {
    if (Array.isArray(this.keyPath)) return this.keyPath.map((p) => record[p])
    return record[this.keyPath]
  }

  getAll(query: unknown): FakeRequest<Record<string, unknown>[]> {
    const request = new FakeRequest<Record<string, unknown>[]>()
    queueMicrotask(() => {
      const all = Array.from(this.records.values()).filter((record) =>
        keyEquals(this.extractKey(record), query),
      )
      request.resolve(all)
    })
    return request
  }
}

class FakeObjectStore {
  readonly records = new Map<string, Record<string, unknown>>()
  private readonly indexes = new Map<string, FakeIndex>()

  constructor(
    public readonly name: string,
    public readonly keyPath: string,
  ) {}

  createIndex(name: string, keyPath: string | string[]): void {
    this.indexes.set(name, new FakeIndex(this.records, keyPath))
  }

  index(name: string): FakeIndex {
    const index = this.indexes.get(name)
    if (!index) throw new Error(`Índice "${name}" não existe na store "${this.name}"`)
    return index
  }

  private keyOf(record: Record<string, unknown>): string {
    return String(record[this.keyPath])
  }

  get(key: unknown): FakeRequest<Record<string, unknown> | undefined> {
    const request = new FakeRequest<Record<string, unknown> | undefined>()
    queueMicrotask(() => request.resolve(this.records.get(String(key))))
    return request
  }

  put(value: Record<string, unknown>): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>()
    queueMicrotask(() => {
      this.records.set(this.keyOf(value), value)
      request.resolve(value[this.keyPath])
    })
    return request
  }

  delete(key: unknown): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>()
    queueMicrotask(() => {
      this.records.delete(String(key))
      request.resolve(undefined)
    })
    return request
  }

  getAll(): FakeRequest<Record<string, unknown>[]> {
    const request = new FakeRequest<Record<string, unknown>[]>()
    queueMicrotask(() => request.resolve(Array.from(this.records.values())))
    return request
  }
}

class FakeTransaction {
  constructor(private readonly db: FakeDatabase) {}
  objectStore(name: string): FakeObjectStore {
    const store = this.db.stores.get(name)
    if (!store) throw new Error(`Object store "${name}" não existe`)
    return store
  }
}

class FakeDatabase {
  readonly stores = new Map<string, FakeObjectStore>()
  readonly objectStoreNames = {
    contains: (name: string): boolean => this.stores.has(name),
  }

  createObjectStore(name: string, options: { keyPath: string }): FakeObjectStore {
    const store = new FakeObjectStore(name, options.keyPath)
    this.stores.set(name, store)
    return store
  }

  transaction(_storeNames: string | string[], _mode: "readonly" | "readwrite"): FakeTransaction {
    return new FakeTransaction(this)
  }

  close(): void {
    // Fake em memória: nada a fazer.
  }
}

const databasesByName = new Map<string, FakeDatabase>()

function fakeOpen(name: string): FakeRequest<FakeDatabase> & { onupgradeneeded: RequestEventHandler; onblocked: RequestEventHandler } {
  const request = new FakeRequest<FakeDatabase>() as FakeRequest<FakeDatabase> & {
    onupgradeneeded: RequestEventHandler
    onblocked: RequestEventHandler
  }
  request.onupgradeneeded = null
  request.onblocked = null
  queueMicrotask(() => {
    let db = databasesByName.get(name)
    const isNew = !db
    if (!db) {
      db = new FakeDatabase()
      databasesByName.set(name, db)
    }
    // Espelha a IndexedDB real: `request.result` já aponta para o banco
    // DURANTE onupgradeneeded, antes de onsuccess disparar.
    request.result = db
    if (isNew) request.onupgradeneeded?.({ target: request })
    request.resolve(db)
  })
  return request
}

/** Instala `globalThis.indexedDB` fake — chamar uma vez no topo de cada arquivo de teste, antes de importar o módulo sob teste. */
export function installFakeIndexedDb(): void {
  ;(globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: fakeOpen }
}

/** Limpa todos os bancos fake — útil entre testes para garantir isolamento. */
export function resetFakeIndexedDb(): void {
  databasesByName.clear()
}
