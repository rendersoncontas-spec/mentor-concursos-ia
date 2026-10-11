import {
  addDaysToKey,
  dateKeyOf,
  daysBetweenKeys,
  DEFAULT_TIMEZONE,
  formatDurationRaw,
} from "@/application/study-analytics/engine/stats-engine"
import {
  canonicalizeDisciplineIds,
  identityDisplayName,
  type DisciplineIdentitySnapshot,
} from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecord, SimuladoSubjectAnalysis } from "@/domain/simulados/types"

import { canonicalizeSimuladoRecords } from "./simulado-identity"
import { buildSubjectAnalysis, MIN_TREND_POINTS } from "./simulado-stats.service"

/**
 * G2.11 — Estudo × desempenho em simulados, por disciplina (cálculo puro).
 *
 * Fontes:
 *   - tempo estudado: `study_history` (fato realizado; nunca plano/meta);
 *   - desempenho: simulados externos registrados, pelas MESMAS funções do
 *     G2.10 (`buildSubjectAnalysis`), sem lógica paralela.
 * As duas fontes se encontram pela IDENTIDADE CANÔNICA da disciplina
 * (G2.12: `discipline_id` → `canonical_discipline_id` quando o catálogo declara
 * o vínculo; senão o próprio id). Matéria de simulado sem id não tem como
 * receber horas.
 *
 * Nenhuma frase gerada aqui afirma causa: só coloca lado a lado o que foi
 * estudado e o que mudou nos simulados no mesmo período.
 */

// ─── Constantes (documentadas em docs/study-performance-correlation.md) ──────

/** Evolução (último − primeiro simulado, em p.p.) a partir da qual há crescimento. */
export const GROWTH_PP = 3
/** Crescimento forte. */
export const HIGH_GROWTH_PP = 8
/** Queda relevante (evolução ≤ −3 p.p.). */
export const DROP_PP = 3
/** "Muito estudo": média de 3 h por semana na matéria, no período. */
export const HIGH_STUDY_MINUTES_PER_WEEK = 180
/** "Pouco estudo": menos de 1 h por semana na matéria, no período. */
export const LOW_STUDY_MINUTES_PER_WEEK = 60
/** Simulados mínimos da matéria no período para falar em evolução. */
export const MIN_SIMULADOS_FOR_EVOLUTION = 2
/** Uma sessão acima disso é dado inválido e fica fora da soma. */
export const MAX_SESSION_MINUTES = 24 * 60

export type StudyPerformancePeriodKey = "4w" | "8w" | "all"

export const STUDY_PERFORMANCE_PERIODS: { key: StudyPerformancePeriodKey; weeks: number | null; label: string; phrase: string }[] = [
  { key: "4w", weeks: 4, label: "4 semanas", phrase: "nas últimas 4 semanas" },
  { key: "8w", weeks: 8, label: "8 semanas", phrase: "nas últimas 8 semanas" },
  { key: "all", weeks: null, label: "Todo o período", phrase: "em todo o período registrado" },
]

const DEFAULT_PERIOD = { key: "8w" as const, weeks: 8, label: "8 semanas", phrase: "nas últimas 8 semanas" }

function periodOf(key: StudyPerformancePeriodKey) {
  return STUDY_PERFORMANCE_PERIODS.find((p) => p.key === key) ?? DEFAULT_PERIOD
}

export function isStudyPerformancePeriod(value: unknown): value is StudyPerformancePeriodKey {
  return value === "4w" || value === "8w" || value === "all"
}

export type StudyPerformanceStatus =
  | "ALTA_EVOLUCAO"
  | "EVOLUCAO"
  | "ESTAVEL"
  | "QUEDA"
  | "MUITO_ESTUDO_POUCA_EVOLUCAO"
  | "POUCO_ESTUDO"
  | "DADOS_INSUFICIENTES"
  | "SEM_SIMULADO"

export const STUDY_PERFORMANCE_STATUS_LABEL: Record<StudyPerformanceStatus, string> = {
  ALTA_EVOLUCAO: "Alta evolução",
  EVOLUCAO: "Evoluindo",
  ESTAVEL: "Estável",
  QUEDA: "Em queda",
  MUITO_ESTUDO_POUCA_EVOLUCAO: "Muito estudo, pouca evolução",
  POUCO_ESTUDO: "Pouco estudo",
  DADOS_INSUFICIENTES: "Dados insuficientes",
  SEM_SIMULADO: "Sem simulado",
}

export interface StudySessionLite {
  id: string
  disciplineId: string | null
  startedAt: string
  durationMinutes: number
}

