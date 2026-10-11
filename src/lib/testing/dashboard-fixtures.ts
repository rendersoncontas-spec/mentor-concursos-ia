import type { RecentHistoryEntry } from "@/application/study-analytics/study-analytics.actions"
import { addDaysToKey } from "@/application/study-analytics/engine/stats-engine"
import type {
  DashboardDataIssues,
  DashboardSnapshot,
  PerformanceByPeriod,
  WidgetConfigItem,
} from "@/domain/dashboard/dashboard.types"
import { EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import type { CycleOverview, CycleItemProgress } from "@/domain/study-cycle/study-cycle.types"
import type { ReplanInfoPayload } from "@/application/study-plan/replan/adaptive-replan.service"
import type { CycleBlock } from "@/domain/study-plan/study-plan.types"

/**
 * G2.21 — dados SINTÉTICOS do Dashboard para o harness E2E.
 *
 * Formato idêntico ao que `getDashboardData` (snapshot), `getDashboardLayoutAction`
 * (layout) e `DashboardWidgetsSection` (dados semeados dos widgets) entregam
 * em produção. Nenhum dado pessoal: nome, disciplinas e números são fictícios
 * e coerentes entre si (o mesmo conjunto de disciplinas aparece no ciclo, no
 * ranking e no desempenho por matéria — identidade canônica preservada).
 * Nenhuma regra de métrica é recalculada aqui: os widgets reais leem estes
 * valores exatamente como leriam os do servidor.
 */

export type DashboardFixtureKind = "data" | "empty" | "issues"

/**
 * Ordem padrão do Dashboard — a MESMA de `getDashboardLayoutConfig()` em
 * src/application/dashboard/dashboard-layout.action.ts (que não pode ser
 * importada aqui: arquivo "use server" só exporta funções assíncronas).
 * O teste unitário e2e-harness-g2-21 confere a correspondência.
 */
export const DEFAULT_DASHBOARD_LAYOUT: WidgetConfigItem[] = [
  { widget_id: "ciclo_estudo", position_order: 1, col_span: 3, visible: true },
  { widget_id: "estudos_hoje", position_order: 2, col_span: 3, visible: true },
  { widget_id: "progresso_edital", position_order: 3, col_span: 2, visible: true },
  { widget_id: "tempo_estudo", position_order: 4, col_span: 1, visible: true },
  { widget_id: "constancia", position_order: 5, col_span: 1, visible: true },
  { widget_id: "metas_estudo", position_order: 6, col_span: 2, visible: true },
  { widget_id: "desempenho", position_order: 7, col_span: 2, visible: true },
  { widget_id: "desempenho_materia", position_order: 8, col_span: 3, visible: true },
  { widget_id: "questoes", position_order: 9, col_span: 1, visible: true },
  { widget_id: "ranking", position_order: 10, col_span: 1, visible: true },
  { widget_id: "calendario", position_order: 11, col_span: 2, visible: true },
  { widget_id: "data_prova", position_order: 12, col_span: 1, visible: true },
  { widget_id: "conquistas", position_order: 13, col_span: 1, visible: true },
  { widget_id: "ultimas_atividades", position_order: 14, col_span: 1, visible: true },
  { widget_id: "lembretes", position_order: 15, col_span: 1, visible: true },
  { widget_id: "mensagem_dia", position_order: 16, col_span: 2, visible: true },
]

const DISCIPLINES = [
  { id: "d0a1b2c3-0001-4000-8000-000000000001", name: "Língua Portuguesa", area: "Básicas", color: "#2563EB", minutes: 2400, correct: 260, wrong: 70 },
  { id: "d0a1b2c3-0002-4000-8000-000000000002", name: "Contabilidade Geral", area: "Específicas", color: "#16A34A", minutes: 3600, correct: 210, wrong: 140 },
  { id: "d0a1b2c3-0003-4000-8000-000000000003", name: "Direito Tributário", area: "Específicas", color: "#9333EA", minutes: 3000, correct: 220, wrong: 90 },
  { id: "d0a1b2c3-0004-4000-8000-000000000004", name: "Direito Constitucional", area: "Básicas", color: "#EA580C", minutes: 1800, correct: 120, wrong: 45 },
  { id: "d0a1b2c3-0005-4000-8000-000000000005", name: "Raciocínio Lógico", area: "Básicas", color: "#0891B2", minutes: 1200, correct: 58, wrong: 27 },
] as const

/** Progresso da volta atual: 1ª matéria concluída, 2ª em andamento, demais pendentes. */
const STUDIED_IN_ROUND = [60, 35, 0, 0, 0] as const
const BLOCK_STATUS = ["CONCLUIDO", "EM_ANDAMENTO", "PENDENTE", "PENDENTE", "PENDENTE"] as const
const ITEM_STATUS = ["CONCLUIDO", "ATUAL", "PENDENTE", "PENDENTE", "PENDENTE"] as const

const day = (todayKey: string, offset: number) => addDaysToKey(todayKey, offset) ?? todayKey
const pct = (c: number, w: number) => (c + w > 0 ? Math.round((c / (c + w)) * 100) : 0)
const hm = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`

function performance(c: number, w: number): PerformanceByPeriod[keyof PerformanceByPeriod] {
  return { totalQuestions: c + w, correctQuestions: c, wrongQuestions: w, accuracyPercentage: pct(c, w) }
}

const NO_ISSUES: DashboardDataIssues = {
  profile: false, target: false, cycle: false, todayPlan: false,
  history: false, activities: false, attempts: false, disciplines: false,
}

function emptySnapshot(name: string | null): DashboardSnapshot {
  const zeroGoal = { target: null, achieved: 0, percentage: null, remaining: null }
  const zeroPerf = performance(0, 0)
  return {
    user: { name, weekly_study_hours: null, weekly_questions_goal: null, weekly_revisions_goal: null, weekly_study_days_goal: null, week_start_day: 1, work_regime: null, experience_level: null },
    activeTarget: null,
    stats: {
      dailyMinutes: 0, weeklyMinutes: 0, monthlyMinutes: 0, longestSession: 0, consecutiveStreak: 0, longestStreak: 0,
      averageFocus: null, averageEnergy: null, averageDifficulty: null,
      totalMinutes: 0, totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0,
      performanceByPeriod: { HOJE: zeroPerf, SEMANA: zeroPerf, MES: zeroPerf, ANO: zeroPerf, TOTAL: zeroPerf },
      completedTopics: 0, pendingTopics: 0, editalProgress: 0,
    },
    disciplinesStats: { total: 0, completed: 0, revising: 0, studying: 0 },
    todayPlanItems: [],
    cycleBlocks: null,
    rawDisciplines: [],
    subjectContexts: [],
    recentActivities: [],
    analytics: {
      heatmap: [], evolution: [], rankings: { disciplines: [], areas: [] },
      goals: { weekly: zeroGoal, daily: zeroGoal },
      stats: { dailyMinutes: 0, weeklyMinutes: 0, monthlyMinutes: 0, longestSession: 0, consecutiveStreak: 0, longestStreak: 0, averageFocus: null, averageEnergy: null, averageDifficulty: null },
    },
    dataIssues: { ...NO_ISSUES },
    disciplineIdentity: EMPTY_DISCIPLINE_IDENTITY,
  }
}

function dataSnapshot(todayKey: string): DashboardSnapshot {
  const totalCorrect = DISCIPLINES.reduce((s, d) => s + d.correct, 0)
  const totalWrong = DISCIPLINES.reduce((s, d) => s + d.wrong, 0)
  const totalMinutes = DISCIPLINES.reduce((s, d) => s + d.minutes, 0)
  const stats = {
    dailyMinutes: 95, weeklyMinutes: 610, monthlyMinutes: 2280, longestSession: 150,
    consecutiveStreak: 6, longestStreak: 14, averageFocus: 4, averageEnergy: 3.6, averageDifficulty: 3.1,
  }
  const cycleBlocks: CycleBlock[] = DISCIPLINES.map((d, i) => ({
    id: `blk-${i + 1}`,
    studyPlanId: "plan-e2e",
    disciplineId: d.id,
    disciplineName: d.name,
    disciplineArea: d.area,
    color: d.color,
    executionOrder: i + 1,
    durationMinutes: 60,
    studiedMinutes: STUDIED_IN_ROUND[i] ?? 0,
    status: BLOCK_STATUS[i] ?? "PENDENTE",
    priorityScore: 80 - i * 10,
  }))
  const heatmap = Array.from({ length: 30 }, (_, i) => {
    const minutes = i % 7 === 6 ? 0 : 60 + ((i * 37) % 90)
    return { date: day(todayKey, i - 29), minutes, sessions: minutes > 0 ? 2 : 0, intensity: Math.min(100, Math.round((minutes / 150) * 100)) }
  })
  return {
    user: {
      name: "Estudante E2E", weekly_study_hours: 20, weekly_questions_goal: 300, weekly_revisions_goal: 10,
      weekly_study_days_goal: 6, week_start_day: 1, work_regime: "INTEGRAL", experience_level: "INTERMEDIARIO",
    },
    activeTarget: {
      id: "target-e2e", target_exam: "Receita Federal", target_role: "Auditor Fiscal", main_study_source: "PDF",
      exam_date: day(todayKey, 90), exam_time: "08:00", exam_location: null, exam_name: "Receita Federal 2027",
    },
    stats: {
      ...stats,
      totalMinutes, totalQuestions: totalCorrect + totalWrong, correctQuestions: totalCorrect, wrongQuestions: totalWrong,
      accuracyPercentage: pct(totalCorrect, totalWrong),
      performanceByPeriod: {
        HOJE: performance(24, 6), SEMANA: performance(150, 50), MES: performance(520, 210), ANO: performance(totalCorrect, totalWrong), TOTAL: performance(totalCorrect, totalWrong),
      },
      completedTopics: 42, pendingTopics: 78, editalProgress: 35,
    },
    disciplinesStats: { total: 5, completed: 1, revising: 1, studying: 3 },
    todayPlanItems: [],
    cycleBlocks,
    rawDisciplines: DISCIPLINES.map((d) => ({
      id: d.id, discipline_id: d.id, name: d.name, tempoFormatted: hm(d.minutes),
      correctCount: d.correct, wrongCount: d.wrong, notebookCount: 0, accuracyPercentage: pct(d.correct, d.wrong),
    })),
    subjectContexts: DISCIPLINES.map((d, i) => ({
      discipline_id: d.id, name: d.name, planned: true, inCycle: true, cycleOrder: i + 1,
      isCurrentInCycle: i === 1, recent30d: i < 4, lastStudiedAt: i < 4 ? `${day(todayKey, -i)}T13:00:00.000Z` : null,
    })),
    recentActivities: DISCIPLINES.slice(0, 4).map((d, i) => ({
      id: `act-${i + 1}`, discipline_name: d.name, subject_name: null, duration_minutes: 45 + i * 15,
      study_source: "PDF", started_at: `${day(todayKey, -i)}T12:00:00.000Z`, completed: true,
    })),
    analytics: {
      heatmap,
      evolution: heatmap.map((h) => ({ date: h.date, value: h.minutes })),
      rankings: {
        // Como rankings.ts: value = minutos, secondaryValue = sessões.
        disciplines: DISCIPLINES.map((d) => ({ id: d.id, name: d.name, value: d.minutes, secondaryValue: Math.round(d.minutes / 75) }))
          .sort((a, b) => b.value - a.value),
        areas: [
          { id: "Específicas", name: "Específicas", value: 6600 },
          { id: "Básicas", name: "Básicas", value: 5400 },
        ],
      },
      goals: {
        weekly: { target: 1200, achieved: 610, percentage: 51, remaining: 590 },
        daily: { target: 171, achieved: 95, percentage: 56, remaining: 76 },
        questions: { target: 300, achieved: 200, percentage: 67, remaining: 100 },
        revisions: { target: 10, achieved: 4, percentage: 40, remaining: 6 },
        studyDays: { target: 6, achieved: 4, percentage: 67, remaining: 2 },
      },
      stats,
    },
    dataIssues: { ...NO_ISSUES },
    disciplineIdentity: EMPTY_DISCIPLINE_IDENTITY,
  }
}

function cycleOverview(todayKey: string): CycleOverview {
  const items: CycleItemProgress[] = DISCIPLINES.map((d, i) => {
    const studied = STUDIED_IN_ROUND[i] ?? 0
    return {
      itemId: `item-${i + 1}`, disciplineId: d.id, disciplineName: d.name, disciplineArea: d.area,
      disciplineColorHex: d.color, order: i, priority: "MEDIA", difficulty: "MEDIA", plannedMinutes: 60,
      studiedMinutesInRound: studied, remainingMinutesInRound: 60 - studied, extraMinutesInRound: 0,
      isCompletedInRound: i === 0, isSkippedInRound: false, isCurrent: i === 1,
      status: ITEM_STATUS[i] ?? "PENDENTE",
      totalStudiedHistoricalMinutes: d.minutes,
    }
  })
  return {
    cycle: {
      id: "cycle-e2e", user_id: "e2e-harness-user", name: "Ciclo Receita Federal", contest_name: "Receita Federal",
      edital_name: null, status: "ACTIVE", current_item_index: 1, current_round: 3, total_rounds_done: 2,
      current_item_progress_min: 35, created_at: `${day(todayKey, -40)}T10:00:00.000Z`, updated_at: `${todayKey}T10:00:00.000Z`,
    },
    items,
    totalPlannedMinutesPerRound: 300,
    totalStudiedMinutesInRound: 95,
    totalExtraMinutesInRound: 0,
    roundProgressPercentage: 32,
    totalHistoricalMinutes: DISCIPLINES.reduce((s, d) => s + d.minutes, 0),
    currentRound: 3,
    totalRoundsDone: 2,
    currentItem: items[1] ?? null,
    nextItem: items[2] ?? null,
  }
}

/**
 * Cache local do cronograma do dia (`mentor_replan_info_cache`, o mesmo que o
 * DailyPlanningView grava depois de cada leitura bem-sucedida). No harness não
 * há sessão, então a leitura ao vivo falha e o widget mostra estes "últimos
 * dados salvos" com o aviso de desatualização — o comportamento real offline.
 */
export function replanInfoCacheFixture(todayKey: string): ReplanInfoPayload {
  const block = (date: string, i: number, d: (typeof DISCIPLINES)[number]) => ({
    id: `rb-${date}-${i}`, itemId: `spi-${i + 1}`, disciplineId: d.id, disciplineName: d.name,
    durationMinutes: 60, executionOrder: i + 1, origin: "BASE", status: "PENDENTE", manuallyClosed: false, manualPendingMinutes: 0,
  })
  const tomorrow = day(todayKey, 1)
  return {
    enabled: true, replanPaused: false, sanityInvalid: false, todayStr: todayKey,
    dailyBlocks: {
      [todayKey]: [block(todayKey, 0, DISCIPLINES[0]), block(todayKey, 1, DISCIPLINES[1]), block(todayKey, 2, DISCIPLINES[2])],
      [tomorrow]: [block(tomorrow, 0, DISCIPLINES[3]), block(tomorrow, 1, DISCIPLINES[4])],
    },
    pendingByDiscipline: [], totalPendingMinutes: 0, unscheduledMinutes: 0, lastEvent: null, hasPlan: true,
  }
}

export interface DashboardFixture {
  snapshot: DashboardSnapshot
  layout: WidgetConfigItem[]
  /** Mesmas chaves que DashboardWidgetsSection semeia no InitialServerDataProvider. */
  initialWidgetData: Record<string, unknown>
}

export function buildDashboardFixture(kind: DashboardFixtureKind, todayKey: string): DashboardFixture {
  const year = Number(todayKey.slice(0, 4))
  const month = Number(todayKey.slice(5, 7))
  const calendarKey = `monthlyCalendar:${year}:${month}`

  if (kind === "empty") {
    return {
      snapshot: emptySnapshot("Estudante E2E"),
      layout: DEFAULT_DASHBOARD_LAYOUT,
      initialWidgetData: {
        activeCycleOverview: null,
        "recentStudyHistory:14": [],
        [calendarKey]: { dailyTotals: [], monthlyStats: null },
      },
    }
  }

  const snapshot = dataSnapshot(todayKey)
  const history: RecentHistoryEntry[] = [
    { date: todayKey, disciplineId: DISCIPLINES[0].id, minutes: 60, studyPlanItemId: null },
    { date: todayKey, disciplineId: DISCIPLINES[1].id, minutes: 35, studyPlanItemId: null },
    { date: day(todayKey, -1), disciplineId: DISCIPLINES[2].id, minutes: 90, studyPlanItemId: null },
  ]
  const monthDays = snapshot.analytics.heatmap.filter((h) => h.date.startsWith(todayKey.slice(0, 7)) && h.minutes > 0)
  const initialWidgetData: Record<string, unknown> = {
    activeCycleOverview: cycleOverview(todayKey),
    "recentStudyHistory:14": history,
    [calendarKey]: {
      dailyTotals: monthDays.map((h) => ({ date: h.date, minutes: h.minutes })),
      monthlyStats: {
        totalMinutes: monthDays.reduce((s, h) => s + h.minutes, 0),
        averageMinutes: monthDays.length ? Math.round(monthDays.reduce((s, h) => s + h.minutes, 0) / monthDays.length) : 0,
        daysStudied: monthDays.length,
      },
    },
  }

  if (kind === "issues") {
    // Fase I.8: leituras que FALHARAM ≠ zero. O histórico e as tentativas
    // falharam nesta carga; os widgets devem mostrar "indisponível"/"—".
    snapshot.dataIssues = { ...NO_ISSUES, history: true, attempts: true, activities: true }
    snapshot.recentActivities = []
    // Sem dado semeado para os widgets: eles buscam sozinhos (e, sem sessão no
    // harness, recebem o erro real da Server Action — erro recuperável).
    return { snapshot, layout: DEFAULT_DASHBOARD_LAYOUT, initialWidgetData: { activeCycleOverview: cycleOverview(todayKey) } }
  }

  return { snapshot, layout: DEFAULT_DASHBOARD_LAYOUT, initialWidgetData }
}
