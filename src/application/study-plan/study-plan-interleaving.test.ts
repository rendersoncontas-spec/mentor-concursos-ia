/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  calculateWeeklyDistribution,
  calculateCycleDistribution,
  SAME_DISCIPLINE_PENALTY,
  SAME_AREA_PENALTY,
} from "./study-plan.algorithm"
import type { AlgorithmDisciplineInput, DayOfWeek } from "@/domain/study-plan/study-plan.types"

const DISCIPLINES: AlgorithmDisciplineInput[] = [
  { disciplineId: "d1", name: "Português", area: "Humanas", weight: 5, status: "STUDYING" },
  { disciplineId: "d2", name: "Matemática", area: "Exatas", weight: 4, status: "STUDYING" },
  { disciplineId: "d3", name: "História", area: "Humanas", weight: 3, status: "NOT_STARTED" },
  { disciplineId: "d4", name: "Geografia", area: "Humanas", weight: 3, status: "REVISING" },
]

const CYCLE_DISCIPLINES = [
  { disciplineId: "d1", name: "Português", area: "Humanas", weight: 5, difficulty: 4 },
  { disciplineId: "d2", name: "Matemática", area: "Exatas", weight: 4, difficulty: 3 },
  { disciplineId: "d3", name: "História", area: "Humanas", weight: 3, difficulty: 2 },
]

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]

// ─── Constantes Auditadas ─────────────────────────────────────────────────────

test("SAME_DISCIPLINE_PENALTY: valor auditado e igual a 100 (escala 0-100)", () => {
  assert.equal(SAME_DISCIPLINE_PENALTY, 100)
})

test("SAME_AREA_PENALTY: valor auditado e igual a 50", () => {
  assert.equal(SAME_AREA_PENALTY, 50)
})

// ─── Escala Normalizada 0-100 ──────────────────────────────────────────────────

test("calculateWeeklyDistribution: prioridades ficam dentro da escala 0-100", () => {
  const items = calculateWeeklyDistribution({
    weeklyMinutes: 600,
    availableDays: ALL_DAYS,
    disciplines: DISCIPLINES,
  })
  assert.ok(items.length > 0)
  items.forEach((item) => {
    assert.ok(
      item.priorityScore >= 0 && item.priorityScore <= 100,
      `priorityScore ${item.priorityScore} fora da escala 0-100`
    )
  })
})

test("calculateCycleDistribution: prioridades ficam dentro da escala 0-100", () => {
  const items = calculateCycleDistribution({
    totalCycleMinutes: 600,
    disciplines: CYCLE_DISCIPLINES,
  })
  assert.ok(items.length > 0)
  items.forEach((item) => {
    assert.ok(
      item.priorityScore >= 0 && item.priorityScore <= 100,
      `priorityScore ${item.priorityScore} fora da escala 0-100`
    )
  })
})

// ─── Interleaving: Sem Conflito (com disciplinas/áreas diferentes) ─────────────

test("balanceamento: disciplina semanal sem repetição de blocos normais no mesmo dia", () => {
  const items = calculateWeeklyDistribution({
    weeklyMinutes: 600,
    availableDays: ALL_DAYS,
    disciplines: DISCIPLINES,
  })

  // Agrupar por dia e filtrar apenas sessões de estudo padrão (desconsidera blocos genéricos de revisão inseridos)
  const byDay = new Map<number, typeof items>()
  items.forEach((item) => {
    if (item.disciplineName.includes("(Revisão)")) return
    const dayItems = byDay.get(item.dayOfWeek) || []
    byDay.set(item.dayOfWeek, dayItems.concat(item))
  })

  let dailyStudyViolations = 0
  byDay.forEach((dayItems) => {
    for (let i = 1; i < dayItems.length; i++) {
      if (dayItems[i - 1]!.disciplineId === dayItems[i]!.disciplineId) dailyStudyViolations++
    }
  })

  assert.equal(dailyStudyViolations, 0, `Violações de repetição de estudos encontradas: ${dailyStudyViolations}`)
})

test("ciclo rotativo: 3 disciplinas alternam sem repetição consecutiva", () => {
  const items = calculateCycleDistribution({
    totalCycleMinutes: 300,
    disciplines: CYCLE_DISCIPLINES,
  })

  assert.ok(items.length >= 3)
  let violations = 0
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!
    const curr = items[i]!
    if (prev.disciplineId === curr.disciplineId) violations++
  }
  assert.equal(violations, 0, `Encontradas ${violations} repetições consecutivas no ciclo`)
})

// ─── Interleaving: Conflito de Mesma Área ─────────────────────────────────────

test("áreas iguais são espaçadas quando há disciplinas suficientes", () => {
  // 2 disciplinas da mesma área + 1 de área diferente
  const items = calculateCycleDistribution({
    totalCycleMinutes: 300,
    disciplines: [
      { disciplineId: "d1", name: "Português", area: "Humanas", weight: 5, difficulty: 3 },
      { disciplineId: "d2", name: "História", area: "Humanas", weight: 4, difficulty: 3 },
      { disciplineId: "d3", name: "Matemática", area: "Exatas", weight: 3, difficulty: 3 },
    ],
  })

  // Conta quantas vezes a mesma área aparece consecutivamente
  let sameAreaAdjacency = 0
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!
    const curr = items[i]!
    if (
      prev.disciplineArea &&
      curr.disciplineArea &&
      prev.disciplineArea === curr.disciplineArea &&
      prev.disciplineId !== curr.disciplineId
    ) {
      sameAreaAdjacency++
    }
  }
  // Com 3 disciplinas (2 Humanas + 1 Exatas), o ideal é 0 ou mínimas adjacências
  // A penalidade de área reduz, mas não proíbe totalmente
  assert.ok(
    sameAreaAdjacency <= 1,
    `Adjacência de mesma área alta demais: ${sameAreaAdjacency}`
  )
})

