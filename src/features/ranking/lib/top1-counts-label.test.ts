import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { top1CountsLabel } from "./top1-counts-label"

describe("top1CountsLabel — dois contadores, nunca uma duração somada", () => {
  it("dias e semanas como 'N vezes' em cada período", () => {
    assert.equal(top1CountsLabel({ daysAtTop: 40, weeksAtTop: 7 }), "1º no tempo estudado: 40 vezes no dia · 7 vezes na semana")
  })
  it("singular", () => {
    assert.equal(top1CountsLabel({ daysAtTop: 1, weeksAtTop: 1 }), "1º no tempo estudado: 1 vez no dia · 1 vez na semana")
  })
  it("omite o contador zerado", () => {
    assert.equal(top1CountsLabel({ daysAtTop: 3, weeksAtTop: 0 }), "1º no tempo estudado: 3 vezes no dia")
    assert.equal(top1CountsLabel({ daysAtTop: 0, weeksAtTop: 2 }), "1º no tempo estudado: 2 vezes na semana")
  })
})
