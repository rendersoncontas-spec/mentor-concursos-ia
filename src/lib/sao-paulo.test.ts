import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  daysAgoKeyInSaoPaulo,
  startOfDayInSaoPauloMs,
  endOfDayInSaoPauloMs,
  daysBetweenSaoPauloDateKeys,
  getDayInSaoPaulo,
  todayKeyInSaoPaulo,
} from "./sao-paulo"

/**
 * Testes de borda para os helpers de fuso horário adicionados na Fase 5 da
 * auditoria de estabilização (substituem o padrão anterior, timezone-unsafe,
 * de src/application/study-analytics/utils.ts: getDaysAgoDate +
 * formatDateToYYYYMMDD, usado em evolution.ts, heatmap.ts,
 * dashboard.service.ts e aggregations.ts).
 *
 * Cobre especificamente: virada de dia perto de 00:00 e 23:59 (fuso de SP),
 * virada de mês e virada de ano — os pontos onde um cálculo baseado no fuso
 * local do runtime (UTC em produção) diverge do fuso de São Paulo (UTC-3).
 */

describe("getDayInSaoPaulo: virada de dia perto da meia-noite UTC (21h-23h59 em SP)", () => {
  it("23:30 UTC de um dia ainda é o mesmo dia em SP (20:30 SP)", () => {
    // 2026-08-27T23:30:00Z = 2026-08-27T20:30:00-03:00
    assert.equal(getDayInSaoPaulo("2026-08-27T23:30:00.000Z"), "2026-08-27")
  })

  it("01:30 UTC do dia seguinte ainda é o dia ANTERIOR em SP (22:30 SP)", () => {
    // 2026-08-28T01:30:00Z = 2026-08-27T22:30:00-03:00 — ainda dia 27 em SP
    assert.equal(getDayInSaoPaulo("2026-08-28T01:30:00.000Z"), "2026-08-27")
  })

  it("03:00 UTC já é o novo dia em SP (00:00 SP em ponto)", () => {
    // 2026-08-28T03:00:00Z = 2026-08-28T00:00:00-03:00
    assert.equal(getDayInSaoPaulo("2026-08-28T03:00:00.000Z"), "2026-08-28")
  })

  it("02:59:59 UTC ainda é o dia anterior em SP (23:59:59 SP)", () => {
    // 2026-08-28T02:59:59Z = 2026-08-27T23:59:59-03:00
    assert.equal(getDayInSaoPaulo("2026-08-28T02:59:59.999Z"), "2026-08-27")
  })
})

describe("daysAgoKeyInSaoPaulo: aritmética de dias sobre uma chave YYYY-MM-DD", () => {
  it("0 dias atrás retorna a própria chave de referência", () => {
    assert.equal(daysAgoKeyInSaoPaulo(0, "2026-08-27"), "2026-08-27")
  })

  it("1 dia atrás em um dia comum", () => {
    assert.equal(daysAgoKeyInSaoPaulo(1, "2026-08-27"), "2026-08-26")
  })

  it("virada de mês: 1 dia atrás de 01/09 é 31/08", () => {
    assert.equal(daysAgoKeyInSaoPaulo(1, "2026-09-01"), "2026-08-31")
  })

  it("virada de ano: 1 dia atrás de 01/01 é 31/12 do ano anterior", () => {
    assert.equal(daysAgoKeyInSaoPaulo(1, "2026-01-01"), "2025-12-31")
  })

  it("virada de mês em fevereiro (ano não-bissexto): 1 dia atrás de 01/03 é 28/02", () => {
    assert.equal(daysAgoKeyInSaoPaulo(1, "2026-03-01"), "2026-02-28")
  })

  it("janela de 7 dias cruzando virada de mês, do mais antigo para hoje", () => {
    const keys = [6, 5, 4, 3, 2, 1, 0].map((i) => daysAgoKeyInSaoPaulo(i, "2026-09-02"))
    assert.deepEqual(keys, [
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ])
  })

  it("usa todayKeyInSaoPaulo() como padrão quando nenhuma referência é passada", () => {
    assert.equal(daysAgoKeyInSaoPaulo(0), todayKeyInSaoPaulo())
  })
})

describe("startOfDayInSaoPauloMs: início do dia (00:00 em SP) como instante UTC correto", () => {
  it("00:00 em SP corresponde a 03:00 UTC do mesmo dia", () => {
    const ms = startOfDayInSaoPauloMs("2026-08-27")
    assert.equal(new Date(ms).toISOString(), "2026-08-27T03:00:00.000Z")
  })

  it("virada de mês: início do dia 01/09 em SP", () => {
    const ms = startOfDayInSaoPauloMs("2026-09-01")
    assert.equal(new Date(ms).toISOString(), "2026-09-01T03:00:00.000Z")
  })

  it("virada de ano: início do dia 01/01 em SP", () => {
    const ms = startOfDayInSaoPauloMs("2026-01-01")
    assert.equal(new Date(ms).toISOString(), "2026-01-01T03:00:00.000Z")
  })

  it("um instante de 02:59 UTC (ainda ontem em SP) fica ANTES do início do dia de hoje em SP", () => {
    const startOfTodaySP = startOfDayInSaoPauloMs("2026-08-28")
    const stillYesterdayInSP = new Date("2026-08-28T02:59:00.000Z").getTime()
    assert.ok(stillYesterdayInSP < startOfTodaySP)
  })

  it("um instante de 03:00 UTC em diante (já hoje em SP) fica NO início do dia de hoje em SP", () => {
    const startOfTodaySP = startOfDayInSaoPauloMs("2026-08-28")
    const alreadyTodayInSP = new Date("2026-08-28T03:00:00.000Z").getTime()
    assert.equal(alreadyTodayInSP, startOfTodaySP)
  })
})

describe("endOfDayInSaoPauloMs: fim do dia (23:59:59.999 em SP) como instante UTC correto", () => {
  it("fim do dia em SP é 1ms antes do início do dia seguinte em SP", () => {
    const endMs = endOfDayInSaoPauloMs("2026-08-27")
    const startOfNextDayMs = startOfDayInSaoPauloMs("2026-08-28")
    assert.equal(endMs, startOfNextDayMs - 1)
  })

  it("virada de mês: fim do dia 31/08 em SP", () => {
    const endMs = endOfDayInSaoPauloMs("2026-08-31")
    assert.equal(new Date(endMs).toISOString(), "2026-09-01T02:59:59.999Z")
  })

  it("virada de ano: fim do dia 31/12 em SP", () => {
    const endMs = endOfDayInSaoPauloMs("2026-12-31")
    assert.equal(new Date(endMs).toISOString(), "2027-01-01T02:59:59.999Z")
  })
})

describe("daysBetweenSaoPauloDateKeys: diferença em dias de calendário entre duas chaves YYYY-MM-DD", () => {
  it("mesma data retorna 0", () => {
    assert.equal(daysBetweenSaoPauloDateKeys("2026-08-27", "2026-08-27"), 0)
  })

  it("data futura retorna diferença positiva", () => {
    assert.equal(daysBetweenSaoPauloDateKeys("2026-08-27", "2026-08-30"), 3)
  })

  it("data passada retorna diferença negativa", () => {
    assert.equal(daysBetweenSaoPauloDateKeys("2026-08-30", "2026-08-27"), -3)
  })

  it("atravessa virada de mês corretamente", () => {
    assert.equal(daysBetweenSaoPauloDateKeys("2026-08-29", "2026-09-02"), 4)
  })

  it("atravessa virada de ano corretamente", () => {
    assert.equal(daysBetweenSaoPauloDateKeys("2026-12-30", "2027-01-02"), 3)
  })
})
