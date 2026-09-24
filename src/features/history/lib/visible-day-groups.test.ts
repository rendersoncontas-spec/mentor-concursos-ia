import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  HISTORY_INITIAL_VISIBLE_SESSIONS,
  HISTORY_VISIBLE_SESSIONS_STEP,
  selectVisibleDayGroups,
} from "./visible-day-groups"

const days = (...counts: number[]) => counts.map((activityCount, i) => ({ day: `d${i}`, activityCount }))

describe("selectVisibleDayGroups (renderização progressiva do Histórico)", () => {
  it("mostra dias inteiros, na ordem recebida, até o limite de sessões", () => {
    const r = selectVisibleDayGroups(days(3, 4, 5, 6), 7)
    assert.deepEqual(r.visible.map((g) => g.day), ["d0", "d1"])
    assert.equal(r.visibleSessionCount, 7)
    assert.equal(r.hiddenSessionCount, 11)
    assert.equal(r.hiddenDayCount, 2)
  })

  it("o dia que cruza o limite entra inteiro (total do dia nunca fica parcial)", () => {
    const r = selectVisibleDayGroups(days(3, 10, 5), 5)
    assert.deepEqual(r.visible.map((g) => g.day), ["d0", "d1"])
    assert.equal(r.visibleSessionCount, 13)
  })

  it("sempre mostra ao menos o primeiro dia, mesmo maior que o limite", () => {
    const r = selectVisibleDayGroups(days(500, 1), 150)
    assert.deepEqual(r.visible.map((g) => g.day), ["d0"])
    assert.equal(r.hiddenDayCount, 1)
  })

  it("com poucas sessões mostra tudo e não há nada oculto", () => {
    const r = selectVisibleDayGroups(days(2, 2), HISTORY_INITIAL_VISIBLE_SESSIONS)
    assert.equal(r.visible.length, 2)
    assert.equal(r.hiddenSessionCount, 0)
    assert.equal(r.hiddenDayCount, 0)
  })

  it("lista vazia", () => {
    const r = selectVisibleDayGroups([], 150)
    assert.deepEqual(r, { visible: [], visibleSessionCount: 0, hiddenSessionCount: 0, hiddenDayCount: 0 })
  })

  it("≈2.800 sessões: a 1ª tela desenha ~150 e cada 'mostrar mais' soma um bloco, sem perder nem repetir dias", () => {
    const groups = Array.from({ length: 700 }, (_, i) => ({ day: `d${i}`, activityCount: 4 })) // 2.800
    const first = selectVisibleDayGroups(groups, HISTORY_INITIAL_VISIBLE_SESSIONS)
    assert.ok(first.visibleSessionCount >= 150 && first.visibleSessionCount < 160)
    const second = selectVisibleDayGroups(groups, HISTORY_INITIAL_VISIBLE_SESSIONS + HISTORY_VISIBLE_SESSIONS_STEP)
    assert.deepEqual(second.visible.slice(0, first.visible.length), first.visible)
    const all = selectVisibleDayGroups(groups, Number.POSITIVE_INFINITY)
    assert.equal(all.visibleSessionCount, 2800)
    assert.equal(new Set(all.visible.map((g) => g.day)).size, 700)
  })
})
