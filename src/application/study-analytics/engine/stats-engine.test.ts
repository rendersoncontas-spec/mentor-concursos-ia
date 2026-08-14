/* eslint-disable @typescript-eslint/no-non-null-assertion */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  type ActivePlan,
  type DailyBucket,
  type DisciplineMeta,
  type DisciplineStat,
  type InsightInput,
  type QuestionAttemptRecord,
  type ReviewItemRow,
  type RevisionStatistics,
  type SessionRecord,
  type UserDisciplineInput,
  activeMinutesOf,
  addDaysToKey,
  aggregateBuckets,
  buildDayBuckets,
  buildHeatmap,
  classifyDiscipline,
  computeAttentionScore,
  computeComparisons,
  computeDisciplineStats,
  computeEditalCoverage,
  computeFocusStatistics,
  computeFrequency,
  computeHoursOfDay,
  computeMonthlyReport,
  computePlanning,
  computePriorities,
  computeProductivity,
  computeQuestionStatistics,
  computeRevisionStatistics,
  computeSessionStatistics,
  computeStreaks,
  computeTimeCards,
  computeTimeOfDayAnalysis,
  computeTopicStats,
  computeWeeklyReport,
  dateKeyFromYmd,
  dateKeyOf,
  daysBetweenKeys,
  focusPercentOf,
  formatDurationRaw,
  generateInsights,
  keyToDate,
  keysBetween,
  lastNDays,
  mondayKeyOf,
  monthKeyOf,
  pausedMinutesOf,
  sanitizeAttempt,
  sanitizeSession,
  todayKey,
  weekdayOfKey,
} from "./stats-engine.ts"

const TZ = "UTC"
const NOW = new Date("2026-08-11T15:00:00Z")

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s1",
    disciplineId: "d1",
    disciplineName: "Direito Constitucional",
    disciplineArea: "Direito",
    startedAt: "2026-08-10T14:00:00Z",
    finishedAt: null,
    durationMinutes: 60,
    activeMinutes: null,
    pausedMinutes: null,
    completed: true,
    interrupted: false,
    focusScore: 4,
    energyLevel: null,
    difficulty: null,
    studyType: "TEORIA",
    studySource: "FREE",
    pagesRead: 10,
    questionsAnswered: 0,
    questionsCorrect: 0,
    flashcardsReviewed: 0,
    topicName: null,
    focusPercentage: null,
    plannedMinutes: null,
    notes: null,
    focusSound: null,
    ...overrides,
  }
}

// ─── Datas ──────────────────────────────────────────────────────────────────

test("dateKeyOf converte ISO para chave no fuso", () => {
  assert.equal(dateKeyOf("2026-08-10T22:30:00Z", "UTC"), "2026-08-10")
  assert.equal(dateKeyOf("2026-08-11T02:00:00Z", "America/Sao_Paulo"), "2026-08-10")
  assert.equal(dateKeyOf(null, TZ), null)
  assert.equal(dateKeyOf("data-invalida", TZ), null)
})

test("addDaysToKey e daysBetweenKeys", () => {
  assert.equal(addDaysToKey("2026-08-11", -1), "2026-08-10")
  assert.equal(addDaysToKey("2026-08-11", 3), "2026-08-14")
  assert.equal(daysBetweenKeys("2026-08-01", "2026-08-11"), 10)
})

test("keyToDate valida", () => {
  assert.equal(keyToDate("2024-02-29") !== null, true)
  assert.equal(keyToDate("2026-02-29"), null)
  assert.equal(keyToDate("2026-13-01"), null)
  assert.equal(keyToDate("abc"), null)
})

test("keysBetween", () => {
  assert.deepEqual(keysBetween("2026-08-08", "2026-08-11"), [
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
    "2026-08-11",
  ])
})

test("mondayKeyOf é segunda-feira anterior ou igual", () => {
  assert.equal(mondayKeyOf("2026-08-11"), "2026-08-10")
  assert.equal(mondayKeyOf("2026-08-10"), "2026-08-10")
  assert.equal(weekdayOfKey("2026-08-11"), 2)
})

test("lastNDays termina hoje", () => {
  const keys = lastNDays(3, NOW, TZ)
  assert.deepEqual(keys, ["2026-08-09", "2026-08-10", "2026-08-11"])
  assert.equal(todayKey(NOW, TZ), "2026-08-11")
})

test("monthKeyOf", () => {
  assert.equal(monthKeyOf("2026-08-11"), "2026-08")
})

// ─── Sanitização ────────────────────────────────────────────────────────────

test("sanitizeSession descarta registros inválidos", () => {
  assert.equal(sanitizeSession({ started_at: null }), null)
  assert.equal(sanitizeSession({ started_at: "invalido" }), null)
  const ok = sanitizeSession({ started_at: "2026-08-10T14:00:00Z", id: "a" })
  assert.ok(ok)
  assert.equal(ok!.durationMinutes, 0)
})

test("sanitizeSession clampa acertos para não exceder respondidas", () => {
  const s = sanitizeSession({
    started_at: "2026-08-10T14:00:00Z",
    questions_answered: 5,
    questions_correct: 12,
  })
  assert.equal(s!.questionsAnswered, 5)
  assert.equal(s!.questionsCorrect, 5)
})

test("sanitizeAttempt normaliza corret/answered_at", () => {
  assert.equal(sanitizeAttempt({ id: "a", correct: true })!.correct, true)
  assert.equal(sanitizeAttempt({ id: "b", correct: "false" })!.correct, false)
  assert.equal(sanitizeAttempt({ id: "c", answered_at: null })!.answeredAt, null)
})

// ─── Derivações por sessão ──────────────────────────────────────────────────

test("activeMinutesOf usa active_minutes ou desconta pausa", () => {
  assert.equal(activeMinutesOf(session({ durationMinutes: 60, activeMinutes: 45 })), 45)
  assert.equal(
    activeMinutesOf(session({ durationMinutes: 60, activeMinutes: null, pausedMinutes: 15 })),
    45,
  )
  assert.equal(
    activeMinutesOf(session({ durationMinutes: 60, activeMinutes: null, pausedMinutes: 70 })),
    0,
  )
})

test("pausedMinutesOf usa pausa explícita ou duração - ativo", () => {
  assert.equal(pausedMinutesOf(session({ durationMinutes: 60, pausedMinutes: 20 })), 20)
  assert.equal(
    pausedMinutesOf(session({ durationMinutes: 60, activeMinutes: 50, pausedMinutes: null })),
    10,
  )
})

