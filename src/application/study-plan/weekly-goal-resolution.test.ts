import assert from "node:assert/strict"
import { test } from "node:test"

import {
  PRODUCT_SUGGESTED_WEEKLY_HOURS,
  resolveFirstShiftDay,
  resolveWeeklyGoalHours,
  TECHNICAL_FALLBACK_FIRST_SHIFT_DAY,
} from "./weekly-planner.service.ts"

test("P1.1 resolveWeeklyGoalHours: valor real → configured", () => {
  const res = resolveWeeklyGoalHours(25)
  assert.equal(res.hours, 25)
  assert.equal(res.source, "configured")
})

test("P1.1 resolveWeeklyGoalHours: ausência → suggested (default de produto)", () => {
  for (const absent of [null, undefined, NaN]) {
    const res = resolveWeeklyGoalHours(absent as number | null | undefined)
    assert.equal(res.hours, PRODUCT_SUGGESTED_WEEKLY_HOURS)
    assert.equal(res.source, "suggested")
  }
})

test("P1.1 resolveFirstShiftDay: explícito → configured; ausência → technical-fallback", () => {
  assert.deepEqual(resolveFirstShiftDay(5), { value: 5, source: "configured" })
  assert.deepEqual(resolveFirstShiftDay(null), {
    value: TECHNICAL_FALLBACK_FIRST_SHIFT_DAY,
    source: "technical-fallback",
  })
  assert.deepEqual(resolveFirstShiftDay(undefined), {
    value: TECHNICAL_FALLBACK_FIRST_SHIFT_DAY,
    source: "technical-fallback",
  })
  assert.deepEqual(resolveFirstShiftDay(NaN), {
    value: TECHNICAL_FALLBACK_FIRST_SHIFT_DAY,
    source: "technical-fallback",
  })
})
