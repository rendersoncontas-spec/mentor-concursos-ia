// ============================================================================
// P1.5 — resolução banco > legado > default (puro, sem Supabase).
// Casos: banco possui / banco ausente+local válido (migra) / local inválido /
// banco vence local / custom_NxM / first_shift inválido / study_days inválido.
// ============================================================================

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseFirstShiftDay,
  parseShiftAnchorDate,
  parseStudyDays,
  parseWorkScale,
  resolvePlanningPreferences,
} from "./planning-preferences.ts"

test("P1.5.1 banco possui configuração → usa banco (source database)", () => {
  const res = resolvePlanningPreferences(
    { workScale: "24x72", firstShiftDay: 5, shiftAnchorDate: "2026-09-01", studyDays: ["seg", "qua"] },
    { workScale: "normal", firstShiftDay: "2", shiftAnchorDate: null, studyDays: null, customScale: null },
  )
  assert.equal(res.source, "database")
  assert.equal(res.migrateUp, null)
  assert.equal(res.workScale, "24x72")
  assert.equal(res.firstShiftDay, 5)
  assert.deepEqual(res.studyDays, ["seg", "qua"])
})

test("P1.5.2 banco ausente + local válido → migra (source migrated + migrateUp)", () => {
  const res = resolvePlanningPreferences(
    { workScale: null, firstShiftDay: null, shiftAnchorDate: null, studyDays: null },
    { workScale: "12x36", firstShiftDay: "7", shiftAnchorDate: "2026-08-24", studyDays: JSON.stringify(["ter", "qui"]), customScale: null },
  )
  assert.equal(res.source, "migrated")
  assert.deepEqual(res.migrateUp, {
    workScale: "12x36",
    firstShiftDay: 7,
    shiftAnchorDate: "2026-08-24",
    studyDays: ["ter", "qui"],
  })
})

test("P1.5.3 banco ausente + local inválido → default legítimo (suggested)", () => {
  const res = resolvePlanningPreferences(
    null,
    { workScale: "escala-mal FORMADA!!", firstShiftDay: "99", shiftAnchorDate: "ontem", studyDays: "[invalido", customScale: null },
  )
  assert.equal(res.source, "suggested")
  assert.equal(res.migrateUp, null)
  assert.equal(res.workScale, "normal")
})

test("P1.5.4 banco parcial: campo presente vence, ausente usa default (nunca local antigo)", () => {
  const res = resolvePlanningPreferences(
    { workScale: "5x1", firstShiftDay: null, shiftAnchorDate: null, studyDays: null },
    { workScale: "24x72", firstShiftDay: "9", shiftAnchorDate: null, studyDays: JSON.stringify(["dom"]), customScale: null },
  )
  assert.equal(res.source, "database")
  assert.equal(res.workScale, "5x1")
  assert.equal(res.firstShiftDay, 2) // fallback técnico, não o 9 legado
  assert.deepEqual(res.studyDays, ["seg", "ter", "qua", "qui", "sex", "sab"])
})

test("P1.5.8 custom_NxM válido passa; N/M fora de 1-14 rejeitam", () => {
  assert.equal(parseWorkScale("custom_3x2"), "custom_3x2")
  assert.equal(parseWorkScale("custom_0x2"), null)
  assert.equal(parseWorkScale("custom_15x2"), null)
  assert.equal(parseWorkScale("custom_abc"), null)
  assert.equal(parseWorkScale("plantão"), null)
})

test("P1.5.9 first_shift_day: 1-31 passa; resto rejeita", () => {
  assert.equal(parseFirstShiftDay(1), 1)
  assert.equal(parseFirstShiftDay("31"), 31)
  assert.equal(parseFirstShiftDay(0), null)
  assert.equal(parseFirstShiftDay(32), null)
  assert.equal(parseFirstShiftDay("abc"), null)
  assert.equal(parseFirstShiftDay(null), null)
})

test("P1.5.10 study_days: subset válido passa; resto rejeita", () => {
  assert.deepEqual(parseStudyDays(["seg", "SEG", "dom"]), ["seg", "dom"])
  assert.deepEqual(parseStudyDays(JSON.stringify(["ter"])), ["ter"])
  assert.equal(parseStudyDays(["seg", "feriado"]), null)
  assert.equal(parseStudyDays("[]"), null)
  assert.equal(parseStudyDays("[invalido"), null)
  assert.equal(parseStudyDays([]), null)
})

test("P1.5 âncora: YYYY-MM-DD válida passa; resto rejeita", () => {
  assert.equal(parseShiftAnchorDate("2026-09-01"), "2026-09-01")
  assert.equal(parseShiftAnchorDate("01/09/2026"), null)
  assert.equal(parseShiftAnchorDate(""), null)
  assert.equal(parseShiftAnchorDate(null), null)
})