test("focusPercentOf prioriza focus_percentage", () => {
  assert.equal(focusPercentOf(session({ focusPercentage: 90, focusScore: 4 })), 90)
  assert.equal(focusPercentOf(session({ focusPercentage: null, focusScore: 4 })), 80)
  assert.equal(focusPercentOf(session({ focusPercentage: null, focusScore: null })), null)
})

// ─── Buckets ────────────────────────────────────────────────────────────────

test("buildDayBuckets aloca sessões e tentativas no dia certo", () => {
  const sessions = [
    session({ startedAt: "2026-08-10T10:00:00Z", questionsAnswered: 4, questionsCorrect: 3 }),
    session({ startedAt: "2026-08-11T10:00:00Z", questionsAnswered: 0 }),
  ]
  const attempts: QuestionAttemptRecord[] = [
    {
      id: "a1",
      questionId: "q1",
      disciplineId: "d1",
      correct: true,
      answeredAt: "2026-08-11T11:00:00Z",
    },
    {
      id: "a2",
      questionId: "q2",
      disciplineId: "d1",
      correct: false,
      answeredAt: "2026-08-11T12:00:00Z",
    },
  ]
  const buckets = buildDayBuckets(sessions, attempts, 5, NOW, TZ)
  const today = buckets[buckets.length - 1]!
  const yesterday = buckets[buckets.length - 2]!
  assert.equal(today.date, "2026-08-11")
  assert.equal(today.minutes, 60)
  assert.equal(today.questions, 2)
  assert.equal(today.correct, 1)
  assert.equal(today.accuracy, 50)
  assert.equal(yesterday.questions, 4)
  assert.equal(yesterday.accuracy, 75)
})

test("aggregateBuckets só conta dias estudados com minutos", () => {
  const buckets: DailyBucket[] = [
    {
      date: "2026-08-10",
      minutes: 30,
      activeMinutes: 30,
      pausedMinutes: 0,
      sessions: 1,
      completedSessions: 1,
      interruptedSessions: 0,
      pages: 5,
      questions: 2,
      correct: 2,
      wrong: 0,
      accuracy: 100,
      flashcards: 0,
      focusSum: 80,
      focusCount: 1,
      focusAvg: 80,
      attempts: 0,
    },
    {
      date: "2026-08-11",
      minutes: 0,
      activeMinutes: 0,
      pausedMinutes: 0,
      sessions: 0,
      completedSessions: 0,
      interruptedSessions: 0,
      pages: 0,
      questions: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
      flashcards: 0,
      focusSum: 0,
      focusCount: 0,
      focusAvg: null,
      attempts: 0,
    },
  ]
  const t = aggregateBuckets(buckets)
  assert.equal(t.minutes, 30)
  assert.equal(t.studiedDays.size, 1)
  assert.equal(t.accuracy, 100)
})

// ─── Cards de tempo ─────────────────────────────────────────────────────────

test("computeTimeCards soma hoje, semana (seg→hoje) e mês", () => {
  const mins: [string, number][] = [
    ["2026-08-01", 30],
    ["2026-08-10", 60],
    ["2026-08-11", 45],
    ["2026-07-20", 999],
  ]
  const buckets: DailyBucket[] = lastNDays(20, NOW, TZ).map((date) => {
    const m = mins.find(([d]) => d === date)?.[1] ?? 0
    return {
      date,
      minutes: m,
      activeMinutes: m,
      pausedMinutes: 0,
      sessions: m > 0 ? 1 : 0,
      completedSessions: m > 0 ? 1 : 0,
      interruptedSessions: 0,
      pages: m > 0 ? 2 : 0,
      questions: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
      flashcards: 0,
      focusSum: m > 0 ? 60 : 0,
      focusCount: m > 0 ? 1 : 0,
      focusAvg: m > 0 ? 60 : null,
      attempts: 0,
    }
  })
  const t = computeTimeCards(buckets, NOW, TZ)
  assert.equal(t.todayMinutes, 45)
  assert.equal(t.weekMinutes, 105)
  assert.equal(t.monthMinutes, 135)
  assert.equal(t.totalMinutes, 135)
  assert.equal(t.studiedDayCount, 3)
  assert.equal(t.avgPerStudiedDay, 45)
  assert.equal(t.bestDay!.date, "2026-08-10")
})

// ─── Streaks ────────────────────────────────────────────────────────────────

test("computeStreaks: sequência atual termina ontem sem quebrar hoje", () => {
  const days = new Set(["2026-08-08", "2026-08-09", "2026-08-10"])
  const s = computeStreaks(days, NOW, TZ)
  assert.equal(s.current, 3)
  assert.equal(s.currentEndsToday, false)
  assert.equal(s.longest, 3)
})

test("computeStreaks: hoje completa a sequência", () => {
  const days = new Set(["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11"])
  const s = computeStreaks(days, NOW, TZ)
  assert.equal(s.current, 4)
  assert.equal(s.currentEndsToday, true)
})

test("computeStreaks: quebra zera a atual, longest mantém", () => {
  const days = new Set(["2026-08-09", "2026-08-10", "2026-08-12"])
  const s = computeStreaks(days, NOW, TZ)
  assert.equal(s.current, 2)
  assert.equal(s.longest, 2)
})

// ─── Questões ───────────────────────────────────────────────────────────────

test("computeQuestionStatistics soma sessões + tentativas", () => {
  const sessions = [session({ questionsAnswered: 5, questionsCorrect: 4 })]
  const attempts: QuestionAttemptRecord[] = [
    {
      id: "a",
      questionId: "q",
      disciplineId: "d",
      correct: true,
      answeredAt: "2026-08-11T12:00:00Z",
    },
    {
      id: "b",
      questionId: "q",
      disciplineId: "d",
      correct: false,
      answeredAt: "2026-08-11T13:00:00Z",
    },
  ]
  const q = computeQuestionStatistics(sessions, attempts)
  assert.equal(q.total, 7)
  assert.equal(q.correct, 5)
  assert.equal(Math.round(q.accuracy ?? 0), 71)
})

// ─── Disciplinas ────────────────────────────────────────────────────────────

