import assert from "node:assert/strict"
import { test } from "node:test"

import {
  type PlanningFormValues,
  buildPlanningPayload,
  getStudyDaysCount,
  isShiftDayForDate,
  isShiftDayForScale,
  normalizePlanningForm,
  planningReason,
  validatePlanningForm,
} from "./planning-form.ts"

function form(partial: Partial<PlanningFormValues>): PlanningFormValues {
  return {
    mode: "ciclo",
    weeklyHours: 25,
    dayConfigMode: "semana",
    scale: "normal",
    customWorkDays: 3,
    customOffDays: 2,
    firstShiftDay: 2,
    studyDays: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    minMinutes: 45,
    maxMinutes: 90,
    sessionStyle: "equilibradas",
    selectedDisciplines: ["Língua Portuguesa", "Direito Constitucional"],
    importanceMap: {},
    knowledgeMap: {},
    ...partial,
  }
}

test("validatePlanningForm: aceita um formulário válido", () => {
  const res = validatePlanningForm(form({}))
  assert.equal(res.ok, true)
  assert.deepEqual(res.errors, [])
})

test("validatePlanningForm: rejeita carga fora de 5h-50h", () => {
  const res = validatePlanningForm(form({ weeklyHours: 3 }))
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes("entre 5h e 50h")))
})

test("validatePlanningForm: rejeita lista de disciplinas vazia", () => {
  const res = validatePlanningForm(form({ selectedDisciplines: [] }))
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes("Selecione ao menos 1 disciplina")))
})

test("validatePlanningForm: rejeita duração mínima maior que máxima", () => {
  const res = validatePlanningForm(form({ minMinutes: 120, maxMinutes: 60 }))
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes("mínima não pode ser maior")))
})

test("validatePlanningForm: rejeita escala personalizada fora de 1-14", () => {
  const res = validatePlanningForm(form({ dayConfigMode: "escala", scale: "custom_0x2" }))
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes("escala personalizada")))
})

test("normalizePlanningForm: limita carga, dias de escala e arredonda duração", () => {
  const res = normalizePlanningForm(
    form({ weeklyHours: 99, customWorkDays: 0, customOffDays: 20, minMinutes: 47, maxMinutes: 91 }),
  )
  assert.equal(res.weeklyHours, 50)
  assert.equal(res.customWorkDays, 1)
  assert.equal(res.customOffDays, 14)
  assert.equal(res.minMinutes, 45)
  assert.equal(res.maxMinutes, 90)
})

test("isShiftDayForScale: 24x72 com primeiro plantão no dia 2", () => {
  assert.equal(isShiftDayForScale(2, 2, "24x72"), true)
  assert.equal(isShiftDayForScale(3, 2, "24x72"), false)
  assert.equal(isShiftDayForScale(6, 2, "24x72"), true)
})

test("isShiftDayForScale: escala personalizada custom_3x2", () => {
  // Trabalha 3 dias (2,3,4), folga 2 dias (5,6), repete a partir de 7
  assert.equal(isShiftDayForScale(2, 2, "custom_3x2"), true)
  assert.equal(isShiftDayForScale(3, 2, "custom_3x2"), true)
  assert.equal(isShiftDayForScale(4, 2, "custom_3x2"), true)
  assert.equal(isShiftDayForScale(5, 2, "custom_3x2"), false)
  assert.equal(isShiftDayForScale(6, 2, "custom_3x2"), false)
  assert.equal(isShiftDayForScale(7, 2, "custom_3x2"), true)
})

test("isShiftDayForScale: normal nunca é plantão", () => {
  assert.equal(isShiftDayForScale(2, 2, "normal"), false)
  assert.equal(isShiftDayForScale(15, 2, "normal"), false)
})

test("isShiftDayForDate: rotação contínua na transição de mês (Agosto -> Setembro)", () => {
  const anchor = "2026-08-24" // Segunda-feira de plantão na escala 24x72 (ciclo de 4 dias)
  
  // Agosto tem 31 dias
  assert.equal(isShiftDayForDate("2026-08-24", anchor, "24x72"), true)
  assert.equal(isShiftDayForDate("2026-08-25", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-08-26", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-08-27", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-08-28", anchor, "24x72"), true)
  assert.equal(isShiftDayForDate("2026-08-29", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-08-30", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-08-31", anchor, "24x72"), false)
  
  // Setembro: 1 de Setembro (após 31 de Agosto) cai exatamente 8 dias após a âncora => Plantão!
  assert.equal(isShiftDayForDate("2026-09-01", anchor, "24x72"), true)
  assert.equal(isShiftDayForDate("2026-09-02", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-09-03", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-09-04", anchor, "24x72"), false)
  assert.equal(isShiftDayForDate("2026-09-05", anchor, "24x72"), true)
})

test("isShiftDayForDate: escala 12x36 alternada dia sim, dia não", () => {
  const anchor = "2026-08-24"
  assert.equal(isShiftDayForDate("2026-08-24", anchor, "12x36"), true)
  assert.equal(isShiftDayForDate("2026-08-25", anchor, "12x36"), false)
  assert.equal(isShiftDayForDate("2026-08-26", anchor, "12x36"), true)
  assert.equal(isShiftDayForDate("2026-08-27", anchor, "12x36"), false)
})

test("isShiftDayForDate: datas anteriores à data âncora (módulo negativo)", () => {
  const anchor = "2026-08-24"
  // 4 dias antes de 24/08 é 20/08 => Plantão
  assert.equal(isShiftDayForDate("2026-08-20", anchor, "24x72"), true)
  assert.equal(isShiftDayForDate("2026-08-21", anchor, "24x72"), false)
})

test("getStudyDaysCount: dias por semana por escala", () => {
  assert.equal(getStudyDaysCount("normal", ["seg", "ter"]), 2)
  assert.equal(getStudyDaysCount("24x72", []), 5)
  assert.equal(getStudyDaysCount("12x36", []), 3.5)
  assert.equal(getStudyDaysCount("6x1", []), 6)
  assert.equal(getStudyDaysCount("custom_3x2", []), 4)
  assert.equal(getStudyDaysCount("custom_6x1", []), 6)
})

test("buildPlanningPayload: inclui todas as disciplinas com default 2.5", () => {
  const res = buildPlanningPayload(
    form({ importanceMap: { "Língua Portuguesa": 5 }, knowledgeMap: {} }),
  )
  assert.deepEqual(res.horasSemana, 25)
  assert.equal(res.importanceMap["Língua Portuguesa"], 5)
  assert.equal(res.importanceMap["Direito Constitucional"], 2.5)
  assert.equal(res.knowledgeMap["Língua Portuguesa"], 2.5)
  assert.equal(Object.keys(res.importanceMap).length, 2)
})

test("planningReason: create gera reason manual e edit gera replan", () => {
  assert.equal(planningReason("create"), "manual")
  assert.equal(planningReason("edit"), "replan")
})
