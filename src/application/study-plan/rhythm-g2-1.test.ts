import assert from "node:assert/strict"
import { describe, it, test } from "node:test"

/**
 * G2.1 FASE 1 — ritmo molda o fatiamento (Opção A), sem novo planner.
 *
 * Contrato: {horas, pesos} + ritmo → blocos; dias/escala/âncora seguem em
 * profiles (disponibilidade); soma total e pesos preservados; blocos de
 * revisão mantêm 20min (regra própria documentada); ausente = legado 30–60.
 */

import { calculateWeeklyDistribution } from "./study-plan.algorithm"
import {
  LEGACY_RHYTHM_BOUNDS,
  parseRhythmConfig,
  resolveRhythmBounds,
  type AlgorithmDisciplineInput,
  type DayOfWeek,
} from "@/domain/study-plan/study-plan.types"

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]

function discs(weights: number[]): AlgorithmDisciplineInput[] {
  return weights.map((weight, i) => ({
    disciplineId: `d${i + 1}`,
    name: `Disc ${i + 1}`,
    area: "Geral",
    weight,
    status: "STUDYING",
  }))
}

function studyDurations(weeklyMinutes: number, weights: number[], rhythm?: Parameters<typeof calculateWeeklyDistribution>[0]["rhythm"]): number[] {
  const items = calculateWeeklyDistribution({ weeklyMinutes, availableDays: ALL_DAYS, disciplines: discs(weights), rhythm })
  const total = items.reduce((a, i) => a + i.durationMinutes, 0)
  assert.equal(total, weeklyMinutes, "soma final deve ser exatamente weeklyMinutes")
  for (const item of items) {
    assert.ok(item.durationMinutes > 0, "nenhum bloco zero ou negativo")
    assert.ok(Number.isInteger(item.durationMinutes), "blocos inteiros")
  }
  return items.filter((i) => {
    // Blocos de estudo vs revisão: revisão tem 20min fixos (fora do ritmo).
    return i.durationMinutes !== 20
  }).map((i) => i.durationMinutes)
}

describe("G2.1 — presets moldam o tamanho dos blocos", () => {
  // short 780: reserva 3×20 converge de primeira → 12×60 + 3 revisões.
  it("short: blocos de 60", () => {
    assert.deepEqual(studyDurations(780, [5], { style: "curtas" }), [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60])
  })

  // balanced 760: reserva converge 60→40 → 8×90 + 2 revisões.
  it("balanced: blocos de 90", () => {
    assert.deepEqual(studyDurations(760, [5], { style: "equilibradas" }), [90, 90, 90, 90, 90, 90, 90, 90])
  })

  // long 740: reserva converge 60→20 → 6×120 + 1 revisão.
  it("long: blocos de 120", () => {
    assert.deepEqual(studyDurations(740, [5], { style: "longas" }), [120, 120, 120, 120, 120, 120])
  })

  it("ausente = legado single-pass bit-idêntico a short explícito convergido", () => {
    const legacy = studyDurations(780, [5])
    const short = studyDurations(780, [5], { style: "curtas" })
    assert.deepEqual(legacy, short)
  })

  it("personalizado usa min/max explícitos (resto dobra no último, sem perder minutos)", () => {
    // 860: reserva converge 60→40 → 8 blocos (7×100 + resto 20 dobrado = 120) + 2 revisões.
    const got = studyDurations(860, [5], { style: "personalizado", minMinutes: 50, maxMinutes: 100 }).sort((a, b) => a - b)
    assert.deepEqual(got, [100, 100, 100, 100, 100, 100, 100, 120])
  })
})