export interface StudyPerformanceRow {
  /** null = matéria do simulado sem vínculo com o catálogo. */
  disciplineId: string | null
  disciplineName: string
  /** null quando não é possível atribuir horas (sem id no catálogo). 0 = nenhuma sessão registrada. */
  studyMinutes: number | null
  studySessions: number
  /** Minutos por semana do período (apenas 4/8 semanas e com horas atribuíveis). */
  weeklyMinutes: number[] | null
  simuladosCount: number
  averageAccuracy: number | null
  firstAccuracy: number | null
  lastAccuracy: number | null
  bestAccuracy: number | null
  worstAccuracy: number | null
  evolutionPp: number | null
  trend: SimuladoSubjectAnalysis["trend"]
  history: SimuladoSubjectAnalysis["history"]
  status: StudyPerformanceStatus
  /** G2.12: outras entradas do catálogo somadas nesta identidade (aliases). */
  mergedNames: string[]
  /** Frases factuais, na ordem de exibição. */
  insights: string[]
}

export interface StudyPerformanceReport {
  periodKey: StudyPerformancePeriodKey
  periodLabel: string
  periodPhrase: string
  startKey: string | null
  endKey: string
  /** Semanas usadas no cálculo de "por semana" (mín. 1). */
  weeks: number
  totalStudyMinutes: number
  /** Minutos de sessões cuja disciplina não existe/está vazia — mostrados, nunca redistribuídos. */
  unassignedStudyMinutes: number
  /** Sessões descartadas por duração inválida (≤ 0 ou > 24 h) ou data ilegível. */
  invalidSessions: number
  simuladosInPeriod: number
  rows: StudyPerformanceRow[]
}

// ─── Período ─────────────────────────────────────────────────────────────────

export function periodWindow(
  periodKey: StudyPerformancePeriodKey,
  todayKey: string,
): { startKey: string | null; endKey: string; weeks: number | null } {
  const period = periodOf(periodKey)
  if (period.weeks === null) return { startKey: null, endKey: todayKey, weeks: null }
  return { startKey: addDaysToKey(todayKey, -(period.weeks * 7 - 1)), endKey: todayKey, weeks: period.weeks }
}

function inWindow(key: string, startKey: string | null, endKey: string): boolean {
  return (startKey === null || key >= startKey) && key <= endKey
}

// ─── Tempo estudado ──────────────────────────────────────────────────────────

export interface StudyAggregate {
  byDiscipline: Map<string, { minutes: number; sessions: number; weekly: number[] | null }>
  totalMinutes: number
  unassignedMinutes: number
  invalidSessions: number
  earliestKey: string | null
}

/**
 * Soma do tempo REALMENTE estudado por disciplina dentro da janela.
 * Mesma regra de duração do motor de estatísticas (duration_minutes > 0, dia
 * em São Paulo). Sessão repetida (mesmo id) conta uma vez; sem disciplina vai
 * para "não atribuído", nunca para uma matéria qualquer.
 */
export function aggregateStudyMinutes(
  sessions: StudySessionLite[],
  startKey: string | null,
  endKey: string,
  weeks: number | null,
  timezone: string = DEFAULT_TIMEZONE,
): StudyAggregate {
  const byDiscipline = new Map<string, { minutes: number; sessions: number; weekly: number[] | null }>()
  const seen = new Set<string>()
  let totalMinutes = 0
  let unassignedMinutes = 0
  let invalidSessions = 0
  let earliestKey: string | null = null

  for (const s of sessions) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    const minutes = Number(s.durationMinutes)
    const key = dateKeyOf(s.startedAt, timezone)
    if (!key) {
      invalidSessions += 1
      continue
    }
    if (!inWindow(key, startKey, endKey)) continue
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_SESSION_MINUTES) {
      invalidSessions += 1
      continue
    }
    totalMinutes += minutes
    if (earliestKey === null || key < earliestKey) earliestKey = key
    if (!s.disciplineId) {
      unassignedMinutes += minutes
      continue
    }
    const entry = byDiscipline.get(s.disciplineId) ?? {
      minutes: 0,
      sessions: 0,
      weekly: weeks !== null ? new Array<number>(weeks).fill(0) : null,
    }
    entry.minutes += minutes
    entry.sessions += 1
    if (entry.weekly && startKey) {
      const idx = Math.floor(daysBetweenKeys(startKey, key) / 7)
      if (idx >= 0 && idx < entry.weekly.length) entry.weekly[idx] = (entry.weekly[idx] ?? 0) + minutes
    }
    byDiscipline.set(s.disciplineId, entry)
  }
  return { byDiscipline, totalMinutes, unassignedMinutes, invalidSessions, earliestKey }
}

// ─── Classificação ───────────────────────────────────────────────────────────

