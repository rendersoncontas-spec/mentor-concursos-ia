/**
 * Fase F.1 — cliente Supabase FALSO para testes de paginação.
 *
 * Simula o comportamento que importa do PostgREST:
 * - cada resposta devolve NO MÁXIMO `maxRows` linhas (padrão 1000), mesmo com
 *   `.limit()` maior ou sem `.range()` — é exatamente o corte silencioso que
 *   causava o truncamento;
 * - `.range(from, to)` inclusivo, `.order()` com várias chaves,
 *   `count: "exact"` e os filtros usados no app (eq, neq, in, gte, gt, lt,
 *   lte, is, not.is);
 * - sem ORDER BY, devolve as linhas numa ordem "física" embaralhada e
 *   diferente a cada requisição (como um banco real pode fazer), para que
 *   paginação sem ordenação determinística seja pega pelos testes.
 *
 * Só leitura. Registra cada requisição em `requests` para os testes contarem
 * idas ao banco e verificarem que nada foi gravado.
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

export interface FakeRequest {
  table: string
  from: number | null
  to: number | null
  withCount: boolean
  ordered: boolean
  method: "select" | "insert" | "update" | "upsert" | "delete"
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return (a as number | string) < (b as number | string) ? -1 : 1
}

let shuffleSeed = 1
function pseudoShuffle<T>(rows: T[]): T[] {
  const out = [...rows]
  for (let i = out.length - 1; i > 0; i--) {
    shuffleSeed = (shuffleSeed * 1103515245 + 12345) % 2147483648
    const j = shuffleSeed % (i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

/**
 * Projeção de colunas como o PostgREST: `*`, colunas simples, relações
 * embutidas `rel ( ... )` (copiadas como estão na linha falsa) e caminhos
 * JSON com alias `alias:coluna->chave`. Sem lista de colunas, devolve tudo.
 */
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

