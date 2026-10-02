/**
 * G1.3 (G-35) — semântica ÚNICA de duração de estudo.
 *
 * Unidade canônica de armazenamento: `study_history.duration_minutes`,
 * inteiro ARREDONDADO (Math.round). Segundos são a unidade precisa e devem
 * ser preservados em metadata quando disponíveis.
 *
 * Regras:
 * - timer/cronômetro, manual e offline usam `studyMinutesFromMs` (round) —
 *   o mesmo valor no display, no snapshot pendente e no banco;
 * - revisão tem regra própria documentada (piso 1, session-duration.ts):
 *   uma sessão respondida nunca vale zero;
 * - linha de 0 min registra que a sessão aconteceu (conta como sessão),
 *   mas contribui com 0 para totais/ciclo — consistente em todos os
 *   leitores, nunca "meia-verdade".
 */
export function studyMinutesFromMs(ms: unknown): number {
  const n = Number(ms)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n / 60000))
}

export function studyMinutesFromSeconds(seconds: unknown): number {
  const n = Number(seconds)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n / 60))
}

/** Minutos fracionários vindos de formulário manual → inteiro. */
export function studyMinutesFromMinutesInput(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}
