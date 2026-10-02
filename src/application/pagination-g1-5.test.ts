// ============================================================================
// G1.5 — PAGINAÇÃO, TIMEZONE, ORDENAÇÃO E DETERMINISMO.
// Convenção de evidência:
// - comportamental puro (sem Next/DB) para regras de ordenação/tempo;
// - wiring onde a query exige runtime Supabase (trava a correção sem
//   afirmar execução real).
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  buildIsoFromSaoPauloDateTime,
  dayOfWeekForDateKey,
  getDayInSaoPaulo,
} from "@/lib/sao-paulo.ts"
import { resolveWeekStartDay } from "@/lib/study-time-calculator.ts"
import { suggestDisciplines } from "@/features/importacao/lib/subject-matcher.ts"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// G-32 — empate de timestamp não perde/duplica em paginação por offset.
// ---------------------------------------------------------------------------

type Row = { id: string; started_at: string }

// Ordenação canônica da fase: (started_at DESC, id DESC) — igual às queries.
function pageOf(rows: Row[], page: number, pageSize: number): Row[] {
  const sorted = [...rows].sort((a, b) =>
    b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id),
  )
  return sorted.slice((page - 1) * pageSize, page * pageSize)
}

const TIED: Row[] = [
  { id: "c", started_at: "2026-08-14T12:00:00.000Z" },
  { id: "a", started_at: "2026-08-14T12:00:00.000Z" },
  { id: "e", started_at: "2026-08-14T12:00:00.000Z" },
  { id: "b", started_at: "2026-08-14T12:00:00.000Z" },
  { id: "d", started_at: "2026-08-13T15:00:00.000Z" },
]

describe("G-32 — empate com desempate canônico pagina sem perda/duplicação", () => {
  it("1/2. páginas consecutivas cobrem tudo exatamente uma vez", () => {
    const p1 = pageOf(TIED, 1, 2)
    const p2 = pageOf(TIED, 2, 2)
    const p3 = pageOf(TIED, 3, 2)
    const all = [...p1, ...p2, ...p3].map((r) => r.id).sort()
    assert.deepEqual(all, ["a", "b", "c", "d", "e"])
  })

  it("3. ordem estável entre execuções (determinismo)", () => {
    const once = [pageOf(TIED, 1, 2), pageOf(TIED, 2, 2), pageOf(TIED, 3, 2)]
    const twice = [pageOf(TIED, 1, 2), pageOf(TIED, 2, 2), pageOf(TIED, 3, 2)]
    assert.deepEqual(once, twice)
    assert.deepEqual(
      once.flat().map((r) => r.id),
      ["e", "c", "b", "a", "d"],
    )
  })

  it("4. sem desempate, a ordem de empate herda a entrada (prova do risco)", () => {
    const unstable = [...TIED].sort((a, b) => b.started_at.localeCompare(a.started_at))
    const shuffled = [...TIED].reverse().sort((a, b) => b.started_at.localeCompare(a.started_at))
    assert.notDeepEqual(
      unstable.map((r) => r.id),
      shuffled.map((r) => r.id),
      "sem id a ordem do empate depende da ordem física",
    )
  })
})

describe("G-32 — tiebreak travado nas queries paginadas (wiring)", () => {
  const cases: Array<[string, string, string]> = [
    ["study-history.service.ts", 'src/application/study-history/study-history.service.ts', '.order("id", { ascending: false })'],
    ["study-history.actions.ts", 'src/application/study-history/study-history.actions.ts', '.order("id", { ascending: true })'],
    ["import-history.actions.ts", 'src/application/import-history/import-history.actions.ts', '.order("id", { ascending: false })'],
    ["admin.actions.ts", 'src/application/admin/admin.actions.ts', '.order("id", { ascending: false })'],
    ["review.repository.ts", 'src/application/review-engine/review.repository.ts', '.order("id", { ascending: true })'],
    ["statistics-center.action.ts", 'src/application/study-analytics/statistics-center.action.ts', '.order("id", { ascending: false })'],
    ["list-plans.action.ts", 'src/application/study-plan/list-plans.action.ts', '.order("id", { ascending: false })'],
    ["discipline-color.service.ts", 'src/application/disciplines/discipline-color.service.ts', '.order("id", { ascending: true })'],
    ["question-attempt.service.ts", 'src/application/questions/question-attempt.service.ts', ".order('id', { ascending: false })"],
  ]
  for (const [label, path, tie] of cases) {
    it(`5. ${label} ordena com desempate por id`, () => {
      assert.ok(src(path).includes(tie), `${label} sem tiebreak`)
    })
  }
})

