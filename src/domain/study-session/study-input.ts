/**
 * G1.6 (G-41) — validação runtime mínima e específica do input de
 * salvamento de estudo. TypeScript não protege runtime: estes helpers
 * convertem `unknown` (formulário/cliente) em valores honestos ANTES de
 * qualquer escrita. Sem `any`, sem exceções, sem limites inventados além
 * dos que o domínio já usa (ex.: energia 1..5, espelhando a action).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID v4 (ou qualquer variante textual) — o que o Postgres aceita. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim())
}

/**
 * Número finito ou null. `undefined`/`null`/`""` → null (ausência);
 * `"abc"`/`NaN`/`Infinity`/objetos → null (nunca NaN silencioso no banco,
 * que o driver serializaria como null sem avisar).
 */
export function finiteOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Inteiro com piso 0 ou null (durações planejadas). */
export function nonNegativeIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.round(n))
}

/** Inteiro dentro de [min, max] ou null (ex.: energia 1..5). */
export function clampIntOrNull(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, Math.round(n)))
}

/**
 * Replica a normalização de `buildIsoFromSaoPauloDateTime` (sao-paulo.ts)
 * só para dizer se a entrada é parseável — sem o fallback silencioso para
 * "agora" que aquela função usa. Retorna false para data vazia/inválida.
 */
export function isParsableSaoPauloDateTime(dateStr: unknown, timeStr: unknown): boolean {
  const d = typeof dateStr === "string" ? dateStr.trim() : ""
  if (!d) return false
  let t = typeof timeStr === "string" ? timeStr.trim() : ""
  if (!t) t = "00:00"
  const timeWithSec = t.length === 8 ? t : `${t}:00`
  return !Number.isNaN(new Date(`${d}T${timeWithSec}-03:00`).getTime())
}
