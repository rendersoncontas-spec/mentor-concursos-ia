import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  alignHistoryToBlocks,
  canonicalizeAttemptRows,
  canonicalizeHistoryRows,
  collectDashboardDisciplineIds,
  mergeUserDisciplinesByIdentity,
} from "@/application/dashboard/dashboard-identity"
import { hideCatalogAliases, loadCatalogAliasIds } from "@/application/disciplines/discipline-aliases"
import { buildStudyPerformance } from "@/application/simulados/study-performance"
import { buildCycleItemMatcher } from "@/application/study-cycle/cycle-item-matcher"
import { AnalyticsEngine } from "@/application/study-analytics/study-analytics.service"
import { canonicalizeStatisticsInput } from "@/application/study-analytics/statistics-identity"
import {
  buildDisciplineIdentity,
  canonicalIdOf,
  EMPTY_DISCIPLINE_IDENTITY,
  identityDisplayName,
} from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"
import { simuladoAnalysisByDiscipline } from "@/features/statistics/lib/simulados-by-discipline"
import { FakeReviewDb } from "@/lib/testing/fake-review-db"
import { must } from "@/lib/testing/must"

// G2.14 — identidade canônica no produto inteiro: Dashboard, Estudos de Hoje,
// Ciclo e listas de seleção, com o mesmo cenário central das fases anteriores.

const X = "x" // canônica
const A = "a" // alias de X
const B = "b" // outro alias de X
const RL = "rl" // Raciocínio Lógico (sem vínculo — fica separado)
const RLEM = "rlem" // Raciocínio Lógico e Matemático
const NDA = "noc-da" // Noções de Direito Administrativo (ambígua, sem vínculo)
const DA = "da"

const IDENTITY = buildDisciplineIdentity({
  catalog: [
    { id: X, name: "Matéria X" },
    { id: A, name: "Matéria X (A)", canonicalDisciplineId: X },
    { id: B, name: "Matéria X — B", canonicalDisciplineId: X },
    { id: RL, name: "Raciocínio Lógico" },
    { id: RLEM, name: "Raciocínio Lógico e Matemático" },
    { id: DA, name: "Direito Administrativo" },
    { id: NDA, name: "Noções de Direito Administrativo" },
  ],
  personal: [{ disciplineId: X, customName: "Minha X" }],
})

function hist(id: string, disciplineId: string | null, minutes: number, name = `nome-${disciplineId}`, day = "2026-10-05") {
  return {
    id, discipline_id: disciplineId, study_source: "FREE", study_type: "TEORIA", started_at: `${day}T15:00:00Z`,
    duration_minutes: minutes, completed: true, interrupted: false, focus_score: null, energy_level: null, difficulty: null,
    metadata: {}, disciplines: disciplineId ? { name, area: null } : null,
  }
}

function subj(id: string, q: number, c: number): SimuladoRecordSubject {
  return { disciplineId: id, disciplineName: `nome-${id}`, questionsCount: q, correctCount: c, wrongCount: q - c, blankCount: 0, accuracy: Math.round((c / q) * 1000) / 10 }
}