// ---------------------------------------------------------------------------
// G-33 — timezone canônico America/Sao_Paulo e boundaries.
// ---------------------------------------------------------------------------

describe("G-33 — boundaries São Paulo vs UTC", () => {
  it("6. 00:30 UTC = 21:30 SP do dia anterior (caso real do bug start_date)", () => {
    assert.equal(getDayInSaoPaulo("2026-09-15T00:30:00.000Z"), "2026-09-14")
  })

  it("7. 23:59:59 SP e 00:00:00 SP mapeiam dias distintos", () => {
    assert.equal(getDayInSaoPaulo("2026-09-15T02:59:59Z"), "2026-09-14")
    assert.equal(getDayInSaoPaulo("2026-09-15T03:00:00Z"), "2026-09-15")
  })

  it("8. dia da semana da chave é independente do runtime (2026-09-14 = segunda)", () => {
    assert.equal(dayOfWeekForDateKey("2026-09-14"), 1)
    assert.equal(dayOfWeekForDateKey("2026-09-13"), 0)
    assert.equal(dayOfWeekForDateKey("2026-12-31"), 4)
  })

  it("9. virada de ano: 2025-12-31T23:00-03:00 ainda é 2025 em SP", () => {
    assert.equal(getDayInSaoPaulo("2026-01-01T01:59:59Z"), "2025-12-31")
    assert.equal(getDayInSaoPaulo("2026-01-01T03:00:00Z"), "2026-01-01")
  })

  it("10. build interpreta a hora em -03:00 e devolve UTC", () => {
    assert.equal(buildIsoFromSaoPauloDateTime("2026-09-15", "00:00"), "2026-09-15T03:00:00.000Z")
  })

  it("11. start_date do plano usa a chave SP, não UTC (wiring)", () => {
    const svc = src("src/application/study-plan/study-plan.service.ts")
    assert.match(svc, /todayKeyInSaoPaulo\(\)/)
    assert.doesNotMatch(svc, /new Date\(\)\.toISOString\(\)\.split\("T"\)\[0\]/)
  })
})

// ---------------------------------------------------------------------------
// G-50 — início de semana via resolver (sem segunda fixa fora do ranking).
// ---------------------------------------------------------------------------

describe("G-50 — resolver canônico de início de semana", () => {
  it("12. sem preferência nem coluna → domingo (0), nunca segunda fixa", () => {
    assert.equal(resolveWeekStartDay(undefined, null), 0)
    assert.equal(resolveWeekStartDay("Segunda-feira", 0), 1)
    assert.equal(resolveWeekStartDay("Domingo", 1), 0)
  })

  it("13. planejamento semanal usa o resolver (wiring)", () => {
    assert.match(src("src/application/study-plan/weekly-planner.service.ts"), /resolveWeekStartDay\(/)
  })
})

// ---------------------------------------------------------------------------
// G-52 — buscas determinísticas.
// ---------------------------------------------------------------------------

describe("G-52 — sugestões e lookups determinísticos", () => {
  it("14. empate de score resolve sempre pelo mesmo id", () => {
    const discs = [
      { id: "b-id", name: "Direito Administrativo", area: "Geral" },
      { id: "a-id", name: "Direito Administrativo", area: "Geral" },
    ]
    const once = suggestDisciplines(["Direito Administrativo"], discs)
    const twice = suggestDisciplines(["Direito Administrativo"], [...discs].reverse())
    assert.equal(once["Direito Administrativo"]?.[0]?.disciplineId, "a-id")
    assert.deepEqual(once, twice)
  })

  it("15. lookups ilike têm order + limit(1) (wiring)", () => {
    for (const path of [
      "src/application/topic-catalog/topic-catalog.service.ts",
      "src/features/edital-importer/lib/persist.ts",
      "src/application/edital/edital.action.ts",
      "src/application/disciplines/discipline-actions.ts",
      "src/application/study-session/study-session.action.ts",
      "src/application/study-cycle/study-cycle.actions.ts",
      "src/application/import-history/import-history.actions.ts",
    ]) {
      const body = src(path)
      assert.match(body, /\.order\("name"\)/, `${path} sem order(name)`)
      assert.match(body, /\.limit\(1\)/, `${path} sem limit(1)`)
    }
  })
})
