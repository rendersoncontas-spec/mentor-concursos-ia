import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { DEFAULT_DASHBOARD_LAYOUT, buildDashboardFixture, replanInfoCacheFixture } from "@/lib/testing/dashboard-fixtures"
import { createFakeSimuladosBackend, FAKE_DISCIPLINES } from "@/lib/testing/fake-simulados-backend"

// G2.21 — cobertura E2E de Simulados/Dashboard/Central de estudos e as
// garantias de isolamento que ela depende (o harness não vaza para produção).

const read = (p: string) => readFileSync(p, "utf8")
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const TODAY = "2026-10-10"

describe("G2.21 — isolamento: produção não usa nada de teste", () => {
  it("só arquivos de harness (e testes) importam @/lib/testing", () => {
    const offenders = walk("src")
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !/\.test\.ts$/.test(f))
      .filter((f) => !/[\\/]e2e-harness[\\/]/.test(f))
      .filter((f) => !/[\\/]lib[\\/]testing[\\/]/.test(f))
      .filter((f) => /from "@\/lib\/testing\//.test(read(f)))
    assert.deepEqual(offenders, [])
  })

  it("Simulados: o padrão do contexto são as Server Actions reais; a página real não injeta nada", () => {
    const ctx = read("src/features/simulados/simulados-actions.tsx")
    for (const action of [
      "getRecords: getSimuladoRecordsAction",
      "deleteRecord: deleteSimuladoRecordAction",
      "getFormDisciplines: getSimuladoFormDisciplinesAction",
      "saveRecord: saveSimuladoRecordAction",
      "getStudyPerformance: getStudyPerformanceAction",
    ]) assert.ok(ctx.includes(action), action)
    assert.match(ctx, /createContext<SimuladosActions>\(SERVER_SIMULADOS_ACTIONS\)/)
    assert.doesNotMatch(read("src/app/(protected)/simulados/page.tsx"), /SimuladosActionsProvider|e2e|testing/)
    // Os componentes chamam a fronteira, não as actions direto (senão o harness não conseguiria trocá-las).
    for (const f of ["simulados-view.tsx", "simulado-record-modal.tsx", "study-performance-section.tsx"]) {
      const src = read(`src/features/simulados/components/${f}`)
      assert.match(src, /useSimuladosActions\(\)/, f)
      assert.doesNotMatch(src, /from "@\/application\/simulados\/(simulado-records\.actions|study-performance\.action)"/, f)
    }
  })

  it("harness novos: só extensão e2e.tsx, sem Supabase/sessão/segredo", () => {
    for (const dir of ["simulados", "dashboard", "study-register"]) {
      const files = walk(`src/app/e2e-harness/${dir}`)
      assert.ok(files.some((f) => f.endsWith("page.e2e.tsx")), dir)
      assert.ok(!files.some((f) => /[\\/]page\.tsx$/.test(f)), `${dir}: page.tsx viraria rota no build normal`)
      for (const f of files) assert.doesNotMatch(read(f), /createClient|service_role|SERVICE_ROLE|process\.env|cookies\(/i, f)
    }
  })

  it("axe-core: só devDependency com versão exata; nenhuma regra desligada sem justificativa", () => {
    const pkg = JSON.parse(read("package.json")) as { devDependencies: Record<string, string>; dependencies: Record<string, string> }
    assert.match(pkg.devDependencies["@axe-core/playwright"] ?? "", /^\d+\.\d+\.\d+$/)
    assert.equal(pkg.dependencies["@axe-core/playwright"], undefined)
    const axe = read("e2e/support/axe.ts")
    assert.match(axe, /export const AXE_EXCEPTIONS: AxeException\[\] = \[\]/, "exceções globais vazias (cada uma exige justificativa no relatório)")
    assert.match(axe, /reason: string/)
  })
})

describe("G2.21 — backend falso de Simulados usa a gravação/leitura REAIS", () => {
  it("carga inicial passa pela validação real e a leitura devolve do mais recente para o mais antigo", async () => {
    const { actions } = createFakeSimuladosBackend({ todayKey: TODAY, seed: "data" })
    const res = await actions.getRecords()
    assert.equal(res.error, null)
    assert.deepEqual(res.data?.map((r) => r.name), [
      "3º Simulado Receita Federal",
      "Simulado TCU — Estratégia",
      "2º Simulado Receita Federal",
      "1º Simulado Receita Federal",
    ])
    const tcu = res.data?.find((r) => r.examName === "TCU")
    assert.equal(tcu?.scoringRule, "CEBRASPE")
    assert.equal(tcu?.netScore, 63 - 26, "pontuação líquida calculada pela persistência real")
  })

  it("mesmo requestId duas vezes = um registro (idempotência real); data futura é recusada pela validação real", async () => {
    const { actions } = createFakeSimuladosBackend({ todayKey: TODAY, seed: "empty" })
    const input = {
      requestId: "aaaaaaaa-0000-4000-8000-000000000001",
      name: "Simulado X", examName: "", roleName: "", simuladoDate: TODAY, source: "TEC" as const, exam_board: "FGV",
      totalQuestions: 10, totalCorrect: 7, totalWrong: 3, totalBlank: 0, scoringRule: "PERCENTUAL" as const, subjects: [],
    }
    assert.equal((await actions.saveRecord(input)).error, null)
    assert.equal((await actions.saveRecord(input)).error, null)
    assert.equal((await actions.getRecords()).data?.length, 1)
    const future = await actions.saveRecord({ ...input, requestId: "aaaaaaaa-0000-4000-8000-000000000002", simuladoDate: "2026-10-11" })
    assert.equal(future.error, "A data do simulado não pode estar no futuro.")
  })

  it("matéria fora do catálogo é recusada; exclusão remove só o registro pedido", async () => {
    const { actions } = createFakeSimuladosBackend({ todayKey: TODAY, seed: "data" })
    const bad = await actions.saveRecord({
      requestId: "bbbbbbbb-0000-4000-8000-000000000001", name: "Y", examName: "", roleName: "", simuladoDate: TODAY, source: "TEC",
      exam_board: "FGV", totalQuestions: 5, totalCorrect: 5, totalWrong: 0, totalBlank: 0, scoringRule: "PERCENTUAL",
      subjects: [{ disciplineId: "cccccccc-0000-4000-8000-000000000009", disciplineName: "Inexistente", questionsCount: 5, correctCount: 5, wrongCount: 0, blankCount: 0 }],
    })
    assert.match(bad.error ?? "", /não foi encontrada no catálogo/)
    const before = (await actions.getRecords()).data ?? []
    const target = before[0]
    assert.ok(target)
    assert.equal((await actions.deleteRecord(target.id)).error, null)
    const after = (await actions.getRecords()).data ?? []
    assert.equal(after.length, before.length - 1)
    assert.ok(!after.some((r) => r.id === target.id))
  })

  it("modos de falha: erro devolvido e chamada rejeitada (rede)", async () => {
    const err = createFakeSimuladosBackend({ todayKey: TODAY, seed: "data", failures: { load: "error", performance: "error" } })
    assert.equal((await err.actions.getRecords()).data, null)
    assert.ok((await err.actions.getStudyPerformance("8w")).error)
    const rej = createFakeSimuladosBackend({ todayKey: TODAY, seed: "data", failures: { save: "reject" } })
    await assert.rejects(() => rej.actions.saveRecord({} as never))
  })

  it("Estudo × desempenho vem do cálculo real com as matérias do catálogo sintético", async () => {
    const { actions } = createFakeSimuladosBackend({ todayKey: TODAY, seed: "data" })
    const res = await actions.getStudyPerformance("all")
    assert.equal(res.error, null)
    const names = res.data?.rows.map((r) => r.disciplineName) ?? []
    for (const d of FAKE_DISCIPLINES.slice(0, 3)) assert.ok(names.includes(d.name), d.name)
    assert.equal(res.data?.simuladosInPeriod, 4)
  })
})

describe("G2.21 — dados sintéticos do Dashboard", () => {
  it("layout padrão do harness = layout padrão de produção (dashboard-layout.action.ts)", () => {
    const src = read("src/application/dashboard/dashboard-layout.action.ts")
    const prod = [...src.matchAll(/widget_id: "([a-z_]+)", position_order: (\d+), col_span: (\d) as const, visible: (true|false)/g)].map((m) => ({
      widget_id: m[1], position_order: Number(m[2]), col_span: Number(m[3]), visible: m[4] === "true",
    }))
    assert.ok(prod.length >= 10)
    assert.deepEqual(DEFAULT_DASHBOARD_LAYOUT, prod)
  })

  it("mesma identidade de disciplinas no ciclo, ranking, desempenho por matéria e cronograma do dia", () => {
    const { snapshot, initialWidgetData } = buildDashboardFixture("data", TODAY)
    const ids = new Set(snapshot.rawDisciplines.map((d) => d.discipline_id))
    for (const b of snapshot.cycleBlocks ?? []) assert.ok(ids.has(b.disciplineId))
    for (const r of snapshot.analytics.rankings.disciplines) assert.ok(ids.has(r.id))
    for (const c of snapshot.subjectContexts ?? []) assert.ok(ids.has(c.discipline_id))
    for (const blocks of Object.values(replanInfoCacheFixture(TODAY).dailyBlocks)) for (const b of blocks) assert.ok(ids.has(b.disciplineId))
    assert.ok(initialWidgetData["activeCycleOverview"])
    assert.ok(initialWidgetData["recentStudyHistory:14"])
    assert.ok(initialWidgetData["monthlyCalendar:2026:10"])
  })

  it("estado de falha marca as leituras como indisponíveis (erro ≠ zero) e não semeia o histórico", () => {
    const { snapshot, initialWidgetData } = buildDashboardFixture("issues", TODAY)
    assert.equal(snapshot.dataIssues?.history, true)
    assert.equal(snapshot.dataIssues?.attempts, true)
    assert.equal(initialWidgetData["recentStudyHistory:14"], undefined)
    const empty = buildDashboardFixture("empty", TODAY)
    assert.equal(empty.snapshot.cycleBlocks, null)
    assert.equal(empty.initialWidgetData["activeCycleOverview"], null)
  })
})

describe("G2.21 — correções de acessibilidade ficam no código", () => {
  it("Dialog devolve o foco ao elemento que abriu o modal (modais controlados, sem DialogTrigger)", () => {
    const src = read("src/components/ui/dialog.tsx")
    assert.match(src, /onOpenAutoFocus=\{\(event\) => \{/)
    assert.match(src, /returnFocusRef\.current = active instanceof HTMLElement && active !== document\.body \? active : null/)
    assert.match(src, /onCloseAutoFocus\?\.\(event\)\s+const target = returnFocusRef\.current/)
    assert.match(src, /if \(event\.defaultPrevented \|\| !target \|\| !target\.isConnected\) return/)
  })

  it("Central de estudos (modo Manual): FormControl envolve o input e cada unidade é FormLabel", () => {
    const src = read("src/features/study-session/components/study-register-modal.tsx")
    for (const unit of ["Horas", "Minutos", "Segundos"]) {
      assert.match(src, new RegExp(`<FormLabel className="text-\\[11px\\] font-normal leading-normal text-muted-foreground">\\s*${unit}\\s*</FormLabel>`), unit)
    }
    assert.match(src, /role="group" aria-labelledby=\{durationLabelId\}/)
    for (const label of ["Data do Estudo", "Horário de Início"]) {
      assert.match(src, new RegExp(`<FormLabel className="text-xs font-medium text-muted-foreground mb-1\\.5 block">\\s*${label}\\s*</FormLabel>`), label)
    }
    assert.doesNotMatch(src, /<FormControl>\s*<div/, "FormControl não pode envolver um <div> (o id iria para o div, não para o input)")
  })

  it("Simulados: Fonte/Banca/penalização com id no SelectTrigger; Erros como <output> rotulado", () => {
    const src = read("src/features/simulados/components/simulado-record-modal.tsx")
    assert.match(src, /htmlFor="sim-source"[\s\S]*?<SelectTrigger id="sim-source"/)
    assert.match(src, /<SelectTrigger id="sim-banca"/)
    assert.match(src, /<SelectTrigger id="sim-penalty-wrong"/)
    assert.match(src, /<Label htmlFor="sim-wrong"[\s\S]*?<output id="sim-wrong"/)
  })
})