test("classifyDiscipline: dominado exige acurácia e recência", () => {
  assert.equal(
    classifyDiscipline({ questions: 10, accuracy: 90, daysSince: 2, studied: true }),
    "DOMINADO",
  )
  assert.equal(
    classifyDiscipline({ questions: 10, accuracy: 70, daysSince: 2, studied: true }),
    "EM_DESENVOLVIMENTO",
  )
  assert.equal(
    classifyDiscipline({ questions: 10, accuracy: 50, daysSince: 2, studied: true }),
    "ATENCAO",
  )
  assert.equal(
    classifyDiscipline({ questions: 10, accuracy: 35, daysSince: 2, studied: true }),
    "CRITICO",
  )
  assert.equal(
    classifyDiscipline({ questions: 0, accuracy: null, daysSince: 70, studied: true }),
    "CRITICO",
  )
  assert.equal(
    classifyDiscipline({ questions: 0, accuracy: null, daysSince: 5, studied: true }),
    "EM_DESENVOLVIMENTO",
  )
})

test("computeAttentionScore: pesos documentados", () => {
  const r = computeAttentionScore({
    accuracy: 50,
    wrong: 40,
    daysSince: 40,
    overdue: 20,
    status: "NOT_STARTED",
    trendDirection: "DOWN",
  })
  assert.equal(r.score, 85)
  assert.equal(r.reasons.length, 3)
  const ok = computeAttentionScore({
    accuracy: 95,
    wrong: 1,
    daysSince: 0,
    overdue: 0,
    status: "CONCLUIDA",
    trendDirection: "UP",
  })
  assert.ok(ok.score < 10)
})

test("computeDisciplineStats agrupa por disciplina com tendência", () => {
  const registry = new Map<string, DisciplineMeta>([
    ["d1", { id: "d1", name: "Constitucional", area: "Direito" }],
  ])
  const sessions: SessionRecord[] = [
    session({
      startedAt: "2026-08-01T10:00:00Z",
      durationMinutes: 30,
      questionsAnswered: 10,
      questionsCorrect: 9,
    }),
    session({ startedAt: "2026-08-11T10:00:00Z", durationMinutes: 30, questionsAnswered: 0 }),
  ]
  const stats = computeDisciplineStats(sessions, [], registry, [], new Map(), 60, NOW, TZ)
  assert.equal(stats.length, 1)
  const d = stats[0]!
  assert.equal(d.name, "Constitucional")
  assert.equal(d.minutes, 60)
  assert.equal(d.classification, "DOMINADO")
  assert.equal(d.accuracy, 90)
  assert.ok(d.attentionScore >= 0)
})

// ─── Tópicos ────────────────────────────────────────────────────────────────

test("computeTopicStats agrupa tópicos", () => {
  const sessions = [
    session({ topicName: "ADCT", questionsAnswered: 4, questionsCorrect: 2 }),
    session({ topicName: "ADCT", questionsAnswered: 1, questionsCorrect: 0 }),
  ]
  const topics = computeTopicStats(sessions, NOW, TZ)
  assert.equal(topics.length, 1)
  assert.equal(topics[0]!.topicName, "ADCT")
  assert.equal(topics[0]!.questions, 5)
  assert.equal(topics[0]!.accuracy, 40)
  assert.equal(topics[0]!.classification, "ATENCAO")
})

// ─── Períodos do dia ────────────────────────────────────────────────────────

test("computeHoursOfDay mapeia horários e marca o melhor", () => {
  const sessions = [
    session({ startedAt: "2026-08-10T02:00:00Z", questionsAnswered: 1 }),
    session({ startedAt: "2026-08-10T08:00:00Z", questionsAnswered: 6, questionsCorrect: 5 }),
    session({ startedAt: "2026-08-10T20:00:00Z" }),
  ]
  const hours = computeHoursOfDay(sessions, [], TZ)
  assert.equal(hours[0]!.label.includes("Madrugada"), true)
  assert.equal(hours[0]!.sessions, 1)
  assert.equal(hours[1]!.label.includes("Manhã"), true)
  assert.equal(Math.round(hours[1]!.accuracy ?? 0), 83)
  assert.equal(hours[1]!.best, true)
  assert.equal(hours[3]!.sessions, 1)
})

// ─── Comparações ────────────────────────────────────────────────────────────

test("computeComparisons: semana atual vs anterior e deltas", () => {
  const buckets: DailyBucket[] = lastNDays(20, NOW, TZ).map((date) => {
    const isWeek = date >= "2026-08-10" && date <= "2026-08-11"
    const minutes = isWeek ? 40 : 10
    return {
      date,
      minutes,
      activeMinutes: minutes,
      pausedMinutes: 0,
      sessions: minutes > 0 ? 1 : 0,
      completedSessions: minutes > 0 ? 1 : 0,
      interruptedSessions: 0,
      pages: 0,
      questions: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
      flashcards: 0,
      focusSum: 0,
      focusCount: 0,
      focusAvg: null,
      attempts: 0,
    }
  })
  const rows = computeComparisons(buckets, NOW, TZ)
  const week = rows.find((r) => r.id === "week_vs_prev")!
  assert.ok(week.metrics.minutes.current! > week.metrics.minutes.previous!)
  const month = rows.find((r) => r.id === "month_vs_prev")!
  assert.equal(month.metrics.minutes.current, 170)
  assert.equal(month.metrics.minutes.previous, 90)
})

// ─── Planejamento ───────────────────────────────────────────────────────────

test("computePlanning: aderência da semana", () => {
  const plan: ActivePlan = {
    weeklyHours: 2,
    weeklyQuestions: 30,
    weeklyDays: 4,
    items: [
      { dayOfWeek: 1, durationMinutes: 60, disciplineId: "d1" },
      { dayOfWeek: 3, durationMinutes: 60, disciplineId: "d1" },
    ],
  }
  const buckets: DailyBucket[] = lastNDays(5, NOW, TZ).map((date) => {
    let minutes = 0
    if (date === "2026-08-10") minutes = 45
    else if (date === "2026-08-11") minutes = 30
    return {
      date,
      minutes,
      activeMinutes: minutes,
      pausedMinutes: 0,
      sessions: minutes > 0 ? 1 : 0,
      completedSessions: minutes > 0 ? 1 : 0,
      interruptedSessions: 0,
      pages: 0,
      questions: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
      flashcards: 0,
      focusSum: 0,
      focusCount: 0,
      focusAvg: null,
      attempts: 0,
    }
  })
  const p = computePlanning(plan, buckets, NOW, TZ)
  assert.equal(p.hasPlan, true)
  assert.equal(p.weeklyTargetMinutes, 120)
  assert.equal(p.actualWeekMinutes, 75)
  assert.ok(Math.abs((p.adherencePct ?? 0) - 62.5) < 0.01)
  const sunday = p.series.find((s) => s.weekday === 1 && s.date === "2026-08-10")!
  assert.equal(sunday.plannedMinutes, 60)
  assert.equal(sunday.actualMinutes, 45)
})

