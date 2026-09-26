/**
 * Banco FALSO em memória, com ESCRITA, para os testes do sistema de revisões
 * (Fase I.1).
 *
 * Por que existe: `fake-postgrest.ts` é só leitura (foi feito para os testes de
 * paginação) e o fluxo de revisão precisa gravar — item, evento, sessão — e,
 * principalmente, precisa reproduzir as três garantias que o banco real dá e
 * das quais o serviço depende:
 *
 *   1. UNIQUE(user_id, source_type, source_id) em review_items → dois cliques
 *      em "Adicionar à revisão" não criam dois itens;
 *   2. UNIQUE(user_id, client_operation_id) parcial em review_history → a mesma
 *      resposta reenviada não gera dois eventos;
 *   3. UNIQUE(user_id) parcial (status = 'ACTIVE') em review_sessions → um
 *      aluno nunca tem duas sessões abertas.
 *
 * A violação devolve `{ error: { code: "23505" } }`, o MESMO código que o
 * Postgres devolve e que o repositório interpreta como duplicidade.
 *
 * O que este duplo NÃO é: um Postgres. Ele não aplica RLS (o isolamento por
 * usuário testado aqui é o do código: todo filtro `.eq("user_id", ...)` do
 * repositório), não valida CHECKs e não tem transações. O que depende de
 * RLS/CHECK é verificado direto no banco real, e o que depende de duas conexões
 * concorrentes é verificado pelos testes de wiring.
 *
 * Determinístico: sem ORDER BY as linhas saem na ordem de inserção, e nada aqui
 * usa Math.random() nem Date.now().
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type Method = "select" | "insert" | "update" | "delete"

export interface FakeUniqueIndex {
  table: string
  columns: string[]
  /** Índice parcial: só vale para as linhas que satisfazem esta condição. */
  where?: (row: Row) => boolean
}

export interface FakeDbError {
  code: string
  message: string
  details: string | null
  hint: string | null
}

/** Índices únicos reais das tabelas de revisão (migração 20260925). */
export const REVIEW_UNIQUE_INDEXES: FakeUniqueIndex[] = [
  { table: "review_items", columns: ["user_id", "source_type", "source_id"] },
  {
    table: "review_history",
    columns: ["user_id", "client_operation_id"],
    where: (row) => row["client_operation_id"] !== null && row["client_operation_id"] !== undefined,
  },
  {
    table: "review_sessions",
    columns: ["user_id"],
    where: (row) => row["status"] === "ACTIVE",
  },
]

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return (a as number | string) < (b as number | string) ? -1 : 1
}

