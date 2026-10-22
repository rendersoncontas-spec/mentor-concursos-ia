import type { StatisticsCenterPayload } from "@/application/study-analytics/statistics-center.action"
import { addDaysToKey } from "@/application/study-analytics/engine/stats-engine"
import type {
  ActivePlan,
  DisciplineMeta,
  QuestionAttemptRecord,
  ReviewItemRow,
  SessionRecord,
  UserDisciplineInput,
} from "@/application/study-analytics/engine/stats-engine"
import type { SimuladoRecord } from "@/domain/simulados/types"
import type { StatisticsActions } from "@/features/statistics/statistics-actions"

/**
 * G2.24 — payload SINTÉTICO da Central de Estatísticas (mesmo formato que a
 * Server Action devolve). Nenhum dado pessoal; disciplinas e números fictícios,
 * coerentes entre si. Estados:
 *  - `data`: ~60 dias de estudo, questões, revisões, edital, plano e 1 simulado.
 *  - `empty`: o banco respondeu e o aluno não tem nada.
 *  - `partial`: sessões ok, mas as leituras de questões, revisões, edital e
 *    simulados FALHARAM (`null`) — a tela precisa dizer "indisponível", nunca "0".
 *  - `error`: a página não trouxe dados e a leitura falha (painel de erro).
 *  - `retry`: a leitura inicial falha; "Tentar novamente" funciona.
 */
export type StatisticsHarnessState = "data" | "empty" | "partial" | "error" | "retry"

const DISCIPLINES = [
  { id: "d0a1b2c3-0001-4000-8000-000000000001", name: "Língua Portuguesa", area: "Básicas", color: "#2563EB" },
  { id: "d0a1b2c3-0002-4000-8000-000000000002", name: "Contabilidade Geral", area: "Específicas", color: "#16A34A" },
  { id: "d0a1b2c3-0003-4000-8000-000000000003", name: "Direito Tributário", area: "Específicas", color: "#9333EA" },
] as const

const day = (todayKey: string, offset: number) => addDaysToKey(todayKey, offset) ?? todayKey
const at = (dateKey: string, hour = 15) => `${dateKey}T${String(hour).padStart(2, "0")}:00:00.000Z`

function studyTypeOf(questions: boolean, i: number): "QUESTOES" | "REVISAO" | "TEORIA" {
  if (questions) return "QUESTOES"
  return i % 5 === 2 ? "REVISAO" : "TEORIA"
}

function buildSessions(todayKey: string): SessionRecord[] {
  const out: SessionRecord[] = []
  for (let i = 0; i < 60; i++) {
    if (i % 4 === 3) continue // dias sem estudo
    const d = DISCIPLINES[i % DISCIPLINES.length] ?? DISCIPLINES[0]
    const questions = i % 3 === 1
    out.push({
      id: `5e55a000-${String(i).padStart(4, "0")}-4000-8000-000000000000`,
      disciplineId: d.id,
      disciplineName: d.name,
      disciplineArea: d.area,
      startedAt: at(day(todayKey, -i), 12 + (i % 8)),
      finishedAt: null,
      durationMinutes: 30 + (i % 5) * 15,
      activeMinutes: 28 + (i % 5) * 15,
      pausedMinutes: 2,
      completed: true,
      interrupted: false,
      focusScore: 3 + (i % 3),
      energyLevel: null,
      difficulty: null,
      studyType: studyTypeOf(questions, i),
      studySource: "FREE",
      pagesRead: questions ? 0 : 6 + (i % 7),
      questionsAnswered: questions ? 20 : 0,
      questionsCorrect: questions ? 12 + (i % 6) : 0,
      flashcardsReviewed: 0,
      topicName: null,
      focusPercentage: 70 + (i % 25),
      plannedMinutes: null,
      notes: null,
      focusSound: null,
    })
  }
  return out
}

function buildAttempts(todayKey: string): QuestionAttemptRecord[] {
  const out: QuestionAttemptRecord[] = []
  for (let i = 0; i < 90; i++) {
    const d = DISCIPLINES[i % DISCIPLINES.length] ?? DISCIPLINES[0]
    out.push({
      id: `a77e0000-${String(i).padStart(4, "0")}-4000-8000-000000000000`,
      questionId: null,
      disciplineId: d.id,
      correct: i % 10 < 7,
      answeredAt: at(day(todayKey, -(i % 45)), 18),
      attemptSource: "MANUAL",
    })
  }
  return out
}

