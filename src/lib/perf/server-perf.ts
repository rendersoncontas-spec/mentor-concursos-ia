import { cache } from "react"

/**
 * Fase F.1 — instrumentação simples de performance NO SERVIDOR.
 *
 * Mede, por requisição de página (RSC):
 * - duração de cada etapa marcada com `timed()` (resolução do usuário,
 *   loaders principais);
 * - duração e quantidade de linhas/páginas das leituras paginadas
 *   (`fetchAllPagesInParallel` com `perfLabel`);
 * - duração total da página até o `logPagePerf()`.
 *
 * Grava UMA linha de log por página, com prefixo `[perf]`, em JSON. Só
 * números e nomes de etapas — nunca token, cookie, senha, id de usuário ou
 * conteúdo do usuário.
 *
 * Ligado em desenvolvimento (`next dev`) e, em produção, só com
 * `NOMEIA_PERF_LOG=1`. Desligado não faz nada (custo zero além de um if).
 * Não altera nada na tela.
 */

export interface PerfStep {
  name: string
  ms: number
  rows?: number
  pages?: number
  ok?: boolean
}

interface Collector {
  t0: number
  steps: PerfStep[]
}

export function perfEnabled(): boolean {
  return process.env["NOMEIA_PERF_LOG"] === "1" || process.env.NODE_ENV === "development"
}

// Um coletor por requisição RSC (React cache). Em Server Actions o cache não
// memoiza, então cada chamada teria o seu — por isso actions usam
// `logActionPerf` diretamente.
const getCollector = cache((): Collector => ({ t0: performance.now(), steps: [] }))

function now(): number {
  return performance.now()
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10
}

/** Marca o início da página (chame no topo do Server Component). */
export function startPagePerf(): void {
  if (!perfEnabled()) return
  getCollector()
}

export function recordPerfStep(step: PerfStep): void {
  if (!perfEnabled()) return
  try {
    getCollector().steps.push({ ...step, ms: round(step.ms) })
  } catch {
    // fora de uma requisição RSC (ex.: teste) — ignora
  }
}

/**
 * Executa `fn` medindo a duração. `count` (opcional) extrai do resultado a
 * quantidade de registros — só o número é registrado.
 */
export async function timed<T>(name: string, fn: () => Promise<T>, count?: (result: T) => number | undefined): Promise<T> {
  if (!perfEnabled()) return fn()
  const t = now()
  try {
    const result = await fn()
    let rows: number | undefined
    try {
      rows = count?.(result)
    } catch {
      rows = undefined
    }
    recordPerfStep({ name, ms: now() - t, ...(rows !== undefined ? { rows } : {}), ok: true })
    return result
  } catch (err) {
    recordPerfStep({ name, ms: now() - t, ok: false })
    throw err
  }
}

/** Escreve a linha `[perf]` da página. */
export function logPagePerf(route: string): void {
  if (!perfEnabled()) return
  try {
    const c = getCollector()
    // eslint-disable-next-line no-console -- log de métricas (só números), intencional
    console.info(`[perf] ${JSON.stringify({ kind: "page", route, totalMs: round(now() - c.t0), steps: c.steps })}`)
  } catch {
    // nunca quebra a página por causa de log
  }
}

/** Linha `[perf]` para uma Server Action chamada pelo navegador. */
export function logActionPerf(
  action: string,
  startedAt: number,
  extra: Omit<PerfStep, "name" | "ms"> & { authMs?: number } = {},
): void {
  if (!perfEnabled()) return
  // eslint-disable-next-line no-console -- log de métricas (só números), intencional
  console.info(`[perf] ${JSON.stringify({ kind: "action", action, totalMs: round(now() - startedAt), ...extra })}`)
}

export { now as perfNow }
