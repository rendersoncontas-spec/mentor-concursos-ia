import { canonicalDisciplineKey } from "@/domain/disciplines/discipline-naming"
import { isValidSimuladoScoringRule, isValidSimuladoSource } from "@/domain/simulados/simulado-rules"
import type { SimuladoRecordInput, SimuladoRecordSource, SimuladoScoringRule } from "@/domain/simulados/types"

import { accuracyOf } from "./simulado-stats.service"

/**
 * G2.10 — validação e normalização server-side do registro de um simulado
 * EXTERNO (feito fora do NomeIA). Função pura: a Server Action chama, os
 * testes chamam, ninguém confia no que veio do navegador.
 *
 * Regras de derivação (o servidor recalcula o que pode ser derivado):
 *   - com matérias: os totais do simulado são a SOMA das matérias (o total
 *     enviado pelo cliente é ignorado) — assim o geral e o detalhado nunca
 *     divergem;
 *   - erros = questões − acertos − brancos, por matéria e no total;
 *   - percentual = acertos ÷ questões.
 */

export const RECORD_LIMITS = {
  maxName: 120,
  maxText: 120,
  maxNotes: 2000,
  maxQuestions: 1000,
  maxSubjects: 60,
  /** Um simulado de até 24 h; acima disso é erro de digitação. */
  maxDurationSeconds: 24 * 60 * 60,
  minDate: "2000-01-01",
} as const

export interface NormalizedSubject {
  disciplineId: string | null
  disciplineName: string
  questionsCount: number
  correctCount: number
  wrongCount: number
  blankCount: number
}

export interface NormalizedSimuladoRecord {
  name: string
  examName: string | null
  roleName: string | null
  simuladoDate: string
  source: SimuladoRecordSource
  sourceCustom: string | null
  examBoard: string
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalBlank: number
  accuracy: number | null
  timeSpentSeconds: number | null
  notes: string | null
  scoringRule: SimuladoScoringRule
  penaltyPerWrong: number | null
  penaltyScore: number | null
  subjects: NormalizedSubject[]
}

type Result = { ok: true; value: NormalizedSimuladoRecord } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  return t.length === 0 ? null : t.slice(0, max)
}

/** Inteiro ≥ 0 ou null quando não é número inteiro válido. */
function nonNegativeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null
  return n
}

/** Data real no calendário, no formato YYYY-MM-DD. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split("-").map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Nome comparável — G2.12: é a MESMA chave canônica do catálogo
 * (`canonicalDisciplineKey`: sem acento, sem caixa, hífen/pontuação viram
 * espaço). Uma regra só para catálogo, importação e simulados.
 */
export function subjectKey(name: string): string {
  return canonicalDisciplineKey(name)
}

