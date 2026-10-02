/**
 * G1.3 (G-38) — normalização CANÔNICA do fingerprint de importação.
 *
 * Divergência real: o TypeScript usava `?? ""` e o índice único
 * (`20260921_2_study_history_import_fingerprint_unique_idx.sql`) usa
 * `COALESCE(..., '~null~')`. Os dois mecanismos nunca comparavam strings
 * entre si (TS×TS em memória, banco×banco no índice), mas a identidade
 * lógica declarada como "exatamente a mesma" não era: NULL vs '' colidia
 * em um lado e não no outro.
 *
 * Regra única (igual ao SQL): NULL/undefined → '~null~'; qualquer outro
 * valor → String(valor) sem alteração ('' continua '').
 * Fingerprints não são persistidos (computados on the fly dos dois lados),
 * então unificar não invalida dado existente.
 */
export const FINGERPRINT_NULL = "~null~"

export function fingerprintField(value: unknown): string {
  if (value === null || value === undefined) return FINGERPRINT_NULL
  return String(value)
}

export function buildImportFingerprint(parts: {
  epochSeconds: string
  disciplineId: string
  durationMinutes: string
  questions: string
  correct: string
  origin: string
}): string {
  return `v2|${parts.epochSeconds}|${parts.disciplineId}|${parts.durationMinutes}|${parts.questions}|${parts.correct}|${parts.origin}`
}
