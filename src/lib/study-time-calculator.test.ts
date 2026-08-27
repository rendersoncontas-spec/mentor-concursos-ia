import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { computeStudyTimeFromHistory, getSaoPauloWeekRange } from "./study-time-calculator"

describe("study-time-calculator engine", () => {
  const history = [
    { started_at: "2026-08-23T14:00:00-03:00", duration_minutes: 255 }, // Domingo
    { started_at: "2026-08-24T09:00:00-03:00", duration_minutes: 295 }, // Segunda
    { started_at: "2026-08-25T10:00:00-03:00", duration_minutes: 250 }, // Terça
    { started_at: "2026-08-26T15:00:00-03:00", duration_minutes: 162 }, // Quarta
    // Registro planejado sem estudo realizado (não deve entrar)
    { started_at: "2026-08-27T08:00:00-03:00", duration_minutes: null },
    { started_at: "2026-08-27T10:00:00-03:00", duration_minutes: 0 },
  ]

  it("calcula semana começando no DOMINGO (weekStartDay = 0)", () => {
    const refDate = "2026-08-27"
    const weekRange = getSaoPauloWeekRange(refDate, 0)

    assert.equal(weekRange.mondayKey, "2026-08-23") // Start da semana
    assert.equal(weekRange.sundayKey, "2026-08-29") // Fim da semana
    assert.equal(weekRange.todayKey, "2026-08-27")

    const summary = computeStudyTimeFromHistory(history, refDate, 0)

    // Hoje (27/08): 0h00
    assert.equal(summary.dailyMinutes, 0)

    // Semana atual Domingo a Sábado (23/08 a 29/08): 255 + 295 + 250 + 162 = 962 min (16h02min)
    assert.equal(summary.weeklyMinutes, 962)

    // Mês de Agosto: 962 min (16h02min)
    assert.equal(summary.monthlyMinutes, 962)

    // A soma dos dias da semana no calendário é ESTRITAMENTE igual ao weeklyMinutes
    const calendarWeekSum = weekRange.weekDays.reduce(
      (sum, dayKey) => sum + (summary.dailyTotals.get(dayKey) || 0),
      0
    )
    assert.equal(calendarWeekSum, summary.weeklyMinutes)
  })

  it("calcula semana começando na SEGUNDA-FEIRA (weekStartDay = 1)", () => {
    const refDate = "2026-08-27"
    const weekRange = getSaoPauloWeekRange(refDate, 1)

    assert.equal(weekRange.mondayKey, "2026-08-24") // Segunda
    assert.equal(weekRange.sundayKey, "2026-08-30") // Domingo
    assert.equal(weekRange.todayKey, "2026-08-27")

    const summary = computeStudyTimeFromHistory(history, refDate, 1)

    // Semana atual Segunda a Domingo (24/08 a 30/08): 295 + 250 + 162 = 707 min (11h47min)
    assert.equal(summary.weeklyMinutes, 707)

    // Mês de Agosto continua 962 min (16h02min)
    assert.equal(summary.monthlyMinutes, 962)

    const calendarWeekSum = weekRange.weekDays.reduce(
      (sum, dayKey) => sum + (summary.dailyTotals.get(dayKey) || 0),
      0
    )
    assert.equal(calendarWeekSum, summary.weeklyMinutes)
  })

  it("calcula corretamente limites em transição de mês", () => {
    // 01/09/2026 (Terça) com semana iniciando no Domingo (0)
    const sundayStart = getSaoPauloWeekRange("2026-09-01", 0)
    assert.equal(sundayStart.mondayKey, "2026-08-30")
    assert.equal(sundayStart.sundayKey, "2026-09-05")

    // 01/09/2026 (Terça) com semana iniciando na Segunda (1)
    const mondayStart = getSaoPauloWeekRange("2026-09-01", 1)
    assert.equal(mondayStart.mondayKey, "2026-08-31")
    assert.equal(mondayStart.sundayKey, "2026-09-06")
  })
})
