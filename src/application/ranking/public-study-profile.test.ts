import assert from "node:assert/strict"
import { test } from "node:test"

import { computeStreaksFromDates } from "./public-study-profile.utils"

test("computeStreaksFromDates: retorna 0 para lista vazia de datas", () => {
  const res = computeStreaksFromDates([])
  assert.deepEqual(res, { currentStreak: 0, longestStreak: 0 })
})

test("computeStreaksFromDates: calcula streak consecutivo para datas contínuas", () => {
  const dates = [
    "2026-08-10T10:00:00Z",
    "2026-08-11T12:00:00Z",
    "2026-08-12T14:00:00Z",
    "2026-08-13T16:00:00Z",
  ]
  const res = computeStreaksFromDates(dates)
  assert.equal(res.longestStreak, 4)
})

test("computeStreaksFromDates: identifica lacuna e calcula maior sequência histórica", () => {
  const dates = [
    "2026-08-01T10:00:00Z",
    "2026-08-02T10:00:00Z",
    "2026-08-05T10:00:00Z",
    "2026-08-06T10:00:00Z",
    "2026-08-07T10:00:00Z",
  ]
  const res = computeStreaksFromDates(dates)
  assert.equal(res.longestStreak, 3)
})

test("computeStreaksFromDates: lida com múltiplas sessões no mesmo dia sem inflar o streak", () => {
  const dates = [
    "2026-08-01T08:00:00Z",
    "2026-08-01T14:00:00Z",
    "2026-08-01T20:00:00Z",
    "2026-08-02T09:00:00Z",
  ]
  const res = computeStreaksFromDates(dates)
  assert.equal(res.longestStreak, 2)
})