function splitTopLevel(cols: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of cols) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Projeção de colunas como o PostgREST (inclui relação embutida `rel ( ... )`). */
function project(row: Row, cols: string | null): Row {
  if (!cols || cols.trim() === "*") return { ...row }
  const out: Row = {}
  for (const part of splitTopLevel(cols)) {
    const rel = /^(?:(\w+):)?(\w+)(?:!\w+)?\s*\(/.exec(part)
    if (rel) {
      const name = rel[1] ?? rel[2] ?? ""
      out[name] = row[rel[2] ?? ""] ?? null
      continue
    }
    out[part] = row[part] ?? null
  }
  return out
}

export interface FakeDbRequest {
  table: string
  method: Method
  head: boolean
}

/**
 * Falha simulada de consulta (Fase I.5): o duplo devolve `{ error }` como o
 * PostgREST devolveria — é assim que se testa que erro de leitura NÃO virou zero
 * nem lista vazia. `head` restringe a falha às contagens (`head: true`), e
 * `times` limita quantas vezes ela ocorre.
 */
export interface FakeFailure {
  table: string
  method?: Method
  /** true = só contagens; false = só leituras com linhas; ausente = ambas. */
  head?: boolean
  times?: number
  /**
   * Quantas consultas que casam devem passar ANTES de a falha começar (Fase
   * I.7). Serve para cenários em que a primeira leitura tem de funcionar e a
   * segunda falha — por exemplo: o serviço confere a sessão, segue adiante, e só
   * então a releitura do estado quebra.
   */
  skip?: number
}

const READ_FAILURE: FakeDbError = {
  code: "57014",
  message: "canceling statement due to statement timeout",
  details: null,
  hint: null,
}

class FakeReviewQuery
  implements PromiseLike<{ data: Row[] | Row | null; error: FakeDbError | null; count: number | null }>
{
  private filters: Filter[] = []
  private orders: Array<{ col: string; asc: boolean }> = []
  private limitN: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private withCount = false
  private head = false
  private columns: string | null = null
  private wantsSingle = false
  private method: Method = "select"
  private payload: Row[] = []
  private patch: Row = {}

  constructor(
    private readonly db: FakeReviewDb,
    private readonly table: string,
  ) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count === "exact") this.withCount = true
    if (opts?.head) this.head = true
    this.columns = cols ?? null
    return this
  }
  insert(values: Row | Row[]) {
    this.method = "insert"
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }
  update(values: Row) {
    this.method = "update"
    this.patch = values
    return this
  }
  delete() {
    this.method = "delete"
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v)
    return this
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v)
    return this
  }
  in(col: string, vs: readonly unknown[]) {
    this.filters.push((r) => vs.includes(r[col]))
    return this
  }
  gt(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) > 0)
    return this
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) >= 0)
    return this
  }
  lt(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) < 0)
    return this
  }
  lte(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], v) <= 0)
    return this
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v)
    return this
  }
  not(col: string, op: string, v: unknown) {
    if (op !== "is") throw new Error(`fake-review-db: not.${op} não suportado`)
    this.filters.push((r) => (r[col] ?? null) !== v)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false })
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  /** `.range(from, to)` inclusivo, como no PostgREST (usado pela paginação). */
  range(from: number, to: number) {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }
  maybeSingle() {
    this.wantsSingle = true
    return this
  }
  single() {
    this.wantsSingle = true
    return this
  }

  private matching(): Row[] {
    const rows = this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)))
    if (this.orders.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const c = cmp(a[o.col], b[o.col])
        if (c !== 0) return o.asc ? c : -c
      }
      return 0
    })
  }

  private result(rows: Row[], count: number | null) {
    const projected = rows.map((r) => project(r, this.columns))
    if (this.wantsSingle) return { data: projected[0] ?? null, error: null, count }
    return { data: projected, error: null, count }
  }

  private run(): { data: Row[] | Row | null; error: FakeDbError | null; count: number | null } {
    this.db.requests.push({ table: this.table, method: this.method, head: this.head })

    const failure = this.db.takeFailure(this.table, this.method, this.head)
    if (failure) return { data: null, error: READ_FAILURE, count: null }

    if (this.method === "insert") {
      const inserted: Row[] = []
      for (const values of this.payload) {
        const row = this.db.withDefaults(this.table, values)
        const conflict = this.db.uniqueConflict(this.table, row)
        if (conflict) {
          return {
            data: null,
            error: {
              code: "23505",
              message: `duplicate key value violates unique constraint "${conflict}"`,
              details: null,
              hint: null,
            },
            count: null,
          }
        }
        this.db.rows(this.table).push(row)
        inserted.push(row)
      }
      return this.result(inserted, null)
    }

    if (this.method === "update") {
      const targets = this.matching()
      for (const row of targets) Object.assign(row, this.patch)
      return this.result(targets, null)
    }

    if (this.method === "delete") {
      const targets = this.matching()
      const kept = this.db.rows(this.table).filter((r) => !targets.includes(r))
      this.db.replace(this.table, kept)
      return this.result(targets, null)
    }

    const rows = this.matching()
    const count = this.withCount ? rows.length : null
    if (this.head) return { data: [], error: null, count }

    // Mesmo comportamento do PostgREST: `.range()` inclusivo, `.limit()` e o
    // teto de linhas por resposta (que corta em silêncio quem lê sem paginar).
    const from = this.rangeFrom ?? 0
    let to = this.rangeTo ?? rows.length - 1
    if (this.limitN !== null) to = Math.min(to, from + this.limitN - 1)
    to = Math.min(to, from + this.db.maxRows - 1)
    return this.result(rows.slice(from, to + 1), count)
  }

  then<
    R1 = { data: Row[] | Row | null; error: FakeDbError | null; count: number | null },
    R2 = never,
  >(
    onfulfilled?:
      | ((value: {
          data: Row[] | Row | null
          error: FakeDbError | null
          count: number | null
        }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected)
  }
}