test("computePlanning sem plano retorna hasPlan false", () => {
  const p = computePlanning(null, [], NOW, TZ)
  assert.equal(p.hasPlan, false)
  assert.equal(p.adherencePct, null)
})

// ─── Revisões ───────────────────────────────────────────────────────────────

test("computeRevisionStatistics classifica por vencimento", () => {
  const items: ReviewItemRow[] = [
    { id: "r1", disciplineId: "d1", status: "PENDING", nextReviewAt: "2026-08-01T10:00:00Z" },
    { id: "r2", disciplineId: "d1", status: "PENDING", nextReviewAt: "2026-08-11T23:00:00Z" },
    { id: "r3", disciplineId: "d2", status: "PENDING", nextReviewAt: "2026-08-20T10:00:00Z" },
  ]
  const registry = new Map<string, DisciplineMeta>([
    ["d1", { id: "d1", name: "Constitucional", area: "Direito" }],
  ])
  const s = computeRevisionStatistics(items, 12, NOW, registry)
  assert.equal(s.totalPending, 3)
  assert.equal(s.overdue, 1)
  assert.equal(s.dueToday, 1)
  assert.equal(s.upcoming, 1)
  assert.equal(s.completedLast30, 12)
  assert.equal(s.completionRate, 80)
  assert.equal(s.byDiscipline[0]!.name, "Constitucional")
})

// ─── Edital ─────────────────────────────────────────────────────────────────

test("computeEditalCoverage conta status", () => {
  const ud: UserDisciplineInput[] = [
    { disciplineId: "d1", status: "CONCLUIDA" },
    { disciplineId: "d2", status: "EM_ESTUDO" },
    { disciplineId: "d3", status: "NOT_STARTED" },
    { disciplineId: "d4", status: "EM_REVISAO" },
  ]
  const stats = [
    { disciplineId: "d1", minutes: 100, daysSinceLastStudy: 2, name: "A", area: "X" },
    { disciplineId: "d2", minutes: 50, daysSinceLastStudy: 0, name: "B", area: "X" },
  ]
  const registry = new Map<string, DisciplineMeta>([
    ["d1", { id: "d1", name: "A", area: "X" }],
    ["d2", { id: "d2", name: "B", area: "X" }],
  ])
  const [, d1, d2] = computeDisciplineStats(
    [
      session({ disciplineId: "d1", startedAt: "2026-08-09T10:00:00Z", durationMinutes: 100 }),
      session({ disciplineId: "d2", startedAt: "2026-08-11T10:00:00Z", durationMinutes: 50 }),
    ],
    [],
    registry,
    ud,
    new Map(),
    150,
    NOW,
    TZ,
  )
  void stats
  void d1
  void d2
  const c = computeEditalCoverage(ud, [], registry, NOW)
  assert.equal(c.total, 4)
  assert.equal(c.completed, 1)
  assert.equal(c.studying, 1)
  assert.equal(c.notStarted, 1)
  assert.equal(c.percentage, 25)
})

test("computeEditalCoverage deduplica disciplinas em múltiplos concursos", () => {
  const registry = new Map<string, DisciplineMeta>([
    ["d1", { id: "d1", name: "Constitucional", area: "X" }],
  ])
  const ud: UserDisciplineInput[] = [
    { disciplineId: "d1", status: "EM_ESTUDO" },
    { disciplineId: "d1", status: "NOT_STARTED" },
    { disciplineId: "d2", status: "CONCLUIDA" },
  ]
  const c = computeEditalCoverage(ud, [], registry, NOW)
  assert.equal(c.total, 2)
  assert.equal(c.byDiscipline.length, 2)
  const d1 = c.byDiscipline.find((d) => d.disciplineId === "d1")
  assert.ok(d1)
  assert.equal(d1.status, "EM_ESTUDO")
  const byId = c.byDiscipline.map((d) => d.disciplineId)
  assert.deepEqual(byId, ["d1", "d2"])
})

// ─── Produtividade ──────────────────────────────────────────────────────────

test("computeProductivity: null sem sessões e com menos de 3 sessões", () => {
  const q = { total: 10, correct: 9, wrong: 1, accuracy: 90, fromSessions: 10, fromAttempts: 0 }
  assert.equal(computeProductivity([], q, 80, 7).score, null)
  assert.equal(computeProductivity([session()], q, 80, 7).score, null)
})

test("computeProductivity: pesos 40/30/20/10 com ≥3 sessões", () => {
  const sessions = [
    session({ durationMinutes: 60, activeMinutes: 48, focusPercentage: 80 }),
    session({ durationMinutes: 60, activeMinutes: 48, focusPercentage: 80 }),
    session({ durationMinutes: 60, activeMinutes: 48, focusPercentage: 80 }),
  ]
  const q = { total: 10, correct: 9, wrong: 1, accuracy: 90, fromSessions: 10, fromAttempts: 0 }
  const p = computeProductivity(sessions, q, 80, 7)
  assert.equal(p.score, 85)
  assert.deepEqual(p.breakdown, {
    activeRatioScore: 80,
    accuracyScore: 90,
    focusScore: 80,
    consistencyScore: 100,
  })
})

// ─── Insights ───────────────────────────────────────────────────────────────

