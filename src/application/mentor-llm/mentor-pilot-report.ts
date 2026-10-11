import type { MentorQualityAssessment } from "./mentor-ai-quality"
import type { MentorRejection } from "./mentor-ai-response.validator"

/**
 * G2.19 — análise DETERMINÍSTICA do piloto (sem LLM avaliando LLM): métricas
 * por versão, percentis de latência, classificação das rejeições e tabela
 * v1 × v2. Usado pelo script `scripts/mentor-ai-pilot.ts`; puro e testável.
 * Métrica sem dado → null (nunca estimada).
 */

export type PilotRejectionCategory =
  | "NUMBER_OUTPUT"
  | "INVALID_REFERENCE"
  | "INVALID_EVIDENCE"
  | "INVALID_RECOMMENDATION"
  | "CAUSALITY"
  | "PROMPT_INJECTION"
  | "UNSUPPORTED_DISCIPLINE"
  | "INVALID_SCHEMA"
  | "TRUNCATED"
  | "OTHER"

/** Categoria da diretiva para cada rejeição do validador. */
export function classifyRejection(r: Pick<MentorRejection, "code" | "field" | "message">): PilotRejectionCategory {
  switch (r.code) {
    case "NUMBER":
    case "DATE":
    case "QUANTITY":
      return "NUMBER_OUTPUT"
    case "SCHEMA":
      return "INVALID_SCHEMA"
    case "CAUSALITY":
      return "CAUSALITY"
    case "SUSPICIOUS_CONTENT":
    case "PRETEND_ACTION":
    case "INVISIBLE_CHARS":
      return "PROMPT_INJECTION"
    case "DISCIPLINE_MISMATCH":
    case "REF_OUT_OF_BLOCK":
      return "UNSUPPORTED_DISCIPLINE"
    case "EVIDENCE_MISMATCH":
      return "INVALID_EVIDENCE"
    case "REF_UNKNOWN":
    case "REF_DUPLICATE":
    case "REF_MALFORMED":
    case "REF_AS_NUMBER":
      if (/evidenceId/.test(r.field) || /evidenceId/.test(r.message)) return "INVALID_EVIDENCE"
      if (/candidateId/.test(r.field) || /candidateId/.test(r.message)) return "INVALID_RECOMMENDATION"
      if (/disciplineRef|disciplina/.test(r.message) || r.message.includes("(D")) return "UNSUPPORTED_DISCIPLINE"
      return "INVALID_REFERENCE"
    default:
      return "OTHER"
  }
}

/** Desfecho do log → categoria, para falhas que não passam pelo validador. */
export function classifyOutcome(outcome: string): PilotRejectionCategory | null {
  if (outcome === "truncated") return "TRUNCATED"
  if (outcome === "invalid_json") return "INVALID_SCHEMA"
  if (outcome === "low_value") return "OTHER"
  return null
}

/** Percentil por posição mais próxima; null se houver poucos valores. */
export function percentile(values: readonly number[], p: number, minSamples: number): number | null {
  if (values.length < minSamples || values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null
}

export interface PilotCallRow {
  scenario: string
  promptVersion: string
  /** "OK", "FAILED", "INSUFFICIENT_DATA", "RATE_LIMITED", "SKIPPED_BUDGET"… */
  status: string
  failReason: string | null
  outcome: string | null
  cached: boolean
  providerMs: number | null
  validationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  rejections: Pick<MentorRejection, "code" | "field" | "message">[]
  assessment: Pick<MentorQualityAssessment, "scores" | "flags"> | null
}

const mean = (xs: number[]) => (xs.length > 0 ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
const nums = (xs: (number | null)[]) => xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x))

export interface PilotVersionSummary {
  promptVersion: string
  providerCalls: number
  success: number
  failures: number
  timeouts: number
  rejected: number
  rejectionRate: number | null
  cacheHits: number
  skippedBudget: number
  latencyAvgMs: number | null
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  validationAvgMs: number | null
  inputTokensAvg: number | null
  outputTokensAvg: number | null
  costTotalUsd: number | null
  costAvgUsd: number | null
  rejectionsByCategory: Partial<Record<PilotRejectionCategory, number>>
}

