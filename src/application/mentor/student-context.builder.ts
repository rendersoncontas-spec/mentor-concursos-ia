import { buildSubjectAnalysis, computePanelStats, findBottlenecks } from "@/application/simulados/simulado-stats.service"
import { buildStudyPerformance, type StudySessionLite } from "@/application/simulados/study-performance"
import {
  aggregateBuckets,
  addDaysToKey,
  buildDayBucketsFromKeys,
  computeDisciplineStats,
  computeEditalCoverage,
  computePlanning,
  computeRevisionStatistics,
  computeStreaks,
  computeTimeCards,
  dateKeyOf,
  daysBetweenKeys,
  DEFAULT_TIMEZONE,
  keysBetween,
  todayKey as todayKeyOf,
  weekStartKeyOf,
  type DailyBucket,
  type DisciplineMeta,
  type DisciplineStat,
} from "@/application/study-analytics/engine/stats-engine"
import type { StatisticsCenterPayload } from "@/application/study-analytics/statistics-center.action"
import { EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import {
  MENTOR_CONTEXT_VERSION,
  type MentorCycleSection,
  type MentorDisciplineSummary,
  type MentorEditalSection,
  type MentorGoalsSection,
  type MentorPeriodTotals,
  type MentorPlanningSection,
  type MentorReviewsSection,
  type MentorSectionStatus,
  type MentorSimulationsSection,
  type MentorStudySection,
  type MentorTargetSection,
  type StudentMentorContext,
} from "@/domain/mentor/student-mentor-context"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"

import { buildMentorInsights, buildRecommendationCandidates, computeContextQuality } from "./mentor-insights"

/**
 * G2.15 — monta o StudentMentorContext a partir de dados JÁ LIDOS (função
 * pura: sem banco, sem relógio implícito, sem LLM).
 *
 * Nenhuma métrica é recalculada com regra nova — tudo sai dos serviços que
 * as telas já usam:
 *   - tempo/sessões/semana/sequência → motor de Estatísticas (buckets por dia
 *     em São Paulo, duração = duration_minutes ?? active_minutes);
 *   - por disciplina → computeDisciplineStats (Estatísticas);
 *   - simulados → computePanelStats / buildSubjectAnalysis / findBottlenecks (G2.10);
 *   - estudo × desempenho → buildStudyPerformance (G2.11);
 *   - revisões → computeRevisionStatistics; plano → computePlanning;
 *     edital → computeEditalCoverage; ciclo → buildCycleOverview (via loader).
 * As disciplinas chegam na identidade canônica (payload das Estatísticas, G2.13).
 */

/** Padrões do banco em `profiles` (igual ao padrão ⇒ não dá para afirmar que o aluno escolheu). */
export const PROFILE_DEFAULT_WEEKLY_QUESTIONS_GOAL = 100
export const PROFILE_DEFAULT_WEEKLY_DAYS_GOAL = 6

export type MentorStatsInput = Pick<
  StatisticsCenterPayload,
  | "sessions"
  | "attempts"
  | "disciplines"
  | "userDisciplines"
  | "reviewItems"
  | "reviewsCompletedLast30"
  | "activePlan"
  | "activePlanError"
  | "weekStartDay"
  | "simulados"
  | "identity"
>

export interface MentorContextInput {
  now: Date
  timezone?: string
  stats: MentorStatsInput
  cycle: { status: MentorSectionStatus; overview: CycleOverview | null }
  profileGoals: {
    status: MentorSectionStatus
    weeklyStudyHours: number | null
    weeklyQuestionsGoal: number | null
    weeklyStudyDaysGoal: number | null
  }
  target: { status: MentorSectionStatus; examName: string | null; examDate: string | null }
  sources: string[]
}

function periodTotals(buckets: DailyBucket[]): MentorPeriodTotals {
  const t = aggregateBuckets(buckets)
  return { minutes: t.minutes, sessions: t.sessions, studiedDays: t.studiedDays.size }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

export function buildStudentMentorContext(input: MentorContextInput): StudentMentorContext {
  const tz = input.timezone ?? DEFAULT_TIMEZONE
  const now = input.now
  const today = todayKeyOf(now, tz)
  const stats = input.stats
  const identity = stats.identity ?? EMPTY_DISCIPLINE_IDENTITY
  const weekStartDay = stats.weekStartDay ?? 0
  const sessions = stats.sessions
  const attempts = stats.attempts ?? []

  // ── Buckets diários (mesma função das Estatísticas), do 1º registro até hoje.
  const keys: string[] = []
  for (const s of sessions) {
    const k = dateKeyOf(s.startedAt, tz)
    if (k) keys.push(k)
  }
  for (const a of attempts) {
    const k = a.answeredAt ? dateKeyOf(a.answeredAt, tz) : null
    if (k) keys.push(k)
  }
  const firstKey = keys.length > 0 ? keys.reduce((m, k) => (k < m ? k : m)) : null
  const windowStart = addDaysToKey(today, -27) ?? today
  const rangeStart = firstKey && firstKey < windowStart ? firstKey : windowStart
  const buckets = buildDayBucketsFromKeys(sessions, attempts, keysBetween(rangeStart, today), tz)

  // ── Registro de disciplinas (nomes já na identidade canônica).
  const registry = new Map<string, DisciplineMeta>()
  for (const d of stats.disciplines ?? []) registry.set(d.id, d)
  for (const s of sessions) {
    if (s.disciplineId && !registry.has(s.disciplineId)) {
      registry.set(s.disciplineId, { id: s.disciplineId, name: s.disciplineName ?? s.disciplineId, area: s.disciplineArea })
    }
  }

  // ── Estudo realizado.
  let study: MentorStudySection
  let disciplineStatsTotal: DisciplineStat[] = []
  let disciplineStats28: DisciplineStat[] = []
  const timeCards = computeTimeCards(buckets, now, tz, weekStartDay)
  if (sessions.length === 0) {
    study = {
      status: "NO_DATA",
      totalMinutes: null,
      totalSessions: null,
      last7: null,
      previous7: null,
      last28: null,
      currentWeekMinutes: null,
      streak: null,
      lastStudyDate: null,
      daysSinceLastStudy: null,
    }
  } else {
    const studiedDays = new Set<string>()
    for (const s of sessions) {
      const k = dateKeyOf(s.startedAt, tz)
      if (k) studiedDays.add(k)
    }
    const lastStudyDate = [...studiedDays].sort().at(-1) ?? null
    const streak = computeStreaks(studiedDays, now, tz)
    study = {
      status: "OK",
      totalMinutes: timeCards.totalMinutes,
      totalSessions: aggregateBuckets(buckets).sessions,
      last7: periodTotals(buckets.slice(-7)),
      previous7: periodTotals(buckets.slice(-14, -7)),
      last28: periodTotals(buckets.slice(-28)),
      currentWeekMinutes: timeCards.weekMinutes,
      streak: { current: streak.current, longest: streak.longest },
      lastStudyDate,
      daysSinceLastStudy: lastStudyDate ? daysBetweenKeys(lastStudyDate, today) : null,
    }
    const revisionForAttention = computeRevisionStatistics(stats.reviewItems ?? [], 0, now, registry)
    const overdueMap = new Map(revisionForAttention.byDiscipline.map((d) => [d.disciplineId, d.overdue]))
    disciplineStatsTotal = computeDisciplineStats(
      sessions, attempts, registry, stats.userDisciplines ?? [], overdueMap, timeCards.totalMinutes, now, tz,
    )
    const sessions28 = sessions.filter((s) => {
      const k = dateKeyOf(s.startedAt, tz)
      return !!k && k >= windowStart && k <= today
    })
    disciplineStats28 = computeDisciplineStats(sessions28, [], registry, [], new Map(), 0, now, tz)
  }

  // ── Simulados (G2.10).
  const records = stats.simulados ?? null
  let simulations: MentorSimulationsSection
  const subjectAnalysis = records ? buildSubjectAnalysis(records) : []
  if (records === null) {
    simulations = emptySimulations("UNAVAILABLE")
  } else if (records.length === 0) {
    simulations = emptySimulations("NO_DATA")
  } else {
    const panel = computePanelStats(records)
    const bottlenecks = findBottlenecks(subjectAnalysis, panel.averageAccuracy)
    const primary = bottlenecks.primary
    simulations = {
      status: "OK",
      count: panel.totalSimulados,
      averageAccuracy: panel.averageAccuracy,
      firstAccuracy: panel.firstAccuracy,
      lastAccuracy: panel.lastAccuracy,
      bestAccuracy: panel.bestAccuracy,
      worstAccuracy: panel.worstAccuracy,
      firstToLastPp: panel.firstToLastPp,
      trend: panel.trend,
      lastDate: records.map((r) => r.simuladoDate).sort().at(-1) ?? null,
      bottleneck: primary
        ? {
            disciplineId: primary.disciplineId,
            name: primary.disciplineName,
            accuracy: primary.accuracy,
            reasons: [...primary.reasons],
            simuladosCount: primary.simuladosCount,
            lowData: primary.lowData,
          }
        : null,
    }
  }

  // ── Estudo × desempenho (G2.11), últimas 4 semanas.
  const lite: StudySessionLite[] = sessions.map((s) => ({
    id: s.id,
    disciplineId: s.disciplineId,
    startedAt: s.startedAt,
    durationMinutes: s.durationMinutes,
  }))
  const performance =
    sessions.length > 0 || (records?.length ?? 0) > 0
      ? buildStudyPerformance({
          records: records ?? [],
          sessions: lite,
          disciplineNames: new Map([...registry.values()].map((d) => [d.id, d.name])),
          identity,
          periodKey: "4w",
          todayKey: today,
          timezone: tz,
        })
      : null
  const performanceById = new Map((performance?.rows ?? []).filter((r) => r.disciplineId).map((r) => [r.disciplineId as string, r]))

  // ── Revisões.
  let reviews: MentorReviewsSection
  if (stats.reviewItems === null) {
    reviews = { status: "UNAVAILABLE", activeItems: null, overdue: null, dueToday: null, upcoming: null, completedLast30: stats.reviewsCompletedLast30 }
  } else if (stats.reviewItems.length === 0) {
    // 0 itens não é desempenho ruim: é ausência de revisão cadastrada.
    reviews = { status: "NO_DATA", activeItems: 0, overdue: null, dueToday: null, upcoming: null, completedLast30: stats.reviewsCompletedLast30 }
  } else {
    const rev = computeRevisionStatistics(stats.reviewItems, stats.reviewsCompletedLast30 ?? 0, now, registry)
    reviews = {
      status: "OK",
      activeItems: stats.reviewItems.length,
      overdue: rev.overdue,
      dueToday: rev.dueToday,
      upcoming: rev.upcoming,
      completedLast30: stats.reviewsCompletedLast30,
    }
  }
  const overdueByDiscipline = new Map(
    stats.reviewItems && stats.reviewItems.length > 0
      ? computeRevisionStatistics(stats.reviewItems, 0, now, registry).byDiscipline.map((d) => [d.disciplineId, d.overdue])
      : [],
  )

  // ── Ciclo (somente leitura do estado determinístico).
  const overview = input.cycle.overview
  const cycle: MentorCycleSection =
    input.cycle.status === "OK" && overview
      ? {
          status: "OK",
          name: overview.cycle.name ?? null,
          currentRound: overview.currentRound,
          totalRoundsDone: overview.totalRoundsDone,
          roundProgressPct: round1(overview.roundProgressPercentage),
          currentItem: overview.currentItem
            ? {
                disciplineId: overview.currentItem.disciplineId,
                name: overview.currentItem.disciplineName,
                studiedMinutesInRound: Math.round(overview.currentItem.studiedMinutesInRound),
                plannedMinutes: overview.currentItem.plannedMinutes,
              }
            : null,
          nextItem: overview.nextItem
            ? { disciplineId: overview.nextItem.disciplineId, name: overview.nextItem.disciplineName }
            : null,
        }
      : {
          status: input.cycle.status === "OK" ? "NO_DATA" : input.cycle.status,
          name: null,
          currentRound: null,
          totalRoundsDone: null,
          roundProgressPct: null,
          currentItem: null,
          nextItem: null,
        }

  // ── Planejamento (planejado ≠ realizado).
  let planning: MentorPlanningSection
  if (stats.activePlanError) {
    planning = { status: "UNAVAILABLE", weeklyTargetMinutes: null, targetSource: null, actualWeekMinutes: null, adherencePct: null }
  } else if (!stats.activePlan) {
    planning = { status: "NO_DATA", weeklyTargetMinutes: null, targetSource: null, actualWeekMinutes: null, adherencePct: null }
  } else {
    const p = computePlanning(stats.activePlan, buckets, now, tz, weekStartDay)
    planning = {
      status: "OK",
      weeklyTargetMinutes: p.weeklyTargetMinutes,
      targetSource: p.weeklyTargetSource ?? null,
      actualWeekMinutes: p.actualWeekMinutes,
      adherencePct: p.adherencePct === null ? null : round1(p.adherencePct),
    }
  }

  // ── Metas reais do perfil.
  const goals = buildGoals(input.profileGoals, buckets, today, weekStartDay, stats.weekStartDay === null, timeCards.weekMinutes)

  // ── Edital (status das disciplinas do aluno).
  let edital: MentorEditalSection
  if (stats.userDisciplines === null) {
    edital = { status: "UNAVAILABLE", total: null, completed: null, studying: null, revising: null, notStarted: null, percentage: null }
  } else if (stats.userDisciplines.length === 0) {
    edital = { status: "NO_DATA", total: null, completed: null, studying: null, revising: null, notStarted: null, percentage: null }
  } else {
    const cov = computeEditalCoverage(stats.userDisciplines, disciplineStatsTotal, registry, now)
    edital = {
      status: "OK",
      total: cov.total,
      completed: cov.completed,
      studying: cov.studying,
      revising: cov.revising,
      notStarted: cov.notStarted,
      percentage: round1(cov.percentage),
    }
  }

  // ── Concurso-alvo.
  const target: MentorTargetSection = {
    status: input.target.status,
    examName: input.target.examName,
    examDate: input.target.examDate,
    daysToExam:
      input.target.examDate && /^\d{4}-\d{2}-\d{2}/.test(input.target.examDate)
        ? daysBetweenKeys(today, input.target.examDate.slice(0, 10))
        : null,
  }

  // ── Disciplinas (identidade canônica): estudo + simulados + edital + revisões.
  const editalStatus = new Map((stats.userDisciplines ?? []).map((u) => [u.disciplineId, u.status]))
  const byTotal = new Map(disciplineStatsTotal.filter((d) => d.disciplineId !== "UNKNOWN").map((d) => [d.disciplineId, d]))
  const by28 = new Map(disciplineStats28.map((d) => [d.disciplineId, d]))
  const bySimulado = new Map(subjectAnalysis.filter((a) => a.disciplineId).map((a) => [a.disciplineId as string, a]))
  const ids = new Set<string>([...byTotal.keys(), ...bySimulado.keys(), ...editalStatus.keys()])
  const disciplines: MentorDisciplineSummary[] = [...ids].map((id) => {
    const t = byTotal.get(id)
    const s = bySimulado.get(id)
    const hasStudyHistory = sessions.length > 0
    return {
      disciplineId: id,
      name: registry.get(id)?.name ?? t?.name ?? s?.disciplineName ?? id,
      mergedNames: [...(identity.memberNames[id] ?? [])],
      studyMinutesLast28: hasStudyHistory ? (by28.get(id)?.minutes ?? 0) : null,
      studyMinutesTotal: hasStudyHistory ? (t?.minutes ?? 0) : null,
      sessionsTotal: hasStudyHistory ? (t?.sessions ?? 0) : null,
      lastStudyDate: t?.lastStudiedDate ?? null,
      simuladosCount: s?.simuladosCount ?? 0,
      simuladoAverage: s?.accuracy ?? null,
      simuladoFirst: s?.firstAccuracy ?? null,
      simuladoLast: s?.lastAccuracy ?? null,
      simuladoEvolutionPp: s?.evolutionPp ?? null,
      simuladoTrend: s?.trend ?? null,
      studyPerformanceStatus: performanceById.get(id)?.status ?? null,
      editalStatus: editalStatus.get(id) ?? null,
      overdueReviews: reviews.status === "OK" ? (overdueByDiscipline.get(id) ?? 0) : null,
    }
  })
  disciplines.sort(
    (a, b) =>
      (b.studyMinutesTotal ?? -1) - (a.studyMinutesTotal ?? -1) ||
      b.simuladosCount - a.simuladosCount ||
      a.name.localeCompare(b.name, "pt-BR"),
  )

  const base: Omit<StudentMentorContext, "contextQuality" | "insights" | "recommendations"> = {
    version: MENTOR_CONTEXT_VERSION,
    generatedAt: now.toISOString(),
    timezone: tz,
    todayKey: today,
    identity: { knownAliases: Object.keys(identity.canonicalOf).length },
    target,
    study,
    simulations,
    reviews,
    cycle,
    planning,
    goals,
    edital,
    disciplines,
    sources: [...input.sources],
  }
  const contextQuality = computeContextQuality(base)
  const withQuality = { ...base, contextQuality }
  const insights = buildMentorInsights(withQuality)
  const recommendations = buildRecommendationCandidates(withQuality)
  return { ...withQuality, insights, recommendations }
}

function emptySimulations(status: MentorSectionStatus): MentorSimulationsSection {
  return {
    status,
    count: null,
    averageAccuracy: null,
    firstAccuracy: null,
    lastAccuracy: null,
    bestAccuracy: null,
    worstAccuracy: null,
    firstToLastPp: null,
    trend: null,
    lastDate: null,
    bottleneck: null,
  }
}

function buildGoals(
  profile: MentorContextInput["profileGoals"],
  buckets: DailyBucket[],
  today: string,
  weekStartDay: number,
  weekStartUnknown: boolean,
  /** Minutos da semana pelo MESMO cálculo das Estatísticas (computeTimeCards). */
  weekMinutes: number,
): MentorGoalsSection {
  const notes: string[] = []
  if (profile.status !== "OK") {
    return { status: profile.status, weeklyStudy: null, weeklyQuestions: null, weeklyDays: null, notes }
  }
  if (weekStartUnknown) notes.push("Início da semana não pôde ser lido; usado o padrão (domingo).")

  const weekStart = weekStartKeyOf(today, weekStartDay) ?? today
  const weekKeys = keysBetween(weekStart, today)
  const byDate = new Map(buckets.map((b) => [b.date, b]))
  let weekQuestions = 0
  let weekDays = 0
  for (const k of weekKeys) {
    const b = byDate.get(k)
    if (!b) continue
    weekQuestions += b.questions
    if (b.minutes > 0) weekDays += 1
  }
  const daysElapsed = Math.min(7, Math.max(1, weekKeys.length))

  let weeklyStudy: MentorGoalsSection["weeklyStudy"] = null
  if (profile.weeklyStudyHours && profile.weeklyStudyHours > 0) {
    const target = Math.round(profile.weeklyStudyHours * 60)
    weeklyStudy = {
      target,
      realized: weekMinutes,
      difference: weekMinutes - target,
      unit: "minutes",
      expectedByToday: Math.round((target * daysElapsed) / 7),
      daysElapsed,
    }
  }

  let weeklyQuestions: MentorGoalsSection["weeklyQuestions"] = null
  const q = profile.weeklyQuestionsGoal
  if (q && q > 0 && q !== PROFILE_DEFAULT_WEEKLY_QUESTIONS_GOAL) {
    weeklyQuestions = { target: q, realized: weekQuestions, difference: weekQuestions - q, unit: "questions" }
  } else if (q === PROFILE_DEFAULT_WEEKLY_QUESTIONS_GOAL) {
    notes.push("Meta de questões igual ao padrão do sistema (100): não tratada como meta do aluno.")
  }

  let weeklyDays: MentorGoalsSection["weeklyDays"] = null
  const d = profile.weeklyStudyDaysGoal
  if (d && d > 0 && d !== PROFILE_DEFAULT_WEEKLY_DAYS_GOAL) {
    weeklyDays = { target: d, realized: weekDays, difference: weekDays - d, unit: "days" }
  } else if (d === PROFILE_DEFAULT_WEEKLY_DAYS_GOAL) {
    notes.push("Meta de dias igual ao padrão do sistema (6): não tratada como meta do aluno.")
  }

  const any = weeklyStudy || weeklyQuestions || weeklyDays
  return { status: any ? "OK" : "NO_DATA", weeklyStudy, weeklyQuestions, weeklyDays, notes }
}