function insightInput(overrides: Partial<InsightInput> = {}): InsightInput {
  const base: InsightInput = {
    hasPlan: true,
    sessionsInRange: 10,
    hoursOfDay: [],
    timeOfDayAnalysis: null,
    focusPct: 80,
    questionStats: {
      total: 20,
      correct: 14,
      wrong: 6,
      accuracy: 70,
      fromSessions: 20,
      fromAttempts: 0,
    },
    streaks: { current: 4, currentEndsToday: true, longest: 6 },
    comparisons: [],
    planning: {
      hasPlan: true,
      weeklyTargetMinutes: 420,
      weeklyTargetQuestions: 0,
      weeklyTargetDays: 0,
      actualWeekMinutes: 420,
      actualWeekQuestions: 0,
      actualWeekDays: 5,
      adherencePct: 100,
      series: [],
    },
    revision: {
      totalPending: 3,
      overdue: 2,
      dueToday: 0,
      upcoming: 1,
      completedLast30: 10,
      completionRate: 50,
      byDiscipline: [],
    },
    disciplineStats: [],
    topicStats: [
      {
        topicName: "Princípios",
        disciplineId: "d1",
        disciplineName: "Constitucional",
        minutes: 100,
        sessions: 5,
        questions: 6,
        correct: 2,
        wrong: 4,
        accuracy: 33,
        focusAvg: null,
        pages: 0,
        lastStudiedDate: null,
        daysSinceLastStudy: 1,
        classification: "ATENCAO",
      },
    ],
    timeCards: {
      todayMinutes: 0,
      weekMinutes: 0,
      monthMinutes: 0,
      last7Minutes: 0,
      last30Minutes: 0,
      last90Minutes: 0,
      totalMinutes: 600,
      studiedDayCount: 12,
      avgPerStudiedDay: 50,
      avgPerPeriodDay: 33,
      bestDay: null,
      worstDay: null,
    },
    productivity: {
      score: 80,
      breakdown: { activeRatioScore: 80, accuracyScore: 70, focusScore: 80, consistencyScore: 100 },
    },
    daysSinceLastStudy: 0,
    questionsPerDay: 5,
    ...overrides,
  }
  return base
}

test("generateInsights: poucas sessões → insight único honesto", () => {
  const out = generateInsights(insightInput({ sessionsInRange: 2 }))
  assert.equal(out.length, 1)
  assert.equal(out[0]!.id, "poucas_sessoes")
})

test("generateInsights: dados suficientes geram múltiplos insights", () => {
  const out = generateInsights(insightInput())
  assert.ok(out.length >= 3)
  assert.ok(out.some((i) => i.id === "topicos_fracos"))
  assert.ok(out.some((i) => i.id === "revisoes_atrasadas"))
  assert.ok(out.some((i) => i.severity === "danger"))
})

test("generateInsights: semana em alta", () => {
  const input = insightInput()
  input.comparisons = [
    {
      id: "week_vs_prev",
      label: "Semana",
      detail: "x",
      metrics: {
        minutes: { current: 120, previous: 60, delta: 60, deltaPct: 100 },
        questions: { current: 10, previous: 10, delta: 0, deltaPct: 0 },
        accuracy: { current: 70, previous: 70, delta: 0, deltaPct: null },
        focus: { current: 80, previous: 80, delta: 0, deltaPct: null },
        pages: { current: 5, previous: 5, delta: 0, deltaPct: 0 },
        sessions: { current: 3, previous: 3, delta: 0, deltaPct: 0 },
        days: { current: 2, previous: 2, delta: 0, deltaPct: 0 },
      },
    },
  ]
  const out = generateInsights(input)
  assert.ok(out.some((i) => i.id === "semana_melhor"))
})

// ─── Relatórios ─────────────────────────────────────────────────────────────

test("computeWeeklyReport compara 7 dias com os anteriores", () => {
  const buckets: DailyBucket[] = lastNDays(20, NOW, TZ).map((date) => {
    const minutes = date >= "2026-08-05" && date <= "2026-08-11" ? 100 : 0
    return {
      date,
      minutes,
      activeMinutes: minutes,
      pausedMinutes: minutes / 10,
      sessions: minutes > 0 ? 1 : 0,
      completedSessions: minutes > 0 ? 1 : 0,
      interruptedSessions: 0,
      pages: minutes > 0 ? 3 : 0,
      questions: minutes > 0 ? 2 : 0,
      correct: minutes > 0 ? 1 : 0,
      wrong: minutes > 0 ? 1 : 0,
      accuracy: 50,
      flashcards: minutes > 0 ? 2 : 0,
      focusSum: minutes > 0 ? 70 : 0,
      focusCount: minutes > 0 ? 1 : 0,
      focusAvg: 70,
      attempts: 0,
    }
  })
  const rows = computeWeeklyReport(buckets, NOW, TZ)
  assert.equal(rows.length, 10)
  const tempo = rows.find((r) => r.id === "tempo")!
  assert.equal(tempo.current, "11h 40min")
  assert.equal(tempo.deltaLabel.includes("▲"), true)
  assert.equal(tempo.positive, true)
})

test("computeMonthlyReport compara mês corrido com anterior", () => {
  const buckets: DailyBucket[] = lastNDays(45, NOW, TZ).map((date) => {
    const minutes = date.startsWith("2026-08") ? 60 : 10
    return {
      date,
      minutes,
      activeMinutes: minutes,
      pausedMinutes: 0,
      sessions: minutes > 0 ? 1 : 0,
      completedSessions: minutes > 0 ? 1 : 0,
      interruptedSessions: 0,
      pages: minutes > 0 ? 1 : 0,
      questions: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
      flashcards: 0,
      focusSum: 0,
      focusCount: 0,
      focusAvg: null,
      attempts: 0,
    }
  })
  const rows = computeMonthlyReport(buckets, NOW, TZ)
  const tempo = rows.find((r) => r.id === "tempo")!
  assert.equal(tempo.current, "11h")
  assert.equal(tempo.previous, "5h 10min")
})

// ─── Heatmap ────────────────────────────────────────────────────────────────

test("buildHeatmap: nada de estudo = nível 0", () => {
  const buckets: DailyBucket[] = lastNDays(10, NOW, TZ).map((date) => ({
    date,
    minutes: 0,
    activeMinutes: 0,
    pausedMinutes: 0,
    sessions: 0,
    completedSessions: 0,
    interruptedSessions: 0,
    pages: 0,
    questions: 0,
    correct: 0,
    wrong: 0,
    accuracy: null,
    flashcards: 0,
    focusSum: 0,
    focusCount: 0,
    focusAvg: null,
    attempts: 0,
  }))
  const cells = buildHeatmap(buckets, 10)
  assert.equal(cells.length, 10)
  assert.ok(cells.every((c) => c.level === 0))
})

