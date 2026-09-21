import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { calculateStreaks } from "./aggregations"

/**
 * Testes de borda para o bug de timezone da Fase 5 da auditoria de
 * estabilização em calculateStreaks (src/application/study-analytics/
 * aggregations.ts): antes, "hoje"/"ontem" eram calculados com `new Date()` +
 * accessors locais do runtime (UTC em produção), enquanto o conjunto de dias
 * estudados (uniqueDaysStudied) já vinha corretamente no fuso de São Paulo.
 *
 * Isso podia fazer a sequência aparecer como quebrada (currentStreak = 0)
 * durante a janela ~21h-23h59 (SP) / 00h-02h59 (UTC), mesmo quando o aluno
 * tinha estudado no dia anterior (SP) e a sequência ainda estava viva.
 *
 * calculateStreaks agora recebe um segundo parâmetro opcional `todayKey`
 * (chave "YYYY-MM-DD" já resolvida no fuso de SP), o que permite testar o
 * comportamento de forma determinística sem depender do relógio real do
 * sistema nem mockar `Date`.
 */

describe("calculateStreaks: sequência não quebra por causa do fuso horário", () => {
  it("conjunto vazio: sequência zerada", () => {
    const result = calculateStreaks(new Set(), "2026-08-27")
    assert.deepEqual(result, { currentStreak: 0, longestStreak: 0 })
  })

  it("estudou hoje (SP): sequência viva com 1 dia", () => {
    const result = calculateStreaks(new Set(["2026-08-27"]), "2026-08-27")
    assert.equal(result.currentStreak, 1)
  })

  it("estudou ontem (SP), ainda não hoje: sequência continua viva (não quebrada)", () => {
    // Esse é exatamente o caso que o bug de timezone quebrava: se "ontem"
    // fosse calculado em UTC em vez de SP durante a janela de ~3h de
    // divergência, esse dia não seria reconhecido como "ontem" e a
    // sequência apareceria como 0 incorretamente.
    const result = calculateStreaks(new Set(["2026-08-26"]), "2026-08-27")
    assert.equal(result.currentStreak, 1)
  })

  it("virada de mês: estudou ontem quando hoje é o 1º dia do mês", () => {
    const result = calculateStreaks(new Set(["2026-08-31"]), "2026-09-01")
    assert.equal(result.currentStreak, 1)
  })

  it("virada de ano: estudou ontem quando hoje é 1º de janeiro", () => {
    const result = calculateStreaks(new Set(["2025-12-31"]), "2026-01-01")
    assert.equal(result.currentStreak, 1)
  })

  it("sequência de vários dias consecutivos até ontem, cruzando virada de mês", () => {
    const days = new Set(["2026-08-29", "2026-08-30", "2026-08-31"])
    const result = calculateStreaks(days, "2026-09-01")
    assert.equal(result.currentStreak, 3)
  })

  it("estudou anteontem (SP), não ontem: sequência real está quebrada (currentStreak = 0)", () => {
    // Garante que a correção não "conserta demais": só ontem/hoje mantêm a
    // sequência viva — dois dias atrás é uma sequência genuinamente quebrada.
    const result = calculateStreaks(new Set(["2026-08-25"]), "2026-08-27")
    assert.equal(result.currentStreak, 0)
  })

  it("usa todayKeyInSaoPaulo() como padrão quando nenhuma referência é passada", () => {
    // Não deve lançar e deve retornar uma sequência não-negativa mesmo sem
    // passar explicitamente a data de referência.
    const result = calculateStreaks(new Set(["2020-01-01"]))
    assert.equal(result.currentStreak, 0)
    assert.ok(result.longestStreak >= 1)
  })
})