describe("G2.1 — soma, pesos e disponibilidade preservados", () => {
  it("pesos: disciplina peso 5 recebe mais que peso 1", () => {
    const items = calculateWeeklyDistribution({
      weeklyMinutes: 1560,
      availableDays: ALL_DAYS,
      disciplines: discs([5, 1]),
      rhythm: { style: "longas" },
    })
    const total = items.reduce((a, i) => a + i.durationMinutes, 0)
    assert.equal(total, 1560)
    const byDisc = new Map<string, number>()
    for (const i of items) byDisc.set(i.disciplineId, (byDisc.get(i.disciplineId) ?? 0) + i.durationMinutes)
    // Reserva de review (20min × n) sai do bolo antes da divisão proporcional.
    assert.ok((byDisc.get("d1") ?? 0) > (byDisc.get("d2") ?? 0) * 2, "peso 5 domina peso 1")
  })

  it("disponibilidade: 1 dia disponível concentra tudo nele", () => {
    const items = calculateWeeklyDistribution({
      weeklyMinutes: 600,
      availableDays: [1],
      disciplines: discs([5, 4]),
      rhythm: { style: "equilibradas" },
    })
    assert.ok(items.length > 0)
    for (const i of items) assert.equal(i.dayOfWeek, 1)
    assert.equal(items.reduce((a, i) => a + i.durationMinutes, 0), 600)
  })

  it("blocos de revisão mantêm 20min fora do ritmo (reserva converge)", () => {
    // 740 longas: reserva converge 60→20 → 6×120 + 1 revisão de 20.
    const items = calculateWeeklyDistribution({
      weeklyMinutes: 740,
      availableDays: ALL_DAYS,
      disciplines: discs([5]),
      rhythm: { style: "longas" },
    })
    assert.equal(items.reduce((a, i) => a + i.durationMinutes, 0), 740)
    const reviews = items.filter((i) => i.durationMinutes === 20)
    assert.equal(reviews.length, 1, "1 revisão de 20min (regra própria, fora do ritmo)")
  })
})

describe("G2.1 — boundary do ritmo (parseRhythmConfig)", () => {
  it("ausente = legado compatível", () => {
    for (const raw of [undefined, null]) {
      const parsed = parseRhythmConfig(raw)
      assert.equal(parsed.ok, true)
      if (parsed.ok) assert.deepEqual(parsed.bounds, { ...LEGACY_RHYTHM_BOUNDS })
    }
  })

  it("presets resolvem da tabela canônica", () => {
    assert.deepEqual(resolveRhythmBounds({ style: "curtas" }), { min: 30, max: 60 })
    assert.deepEqual(resolveRhythmBounds({ style: "equilibradas" }), { min: 45, max: 90 })
    assert.deepEqual(resolveRhythmBounds({ style: "longas" }), { min: 60, max: 120 })
  })

  it("personalizado válido passa; inválido é erro honesto", () => {
    const ok = parseRhythmConfig({ style: "personalizado", minMinutes: 50, maxMinutes: 100 })
    assert.equal(ok.ok, true)
    if (ok.ok) assert.deepEqual(ok.bounds, { min: 50, max: 100 })
    for (const bad of [
      { style: "turbo" },
      { style: "personalizado", minMinutes: 100, maxMinutes: 50 },
      { style: "personalizado", minMinutes: 10, maxMinutes: 90 },
      { style: "personalizado" },
      "curtas",
      42,
    ]) {
      assert.equal(parseRhythmConfig(bad).ok, false, `deveria rejeitar ${JSON.stringify(bad)}`)
    }
  })

  it("payload inválido nunca vira dummy silencioso", () => {
    const parsed = parseRhythmConfig({ style: "longas", minMinutes: 999, maxMinutes: 1 })
    // presets ignoram min/max espúrios: estilo manda.
    assert.equal(parsed.ok, true)
  })
})

test("G2.1 — carga pequena: 300min viram blocos válidos (sem zero/negativo)", () => {
  // 300 short: reserva 20 → 4×60 + resto 40 (≥ min) + 1 revisão.
  const got = studyDurations(300, [5], { style: "curtas" }).sort((a, b) => a - b)
  assert.deepEqual(got, [40, 60, 60, 60, 60])
})