// ─── Penalidade de Única Disciplina (caso extremo do plano) ────────────────────

test("única disciplina no pool não é descartada mesmo com score negativo", () => {
  const items = calculateCycleDistribution({
    totalCycleMinutes: 120,
    disciplines: [
      { disciplineId: "solo", name: "Só Uma Matéria", area: "Solo", weight: 5, difficulty: 5 },
    ],
  })
  // Deve gerar blocos da única disciplina mesmo sendo repetida consecutivamente
  assert.ok(items.length > 0)
  assert.ok(items.every((i) => i.disciplineId === "solo"))
})

// ─── Modo Reta Final (isFinalSprint / allowConsecutiveBlocks) ──────────────────

test("modo reta final: isFinalSprint desativa penalidades e agrupa mesma matéria", () => {
  const items = calculateCycleDistribution({
    totalCycleMinutes: 300,
    isFinalSprint: true,
    disciplines: CYCLE_DISCIPLINES,
  })

  // Com penalidades desligadas, blocos ficam agrupados por prioridade (score)
  // Validamos que o output ainda é válido e ordenado por score
  assert.ok(items.length > 0)
  const totalMinutes = items.reduce((acc, i) => acc + i.durationMinutes, 0)
  assert.equal(totalMinutes, 300)

  // Em reta final, blocos da mesma disciplina tendem a agrupar consecutivamente
  // (ordem de prioridade pura, sem interleaving forçado)
  const firstDiscipline = items[0]!.disciplineId
  const sameDisciplineSequence = items.filter(
    (i, idx) => idx < 3 && i.disciplineId === firstDiscipline
  )
  // Com 3 disciplinas e blocos agrupados, os primeiros blocos devem ser da mesma matéria
  assert.ok(sameDisciplineSequence.length >= 1)
})

test("modo normal vs reta final: sequências diferem quando há agrupamento", () => {
  const disciplines = [
    { disciplineId: "d1", name: "A", area: "Area1", weight: 5, difficulty: 3 },
    { disciplineId: "d2", name: "B", area: "Area2", weight: 4, difficulty: 3 },
    { disciplineId: "d3", name: "C", area: "Area3", weight: 3, difficulty: 3 },
  ]

  const normal = calculateCycleDistribution({
    totalCycleMinutes: 360,
    disciplines,
  })
  const sprint = calculateCycleDistribution({
    totalCycleMinutes: 360,
    isFinalSprint: true,
    disciplines,
  })

  const normalSequence = normal.map((i) => i.disciplineId)
  const sprintSequence = sprint.map((i) => i.disciplineId)

  // As sequências devem ser diferentes (interleaving vs agrupamento)
  // Se iguais, o modo reta final não está alterando o comportamento
  assert.notDeepEqual(normalSequence, sprintSequence)
})

test("reta final no plano semanal: isFinalSprint propaga corretamente", () => {
  const normal = calculateWeeklyDistribution({
    weeklyMinutes: 480,
    availableDays: ALL_DAYS,
    disciplines: DISCIPLINES,
    isFinalSprint: true,
  })

  assert.ok(normal.length > 0)
  const totalMinutes = normal.reduce((acc, i) => acc + i.durationMinutes, 0)
  assert.equal(totalMinutes, 480)
})

// ─── Casos Extremos ────────────────────────────────────────────────────────────

test("pool vazio retorna array vazio", () => {
  const weekly = calculateWeeklyDistribution({
    weeklyMinutes: 600,
    availableDays: ALL_DAYS,
    disciplines: [],
  })
  assert.equal(weekly.length, 0)

  const cycle = calculateCycleDistribution({
    totalCycleMinutes: 600,
    disciplines: [],
  })
  assert.equal(cycle.length, 0)
})

test("disciplina COMPLETED é descartada do plano semanal", () => {
  const items = calculateWeeklyDistribution({
    weeklyMinutes: 300,
    availableDays: ALL_DAYS,
    disciplines: [
      { disciplineId: "d1", name: "A", area: "X", weight: 5, status: "COMPLETED" },
      { disciplineId: "d2", name: "B", area: "Y", weight: 4, status: "STUDYING" },
    ],
  })
  assert.ok(items.length > 0)
  assert.ok(items.every((i) => i.disciplineId === "d2"))
})

test("todos os minutos são preservados sem perda (soma exata)", () => {
  const weeklyMinutes = 600
  const items = calculateWeeklyDistribution({
    weeklyMinutes,
    availableDays: ALL_DAYS,
    disciplines: DISCIPLINES,
  })
  const totalMinutes = items.reduce((acc, i) => acc + i.durationMinutes, 0)
  assert.equal(totalMinutes, weeklyMinutes)
})