/**
 * Situação da matéria. Ordem das regras (a primeira que vale):
 *   menos de 2 simulados → POUCO_ESTUDO (se < 1 h/semana) ou
 *                          SEM_SIMULADO (0) / DADOS_INSUFICIENTES (1);
 *   evolução ≤ −3 p.p.                          → QUEDA
 *   ≥ 3 h/semana e evolução < +3 p.p.           → MUITO_ESTUDO_POUCA_EVOLUCAO
 *   evolução ≥ +8 p.p.                          → ALTA_EVOLUCAO
 *   evolução ≥ +3 p.p.                          → EVOLUCAO
 *   caso contrário                              → ESTAVEL
 * `minutesPerWeek` null (sem vínculo com o catálogo) desliga as regras de horas.
 */
export function classifyStudyPerformance(input: {
  simuladosCount: number
  evolutionPp: number | null
  minutesPerWeek: number | null
}): StudyPerformanceStatus {
  const { simuladosCount, evolutionPp, minutesPerWeek } = input
  const lowStudy = minutesPerWeek !== null && minutesPerWeek < LOW_STUDY_MINUTES_PER_WEEK
  const highStudy = minutesPerWeek !== null && minutesPerWeek >= HIGH_STUDY_MINUTES_PER_WEEK
  if (simuladosCount < MIN_SIMULADOS_FOR_EVOLUTION || evolutionPp === null) {
    if (lowStudy) return "POUCO_ESTUDO"
    return simuladosCount === 0 ? "SEM_SIMULADO" : "DADOS_INSUFICIENTES"
  }
  if (evolutionPp <= -DROP_PP) return "QUEDA"
  if (highStudy && evolutionPp < GROWTH_PP) return "MUITO_ESTUDO_POUCA_EVOLUCAO"
  if (evolutionPp >= HIGH_GROWTH_PP) return "ALTA_EVOLUCAO"
  if (evolutionPp >= GROWTH_PP) return "EVOLUCAO"
  return "ESTAVEL"
}

