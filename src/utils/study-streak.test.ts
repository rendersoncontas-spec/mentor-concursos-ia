import { test } from "node:test"
import assert from "node:assert/strict"
import { computeStreak, localDateKey } from "./study-streak"

function day(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return localDateKey(d)
}

test("localDateKey formata YYYY-MM-DD local", () => {
  assert.match(localDateKey(new Date(2026, 0, 5)), /^\d{4}-01-05$/)
})

test("streak: sequência contínua até hoje", () => {
  assert.equal(computeStreak(new Set([day(0), day(1), day(2), day(5)])), 3)
})

test("streak: hoje sem sessão conta a partir de ontem", () => {
  assert.equal(computeStreak(new Set([day(1), day(2), day(3)])), 3)
})

test("streak: lacuna quebra a sequência", () => {
  assert.equal(computeStreak(new Set([day(0), day(1), day(3)])), 2)
})

test("streak: conjunto vazio retorna 0", () => {
  assert.equal(computeStreak(new Set()), 0)
})