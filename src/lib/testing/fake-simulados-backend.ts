import type { SupabaseClient } from "@supabase/supabase-js"

import { deleteSimuladoRecord, saveSimuladoRecord } from "@/application/simulados/simulado-record-persistence"
import { readSimuladoRecords } from "@/application/simulados/simulado-records.read"
import { buildStudyPerformance, type StudySessionLite } from "@/application/simulados/study-performance"
import { addDaysToKey } from "@/application/study-analytics/engine/stats-engine"
import { EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecordInput } from "@/domain/simulados/types"
import type { SimuladosActions } from "@/features/simulados/simulados-actions"
import { FakeReviewDb } from "@/lib/testing/fake-review-db"

/**
 * G2.21 — "backend" FALSO da tela de Simulados para o harness E2E.
 *
 * O que é real: validação, regras de gravação, idempotência por `requestId`,
 * exclusão e leitura dos simulados (`saveSimuladoRecord`, `deleteSimuladoRecord`,
 * `readSimuladoRecords`) e o cálculo de Estudo × desempenho
 * (`buildStudyPerformance`) — as MESMAS funções que as Server Actions chamam.
 * O que é falso: só o banco (FakeReviewDb em memória) e o usuário (um id
 * sintético). Nenhuma sessão, nenhum Supabase, nenhum dado pessoal.
 *
 * Falhas simuladas: cada ação pode devolver erro (como o servidor devolveria)
 * ou rejeitar (como uma Server Action com a rede caída).
 */

export const E2E_USER_ID = "e2e-harness-user"

/** Catálogo sintético (uuid v4 válidos, exigidos pela validação real). */
export const FAKE_DISCIPLINES = [
  { id: "0a1b2c3d-0001-4000-8000-000000000001", name: "Língua Portuguesa", area: "Básicas" },
  { id: "0a1b2c3d-0002-4000-8000-000000000002", name: "Contabilidade Geral", area: "Específicas" },
  { id: "0a1b2c3d-0003-4000-8000-000000000003", name: "Direito Tributário", area: "Específicas" },
  { id: "0a1b2c3d-0004-4000-8000-000000000004", name: "Direito Constitucional", area: "Básicas" },
  { id: "0a1b2c3d-0005-4000-8000-000000000005", name: "Raciocínio Lógico", area: "Básicas" },
] as const

const [PT, CG, DT] = FAKE_DISCIPLINES

export type FakeFailureMode = "error" | "reject" | null

export interface FakeSimuladosOptions {
  todayKey: string
  seed: "data" | "empty"
  failures?: {
    load?: FakeFailureMode
    save?: FakeFailureMode
    delete?: FakeFailureMode
    performance?: FakeFailureMode
  }
  /** Atraso de cada ação (ms) — torna o estado "carregando/salvando" observável. */
  delayMs?: number
  saveDelayMs?: number
  /** Chamado a cada ação (contadores do teste: duplo clique ≠ 2 gravações). */
  onCall?: (action: keyof SimuladosActions) => void
}

function day(todayKey: string, offset: number): string {
  return addDaysToKey(todayKey, offset) ?? todayKey
}

function seedInputs(todayKey: string): SimuladoRecordInput[] {
  const base = {
    source: "TEC" as const,
    exam_board: "FGV",
    examName: "Receita Federal",
    roleName: "Auditor Fiscal",
    scoringRule: "PERCENTUAL" as const,
  }
  return [
    {
      ...base,
      requestId: "5e1d0000-0001-4000-8000-000000000001",
      name: "1º Simulado Receita Federal",
      simuladoDate: day(todayKey, -70),
      totalQuestions: 80, totalCorrect: 47, totalWrong: 33, totalBlank: 0,
      timeSpentSeconds: 4 * 3600,
      subjects: [
        { disciplineId: PT.id, disciplineName: PT.name, questionsCount: 20, correctCount: 14, wrongCount: 6, blankCount: 0 },
        { disciplineId: CG.id, disciplineName: CG.name, questionsCount: 30, correctCount: 15, wrongCount: 15, blankCount: 0 },
        { disciplineId: DT.id, disciplineName: DT.name, questionsCount: 30, correctCount: 18, wrongCount: 12, blankCount: 0 },
      ],
    },
    {
      ...base,
      requestId: "5e1d0000-0002-4000-8000-000000000002",
      name: "2º Simulado Receita Federal",
      source: "GRAN",
      simuladoDate: day(todayKey, -45),
      totalQuestions: 80, totalCorrect: 53, totalWrong: 27, totalBlank: 0,
      subjects: [
        { disciplineId: PT.id, disciplineName: PT.name, questionsCount: 20, correctCount: 15, wrongCount: 5, blankCount: 0 },
        { disciplineId: CG.id, disciplineName: CG.name, questionsCount: 30, correctCount: 18, wrongCount: 12, blankCount: 0 },
        { disciplineId: DT.id, disciplineName: DT.name, questionsCount: 30, correctCount: 20, wrongCount: 10, blankCount: 0 },
      ],
    },
    {
      ...base,
      requestId: "5e1d0000-0003-4000-8000-000000000003",
      name: "Simulado TCU — Estratégia",
      source: "ESTRATEGIA",
      exam_board: "CEBRASPE",
      examName: "TCU",
      roleName: "Auditor de Controle Externo",
      scoringRule: "CEBRASPE",
      penaltyPerWrong: 1,
      simuladoDate: day(todayKey, -20),
      totalQuestions: 100, totalCorrect: 63, totalWrong: 26, totalBlank: 11,
      notes: "Prova longa; faltou tempo para revisar Contabilidade.",
      subjects: [
        { disciplineId: PT.id, disciplineName: PT.name, questionsCount: 40, correctCount: 30, wrongCount: 6, blankCount: 4 },
        { disciplineId: CG.id, disciplineName: CG.name, questionsCount: 60, correctCount: 33, wrongCount: 20, blankCount: 7 },
      ],
    },
    {
      ...base,
      requestId: "5e1d0000-0004-4000-8000-000000000004",
      name: "3º Simulado Receita Federal",
      simuladoDate: day(todayKey, -6),
      totalQuestions: 80, totalCorrect: 56, totalWrong: 24, totalBlank: 0,
      timeSpentSeconds: 3 * 3600 + 30 * 60,
      subjects: [
        { disciplineId: PT.id, disciplineName: PT.name, questionsCount: 20, correctCount: 17, wrongCount: 3, blankCount: 0 },
        { disciplineId: CG.id, disciplineName: CG.name, questionsCount: 30, correctCount: 16, wrongCount: 14, blankCount: 0 },
        { disciplineId: DT.id, disciplineName: DT.name, questionsCount: 30, correctCount: 23, wrongCount: 7, blankCount: 0 },
      ],
    },
  ]
}