// ─── Frases ──────────────────────────────────────────────────────────────────

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`)

export function formatPpSigned(value: number): string {
  const v = String(Math.abs(Math.round(value * 10) / 10)).replace(".", ",")
  if (value > 0) return `+${v} p.p.`
  if (value < 0) return `−${v} p.p.`
  return `${v} p.p.`
}

function buildInsights(row: Omit<StudyPerformanceRow, "insights">, phrase: string): string[] {
  const out: string[] = []
  const name = row.disciplineName
  if (row.studyMinutes === null) {
    out.push(`${name} foi registrada no simulado sem vínculo com o catálogo de matérias, então não dá para somar as horas de estudo dela.`)
  } else if (row.studyMinutes > 0) {
    out.push(`Você estudou ${formatDurationRaw(row.studyMinutes)} de ${name} ${phrase}.`)
  } else {
    out.push(`Nenhuma sessão de estudo de ${name} registrada ${phrase}.`)
  }

  if (row.simuladosCount === 0) {
    out.push(`Nenhum simulado com ${name} ${phrase}. Dados insuficientes para analisar o desempenho desta matéria.`)
  } else if (row.simuladosCount === 1) {
    out.push(`Um simulado ${phrase}: ${pct(row.lastAccuracy)}. Ainda não dá para medir evolução.`)
  } else if (row.firstAccuracy !== null && row.lastAccuracy !== null && row.evolutionPp !== null) {
    out.push(`Seu resultado nos simulados passou de ${pct(row.firstAccuracy)} para ${pct(row.lastAccuracy)} (${formatPpSigned(row.evolutionPp)}).`)
    out.push(
      row.simuladosCount >= MIN_TREND_POINTS
        ? "Há dados suficientes para acompanhar a tendência."
        : "Com 2 simulados há comparação, mas ainda não tendência.",
    )
  }

  if (row.status === "MUITO_ESTUDO_POUCA_EVOLUCAO" && row.studyMinutes !== null && row.evolutionPp !== null) {
    out.push(
      `${name} teve ${formatDurationRaw(row.studyMinutes)} de estudo, mas ${formatPpSigned(row.evolutionPp)} de evolução nos simulados. Vale olhar a qualidade do estudo, não apenas o tempo.`,
    )
  }
  return out
}

// ─── Cruzamento ──────────────────────────────────────────────────────────────

/**
 * Monta o relatório do período. Simulados e sessões fora da janela ficam de
 * fora dos dois lados, para que horas e evolução falem do mesmo intervalo.
 */
export function buildStudyPerformance(input: {
  records: SimuladoRecord[]
  sessions: StudySessionLite[]
  disciplineNames: Map<string, string>
  periodKey: StudyPerformancePeriodKey
  todayKey: string
  timezone?: string
  /** G2.12: identidade canônica (aliases + nome pessoal). Ausente = cada id é ele mesmo. */
  identity?: DisciplineIdentitySnapshot | null
}): StudyPerformanceReport {
  const period = periodOf(input.periodKey)
  const { startKey, endKey, weeks } = periodWindow(period.key, input.todayKey)
  const identity = input.identity ?? null
  // Estudo e simulado passam pela MESMA resolução de identidade antes de se
  // encontrarem — é o que faz "estudo em A" e "simulado em B" (A e B aliases
  // de X) aparecerem juntos em X.
  const sessions = canonicalizeDisciplineIds(input.sessions, identity)
  const study = aggregateStudyMinutes(sessions, startKey, endKey, weeks, input.timezone)
  const nameOf = (id: string, fallback: string) =>
    identityDisplayName(identity, id, input.disciplineNames.get(id) ?? fallback)
  const mergedOf = (id: string | null) => (id && identity?.memberNames[id] ? [...identity.memberNames[id]] : [])

  const records = canonicalizeSimuladoRecords(
    input.records.filter((r) => inWindow(r.simuladoDate, startKey, endKey)),
    identity,
  )
  const analysis = buildSubjectAnalysis(records)

  // Semanas do "por semana": fixas em 4/8; em "todo o período", do primeiro
  // registro (estudo ou simulado) até hoje.
  let effectiveWeeks = weeks ?? 1
  if (weeks === null) {
    const firstSimulado = records.reduce<string | null>((acc, r) => (acc === null || r.simuladoDate < acc ? r.simuladoDate : acc), null)
    const first = [study.earliestKey, firstSimulado].filter((k): k is string => !!k).sort()[0]
    if (first) effectiveWeeks = Math.max(1, Math.ceil((daysBetweenKeys(first, endKey) + 1) / 7))
  }

  const rows: StudyPerformanceRow[] = []
  const usedStudyIds = new Set<string>()

  for (const a of analysis) {
    const studyEntry = a.disciplineId ? study.byDiscipline.get(a.disciplineId) : undefined
    if (a.disciplineId) usedStudyIds.add(a.disciplineId)
    const studyMinutes = a.disciplineId ? (studyEntry?.minutes ?? 0) : null
    const base = {
      disciplineId: a.disciplineId,
      disciplineName: a.disciplineId ? nameOf(a.disciplineId, a.disciplineName) : a.disciplineName,
      studyMinutes,
      studySessions: studyEntry?.sessions ?? 0,
      weeklyMinutes: studyMinutes === null ? null : (studyEntry?.weekly ?? (weeks !== null ? new Array<number>(weeks).fill(0) : null)),
      simuladosCount: a.simuladosCount,
      averageAccuracy: a.accuracy,
      firstAccuracy: a.firstAccuracy,
      lastAccuracy: a.lastAccuracy,
      bestAccuracy: a.bestAccuracy,
      worstAccuracy: a.worstAccuracy,
      evolutionPp: a.evolutionPp,
      trend: a.trend,
      history: a.history,
      mergedNames: mergedOf(a.disciplineId),
    }
    const status = classifyStudyPerformance({
      simuladosCount: a.simuladosCount,
      evolutionPp: a.evolutionPp,
      minutesPerWeek: studyMinutes === null ? null : studyMinutes / effectiveWeeks,
    })
    const row = { ...base, status }
    rows.push({ ...row, insights: buildInsights(row, period.phrase) })
  }

  // Matérias estudadas sem nenhum simulado no período.
  for (const [disciplineId, entry] of study.byDiscipline) {
    if (usedStudyIds.has(disciplineId)) continue
    const base = {
      disciplineId,
      disciplineName: nameOf(disciplineId, "Matéria"),
      studyMinutes: entry.minutes,
      studySessions: entry.sessions,
      weeklyMinutes: entry.weekly,
      simuladosCount: 0,
      averageAccuracy: null,
      firstAccuracy: null,
      lastAccuracy: null,
      bestAccuracy: null,
      worstAccuracy: null,
      evolutionPp: null,
      trend: null,
      history: [],
      mergedNames: mergedOf(disciplineId),
    }
    const status = classifyStudyPerformance({ simuladosCount: 0, evolutionPp: null, minutesPerWeek: entry.minutes / effectiveWeeks })
    const row = { ...base, status }
    rows.push({ ...row, insights: buildInsights(row, period.phrase) })
  }

  // Primeiro as matérias com simulado (há o que comparar), depois por horas.
  rows.sort(
    (a, b) =>
      Number(b.simuladosCount > 0) - Number(a.simuladosCount > 0) ||
      (b.studyMinutes ?? -1) - (a.studyMinutes ?? -1) ||
      a.disciplineName.localeCompare(b.disciplineName, "pt-BR"),
  )

  return {
    periodKey: period.key,
    periodLabel: period.label,
    periodPhrase: period.phrase,
    startKey,
    endKey,
    weeks: effectiveWeeks,
    totalStudyMinutes: study.totalMinutes,
    unassignedStudyMinutes: study.unassignedMinutes,
    invalidSessions: study.invalidSessions,
    simuladosInPeriod: records.length,
    rows,
  }
}