export function summarizeVersion(rows: readonly PilotCallRow[], promptVersion: string): PilotVersionSummary {
  const mine = rows.filter((r) => r.promptVersion === promptVersion)
  const called = mine.filter((r) => r.providerMs !== null && !r.cached)
  const rejectedRows = called.filter((r) => r.status === "FAILED" && r.failReason === "INVALID_RESPONSE")
  const answered = called.filter((r) => r.status === "OK" || (r.status === "FAILED" && r.failReason === "INVALID_RESPONSE"))
  const byCat: Partial<Record<PilotRejectionCategory, number>> = {}
  for (const r of rejectedRows) {
    const cats = new Set<PilotRejectionCategory>(r.rejections.map(classifyRejection))
    const fromOutcome = r.outcome ? classifyOutcome(r.outcome) : null
    if (fromOutcome) cats.add(fromOutcome)
    if (cats.size === 0) cats.add("OTHER")
    for (const c of cats) byCat[c] = (byCat[c] ?? 0) + 1
  }
  const latencies = nums(called.map((r) => r.providerMs))
  const costs = nums(called.map((r) => r.costUsd))
  return {
    promptVersion,
    providerCalls: called.length,
    success: called.filter((r) => r.status === "OK").length,
    failures: called.filter((r) => r.status === "FAILED").length,
    timeouts: called.filter((r) => r.failReason === "TIMEOUT").length,
    rejected: rejectedRows.length,
    rejectionRate: answered.length > 0 ? Math.round((rejectedRows.length / answered.length) * 1000) / 1000 : null,
    cacheHits: mine.filter((r) => r.cached).length,
    skippedBudget: mine.filter((r) => r.status === "SKIPPED_BUDGET").length,
    latencyAvgMs: mean(latencies),
    latencyP50Ms: percentile(latencies, 50, 3),
    latencyP95Ms: percentile(latencies, 95, 20),
    validationAvgMs: mean(nums(called.map((r) => r.validationMs))),
    inputTokensAvg: mean(nums(called.map((r) => r.inputTokens))),
    outputTokensAvg: mean(nums(called.map((r) => r.outputTokens))),
    costTotalUsd: costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) * 1e6) / 1e6 : null,
    costAvgUsd: costs.length > 0 ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 1e6) / 1e6 : null,
    rejectionsByCategory: byCat,
  }
}

export interface PilotComparisonRow {
  scenario: string
  v1: string
  v2: string
  winner: "mentor-v1" | "mentor-v2" | "empate" | "sem dados"
  reason: string
}

function label(r: PilotCallRow | undefined): string {
  if (!r) return "—"
  if (r.status === "OK") return `OK${r.providerMs !== null ? ` · ${r.providerMs} ms` : ""}`
  if (r.status === "FAILED") {
    const cats = [...new Set(r.rejections.map(classifyRejection))]
    const out = r.outcome ? classifyOutcome(r.outcome) : null
    return `FALHOU (${[...cats, ...(out ? [out] : [])].join(", ") || r.failReason || "?"})`
  }
  return r.status
}

/** Soma das dimensões heurísticas (USEFULNESS fica de fora: é humana). */
function heuristicScore(r: PilotCallRow): number {
  const s = r.assessment?.scores
  if (!s) return 0
  return (["SPECIFICITY", "ACTIONABILITY", "UNCERTAINTY_HANDLING", "CLARITY"] as const).reduce((acc, k) => acc + (s[k] ?? 0), 0)
}

/**
 * Tabela v1 × v2 por cenário. Ordem dos critérios: segurança/fidelidade
 * (passou no validador?) → qualidade heurística → latência → tokens. O
 * vencedor é PROVISÓRIO até a avaliação humana (utilidade).
 */