function buildReviewItems(todayKey: string): ReviewItemRow[] {
  return [-5, -2, -1, 0, 0, 2, 4, 9].map((offset, i) => ({
    id: `7e710000-${String(i).padStart(4, "0")}-4000-8000-000000000000`,
    disciplineId: (DISCIPLINES[i % DISCIPLINES.length] ?? DISCIPLINES[0]).id,
    status: "ATIVO",
    nextReviewAt: at(day(todayKey, offset), 15),
  }))
}

const USER_DISCIPLINES: UserDisciplineInput[] = [
  { disciplineId: DISCIPLINES[0].id, status: "EM_ESTUDO" },
  { disciplineId: DISCIPLINES[1].id, status: "CONCLUIDA" },
  { disciplineId: DISCIPLINES[2].id, status: "NOT_STARTED" },
]

const ACTIVE_PLAN: ActivePlan = {
  weeklyHours: 20,
  weeklyQuestions: 100,
  weeklyDays: 6,
  weeklyHoursSource: "configured",
  items: [1, 2, 3, 4, 5].map((dayOfWeek, i) => ({
    dayOfWeek,
    durationMinutes: 90,
    disciplineId: (DISCIPLINES[i % DISCIPLINES.length] ?? DISCIPLINES[0]).id,
  })),
}

function buildSimulado(todayKey: string): SimuladoRecord {
  return {
    id: "51a00000-0001-4000-8000-000000000001",
    userId: "e2e-harness-user",
    name: "Simulado sintético 1",
    examName: "Concurso fictício",
    roleName: "Analista",
    simuladoDate: day(todayKey, -10),
    source: "PROVA_ANTERIOR",
    sourceCustom: null,
    exam_board: "CEBRASPE",
    exam_board_custom: null,
    totalQuestions: 60,
    totalCorrect: 42,
    totalWrong: 12,
    totalBlank: 6,
    accuracy: 70,
    netScore: 30,
    netAccuracy: 50,
    timeSpentSeconds: 9000,
    notes: null,
    scoringRule: "CEBRASPE",
    penaltyPerWrong: 1,
    penaltyScore: null,
    subjects: DISCIPLINES.map((d, i) => ({
      disciplineId: d.id,
      disciplineName: d.name,
      questionsCount: 20,
      correctCount: 16 - i * 3,
      wrongCount: 3 + i * 2,
      blankCount: 1 + i,
      accuracy: ((16 - i * 3) / 20) * 100,
    })),
    createdAt: at(day(todayKey, -10)),
    updatedAt: at(day(todayKey, -10)),
  }
}

export function buildStatisticsFixture(state: Exclude<StatisticsHarnessState, "error" | "retry">, todayKey: string): StatisticsCenterPayload {
  const disciplines: DisciplineMeta[] = DISCIPLINES.map(({ id, name, area }) => ({ id, name, area }))
  if (state === "empty") {
    return {
      sessions: [],
      attempts: [],
      disciplines: [],
      userDisciplines: [],
      reviewItems: [],
      reviewsCompletedLast30: 0,
      activePlan: null,
      activePlanError: false,
      simulados: [],
      weekStartDay: 1,
    }
  }
  if (state === "partial") {
    return {
      sessions: buildSessions(todayKey),
      attempts: null,
      disciplines: null,
      userDisciplines: null,
      reviewItems: null,
      reviewsCompletedLast30: null,
      activePlan: null,
      activePlanError: true,
      simulados: null,
      weekStartDay: null,
    }
  }
  return {
    sessions: buildSessions(todayKey),
    attempts: buildAttempts(todayKey),
    disciplines,
    userDisciplines: USER_DISCIPLINES,
    reviewItems: buildReviewItems(todayKey),
    reviewsCompletedLast30: 5,
    activePlan: ACTIVE_PLAN,
    activePlanError: false,
    simulados: [buildSimulado(todayKey)],
    weekStartDay: 1,
  }
}

export function createFakeStatisticsActions(state: StatisticsHarnessState, todayKey: string): StatisticsActions {
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 150))
  let calls = 0
  return {
    async getStatisticsCenterAction() {
      await delay()
      calls += 1
      if (state === "error" || (state === "retry" && calls === 1)) {
        return { data: null, error: "Falha simulada de leitura (harness).", cached: false }
      }
      const kind = state === "retry" ? "data" : state
      return { data: buildStatisticsFixture(kind, todayKey), error: null, cached: false }
    },
  }
}
