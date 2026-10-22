import { packHistoryList, type HistoryListDbRow } from "@/application/study-history/history-list-payload"
import { addDaysToKey } from "@/application/study-analytics/engine/stats-engine"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import type { CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import type { PeriodGoalData, ReplanInfoPayload, ReplanUiBlock } from "@/application/study-plan/replan/adaptive-replan.service"
import type { HistoryActions } from "@/features/history/history-actions"
import type { PlanningActions } from "@/features/planejamento/planning-actions"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"

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

/**
 * `calendar-error`: toda leitura de mês falha. `calendar-retry`: SÓ a primeira
 * leitura falha (a nova tentativa funciona). `calendar-month-error`: o mês
 * atual carrega, qualquer outro mês falha (erro depois de trocar o período).
 */
export type HistoryHarnessState =
  | "data"
  | "empty"
  | "error"
  | "calendar-error"
  | "calendar-retry"
  | "calendar-month-error"

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
  let monthlyCalls = 0

  return {
    async getList() {
      await delay()
      if (state === "error") return { data: null, error: "falha simulada de leitura" }
      return { data: packHistoryList(dbRows), error: null }
    },
    async getMonthly(year: number, month: number) {
      await delay()
      monthlyCalls += 1
      if (state === "calendar-error") throw new Error("falha de rede simulada (harness)")
      if (state === "calendar-retry" && monthlyCalls === 1) throw new Error("falha de rede simulada (harness)")
      if (state === "calendar-month-error") {
        const current = `${todayKey.slice(0, 4)}-${todayKey.slice(5, 7)}`
        if (`${year}-${String(month).padStart(2, "0")}` !== current) return { data: null, error: "falha simulada de leitura" }
      }
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

/**
 * G2.24 — leituras sintéticas do Planejamento (visões Dia, Semana, Mês e Metas).
 * `data`: plano com janela de 7 dias a partir de hoje, pendência e um
 * reajuste desfazível. `empty`: sem plano. `error`: TODA leitura falha (banner
 * "Não foi possível atualizar o cronograma"). `retry`: toda leitura falha até
 * o evento de sessão salva (`study-session-saved`); depois funciona. (Não
 * depende de contar chamadas: as visões podem reler por conta própria.)
 */
export type PlanningHarnessState = "data" | "empty" | "error" | "retry"

function replanDailyBlocks(todayKey: string): Record<string, ReplanUiBlock[]> {
  const out: Record<string, ReplanUiBlock[]> = {}
  for (let offset = 0; offset < 7; offset++) {
    const key = day(todayKey, offset)
    out[key] = [0, 1].map((n) => {
      const d = DISCIPLINES[(offset + n) % DISCIPLINES.length] ?? DISCIPLINES[0]
      return {
        id: `rb-e2e-${offset}-${n}`,
        itemId: `item-e2e-${(offset + n) % DISCIPLINES.length}`,
        disciplineId: d.id,
        disciplineName: d.name,
        durationMinutes: n === 0 ? 60 : 45,
        executionOrder: n + 1,
        origin: offset === 1 && n === 1 ? "REAJUSTE" : "BASE",
        status: "PENDENTE",
        manuallyClosed: false,
        manualPendingMinutes: 0,
      }
    })
  }
  return out
}

export function buildReplanInfoFixture(todayKey: string, hasPlan: boolean): ReplanInfoPayload {
  if (!hasPlan) {
    return {
      enabled: true,
      replanPaused: false,
      sanityInvalid: false,
      todayStr: todayKey,
      dailyBlocks: {},
      pendingByDiscipline: [],
      totalPendingMinutes: 0,
      unscheduledMinutes: 0,
      lastEvent: null,
      hasPlan: false,
    }
  }
  return {
    enabled: true,
    replanPaused: false,
    sanityInvalid: false,
    todayStr: todayKey,
    dailyBlocks: replanDailyBlocks(todayKey),
    pendingByDiscipline: [
      { disciplineId: DISCIPLINES[0].id, disciplineName: DISCIPLINES[0].name, pendingMinutes: 30 },
      { disciplineId: DISCIPLINES[2].id, disciplineName: DISCIPLINES[2].name, pendingMinutes: 15 },
    ],
    totalPendingMinutes: 45,
    unscheduledMinutes: 0,
    lastEvent: {
      id: "evt-e2e-1",
      createdAt: `${todayKey}T12:00:00.000Z`,
      reason: "PENDENCIA",
      pendingMinutes: 45,
      distributedDays: 2,
      critical: false,
      revertedAt: null,
      message: "45 min de pendência redistribuídos em 2 dias.",
    },
    hasPlan: true,
  }
}

export function buildPeriodGoalFixture(todayKey: string): PeriodGoalData {
  return {
    goalMinutes: 1200,
    goalSource: "configured",
    studiedMinutes: 360,
    remainingMinutes: 840,
    dailyGoalMinutes: 171,
    periodLabel: "Esta semana",
    periodStart: day(todayKey, -3),
    periodEnd: day(todayKey, 3),
  }
}

export function createFakePlanningActions(state: PlanningHarnessState): PlanningActions {
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 120))
  let recovered = state !== "retry"
  if (state === "retry" && typeof window !== "undefined") {
    // registrado ANTES das visões: quando o listener delas relê, já está recuperado
    window.addEventListener("study-session-saved", () => {
      recovered = true
    })
  }
  return {
    async getReplanInfoAction() {
      await delay()
      if (state === "error" || !recovered) return { data: null, error: "falha simulada de leitura" }
      return { data: buildReplanInfoFixture(getDayInSaoPaulo(new Date()), state !== "empty"), error: null }
    },
    async getPeriodGoalAction() {
      await delay()
      if (state === "error") return { data: null, error: "falha simulada de leitura" }
      return { data: buildPeriodGoalFixture(getDayInSaoPaulo(new Date())), error: null }
    },
    // Sem sessão no harness: o sync real devolveria null/erro; aqui é um no-op
    // explícito (nenhuma preferência remota e nenhuma escrita).
    async syncPlanningPreferencesFromServer() {
      return null
    },
  }
}
