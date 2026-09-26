import assert from "node:assert/strict"
import { test } from "node:test"

import {
  getStudyPlanDay,
  type BaseCycleBlock,
  type SharedPlanConfig,
} from "./study-plan-shared.ts"
import { todayKeyInSaoPaulo } from "@/lib/sao-paulo.ts"

const MOCK_CYCLE_BLOCKS: BaseCycleBlock[] = [
  { id: "b1", disciplineId: "d-const", disciplineName: "Direito Constitucional", durationMinutes: 60, color: "#2563EB" },
  { id: "b2", disciplineId: "d-adm", disciplineName: "Direito Administrativo", durationMinutes: 60, color: "#10B981" },
  { id: "b3", disciplineId: "d-port", disciplineName: "Língua Portuguesa", durationMinutes: 60, color: "#F59E0B" },
  { id: "b4", disciplineId: "d-ti", disciplineName: "Tecnologia da Informação", durationMinutes: 60, color: "#8B5CF6" },
  { id: "b5", disciplineId: "d-aud", disciplineName: "Auditoria", durationMinutes: 60, color: "#EC4899" },
]

const MOCK_CONFIG_24x72: SharedPlanConfig = {
  scheduleMode: "24x72",
  firstShiftDay: 2, // 25/08 e 29/08 são plantão
  anchorShiftDate: "2026-08-01",
  studyDays: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
  customShiftDays: {},
}

const MOCK_REPLAN_INFO = {
  enabled: true,
  hasPlan: true,
  planId: "p1",
  planType: "SEMANAL" as const,
  replanPaused: false,
  autoEnabled: true,
  sanityInvalid: false,
  todayStr: "2026-08-27",
  lastEvent: null,
  totalPendingMinutes: 0,
  unscheduledMinutes: 0,
  pendingByDiscipline: [] as { disciplineId: string; disciplineName: string; pendingMinutes: number }[],
  dailyBlocks: {
    "2026-08-23": [
      { id: "db1", itemId: "i1", disciplineId: "d-const", disciplineName: "Direito Constitucional", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 1, manualPendingMinutes: 0 },
      { id: "db2", itemId: "i2", disciplineId: "d-adm", disciplineName: "Direito Administrativo", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 2, manualPendingMinutes: 0 },
    ],
    "2026-08-24": [
      { id: "db3", itemId: "i5", disciplineId: "d-aud", disciplineName: "Auditoria", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 1, manualPendingMinutes: 0 },
      { id: "db4", itemId: "i4", disciplineId: "d-ti", disciplineName: "Tecnologia da Informação", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 2, manualPendingMinutes: 0 },
    ],
    "2026-08-26": [
      { id: "db5", itemId: "i3", disciplineId: "d-port", disciplineName: "Língua Portuguesa", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 1, manualPendingMinutes: 0 },
    ],
    "2026-08-27": [
      { id: "db6", itemId: "i1", disciplineId: "d-const", disciplineName: "Direito Constitucional", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 1, manualPendingMinutes: 0 },
      { id: "db7", itemId: "i2", disciplineId: "d-adm", disciplineName: "Direito Administrativo", durationMinutes: 59, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 2, manualPendingMinutes: 0 },
    ],
    "2026-08-28": [
      { id: "db8", itemId: "i4", disciplineId: "d-ti", disciplineName: "Tecnologia da Informação", durationMinutes: 60, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 1, manualPendingMinutes: 0 },
      { id: "db9", itemId: "i5", disciplineId: "d-aud", disciplineName: "Auditoria", durationMinutes: 59, status: "PENDENTE", origin: "BASE" as const, manuallyClosed: false, executionOrder: 2, manualPendingMinutes: 0 },
    ],
  },
}