test("buildHeatmap: percentis geram níveis 1..4", () => {
  const buckets: DailyBucket[] = lastNDays(10, NOW, TZ).map((date, i) => ({
    date,
    minutes: i * 10,
    activeMinutes: i * 10,
    pausedMinutes: 0,
    sessions: i > 0 ? 1 : 0,
    completedSessions: i > 0 ? 1 : 0,
    interruptedSessions: 0,
    pages: 0,
    questions: 0,
    correct: 0,
    wrong: 0,
    accuracy: null,
    flashcards: 0,
    focusSum: 0,
    focusCount: 0,
    focusAvg: null,
    attempts: 0,
  }))
  const cells = buildHeatmap(buckets, 10)
  assert.equal(cells[0]!.level, 0)
  assert.ok(cells.some((c) => c.level === 4))
  assert.ok(cells.some((c) => c.level === 1))
})

// ─── Formatação ─────────────────────────────────────────────────────────────

test("formatDurationRaw", () => {
  assert.equal(formatDurationRaw(45), "45min")
  assert.equal(formatDurationRaw(120), "2h")
  assert.equal(formatDurationRaw(125), "2h 05min")
})

// ─── Agregação de sessões ───────────────────────────────────────────────────

test("computeSessionStatistics", () => {
  const sessions = [
    session({ durationMinutes: 30, completed: true }),
    session({ durationMinutes: 90, completed: false, interrupted: true, activeMinutes: 60 }),
  ]
  const s = computeSessionStatistics(sessions)
  assert.equal(s.total, 2)
  assert.equal(s.completed, 1)
  assert.equal(s.interrupted, 1)
  assert.equal(s.averageMinutes, 60)
  assert.equal(s.longestMinutes, 90)
  assert.equal(s.shortestMinutes, 30)
  assert.equal(s.averageActiveMinutes, 45)
})

// ─── Prioridades ────────────────────────────────────────────────────────────

test("computePriorities ordena por score e traduz ações", () => {
  const stats = [
    {
      disciplineId: "d1",
      name: "A",
      area: null,
      minutes: 10,
      activeMinutes: 10,
      sessions: 1,
      questions: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
      accuracyTrend: null,
      trendDirection: "STABLE" as const,
      focusAvg: null,
      pages: 0,
      flashcards: 0,
      lastStudiedDate: null,
      daysSinceLastStudy: 80,
      firstHalfMinutes: 0,
      secondHalfMinutes: 10,
      attentionScore: 90,
      attentionReasons: ["80 dias sem estudar"],
      classification: "CRITICO" as const,
      shareOfTotalMinutes: 100,
    },
    {
      disciplineId: "d2",
      name: "B",
      area: null,
      minutes: 90,
      activeMinutes: 90,
      sessions: 5,
      questions: 10,
      correct: 9,
      wrong: 1,
      accuracy: 90,
      accuracyTrend: null,
      trendDirection: "UP" as const,
      focusAvg: null,
      pages: 0,
      flashcards: 0,
      lastStudiedDate: "2026-08-11",
      daysSinceLastStudy: 0,
      firstHalfMinutes: 40,
      secondHalfMinutes: 50,
      attentionScore: 5,
      attentionReasons: [],
      classification: "DOMINADO" as const,
      shareOfTotalMinutes: 90,
    },
  ]
  const priorities = computePriorities(
    stats as DisciplineStat[],
    {
      totalPending: 0,
      overdue: 0,
      dueToday: 0,
      upcoming: 0,
      completedLast30: 0,
      completionRate: null,
      byDiscipline: [],
    } as RevisionStatistics,
  )
  assert.equal(priorities.length, 2)
  assert.equal(priorities[0]!.name, "A")
  assert.equal(priorities[0]!.action.includes("Retome"), true)
})

// ─── Frequência ─────────────────────────────────────────────────────────────

test("computeFrequency conta dias e lacunas", () => {
  void computeFrequency([] as DailyBucket[], NOW, TZ)
  const buckets: DailyBucket[] = lastNDays(14, NOW, TZ).map((date) => {
    const studied = date >= "2026-08-09" && date <= "2026-08-11"
    const minutes = studied ? 30 : 0
    return {
      date,
      minutes,
      activeMinutes: minutes,
      pausedMinutes: 0,
      sessions: studied ? 1 : 0,
      completedSessions: studied ? 1 : 0,
      interruptedSessions: 0,
      pages: 0,
      questions: studied ? 1 : 0,
      correct: studied ? 1 : 0,
      wrong: 0,
      accuracy: studied ? 100 : null,
      flashcards: 0,
      focusSum: 0,
      focusCount: 0,
      focusAvg: null,
      attempts: 0,
    }
  })
  const f = computeFrequency(buckets, NOW, TZ)
  assert.equal(f.last7Days, 3)
  assert.equal(f.daysSinceLastStudy, 0)
  assert.ok(f.gapDays.length > 0)
  assert.ok(f.weeklyAvgDays > 0)
})

// ─── Datas auxiliares que precisam de cobertura explícita ───────────────────

test("utilidades de data restantes", () => {
  assert.equal(dateKeyFromYmd(2026, 8, 1), "2026-08-01")
  assert.equal(monthKeyOf("2026-08-01"), "2026-08")
  const k = addDaysToKey("2026-08-11", 1)!
  assert.equal(keyToDate(k)!.toISOString().slice(0, 10), "2026-08-12")
})

// ─── Análise de desempenho por faixa de horário ─────────────────────────────