function project(row: Row, cols: string | null): Row {
  if (!cols) return row
  const parts = splitTopLevel(cols)
  if (parts.includes("*") && parts.every((p) => p === "*" || p.includes("("))) return row
  const out: Row = {}
  for (const part of parts) {
    if (part === "*") {
      Object.assign(out, row)
      continue
    }
    const rel = /^(?:(\w+):)?(\w+)(?:!\w+)?\s*\(/.exec(part)
    if (rel) {
      const name = rel[1] ?? rel[2] ?? ""
      out[name] = row[rel[2] ?? ""] ?? null
      continue
    }
    const json = /^(\w+):(\w+)->(\w+)$/.exec(part)
    if (json) {
      const obj = row[json[2] ?? ""] as Record<string, unknown> | null | undefined
      out[json[1] ?? ""] = obj && typeof obj === "object" ? (obj[json[3] ?? ""] ?? null) : null
      continue
    }
    out[part] = row[part] ?? null
  }
  return out
}

export interface FakePostgrestError {
  message: string
}

class FakeQuery
  implements PromiseLike<{ data: Row[] | Row | null; error: FakePostgrestError | null; count: number | null }>
{
  private filters: Filter[] = []
  private orders: Array<{ col: string; asc: boolean }> = []
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private limitN: number | null = null
  private withCount = false
  private columns: string | null = null
  private single = false

  constructor(
    private readonly db: FakePostgrest,
    private readonly table: string,
    private method: FakeRequest["method"] = "select",
  ) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count === "exact") this.withCount = true
    this.columns = cols ?? null
    return this
  }
  insert() { this.method = "insert"; return this }
  update() { this.method = "update"; return this }
  upsert() { this.method = "upsert"; return this }
  delete() { this.method = "delete"; return this }
  eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this }
  neq(col: string, v: unknown) { this.filters.push((r) => r[col] !== v); return this }
  in(col: string, vs: readonly unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this }
  gte(col: string, v: unknown) { this.filters.push((r) => cmp(r[col], v) >= 0 && (r[col] !== null && r[col] !== undefined)); return this }
  gt(col: string, v: unknown) { this.filters.push((r) => cmp(r[col], v) > 0 && (r[col] !== null && r[col] !== undefined)); return this }
  lt(col: string, v: unknown) { this.filters.push((r) => (r[col] !== null && r[col] !== undefined) && cmp(r[col], v) < 0); return this }
  lte(col: string, v: unknown) { this.filters.push((r) => (r[col] !== null && r[col] !== undefined) && cmp(r[col], v) <= 0); return this }
  is(col: string, v: unknown) { this.filters.push((r) => (r[col] ?? null) === v); return this }
  not(col: string, op: string, v: unknown) {
    if (op !== "is") throw new Error(`fake-postgrest: not.${op} não suportado`)
    this.filters.push((r) => (r[col] ?? null) !== v)
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this }
  limit(n: number) { this.limitN = n; return this }
  maybeSingle() { this.single = true; return this }

  private run() {
    this.db.requests.push({
      table: this.table,
      from: this.rangeFrom,
      to: this.rangeTo,
      withCount: this.withCount,
      ordered: this.orders.length > 0,
      method: this.method,
    })
    if (this.method !== "select") return { data: null, error: null, count: null }
    // Fase I.8 — injeção de falha (para testar erro≠ausência): consome uma
    // falha pendente da tabela, se houver, e devolve `error` como o PostgREST
    // devolveria — nenhum dado. Sem falha marcada, o comportamento é o mesmo
    // de sempre (leitura bem-sucedida).
    const pending = this.db.failures[this.table] ?? 0
    if (pending > 0) {
      this.db.failures[this.table] = pending - 1
      const message = this.db.failureMessages[this.table] ?? `fake-postgrest: falha simulada em ${this.table}`
      return { data: null, error: { message }, count: null }
    }
    let rows = (this.db.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)))
    const count = this.withCount ? rows.length : null
    if (this.orders.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp(a[o.col], b[o.col])
          if (c !== 0) return o.asc ? c : -c
        }
        return 0
      })
    } else {
      rows = pseudoShuffle(rows)
    }
    const from = this.rangeFrom ?? 0
    let to = this.rangeTo ?? rows.length - 1
    if (this.limitN !== null) to = Math.min(to, from + this.limitN - 1)
    to = Math.min(to, from + this.db.maxRows - 1) // corte do PostgREST
    const page = rows.slice(from, to + 1)
    const projected = page.map((r) => project(r, this.columns))
    if (this.single) return { data: projected[0] ?? null, error: null, count }
    return { data: projected, error: null, count }
  }

  then<
    R1 = { data: Row[] | Row | null; error: FakePostgrestError | null; count: number | null },
    R2 = never,
  >(
    onfulfilled?:
      | ((value: { data: Row[] | Row | null; error: FakePostgrestError | null; count: number | null }) => R1 | PromiseLike<R1>)
      | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected)
  }
}

export class FakePostgrest {
  readonly requests: FakeRequest[] = []
  /**
   * Fase I.8 — quantas vezes cada tabela ainda deve falhar (consumido a cada
   * `select`). Populado só por `failOn`; sem chamar `failOn`, o comportamento
   * é o de sempre (nunca falha) — não quebra nenhum teste existente.
   */
  readonly failures: Record<string, number> = {}
  readonly failureMessages: Record<string, string> = {}
  constructor(
    readonly tables: Record<string, Row[]>,
    readonly maxRows = 1000,
  ) {}
  from(table: string) {
    return new FakeQuery(this, table)
  }
  get writes() {
    return this.requests.filter((r) => r.method !== "select")
  }
  /**
   * Marca `table` para responder com `{ data: null, error }` nas próximas
   * `times` leituras (`select`), depois volta a responder normalmente. Serve
   * para testar que um erro de leitura vira estado de erro, não ausência.
   */
  failOn(table: string, times = 1, message?: string): void {
    this.failures[table] = (this.failures[table] ?? 0) + times
    if (message) this.failureMessages[table] = message
  }
}
