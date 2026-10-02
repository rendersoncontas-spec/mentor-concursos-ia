/**
 * G1.2 (G-10) — contrato de regras/score de simulados (fonte única).
 *
 * Os mesmos conjuntos alimentam os CHECKs do banco
 * (20260929_g12_integrity_checks.sql) e a validação server-side da action.
 * net_score/net_percentage ficam SEM limite inferior de propósito: CEBRASPE
 * admite líquido negativo (wrong > correct).
 */
import type { SimuladoRecordSource, SimuladoScoringRule } from "./types"

export const SIMULADO_SOURCES: readonly SimuladoRecordSource[] = [
  "TEC",
  "GRAN",
  "ESTRATEGIA",
  "QCONCURSOS",
  "PDF",
  "PROVA_ANTERIOR",
  "OUTRO",
] as const

export const SIMULADO_SCORING_RULES: readonly SimuladoScoringRule[] = [
  "PERCENTUAL",
  "CEBRASPE",
  "PENALIZACAO",
  "PERSONALIZADO",
] as const

export function isValidSimuladoSource(value: unknown): value is SimuladoRecordSource {
  return (
    typeof value === "string" && (SIMULADO_SOURCES as readonly string[]).includes(value)
  )
}

export function isValidSimuladoScoringRule(value: unknown): value is SimuladoScoringRule {
  return (
    typeof value === "string" && (SIMULADO_SCORING_RULES as readonly string[]).includes(value)
  )
}