export class FakeReviewDb {
  readonly requests: FakeDbRequest[] = []
  private readonly data: Record<string, Row[]>
  private readonly failures: FakeFailure[] = []
  private seq = 0

  constructor(
    tables: Record<string, Row[]> = {},
    private readonly uniqueIndexes: FakeUniqueIndex[] = REVIEW_UNIQUE_INDEXES,
    /** Instante usado nos defaults das colunas de data (nunca Date.now()). */
    private readonly nowIso = "2026-01-01T00:00:00.000Z",
    /** Teto de linhas por resposta, como o do PostgREST. */
    readonly maxRows = 1000,
  ) {
    this.data = {}
    for (const [table, rows] of Object.entries(tables)) this.data[table] = rows.map((r) => ({ ...r }))
  }

  from(table: string) {
    return new FakeReviewQuery(this, table)
  }

  /** Faz as próximas consultas que casarem devolverem erro, como o banco faria. */
  failOn(failure: FakeFailure): void {
    this.failures.push({ ...failure })
  }

  /** Consome uma falha pendente que case com a consulta, se houver. */
  takeFailure(table: string, method: Method, head: boolean): FakeFailure | null {
    const index = this.failures.findIndex(
      (f) =>
        f.table === table &&
        (f.method ?? "select") === method &&
        (f.head === undefined || f.head === head),
    )
    if (index === -1) return null
    const failure = this.failures[index] as FakeFailure
    if ((failure.skip ?? 0) > 0) {
      // Esta consulta é uma das que precisam passar antes da falha.
      failure.skip = (failure.skip ?? 0) - 1
      return null
    }
    const remaining = (failure.times ?? Number.POSITIVE_INFINITY) - 1
    if (remaining <= 0) this.failures.splice(index, 1)
    else failure.times = remaining
    return failure
  }

  rows(table: string): Row[] {
    const existing = this.data[table]
    if (existing) return existing
    const created: Row[] = []
    this.data[table] = created
    return created
  }

  replace(table: string, rows: Row[]): void {
    this.data[table] = rows
  }

  /** Cópia das linhas de uma tabela (para as asserções dos testes). */
  table(name: string): Row[] {
    return this.rows(name).map((r) => ({ ...r }))
  }

  /** Ids sequenciais e legíveis: determinísticos, ao contrário de um uuid. */
  nextId(table: string): string {
    this.seq += 1
    return `${table}-${String(this.seq).padStart(4, "0")}`
  }

  withDefaults(table: string, values: Row): Row {
    const row: Row = { ...values }
    if (row["id"] === undefined) row["id"] = this.nextId(table)
    if (row["created_at"] === undefined) row["created_at"] = this.nowIso
    return row
  }

  /** Nome do índice violado, ou null. */
  uniqueConflict(table: string, candidate: Row): string | null {
    for (const index of this.uniqueIndexes) {
      if (index.table !== table) continue
      if (index.where && !index.where(candidate)) continue
      const clash = this.rows(table).some(
        (row) =>
          (!index.where || index.where(row)) &&
          index.columns.every((col) => (row[col] ?? null) === (candidate[col] ?? null)),
      )
      if (clash) return `uq_${table}_${index.columns.join("_")}`
    }
    return null
  }
}
