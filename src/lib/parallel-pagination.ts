/**
 * Fase F (performance) — leitura paginada em paralelo.
 *
 * O PostgREST devolve no máximo ~1000 linhas por requisição, então listas
 * grandes (study_history tem usuários com ~2.800 sessões) eram lidas em
 * páginas SEQUENCIAIS: 1000 → espera → 1000 → espera → 800. Aqui a primeira
 * página já traz a contagem total (`count: "exact"`) e as demais saem todas ao
 * mesmo tempo. O resultado final é o mesmo (mesma ordem, mesmas linhas); só o
 * número de idas e voltas em sequência cai de N para 2.
 *
 * Se a contagem não vier, ou se chegarem mais linhas do que a contagem previu
 * (inserções durante a leitura), a leitura continua página a página a partir
 * dali — o mesmo comportamento da versão sequencial.
 *
 * Fase F.1: o limite de linhas por requisição do PostgREST continua sendo a
 * proteção do banco — NUNCA aumentar o limite global. Muitos registros →
 * paginar. As páginas restantes saem em lotes de no máximo `concurrency`
 * requisições simultâneas (padrão 4), para 10.000+ linhas não virarem dezenas
 * de requisições ao mesmo tempo. Quem chama deve ordenar de forma
 * determinística (com uma coluna única, ex. "id", como desempate), senão
 * páginas diferentes podem repetir ou pular linhas.
 */

import { perfEnabled, perfNow, recordPerfStep } from "@/lib/perf/server-perf"

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

export type FetchPage<T> = (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>

export interface PaginationOptions {
  pageSize?: number
  maxRows?: number
  concurrency?: number
  /** Fase F.1: nome da leitura no log `[perf]` (duração, linhas, páginas). */
  perfLabel?: string
}

export async function fetchAllPagesInParallel<T>(
  fetchPage: FetchPage<T>,
  options: PaginationOptions = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  if (!options.perfLabel || !perfEnabled()) return fetchAllPagesCore(fetchPage, options)
  const t = perfNow()
  let pages = 0
  const counted: FetchPage<T> = (from, to, withCount) => {
    pages++
    return fetchPage(from, to, withCount)
  }
  const result = await fetchAllPagesCore(counted, options)
  recordPerfStep({ name: options.perfLabel, ms: perfNow() - t, rows: result.data.length, pages, ok: !result.error })
  return result
}

async function fetchAllPagesCore<T>(
  fetchPage: FetchPage<T>,
  options: PaginationOptions,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const pageSize = options.pageSize ?? 1000
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY
  const concurrency = Math.max(1, options.concurrency ?? 4)

  const first = await fetchPage(0, pageSize - 1, true)
  if (first.error) return { data: [], error: first.error }
  const all: T[] = [...(first.data ?? [])]
  if (all.length < pageSize || all.length >= maxRows) return { data: all.slice(0, maxRows), error: null }

  const total = typeof first.count === "number" ? Math.min(first.count, maxRows) : null
  let offset = pageSize

  if (total !== null && total > pageSize) {
    const offsets: number[] = []
    for (let o = pageSize; o < total; o += pageSize) offsets.push(o)
    let last: PageResult<T> | undefined
    for (let i = 0; i < offsets.length; i += concurrency) {
      const batch = offsets.slice(i, i + concurrency)
      const pages = await Promise.all(batch.map((o) => fetchPage(o, o + pageSize - 1, false)))
      // Mesma ordem das páginas, independentemente de qual respondeu primeiro.
      for (const page of pages) {
        if (page.error) return { data: all, error: page.error }
        all.push(...(page.data ?? []))
        last = page
      }
    }
    // Última página incompleta: acabou (caso normal).
    if (!last || (last.data?.length ?? 0) < pageSize) return { data: all.slice(0, maxRows), error: null }
    offset = pageSize * (offsets.length + 1)
  }

  // Sem contagem, ou vieram mais linhas do que o previsto: segue sequencial.
  while (all.length < maxRows) {
    const page = await fetchPage(offset, offset + pageSize - 1, false)
    if (page.error) return { data: all, error: page.error }
    const rows = page.data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return { data: all.slice(0, maxRows), error: null }
}

/** Opção de contagem para `.select(colunas, countOption(withCount))` na 1ª página. */
export function countOption(withCount: boolean): { count: "exact" } | undefined {
  return withCount ? { count: "exact" } : undefined
}

interface OrderableRangeQuery {
  order(column: string, options: { ascending: boolean }): OrderableRangeQuery
  range(from: number, to: number): PromiseLike<unknown>
}

export interface OrderBy {
  column: string
  ascending: boolean
}

/**
 * Fase F.1 — atalho para "ler TODAS as linhas de uma consulta Supabase".
 *
 * `build(withCount)` monta a consulta com `.from().select(cols,
 * countOption(withCount))` e os filtros; aqui entram a ordenação (a última
 * coluna deve ser única, ex. "id", para páginas estáveis) e o `.range()` de
 * cada página. Não altera filtros nem colunas de quem chama.
 */
export async function fetchAllRowsPaged<T>(
  build: (withCount: boolean) => unknown,
  orderBy: readonly OrderBy[],
  options: PaginationOptions = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  if (orderBy.length === 0) throw new Error("fetchAllRowsPaged: ordenação determinística é obrigatória")
  return fetchAllPagesInParallel<T>((from, to, withCount) => {
    let query = build(withCount) as OrderableRangeQuery
    for (const o of orderBy) query = query.order(o.column, { ascending: o.ascending })
    return query.range(from, to) as PromiseLike<PageResult<T>>
  }, options)
}