/** Sessões de estudo sintéticas nas últimas 8 semanas (alimentam Estudo × desempenho). */
function seedSessions(todayKey: string): StudySessionLite[] {
  const sessions: StudySessionLite[] = []
  const plan: Array<[string, number]> = [
    [PT.id, 60],
    [CG.id, 120],
    [DT.id, 90],
  ]
  for (let week = 0; week < 8; week++) {
    plan.forEach(([disciplineId, minutes], i) => {
      const key = day(todayKey, -(week * 7 + i + 1))
      sessions.push({ id: `sess-${week}-${i}`, disciplineId, startedAt: `${key}T12:00:00.000Z`, durationMinutes: minutes })
    })
  }
  return sessions
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createFakeSimuladosBackend(options: FakeSimuladosOptions): { actions: SimuladosActions; db: FakeReviewDb } {
  const db = new FakeReviewDb(
    { simulados: [], simulado_disciplines: [], disciplines: FAKE_DISCIPLINES.map((d) => ({ ...d })) },
    [{ table: "simulados", columns: ["id"] }],
  )
  const client = db as unknown as SupabaseClient
  const delay = options.delayMs ?? 0
  const failures = options.failures ?? {}
  const sessions = options.seed === "data" ? seedSessions(options.todayKey) : []

  // A carga inicial passa pelo MESMO caminho de gravação real.
  const ready = (async () => {
    if (options.seed !== "data") return
    for (const input of seedInputs(options.todayKey)) {
      const res = await saveSimuladoRecord(client, E2E_USER_ID, input, options.todayKey)
      if (res.error) throw new Error(`seed inválido: ${res.error}`)
    }
  })()

  async function step(action: keyof SimuladosActions, mode: FakeFailureMode | undefined, ms = delay) {
    options.onCall?.(action)
    await ready
    if (ms > 0) await sleep(ms)
    if (mode === "reject") throw new Error("falha de rede simulada (harness)")
    return mode === "error"
  }

  const actions: SimuladosActions = {
    async getRecords() {
      if (await step("getRecords", failures.load)) return { data: null, error: "Erro ao carregar simulados." }
      const res = await readSimuladoRecords(client, E2E_USER_ID)
      return { ...res, identity: EMPTY_DISCIPLINE_IDENTITY }
    },
    async deleteRecord(id: string) {
      if (await step("deleteRecord", failures.delete)) return { error: "Não foi possível excluir o simulado." }
      return deleteSimuladoRecord(client, E2E_USER_ID, id)
    },
    async getFormDisciplines() {
      await step("getFormDisciplines", null)
      return { data: FAKE_DISCIPLINES.map((d) => ({ ...d })), error: null }
    },
    async saveRecord(input: SimuladoRecordInput) {
      if (await step("saveRecord", failures.save, options.saveDelayMs ?? delay)) {
        return { data: null, error: "Erro ao registrar simulado. Tente novamente." }
      }
      return saveSimuladoRecord(client, E2E_USER_ID, input, options.todayKey)
    },
    async getStudyPerformance(periodKey) {
      if (await step("getStudyPerformance", failures.performance)) {
        return { data: null, error: "Não foi possível calcular o desempenho agora." }
      }
      const records = await readSimuladoRecords(client, E2E_USER_ID)
      if (records.error || !records.data) return { data: null, error: records.error ?? "Erro." }
      const report = buildStudyPerformance({
        records: records.data,
        sessions,
        disciplineNames: new Map(FAKE_DISCIPLINES.map((d) => [d.id, d.name])),
        periodKey,
        todayKey: options.todayKey,
      })
      return { data: report, error: null }
    },
  }
  return { actions, db }
}