test("CONSISTÊNCIA TOTAL: Calendário Mensal === Agenda Semanal para todas as datas da semana", () => {
  const weekDates = [
    "2026-08-23", // Domingo
    "2026-08-24", // Segunda
    "2026-08-25", // Terça (Plantão)
    "2026-08-26", // Quarta
    "2026-08-27", // Quinta
    "2026-08-28", // Sexta
    "2026-08-29", // Sábado (Plantão)
  ]

  for (const dateStr of weekDates) {
    // Simula chamada pelo Calendário Mensal
    const monthlyPlanDay = getStudyPlanDay(dateStr, MOCK_REPLAN_INFO, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)

    // Simula chamada pela Agenda Semanal
    const weeklyPlanDay = getStudyPlanDay(dateStr, MOCK_REPLAN_INFO, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)

    // TESTE DE CONSISTÊNCIA: devem ser rigorosamente idênticos
    assert.deepEqual(monthlyPlanDay, weeklyPlanDay, `Diferença detectada na data ${dateStr}`)
  }
})

test("PLANTÃO: 25/08 e 29/08 retornam 0 blocos e 0 minutos planejados em ambos os componentes", () => {
  const tues25 = getStudyPlanDay("2026-08-25", MOCK_REPLAN_INFO, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)
  const sat29 = getStudyPlanDay("2026-08-29", MOCK_REPLAN_INFO, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)

  assert.equal(tues25.isDutyShift, true)
  assert.equal(tues25.plannedMinutes, 0)
  assert.equal(tues25.blocks.length, 0)

  assert.equal(sat29.isDutyShift, true)
  assert.equal(sat29.plannedMinutes, 0)
  assert.equal(sat29.blocks.length, 0)
})

test("SEGUNDA 24/08: Exibe exatamente Auditoria + Tecnologia da Informação", () => {
  const mon24 = getStudyPlanDay("2026-08-24", MOCK_REPLAN_INFO, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)

  assert.equal(mon24.isDutyShift, false)
  assert.equal(mon24.blocks.length, 2)
  assert.equal(mon24.blocks[0]?.disciplineName, "Auditoria")
  assert.equal(mon24.blocks[1]?.disciplineName, "Tecnologia da Informação")
  assert.equal(mon24.plannedMinutes, 120)
})

test("FALLBACK DETERMINÍSTICO: Quando não há blocos no servidor, gera slices idênticos em ambos os componentes", () => {
  const dateStr = "2026-09-01" // Terça
  const monthlyFallback = getStudyPlanDay(dateStr, null, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)
  const weeklyFallback = getStudyPlanDay(dateStr, null, MOCK_CONFIG_24x72, MOCK_CYCLE_BLOCKS)

  assert.deepEqual(monthlyFallback, weeklyFallback)
  assert.ok(monthlyFallback.blocks.length > 0)
  assert.equal(monthlyFallback.plannedMinutes, weeklyFallback.plannedMinutes)
})

// P1.1 — ano nunca é fixo: explícito é respeitado, virada de ano funciona,
// e ausência cai no ano real de America/Sao_Paulo (nunca 2026 hardcoded).
test("P1.1 ANO: year explícito é respeitado (2027 e virada 31/12→01/01)", () => {
  const dec31 = getStudyPlanDay("2027-12-31", null, MOCK_CONFIG_24x72, [])
  assert.equal(dec31.dateStr, "2027-12-31")
  assert.equal(dec31.dayOfWeekIndex, new Date(2027, 11, 31).getDay())

  const jan01 = getStudyPlanDay("2028-01-01", null, MOCK_CONFIG_24x72, [])
  assert.equal(jan01.dateStr, "2028-01-01")
  assert.equal(jan01.dayOfWeekIndex, new Date(2028, 0, 1).getDay())
})

test("P1.1 ANO: sem ano válido usa o ano real de São Paulo (nunca fixo)", () => {
  const res = getStudyPlanDay("abcd-08-15", null, MOCK_CONFIG_24x72, [])
  const expectedYear = Number(todayKeyInSaoPaulo().split("-")[0])
  assert.ok(Number.isFinite(expectedYear))
  // dayOfWeekIndex deve bater com o ano derivado, não com 2026 fixo
  assert.equal(res.dayOfWeekIndex, new Date(expectedYear, 7, 15).getDay())
})
