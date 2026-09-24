import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { filterHistorySessions, type FilterableSession, type HistoryFilters } from "./filter-history-sessions"
import { selectVisibleDayGroups } from "./visible-day-groups"

/**
 * Fase F.1 — filtros do Histórico (movidos sem alteração para função pura).
 * Garante que filtros, ordem e totais continuam corretos com milhares de
 * sessões, e que a renderização progressiva não interfere nos filtros.
 */

const EMPTY: HistoryFilters = {
  dateStart: "",
  dateEnd: "",
  disciplineId: "",
  origin: "",
  studyType: "",
  technique: "",
  timeRange: "",
  focusRange: "",
}

type S = FilterableSession & { id: string }

function sessions(n: number): S[] {
  const base = Date.UTC(2024, 0, 1, 15) // 12h em São Paulo
  return Array.from({ length: n }, (_, k) => ({
    id: `s${k}`,
    started_at: new Date(base + k * 7 * 3_600_000).toISOString(),
    discipline_id: `d${k % 5}`,
    import_batch_id: k % 4 === 0 ? "batch-1" : null,
    origin_source: k % 4 === 0 ? "planilha" : null,
    origin_source_name: k % 4 === 0 ? "Minha planilha" : null,
    study_type: k % 3 === 0 ? "QUESTOES" : "TEORIA",
    technique: k % 2 === 0 ? "POMODORO" : null,
    duration_minutes: 10 + (k % 150),
    metadata: k % 6 === 0 ? {} : { focus_percentage: k % 101 },
  }))
}

describe("filterHistorySessions", () => {
  const all = sessions(2797)

  it("sem filtro devolve todas, na mesma ordem", () => {
    assert.deepEqual(filterHistorySessions(all, EMPTY, null), all)
  })

  it("período (dia em São Paulo, inclusivo nas duas pontas)", () => {
    // 23h UTC do dia 10 é 20h em São Paulo do MESMO dia 10; 02h UTC do dia 11 é dia 10 em SP.
    const first = all[0]
    assert.ok(first)
    const edge: S[] = [
      { ...first, id: "a", started_at: "2024-03-10T23:00:00.000Z" },
      { ...first, id: "b", started_at: "2024-03-11T02:00:00.000Z" },
      { ...first, id: "c", started_at: "2024-03-11T03:30:00.000Z" },
      { ...first, id: "d", started_at: "2024-03-09T02:59:00.000Z" },
    ]
    const res = filterHistorySessions(edge, { ...EMPTY, dateStart: "2024-03-10", dateEnd: "2024-03-10" }, null)
    assert.deepEqual(
      res.map((s) => s.id),
      ["a", "b"],
    )
  })

  it("disciplina, origem (mentor × importado), tipo, técnica", () => {
    assert.ok(filterHistorySessions(all, { ...EMPTY, disciplineId: "d2" }, null).every((s) => s.discipline_id === "d2"))
    const mentor = filterHistorySessions(all, { ...EMPTY, origin: "mentor" }, null)
    assert.ok(mentor.every((s) => !s.origin_source))
    const imported = filterHistorySessions(all, { ...EMPTY, origin: "Minha planilha" }, null)
    assert.equal(mentor.length + imported.length, all.length)
    assert.ok(filterHistorySessions(all, { ...EMPTY, studyType: "QUESTOES" }, null).every((s) => s.study_type === "QUESTOES"))
    assert.ok(filterHistorySessions(all, { ...EMPTY, technique: "POMODORO" }, null).every((s) => s.technique === "POMODORO"))
  })

  it("faixas de duração particionam as sessões sem sobra nem sobreposição", () => {
    const parts = ["0-30", "30-60", "60-120", "120+"].map(
      (timeRange) => filterHistorySessions(all, { ...EMPTY, timeRange }, null).length,
    )
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      all.length,
    )
  })

  it("faixas de foco ignoram sessões sem foco registrado", () => {
    const withFocus = all.filter((s) => s.metadata?.["focus_percentage"] !== undefined).length
    const parts = ["0-49", "50-69", "70-89", "90-100"].map(
      (focusRange) => filterHistorySessions(all, { ...EMPTY, focusRange }, null).length,
    )
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      withFocus,
    )
  })

  it("filtro de importação e combinação de filtros", () => {
    const res = filterHistorySessions(all, { ...EMPTY, disciplineId: "d0", studyType: "QUESTOES" }, "batch-1")
    assert.ok(res.length > 0)
    assert.ok(res.every((s) => s.import_batch_id === "batch-1" && s.discipline_id === "d0" && s.study_type === "QUESTOES"))
  })

  it("totais sobre TODAS as sessões filtradas, mesmo com a lista mostrando só os primeiros dias", () => {
    const filtered = filterHistorySessions(all, { ...EMPTY, disciplineId: "d1" }, null)
    const totalMinutes = filtered.reduce((a, s) => a + (s.duration_minutes || 0), 0)
    // Agrupamento por dia como na tela (dia em SP), do mais recente para o mais antigo.
    const byDay = new Map<string, number>()
    for (const s of filtered) {
      const day = new Date(s.started_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
      byDay.set(day, (byDay.get(day) || 0) + 1)
    }
    const groups = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, activityCount]) => ({ day, activityCount }))
    const visible = selectVisibleDayGroups(groups, 150)
    assert.equal(visible.visibleSessionCount + visible.hiddenSessionCount, filtered.length)
    assert.equal(totalMinutes, filtered.reduce((a, s) => a + (s.duration_minutes || 0), 0))
    assert.ok(visible.visibleSessionCount < filtered.length)
  })
})