function rec(id: string, date: string, subjects: SimuladoRecordSubject[]): SimuladoRecord {
  const q = subjects.reduce((a, s) => a + s.questionsCount, 0)
  const c = subjects.reduce((a, s) => a + s.correctCount, 0)
  return {
    id, userId: "u", name: id, examName: "", roleName: "", simuladoDate: date, source: "TEC", sourceCustom: null,
    exam_board: null, exam_board_custom: null, totalQuestions: q, totalCorrect: c, totalWrong: q - c, totalBlank: 0,
    accuracy: Math.round((c / q) * 1000) / 10, timeSpentSeconds: null, notes: null, scoringRule: "PERCENTUAL",
    penaltyScore: null, subjects, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`,
  }
}

function ranking(rows: ReturnType<typeof hist>[]) {
  const ctx = AnalyticsEngine.createContext(rows as unknown as Parameters<typeof AnalyticsEngine.createContext>[0], 30)
  return AnalyticsEngine.rankings.getDisciplineRanking(ctx)
}

describe("cenário central: ESTUDO em A + SIMULADO em B → identidade X (todas as telas)", () => {
  it("Estatísticas, Estudo × desempenho, Dashboard e Ciclo resolvem para X — nunca duas matérias", () => {
    const sessions = [{ id: "e1", disciplineId: A, startedAt: "2026-10-01T15:00:00Z", durationMinutes: 120 }]
    const simulados = [rec("s1", "2026-09-20", [subj(B, 20, 12)]), rec("s2", "2026-10-02", [subj(B, 20, 16)])]

    // Estudo × desempenho (G2.11/G2.12)
    const perf = buildStudyPerformance({ records: simulados, sessions, disciplineNames: new Map(), identity: IDENTITY, periodKey: "4w", todayKey: "2026-10-06" })
    assert.deepEqual(perf.rows.map((r) => r.disciplineId), [X])
    assert.equal(must(perf.rows[0]).studyMinutes, 120)
    assert.equal(must(perf.rows[0]).simuladosCount, 2)

    // Estatísticas (G2.13)
    const stats = canonicalizeStatisticsInput(
      { sessions: [], attempts: [], disciplines: [], userDisciplines: [], reviewItems: [], activePlan: null, simulados },
      IDENTITY,
    )
    assert.deepEqual([...simuladoAnalysisByDiscipline(stats.simulados ?? []).keys()], [X])

    // Dashboard (G2.14)
    const dash = ranking(canonicalizeHistoryRows([hist("e1", A, 120), hist("e2", B, 30)], IDENTITY))
    assert.deepEqual(dash.map((r) => [r.id, r.name, r.value]), [[X, "Minha X", 150]])

    // Ciclo (G2.14): item na canônica recebe estudo do alias
    const match = buildCycleItemMatcher([{ id: "item-x", disciplineId: X, disciplineName: "Matéria X" }], IDENTITY)
    assert.equal(match({ disciplineId: A, disciplineName: "Matéria X (A)" })?.kind, "identity")
  })
})

describe("Dashboard — ranking por matéria, desempenho por matéria e cobertura do edital", () => {
  it("sem alias: nada muda (mesmas linhas, mesmos objetos)", () => {
    const rows = [hist("1", RL, 30), hist("2", DA, 20)]
    const out = canonicalizeHistoryRows(rows, EMPTY_DISCIPLINE_IDENTITY)
    assert.equal(out[0], rows[0])
    assert.deepEqual(ranking(out).map((r) => r.id).sort(), [DA, RL])
  })

  it("alias, canônica e ambos: uma linha no ranking, minutos e sessões somados, nome pessoal", () => {
    const out = canonicalizeHistoryRows([hist("1", A, 10), hist("2", X, 20), hist("3", B, 5), hist("4", RL, 7)], IDENTITY)
    const r = ranking(out)
    const x = must(r.find((i) => i.id === X))
    assert.equal(x.value, 35)
    assert.equal(x.secondaryValue, 3)
    assert.equal(x.name, "Minha X")
    assert.equal(r.length, 2, "RL continua separado")
  })

  it("linha repetida (mesmo id real) não conta duas vezes; questões avulsas também", () => {
    const h = hist("1", A, 10)
    assert.equal(canonicalizeHistoryRows([h, { ...h }], IDENTITY).length, 1)
    const attempts = canonicalizeAttemptRows([{ id: "q1", discipline_id: A }, { id: "q1", discipline_id: A }, { id: "q2", discipline_id: RL }], IDENTITY)
    assert.deepEqual(attempts.map((a) => a.discipline_id), [X, RL])
  })

  it("vínculos do aluno: alias + canônica viram UMA entrada (status da canônica); ambígua separada", () => {
    const rows = [
      { id: "ud-a", discipline_id: A, status: "COMPLETED", discipline: { id: A, name: "Matéria X (A)" } },
      { id: "ud-x", discipline_id: X, status: "STUDYING", discipline: { id: X, name: "Matéria X" } },
      { id: "ud-nda", discipline_id: NDA, status: "STUDYING", discipline: { id: NDA, name: "Noções de Direito Administrativo" } },
      { id: "ud-da", discipline_id: DA, status: "STUDYING", discipline: { id: DA, name: "Direito Administrativo" } },
    ]
    const merged = mergeUserDisciplinesByIdentity(rows, IDENTITY)
    assert.deepEqual(merged.map((m) => [m.id, m.discipline_id, m.status, m.discipline.name]), [
      ["ud-x", X, "STUDYING", "Minha X"],
      ["ud-nda", NDA, "STUDYING", "Noções de Direito Administrativo"],
      ["ud-da", DA, "STUDYING", "Direito Administrativo"],
    ])
    assert.equal(rows[0]?.discipline_id, A, "entrada original intacta")
  })

  it("só o alias vinculado: a entrada vira a identidade X (id da linha preservado)", () => {
    const merged = mergeUserDisciplinesByIdentity([{ id: "ud-a", discipline_id: A, status: "REVISING", discipline: { id: A, name: "Matéria X (A)" } }], IDENTITY)
    assert.deepEqual(merged.map((m) => [m.id, m.discipline_id, m.status]), [["ud-a", X, "REVISING"]])
  })

  it("ids coletados de todas as fontes do Dashboard (uma leitura de identidade)", () => {
    const ids = collectDashboardDisciplineIds({
      history: [{ discipline_id: A }],
      attempts: [{ discipline_id: RL }],
      userDisciplines: [{ discipline_id: B, discipline: { id: B } }],
      planItems: [{ discipline_id: DA }],
      cycleBlocks: [{ disciplineId: NDA }],
    })
    assert.deepEqual(ids, [A, B, DA, NDA, RL].sort())
  })

  it("zero e muitos registros (30.000 sessões em tempo linear)", () => {
    assert.deepEqual(ranking(canonicalizeHistoryRows([], IDENTITY)), [])
    const ids = [A, B, X, RL, DA, NDA]
    const many = Array.from({ length: 30_000 }, (_, i) => hist(`h${i}`, ids[i % ids.length] ?? RL, 1))
    const t0 = performance.now()
    const out = canonicalizeHistoryRows(many, IDENTITY)
    const elapsed = performance.now() - t0
    const r = ranking(out)
    assert.equal(r.reduce((a, i) => a + i.value, 0), 30_000)
    assert.equal(must(r.find((i) => i.id === X)).value, 15_000)
    assert.equal(r.length, 4)
    assert.ok(elapsed < 1500, `${elapsed.toFixed(0)} ms`)
  })
})

describe("Estudos de Hoje — só a identidade da disciplina muda", () => {
  const entry = (disciplineId: string, minutes = 30) => ({ date: "2026-10-06T15:00:00.000Z", disciplineId, minutes, studyPlanItemId: null })

  it("estudo no alias conta no bloco da canônica", () => {
    const out = alignHistoryToBlocks([entry(A)], [X, RL], IDENTITY)
    assert.equal(out[0]?.disciplineId, X)
    assert.equal(out[0]?.minutes, 30, "duração intacta")
    assert.equal(out[0]?.date, "2026-10-06T15:00:00.000Z", "data/hora intactas")
  })

  it("estudo na canônica conta no bloco que está no alias", () => {
    assert.equal(alignHistoryToBlocks([entry(X)], [B], IDENTITY)[0]?.disciplineId, B)
  })

  it("bloco da própria disciplina: nada muda; com blocos alias e canônica, prefere o da canônica", () => {
    assert.equal(alignHistoryToBlocks([entry(A)], [A, X], IDENTITY)[0]?.disciplineId, A)
    assert.equal(alignHistoryToBlocks([entry(B)], [A, X], IDENTITY)[0]?.disciplineId, X)
  })

  it("sem identidade, ambígua ou matéria diferente: entrada como veio", () => {
    assert.equal(alignHistoryToBlocks([entry(A)], [X], EMPTY_DISCIPLINE_IDENTITY)[0]?.disciplineId, A)
    assert.equal(alignHistoryToBlocks([entry(NDA)], [DA], IDENTITY)[0]?.disciplineId, NDA)
    assert.equal(alignHistoryToBlocks([entry(RL)], [RLEM], IDENTITY)[0]?.disciplineId, RL)
    assert.equal(alignHistoryToBlocks([entry(A)], [X], undefined)[0]?.disciplineId, A)
  })
})

describe("Ciclo — casamento estudo → item", () => {
  const items = [
    { id: "i-rlem", disciplineId: RLEM, disciplineName: "Raciocínio Lógico e Matemático" },
    { id: "i-x", disciplineId: X, disciplineName: "Matéria X" },
    { id: "i-ti", disciplineId: "ti-sigla", disciplineName: "Tecnologia da Informação (TI)" },
  ]
  const withRlm = buildDisciplineIdentity({
    catalog: [
      { id: RLEM, name: "Raciocínio Lógico e Matemático" },
      { id: "rlm", name: "Raciocínio Lógico-Matemático", canonicalDisciplineId: RLEM },
      { id: X, name: "Matéria X" },
      { id: A, name: "Matéria X (A)", canonicalDisciplineId: X },
    ],
  })

  it("A — mesmo id", () => {
    assert.deepEqual(buildCycleItemMatcher(items, withRlm)({ disciplineId: X, disciplineName: "Matéria X" }), { item: items[1], kind: "id" })
  })

  it("B — alias → canônica pela identidade (antes da similaridade)", () => {
    const m = buildCycleItemMatcher(items, withRlm)({ disciplineId: "rlm", disciplineName: "Raciocínio Lógico-Matemático" })
    assert.equal(m?.item.id, "i-rlem")
    assert.equal(m?.kind, "identity")
  })

  it("sem identidade, o contrato legado é idêntico (o mesmo alias casava por similaridade)", () => {
    const m = buildCycleItemMatcher(items, EMPTY_DISCIPLINE_IDENTITY)({ disciplineId: "rlm", disciplineName: "Raciocínio Lógico-Matemático" })
    assert.equal(m?.item.id, "i-rlem")
    assert.equal(m?.kind, "similarity")
    const ti = buildCycleItemMatcher(items, null)({ disciplineId: "ti", disciplineName: "Tecnologia da Informação" })
    assert.equal(ti?.item.id, "i-ti", "contrato IMPORT 11 preservado")
  })

  it("C — nomes parecidos, matérias diferentes: comportamento legado documentado (similaridade 0,80), NÃO alterado", () => {
    const m = buildCycleItemMatcher(items, withRlm)({ disciplineId: RL, disciplineName: "Raciocínio Lógico" })
    assert.equal(m?.kind, "similarity")
    assert.equal(m?.item.id, "i-rlem")
  })

  it("D — disciplinas diferentes: sem casamento", () => {
    assert.equal(buildCycleItemMatcher(items, withRlm)({ disciplineId: "dp", disciplineName: "Direito Penal" }), null)
  })

  it("nome igual sem id em comum continua casando por nome", () => {
    assert.equal(buildCycleItemMatcher(items, withRlm)({ disciplineId: "outro-id", disciplineName: "matéria x" })?.kind, "name")
  })
})

describe("regras da identidade (cadeia, auto-referência, vínculo inexistente)", () => {
  const id = buildDisciplineIdentity({
    catalog: [
      { id: "a", name: "A", canonicalDisciplineId: "b" },
      { id: "b", name: "B", canonicalDisciplineId: "c" },
      { id: "c", name: "C" },
      { id: "self", name: "Self", canonicalDisciplineId: "self" },
      { id: "orphan", name: "Órfã", canonicalDisciplineId: "nao-existe" },
    ],
  })

  it("cadeia A → B → C resolve para C", () => {
    assert.equal(canonicalIdOf(id, "a"), "c")
    assert.equal(canonicalIdOf(id, "b"), "c")
  })

  it("auto-referência é a própria identidade", () => {
    assert.equal(canonicalIdOf(id, "self"), "self")
  })

  it("vínculo para id que não veio do catálogo: aponta para o id declarado, nome cai no do próprio registro", () => {
    assert.equal(canonicalIdOf(id, "orphan"), "nao-existe")
    assert.equal(identityDisplayName(id, "orphan", "fallback"), "Órfã")
  })
})

describe("listas de seleção", () => {
  it("alias some, canônica e matérias parecidas (RL × RL e M) ficam", () => {
    const rows = [{ id: RL }, { id: RLEM }, { id: "rlm" }, { id: NDA }, { id: DA }]
    assert.deepEqual(hideCatalogAliases(rows, new Set(["rlm"])).map((r) => r.id), [RL, RLEM, NDA, DA])
  })

  it("alias que está no plano do aluno continua visível", () => {
    assert.deepEqual(hideCatalogAliases([{ id: RLEM }, { id: "rlm" }], new Set(["rlm"]), ["rlm"]).map((r) => r.id), [RLEM, "rlm"])
  })

  it("sem aliases a lista é a mesma (referência)", () => {
    const rows = [{ id: RL }]
    assert.equal(hideCatalogAliases(rows, new Set()), rows)
  })

  it("loader: lê só linhas com vínculo; falha/coluna ausente = lista completa (fail-open)", async () => {
    const db = new FakeReviewDb({ disciplines: [{ id: RLEM, canonical_discipline_id: null }, { id: "rlm", canonical_discipline_id: RLEM }] }, [])
    assert.deepEqual([...(await loadCatalogAliasIds(db as unknown as SupabaseClient))], ["rlm"])
    db.failOn({ table: "disciplines" })
    assert.equal((await loadCatalogAliasIds(db as unknown as SupabaseClient)).size, 0)
  })
})

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8")

  it("Dashboard: identidade carregada uma vez e aplicada a histórico, questões, vínculos, plano e ciclo", () => {
    const src = read("src/application/dashboard/dashboard.service.ts")
    assert.equal((src.match(/loadDisciplineIdentity\(/g) ?? []).length, 1)
    assert.match(src, /const rawHistory = canonicalizeHistoryRows\(rawHistoryRead, disciplineIdentity\)/)
    assert.match(src, /const disciplines = mergeUserDisciplinesByIdentity\(/)
    assert.match(src, /canonicalizeAttemptRows\(/)
    assert.match(src, /canonicalIdOf\(disciplineIdentity, rawId\)/)
  })

  it("Estudos de Hoje: alinha o id e não mexe no componente do plano", () => {
    const widget = read("src/features/dashboard/components/dashboard-widget-catalog.tsx")
    assert.match(widget, /alignHistoryToBlocks\(history \?\? \[\], cycleBlocks\.map\(\(b\) => b\.disciplineId\), snapshot\?\.disciplineIdentity\)/)
    assert.match(widget, /history=\{alignedHistory\}/)
    const plan = read("src/features/planejamento/components/daily-planning-view.tsx")
    assert.doesNotMatch(plan, /canonical|identity/i)
  })

  it("Ciclo: o serviço usa o matcher (identidade antes de nome/similaridade); reconciliação intocada", () => {
    const src = read("src/application/study-cycle/cycle-study-registration.service.ts")
    assert.match(src, /buildCycleItemMatcher\(/)
    assert.doesNotMatch(src, /similarity\(/, "similaridade mora só no matcher")
    const engine = read("src/application/study-cycle/cycle-reconciliation.engine.ts")
    assert.doesNotMatch(engine, /canonical|identity/i)
  })

  it("listas do catálogo escondem aliases (simulado, importação, seletor de sessão, busca)", () => {
    for (const f of [
      "src/application/simulados/simulado-records.actions.ts",
      "src/application/import-history/import-history.actions.ts",
      "src/application/study-session/get-disciplines.action.ts",
      "src/application/edital/edital.action.ts",
    ]) {
      assert.match(read(f), /hideCatalogAliases\(/, f)
    }
  })
})
