import { packHistoryList, type HistoryListDbRow } from "@/application/study-history/history-list-payload"
import { addDaysToKey } from "@/application/study-analytics/engine/stats-engine"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import type { CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import type { HistoryActions } from "@/features/history/history-actions"

/**
 * G2.23 — dados SINTÉTICOS para os harnesses de Histórico e Planejamento
 * (abas, teclado e foco). Nenhum dado pessoal: disciplinas e sessões fictícias,
 * coerentes entre si. O Histórico usa o MESMO empacotamento do servidor
 * (`packHistoryList`), então a tela recebe exatamente o formato real.
 */

const DISCIPLINES = [
  { id: "d0a1b2c3-0001-4000-8000-000000000001", name: "Língua Portuguesa", area: "Básicas", color: "#2563EB" },
  { id: "d0a1b2c3-0002-4000-8000-000000000002", name: "Contabilidade Geral", area: "Específicas", color: "#16A34A" },
  { id: "d0a1b2c3-0003-4000-8000-000000000003", name: "Direito Tributário", area: "Específicas", color: "#9333EA" },
] as const

const day = (todayKey: string, offset: number) => addDaysToKey(todayKey, offset) ?? todayKey

interface FixtureSession {
  id: string
  dateKey: string
  disciplineIndex: number
  minutes: number
  studyType: "TEORIA" | "QUESTOES" | "REVISAO"
  questions?: { answered: number; correct: number }
}

function sessions(todayKey: string): FixtureSession[] {
  const out: FixtureSession[] = []
  for (let i = 0; i < 9; i++) {
    out.push({
      id: `5e55a000-00${String(i).padStart(2, "0")}-4000-8000-000000000000`,
      dateKey: day(todayKey, -i),
      disciplineIndex: i % 3,
      minutes: 30 + (i % 4) * 15,
      studyType: i % 3 === 1 ? "QUESTOES" : "TEORIA",
      ...(i % 3 === 1 ? { questions: { answered: 20, correct: 14 } } : {}),
    })
  }
  return out
}

/** Meio-dia em São Paulo do dia `dateKey` (ISO). */
const startedAt = (dateKey: string) => `${dateKey}T15:00:00.000Z`

export type HistoryHarnessState = "data" | "empty" | "error" | "calendar-error"

export function createFakeHistoryActions(state: HistoryHarnessState, todayKey: string): HistoryActions {
  const list = state === "empty" ? [] : sessions(todayKey)
  const dbRows: HistoryListDbRow[] = list.map((s) => {
    const d = DISCIPLINES[s.disciplineIndex] ?? DISCIPLINES[0]
    return {
      id: s.id,
      started_at: startedAt(s.dateKey),
      created_at: startedAt(s.dateKey),
      duration_minutes: s.minutes,
      discipline_id: d.id,
      study_type: s.studyType,
      technique: "LIVRE",
      origin_source: null,
      origin_source_name: null,
      import_batch_id: null,
      disciplines: { id: d.id, name: d.name, area: d.area },
      ...(s.questions ? { meta_questions_answered: s.questions.answered, meta_questions_correct: s.questions.correct } : {}),
    }
  })
  const full = (s: FixtureSession): StudyHistory & { disciplines: { id: string; name: string; area: string } } => {
    const d = DISCIPLINES[s.disciplineIndex] ?? DISCIPLINES[0]
    return {
      id: s.id,
      user_id: "e2e-harness-user",
      discipline_id: d.id,
      study_plan_item_id: null,
      study_source: "FREE",
      study_type: s.studyType,
      technique: "LIVRE",
      started_at: startedAt(s.dateKey),
      finished_at: null,
      duration_minutes: s.minutes,
      active_minutes: s.minutes,
      paused_minutes: 0,
      planned_minutes: null,
      completed: true,
      interrupted: false,
      energy_level: null,
      difficulty: null,
      focus_score: null,
      mood: null,
      notes: null,
      metadata: s.questions ? { questions_answered: s.questions.answered, questions_correct: s.questions.correct } : {},
      created_at: startedAt(s.dateKey),
      disciplines: { id: d.id, name: d.name, area: d.area },
    }
  }
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 150))

  return {
    async getList() {
      await delay()
      if (state === "error") return { data: null, error: "falha simulada de leitura" }
      return { data: packHistoryList(dbRows), error: null }
    },
    async getMonthly(year: number, month: number) {
      await delay()
      if (state === "calendar-error") throw new Error("falha de rede simulada (harness)")
      const prefix = `${year}-${String(month).padStart(2, "0")}`
      const rows = list.filter((s) => s.dateKey.startsWith(prefix)).map(full)
      return { data: rows as unknown as Awaited<ReturnType<HistoryActions["getMonthly"]>>["data"], error: null }
    },
    async getSessionForEdit(sessionId: string) {
      await delay()
      const s = list.find((x) => x.id === sessionId)
      return s ? { data: full(s) as unknown as Record<string, unknown>, error: null } : { data: null, error: "Sessão não encontrada." }
    },
    async deleteSession() {
      await delay()
      return { error: null }
    },
  }
}

/** Plano de estudo sintético no formato de `getCycleOverviewData` (Planejamento). */
export function buildPlanningFixture(todayKey: string): CycleOverviewData {
  return {
    planId: "plan-e2e",
    version: 1,
    planType: "CICLO_ROTATIVO",
    totalCycleMinutes: 180,
    completedMinutes: 60,
    progressPercentage: 33,
    currentBlockIndex: 1,
    totalBlocksCount: 3,
    completedBlocksCount: 1,
    blocks: DISCIPLINES.map((d, i) => ({
      id: `blk-e2e-${i + 1}`,
      studyPlanId: "plan-e2e",
      disciplineId: d.id,
      disciplineName: d.name,
      disciplineArea: d.area,
      color: d.color,
      executionOrder: i + 1,
      durationMinutes: 60,
      studiedMinutes: i === 0 ? 60 : 0,
      status: i === 0 ? "CONCLUIDO" : "PENDENTE",
      priorityScore: 3,
    })),
    history: [
      { date: todayKey, disciplineId: DISCIPLINES[0].id, minutes: 60 },
      { date: day(todayKey, -1), disciplineId: DISCIPLINES[1].id, minutes: 45 },
    ],
  }
}