export function compareVersions(rows: readonly PilotCallRow[]): PilotComparisonRow[] {
  const scenarios = [...new Set(rows.map((r) => r.scenario))]
  return scenarios.map((scenario) => {
    const pick = (v: string) => rows.find((r) => r.scenario === scenario && r.promptVersion === v && !r.cached)
    const a = pick("mentor-v1")
    const b = pick("mentor-v2")
    const row = (winner: PilotComparisonRow["winner"], reason: string): PilotComparisonRow => ({ scenario, v1: label(a), v2: label(b), winner, reason })
    if (!a || !b || a.status === "SKIPPED_BUDGET" || b.status === "SKIPPED_BUDGET") return row("sem dados", "uma das versões não rodou")
    if (a.status !== "OK" && b.status !== "OK") {
      if (a.status === b.status && a.status !== "FAILED") return row("empate", `ambas ${a.status}`)
      return row("empate", "ambas falharam")
    }
    if (a.status === "OK" && b.status !== "OK") return row("mentor-v1", `v2 ${label(b).toLowerCase()}`)
    if (b.status === "OK" && a.status !== "OK") return row("mentor-v2", `v1 ${label(a).toLowerCase()}`)
    const sa = heuristicScore(a)
    const sb = heuristicScore(b)
    if (Math.abs(sa - sb) >= 0.1) return sa > sb ? row("mentor-v1", "qualidade heurística maior") : row("mentor-v2", "qualidade heurística maior")
    const gap = a.providerMs !== null && b.providerMs !== null ? Math.abs(a.providerMs - b.providerMs) : 0
    if (a.providerMs !== null && b.providerMs !== null && gap >= 300 && gap >= 0.2 * Math.max(a.providerMs, b.providerMs)) {
      return a.providerMs < b.providerMs ? row("mentor-v1", "mais rápida (qualidade igual)") : row("mentor-v2", "mais rápida (qualidade igual)")
    }
    const ta = (a.inputTokens ?? 0) + (a.outputTokens ?? 0)
    const tb = (b.inputTokens ?? 0) + (b.outputTokens ?? 0)
    if (ta > 0 && tb > 0 && Math.abs(ta - tb) >= 0.15 * Math.max(ta, tb)) return ta < tb ? row("mentor-v1", "menos tokens (qualidade igual)") : row("mentor-v2", "menos tokens (qualidade igual)")
    return row("empate", "qualidade, latência e tokens equivalentes")
  })
}

/**
 * Critério da diretiva (Fase 21) aplicado aos números do piloto: manter v2 se
 * for pelo menos tão segura, com grounding igual ou melhor, sem aumentar a
 * rejeição de forma problemática nem custo/latência sem benefício.
 */
export function pilotDecision(v1: PilotVersionSummary, v2: PilotVersionSummary, table: readonly PilotComparisonRow[]): { keepV2: boolean | null; reasons: string[] } {
  if (v1.providerCalls === 0 || v2.providerCalls === 0) return { keepV2: null, reasons: ["sem chamadas reais suficientes nas duas versões"] }
  const reasons: string[] = []
  let keep = true
  const r1 = v1.rejectionRate ?? 0
  const r2 = v2.rejectionRate ?? 0
  if (r2 > r1 + 0.15) {
    keep = false
    reasons.push(`rejeição da v2 (${r2}) bem acima da v1 (${r1})`)
  }
  const v1wins = table.filter((t) => t.winner === "mentor-v1").length
  const v2wins = table.filter((t) => t.winner === "mentor-v2").length
  if (v1wins > v2wins + 1) {
    keep = false
    reasons.push(`v1 vence mais casos (${v1wins} × ${v2wins})`)
  }
  if (v1.latencyAvgMs !== null && v2.latencyAvgMs !== null && v2.latencyAvgMs > v1.latencyAvgMs * 1.5 && v2wins <= v1wins) {
    keep = false
    reasons.push("v2 bem mais lenta sem ganho de qualidade")
  }
  if (keep) reasons.push(`v2 ≥ v1: rejeição ${r2} × ${r1}; vitórias ${v2wins} × ${v1wins}`)
  return { keepV2: keep, reasons }
}