// Caso 1: Manhã com maior foco → Manhã
test("computeTimeOfDayAnalysis: manhã com maior foco → overallBest = Manhã", () => {
  const sessions: SessionRecord[] = [
    // 3 sessões na manhã (08:00 UTC) com foco alto (91%)
    session({
      id: "m1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 8,
      durationMinutes: 50,
    }),
    session({
      id: "m2",
      startedAt: "2026-08-09T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 9,
      durationMinutes: 50,
    }),
    session({
      id: "m3",
      startedAt: "2026-08-08T08:00:00Z",
      focusPercentage: 90,
      questionsAnswered: 10,
      questionsCorrect: 7,
      durationMinutes: 50,
    }),
    // 3 sessões à tarde (14:00 UTC) com foco menor (72%)
    session({
      id: "t1",
      startedAt: "2026-08-10T14:00:00Z",
      focusPercentage: 72,
      questionsAnswered: 10,
      questionsCorrect: 5,
      durationMinutes: 50,
    }),
    session({
      id: "t2",
      startedAt: "2026-08-09T14:00:00Z",
      focusPercentage: 72,
      questionsAnswered: 10,
      questionsCorrect: 6,
      durationMinutes: 50,
    }),
    session({
      id: "t3",
      startedAt: "2026-08-08T14:00:00Z",
      focusPercentage: 73,
      questionsAnswered: 10,
      questionsCorrect: 4,
      durationMinutes: 50,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.hasEnoughData, true)
  assert.equal(result.overallBest!.period, "MANHA")
  assert.equal(result.bestByFocus!.period, "MANHA")
  assert.ok(result.overallBest!.focusAvg! > 85)
})

// Caso 2: Noite com maior foco → Noite
test("computeTimeOfDayAnalysis: noite com maior foco → overallBest = Noite", () => {
  const sessions: SessionRecord[] = [
    session({
      id: "n1",
      startedAt: "2026-08-10T20:00:00Z",
      focusPercentage: 92,
      questionsAnswered: 8,
      questionsCorrect: 6,
      durationMinutes: 40,
    }),
    session({
      id: "n2",
      startedAt: "2026-08-09T20:00:00Z",
      focusPercentage: 92,
      questionsAnswered: 8,
      questionsCorrect: 7,
      durationMinutes: 40,
    }),
    session({
      id: "n3",
      startedAt: "2026-08-08T20:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 8,
      questionsCorrect: 5,
      durationMinutes: 40,
    }),
    session({
      id: "mm1",
      startedAt: "2026-08-10T03:00:00Z",
      focusPercentage: 70,
      questionsAnswered: 5,
      questionsCorrect: 3,
      durationMinutes: 30,
    }),
    session({
      id: "mm2",
      startedAt: "2026-08-09T03:00:00Z",
      focusPercentage: 71,
      questionsAnswered: 5,
      questionsCorrect: 2,
      durationMinutes: 30,
    }),
    session({
      id: "mm3",
      startedAt: "2026-08-08T03:00:00Z",
      focusPercentage: 72,
      questionsAnswered: 5,
      questionsCorrect: 4,
      durationMinutes: 30,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.hasEnoughData, true)
  assert.equal(result.overallBest!.period, "NOITE")
  assert.equal(result.bestByFocus!.period, "NOITE")
})

// Caso 3: Manhã com maior foco, Noite com maior acerto → respeitar regra definida
test("computeTimeOfDayAnalysis: melhor foco ≠ melhor acerto, overallBest segue critério foco primeiro", () => {
  const sessions: SessionRecord[] = [
    // Manhã: foco 91%, acerto 82%
    session({
      id: "m1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 8,
      durationMinutes: 50,
    }),
    session({
      id: "m2",
      startedAt: "2026-08-09T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 9,
      durationMinutes: 50,
    }),
    session({
      id: "m3",
      startedAt: "2026-08-08T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 7,
      durationMinutes: 50,
    }),
    // Noite: foco 91%, acerto 89% → mesmno foco, maior acerto → Noite vence
    session({
      id: "n1",
      startedAt: "2026-08-10T20:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 9,
      durationMinutes: 40,
    }),
    session({
      id: "n2",
      startedAt: "2026-08-09T20:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 8,
      durationMinutes: 40,
    }),
    session({
      id: "n3",
      startedAt: "2026-08-08T20:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 10,
      durationMinutes: 40,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.hasEnoughData, true)
  // Melhor foco: empate entre manhã e noite (91%) → morning aparece primeiro na ordenação
  // overallBest: foco empatado, acerto da noite (89%) > manhã (82%) → Noite
  assert.equal(result.overallBest!.period, "NOITE")
  assert.ok(result.bestByAccuracy!.period === "NOITE")
})

// Caso 4: Somente uma sessão → dados insuficientes
test("computeTimeOfDayAnalysis: uma única sessão → dados insuficientes", () => {
  const sessions: SessionRecord[] = [
    session({
      id: "s1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: 100,
      questionsAnswered: 10,
      questionsCorrect: 10,
      durationMinutes: 30,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.hasEnoughData, false)
  assert.ok(result.notEnoughDataMessage !== null)
  assert.equal(result.overallBest, null)
})

// Caso 5: Sessões sem horário → ignoradas para análise de horário
test("computeTimeOfDayAnalysis: sessões sem horário são ignoradas", () => {
  const sessions: SessionRecord[] = [
    session({
      id: "ok1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: 80,
      durationMinutes: 50,
    }),
    session({
      id: "ok2",
      startedAt: "2026-08-09T08:00:00Z",
      focusPercentage: 80,
      durationMinutes: 50,
    }),
    session({
      id: "ok3",
      startedAt: "2026-08-08T08:00:00Z",
      focusPercentage: 80,
      durationMinutes: 50,
    }),
  ]
  // Sessão com startedAt vazio/nulo não pode ser criada pois sanitizeSession rejeita.
  // Mas computeTimeOfDayAnalysis recebe SessionRecord[], então localParts retorna null para ISO inválido
  const badSession = session({ id: "bad", startedAt: "", focusPercentage: 50, durationMinutes: 20 })
  const allSessions = [...sessions, badSession]
  const result = computeTimeOfDayAnalysis(allSessions, [], TZ)
  assert.equal(result.hasEnoughData, true)
  assert.equal(result.overallBest!.period, "MANHA")
  assert.equal(result.buckets.find((b) => b.period === "MANHA")!.sessions, 3)
})

// Caso 6: Sessões importadas (origin_source) são consideradas se têm horário válido
test("computeTimeOfDayAnalysis: sessões importadas são consideradas", () => {
  const sessions: SessionRecord[] = [
    // Sessão "importada" (simulada — studySource diferente, mas os mesmos dados)
    session({
      id: "imp1",
      startedAt: "2026-08-10T20:00:00Z",
      studySource: "APROVADO",
      focusPercentage: 95,
      questionsAnswered: 10,
      questionsCorrect: 9,
      durationMinutes: 60,
    }),
    session({
      id: "imp2",
      startedAt: "2026-08-09T20:00:00Z",
      studySource: "APROVADO",
      focusPercentage: 94,
      questionsAnswered: 10,
      questionsCorrect: 8,
      durationMinutes: 60,
    }),
    session({
      id: "imp3",
      startedAt: "2026-08-08T20:00:00Z",
      studySource: "APROVADO",
      focusPercentage: 96,
      questionsAnswered: 10,
      questionsCorrect: 10,
      durationMinutes: 60,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.hasEnoughData, true)
  assert.equal(result.overallBest!.period, "NOITE")
  assert.equal(result.bestByFocus!.period, "NOITE")
  assert.ok(result.bestByFocus!.focusAvg! > 90)
})

// Caso 7: Verificar que buckets estão na ordem correta (00-06, 06-12, 12-18, 18-24)
test("computeTimeOfDayAnalysis: buckets sempre na ordem Madrugada, Manhã, Tarde, Noite", () => {
  const sessions: SessionRecord[] = [
    session({
      id: "n1",
      startedAt: "2026-08-10T20:00:00Z",
      focusPercentage: 80,
      durationMinutes: 30,
    }),
    session({
      id: "n2",
      startedAt: "2026-08-09T20:00:00Z",
      focusPercentage: 80,
      durationMinutes: 30,
    }),
    session({
      id: "n3",
      startedAt: "2026-08-08T20:00:00Z",
      focusPercentage: 80,
      durationMinutes: 30,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.buckets[0]!.period, "MADRUGADA")
  assert.equal(result.buckets[0]!.range, "00h–06h")
  assert.equal(result.buckets[1]!.period, "MANHA")
  assert.equal(result.buckets[1]!.range, "06h–12h")
  assert.equal(result.buckets[2]!.period, "TARDE")
  assert.equal(result.buckets[2]!.range, "12h–18h")
  assert.equal(result.buckets[3]!.period, "NOITE")
  assert.equal(result.buckets[3]!.range, "18h–24h")
})

// Caso 8: Mínimo de 3 sessões OU 60 minutos — madrugada com 2 sessões curtas não vence
test("computeTimeOfDayAnalysis: faixa com poucos dados não vence mesmo com foco/accuracy alto", () => {
  const sessions: SessionRecord[] = [
    // Madrugada: 2 sessões, 40 min total, foco 100% — mas não atinge mínimo
    session({
      id: "md1",
      startedAt: "2026-08-10T02:00:00Z",
      focusPercentage: 100,
      questionsAnswered: 5,
      questionsCorrect: 5,
      durationMinutes: 20,
    }),
    session({
      id: "md2",
      startedAt: "2026-08-09T02:00:00Z",
      focusPercentage: 100,
      questionsAnswered: 5,
      questionsCorrect: 5,
      durationMinutes: 20,
    }),
    // Manhã: 3 sessões, 150 min, foco 80%
    session({
      id: "m1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: 80,
      questionsAnswered: 10,
      questionsCorrect: 6,
      durationMinutes: 50,
    }),
    session({
      id: "m2",
      startedAt: "2026-08-09T08:00:00Z",
      focusPercentage: 80,
      questionsAnswered: 10,
      questionsCorrect: 7,
      durationMinutes: 50,
    }),
    session({
      id: "m3",
      startedAt: "2026-08-08T08:00:00Z",
      focusPercentage: 81,
      questionsAnswered: 10,
      questionsCorrect: 6,
      durationMinutes: 50,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.hasEnoughData, true)
  // Madrugada não atende mínimo (2 < 3 AND 40 < 60) → não é overallBest
  assert.notEqual(result.overallBest!.period, "MADRUGADA")
  assert.equal(result.overallBest!.period, "MANHA")
})

// Caso 9: Recomendação contém a faixa de horário correta
test("computeTimeOfDayAnalysis: recomendação menciona o horário correto", () => {
  const sessions: SessionRecord[] = [
    session({
      id: "m1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 8,
      durationMinutes: 50,
    }),
    session({
      id: "m2",
      startedAt: "2026-08-09T08:00:00Z",
      focusPercentage: 91,
      questionsAnswered: 10,
      questionsCorrect: 9,
      durationMinutes: 50,
    }),
    session({
      id: "m3",
      startedAt: "2026-08-08T08:00:00Z",
      focusPercentage: 90,
      questionsAnswered: 10,
      questionsCorrect: 7,
      durationMinutes: 50,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.ok(result.recommendation.includes("06h–12h"))
  assert.ok(result.recommendation.includes("Manhã"))
})

// Caso 10: Sem nenhum dado
test("computeTimeOfDayAnalysis: sem sessões → mensagem de dados insuficientes", () => {
  const result = computeTimeOfDayAnalysis([], [], TZ)
  assert.equal(result.hasEnoughData, false)
  assert.equal(result.overallBest, null)
  assert.ok(result.notEnoughDataMessage !== null)
  assert.ok(result.recommendation.includes("suficiente"))
})

// Caso 11: Média de foco ignora sessões com NULL (90, NULL, NULL -> 90)
test("computeFocusStatistics: média ignora sessões com foco null", () => {
  const sessions = [
    session({ focusPercentage: 90, focusScore: null }),
    session({ focusPercentage: null, focusScore: null }),
    session({ focusPercentage: null, focusScore: null }),
  ]
  const stats = computeFocusStatistics(sessions)
  assert.equal(stats.average, 90)
  assert.equal(stats.averagePct, 90)
  assert.equal(stats.best, 90)
  assert.equal(stats.worst, 90)
})

// Caso 12: Somente sessões com NULL geram média null
test("computeFocusStatistics: somente sessões com foco null geram média null", () => {
  const sessions = [
    session({ focusPercentage: null, focusScore: null }),
    session({ focusPercentage: null, focusScore: null }),
  ]
  const stats = computeFocusStatistics(sessions)
  assert.equal(stats.average, null)
  assert.equal(stats.best, null)
  assert.equal(stats.worst, null)
})

// Caso 13: TimeOfDayAnalysis com todas as sessões NULL não elege bestByFocus
test("computeTimeOfDayAnalysis: todas as sessões com foco null geram bestByFocus null", () => {
  const sessions: SessionRecord[] = [
    session({
      id: "m1",
      startedAt: "2026-08-10T08:00:00Z",
      focusPercentage: null,
      focusScore: null,
      durationMinutes: 50,
    }),
    session({
      id: "m2",
      startedAt: "2026-08-09T08:00:00Z",
      focusPercentage: null,
      focusScore: null,
      durationMinutes: 50,
    }),
    session({
      id: "m3",
      startedAt: "2026-08-08T08:00:00Z",
      focusPercentage: null,
      focusScore: null,
      durationMinutes: 50,
    }),
  ]
  const result = computeTimeOfDayAnalysis(sessions, [], TZ)
  assert.equal(result.bestByFocus, null)
  assert.equal(result.buckets.find((b) => b.period === "MANHA")?.focusAvg, null)
})