function validateSubjects(raw: SimuladoRecordInput["subjects"]): { ok: true; subjects: NormalizedSubject[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Matérias inválidas." }
  if (raw.length > RECORD_LIMITS.maxSubjects) return { ok: false, error: `Use no máximo ${RECORD_LIMITS.maxSubjects} matérias.` }

  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  const subjects: NormalizedSubject[] = []
  for (const s of raw) {
    const name = text(s?.disciplineName, RECORD_LIMITS.maxText)
    if (!name) return { ok: false, error: "Informe o nome de cada matéria." }

    const disciplineId = s?.disciplineId ?? null
    if (disciplineId !== null && !isUuid(disciplineId)) return { ok: false, error: `Matéria "${name}" inválida.` }

    const key = subjectKey(name)
    if ((disciplineId && seenIds.has(disciplineId)) || seenNames.has(key)) {
      return { ok: false, error: `A matéria "${name}" foi adicionada mais de uma vez.` }
    }
    if (disciplineId) seenIds.add(disciplineId)
    seenNames.add(key)

    const questions = nonNegativeInt(s?.questionsCount)
    const correct = nonNegativeInt(s?.correctCount)
    const blank = nonNegativeInt(s?.blankCount ?? 0)
    if (questions === null || questions < 1 || questions > RECORD_LIMITS.maxQuestions) {
      return { ok: false, error: `Informe a quantidade de questões de "${name}" (1 a ${RECORD_LIMITS.maxQuestions}).` }
    }
    if (correct === null) return { ok: false, error: `Acertos de "${name}" inválidos.` }
    if (blank === null) return { ok: false, error: `Questões em branco de "${name}" inválidas.` }
    if (correct > questions) return { ok: false, error: `"${name}": acertos não podem passar do total de questões.` }
    if (correct + blank > questions) {
      return { ok: false, error: `"${name}": acertos + brancos não podem passar do total de questões.` }
    }
    subjects.push({
      disciplineId,
      disciplineName: name,
      questionsCount: questions,
      correctCount: correct,
      blankCount: blank,
      wrongCount: questions - correct - blank,
    })
  }
  return { ok: true, subjects }
}

/**
 * @param todayKey dia de hoje em São Paulo (YYYY-MM-DD) — simulado com data
 *   futura é recusado.
 */
export function normalizeSimuladoRecordInput(input: SimuladoRecordInput | null | undefined, todayKey: string): Result {
  if (!input || typeof input !== "object") return { ok: false, error: "Dados do simulado inválidos." }

  const name = text(input.name, RECORD_LIMITS.maxName)
  if (!name) return { ok: false, error: "Informe o nome do simulado." }

  if (!isValidDateKey(input.simuladoDate)) return { ok: false, error: "Informe uma data válida para o simulado." }
  if (input.simuladoDate > todayKey) return { ok: false, error: "A data do simulado não pode estar no futuro." }
  if (input.simuladoDate < RECORD_LIMITS.minDate) return { ok: false, error: "Data do simulado inválida." }

  const examBoard = text(input.exam_board, RECORD_LIMITS.maxText)
  if (!examBoard) return { ok: false, error: "Informe a banca do simulado." }

  if (!isValidSimuladoSource(input.source)) return { ok: false, error: "Fonte do simulado inválida." }
  const scoringRule: SimuladoScoringRule = input.scoringRule ?? "PERCENTUAL"
  if (!isValidSimuladoScoringRule(scoringRule)) return { ok: false, error: "Regra de pontuação inválida." }

  // ── Resultado: por matéria (soma) ou geral ─────────────────────────────
  const subjectsResult = validateSubjects(input.subjects ?? [])
  if (!subjectsResult.ok) return subjectsResult
  const subjects = subjectsResult.subjects

  let totalQuestions: number
  let totalCorrect: number
  let totalBlank: number
  if (subjects.length > 0) {
    totalQuestions = subjects.reduce((a, s) => a + s.questionsCount, 0)
    totalCorrect = subjects.reduce((a, s) => a + s.correctCount, 0)
    totalBlank = subjects.reduce((a, s) => a + s.blankCount, 0)
  } else {
    const q = nonNegativeInt(input.totalQuestions)
    const c = nonNegativeInt(input.totalCorrect)
    const b = nonNegativeInt(input.totalBlank ?? 0)
    if (q === null || q < 1) return { ok: false, error: "O simulado precisa ter pelo menos 1 questão." }
    if (q > RECORD_LIMITS.maxQuestions) return { ok: false, error: `O simulado pode ter no máximo ${RECORD_LIMITS.maxQuestions} questões.` }
    if (c === null) return { ok: false, error: "Acertos inválidos." }
    if (b === null) return { ok: false, error: "Questões em branco inválidas." }
    if (c > q) return { ok: false, error: "Acertos não podem passar do total de questões." }
    if (c + b > q) return { ok: false, error: "Acertos + brancos não podem passar do total de questões." }
    totalQuestions = q
    totalCorrect = c
    totalBlank = b
  }
  const totalWrong = totalQuestions - totalCorrect - totalBlank

  // Erros enviados pelo cliente só são conferidos (o valor gravado é o derivado).
  if (subjects.length === 0 && input.totalWrong !== undefined && input.totalWrong !== null) {
    const w = nonNegativeInt(input.totalWrong)
    if (w === null || w !== totalWrong) {
      return { ok: false, error: "Acertos + erros + brancos deve ser igual ao total de questões." }
    }
  }

  // ── Tempo ───────────────────────────────────────────────────────────────
  let timeSpentSeconds: number | null = null
  if (input.timeSpentSeconds !== null && input.timeSpentSeconds !== undefined) {
    const t = nonNegativeInt(input.timeSpentSeconds)
    if (t === null || t > RECORD_LIMITS.maxDurationSeconds) {
      return { ok: false, error: "Tempo gasto inválido (máximo de 24 horas)." }
    }
    timeSpentSeconds = t === 0 ? null : t
  }

  // ── Pontuação ───────────────────────────────────────────────────────────
  let penaltyPerWrong: number | null = null
  if (scoringRule === "CEBRASPE") {
    const p = input.penaltyPerWrong === null || input.penaltyPerWrong === undefined ? 1 : Number(input.penaltyPerWrong)
    if (!Number.isFinite(p) || p < 0 || p > 10) return { ok: false, error: "Penalização por erro inválida." }
    penaltyPerWrong = p
  }
  let penaltyScore: number | null = null
  if (input.penaltyScore !== null && input.penaltyScore !== undefined) {
    const p = Number(input.penaltyScore)
    if (!Number.isFinite(p) || p < 0 || p > 100) return { ok: false, error: "Pontuação final deve ficar entre 0 e 100." }
    penaltyScore = p
  }

  return {
    ok: true,
    value: {
      name,
      examName: text(input.examName, RECORD_LIMITS.maxText),
      roleName: text(input.roleName, RECORD_LIMITS.maxText),
      simuladoDate: input.simuladoDate,
      source: input.source,
      sourceCustom: input.source === "OUTRO" ? text(input.sourceCustom, RECORD_LIMITS.maxText) : null,
      examBoard,
      totalQuestions,
      totalCorrect,
      totalWrong,
      totalBlank,
      accuracy: accuracyOf(totalCorrect, totalQuestions),
      timeSpentSeconds,
      notes: text(input.notes, RECORD_LIMITS.maxNotes),
      scoringRule,
      penaltyPerWrong,
      penaltyScore,
      subjects,
    },
  }
}
