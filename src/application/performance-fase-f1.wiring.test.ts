import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase F.1 — testes de "wiring" (leitura do código-fonte) que impedem a volta
 * de leituras sem paginação nas consultas que podem passar de 1.000 linhas, e
 * que registram as demais garantias da fase.
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

/** Código sem comentários (os comentários citam os padrões antigos de propósito). */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(rel))
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

function body(source: string, signature: string): string {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `não encontrado: ${signature}`)
  const next = source.indexOf("\nexport ", start + signature.length)
  return source.slice(start, next === -1 ? undefined : next)
}

describe("Fase F.1 — study_cycle_sessions sempre paginado", () => {
  it("nenhuma LEITURA direta de study_cycle_sessions fora do leitor paginado", () => {
    const offenders: string[] = []
    for (const file of walk("src")) {
      if (file.endsWith(path.join("study-cycle", "cycle-sessions.reader.ts"))) continue
      const src = read(file)
      const re = /\.from\("study_cycle_sessions"\)([\s\S]{0,160})/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const tail = m[1] ?? ""
        if (/^\s*\.(insert|update|upsert|delete)\(/.test(tail)) continue
        offenders.push(`${file}: .from("study_cycle_sessions")${tail.slice(0, 60).replace(/\s+/g, " ")}`)
      }
    }
    assert.deepEqual(offenders, [])
  })

  it("as actions de ciclo delegam a leitura ao leitor testado (sem rebuild/reconcile/gravação)", () => {
    const actions = read("src/application/study-cycle/study-cycle.actions.ts")
    for (const [sig, loader] of [
      ["export async function getCyclesAction", "loadCyclesOverview(supabase, userId)"],
      ["export async function getActiveCycleAction", "loadActiveCycleOverview(supabase, userId)"],
      ["export async function getCycleByIdAction", "loadCycleOverviewById(supabase, userId, cycleId)"],
    ] as const) {
      const fn = body(actions, sig)
      assert.ok(fn.includes(loader), `${sig} deve usar ${loader}`)
      for (const forbidden of ["reconcileCycleProgress", "rebuild", "registerStudyToCycle", ".update(", ".insert(", ".upsert(", "revalidatePath"]) {
        assert.equal(fn.includes(forbidden), false, `${sig} não pode conter ${forbidden}`)
      }
    }
    const reader = read("src/application/study-cycle/cycle-overview.reader.ts")
    for (const forbidden of [".update(", ".insert(", ".upsert(", ".delete(", "study_history"]) {
      assert.equal(reader.includes(forbidden), false, `cycle-overview.reader.ts não pode conter ${forbidden}`)
    }
  })

  it("aba Ciclos deriva o ciclo ativo da lista (sem ler as sessões do ciclo ativo 2×)", () => {
    const page = read("src/app/(protected)/ciclos/page.tsx")
    const view = read("src/features/study-cycle/components/study-cycles-view.tsx")
    assert.equal(page.includes("getActiveCycleAction("), false)
    assert.ok(page.includes("pickActiveCycleOverview(cyclesResult.data)"))
    assert.equal(view.includes("getActiveCycleAction("), false)
    assert.ok(view.includes("pickActiveCycleOverview(cyclesResult.data)"))
  })
})

describe("Fase F.1 — study_history / review_items / question_attempts paginados", () => {
  const cases: Array<[string, string, string]> = [
    ["src/application/study-plan/study-plan.service.ts", "export async function getCycleOverviewData", "study_history"],
    ["src/application/disciplines/disciplines.service.ts", "export async function getDisciplinesPageData", "study_history"],
    ["src/application/disciplines/disciplines.service.ts", "export async function getDisciplinesPageData", "question_attempts"],
    ["src/application/study-plan/list-plans.action.ts", "export async function listPlansAction", "study_history"],
    ["src/application/study-plan/replan/adaptive-replan.service.ts", "export async function getPeriodGoalData", "study_history"],
    ["src/application/admin/admin.actions.ts", "export async function getUserDetailsAdminAction", "study_history"],
    ["src/application/admin/admin.actions.ts", "export async function getUserDetailsAdminAction", "question_attempts"],
    ["src/application/import-history/import-history.actions.ts", "export async function listImportsAction", "study_history"],
    ["src/application/dashboard/dashboard.service.ts", "export async function getDashboardData", "question_attempts"],
  ]
  for (const [file, sig, table] of cases) {
    it(`${sig.replace("export async function ", "")} lê ${table} com fetchAllRowsPaged`, () => {
      const fn = body(read(file), sig)
      const idx = fn.indexOf(`.from("${table}")`)
      assert.ok(idx >= 0, `${table} não encontrado em ${sig}`)
      const before = fn.slice(Math.max(0, idx - 400), idx)
      assert.ok(before.includes("fetchAllRowsPaged"), `${table} em ${sig} deve ser lido com fetchAllRowsPaged`)
    })
  }

  it("statistics-center: tentativas e itens de revisão paginados (o .limit(50000) era cortado em 1.000)", () => {
    const src = code("src/application/study-analytics/statistics-center.action.ts")
    assert.equal(src.includes(".limit(ATTEMPTS_LIMIT)"), false)
    assert.ok(src.includes("maxRows: ATTEMPTS_LIMIT"))
    // Fase I.3: a leitura de review_items continua paginada, agora envolvida por
    // activeReviewItemsOnly() — a regra única de "item ativo" (não suspenso, não
    // arquivado), a mesma da fila de Revisões. O que este teste trava é a
    // paginação; o filtro em si tem teste próprio
    // (statistics-review-items-active.test.ts).
    assert.ok(
      /fetchAllRowsPaged<[\s\S]{0,200}?>\(\s*\(withCount\) =>\s*(activeReviewItemsOnly\(\s*)?supabase\s*\.from\("review_items"\)/.test(
        src,
      ),
      "review_items nas Estatísticas precisa continuar sendo lido com fetchAllRowsPaged",
    )
  })

  // Fase I.1: o módulo de revisões foi reescrito e trocou a leitura paginada
  // "carrega tudo e filtra em memória" por leituras limitadas na origem —
  // contagens com `head: true` (que não trazem linha nenhuma) e listas com
  // `.limit()` explícito. A garantia da Fase F.1 continua valendo, só muda a
  // forma de cumpri-la: NENHUMA leitura de review_items/review_history pode ser
  // ilimitada, porque o teto de 1.000 linhas do PostgREST corta em silêncio.
  it("página de Revisões não consulta o banco direto: delega ao serviço", () => {
    const src = read("src/app/(protected)/dashboard/reviews/page.tsx")
    assert.ok(src.includes("getReviewsOverview("), "a página deve usar getReviewsOverview")
    assert.equal(src.includes('.from("review_items")'), false)
    assert.equal(src.includes('.from("review_history")'), false)
  })

  it("toda leitura de review_items/review_history no repositório é limitada (head:true, .limit(), .maybeSingle() ou paginada)", () => {
    const src = code("src/application/review-engine/review.repository.ts")
    const offenders: string[] = []
    for (const table of ["review_items", "review_history", "review_sessions"]) {
      const re = new RegExp(`\\.from\\("${table}"\\)([\\s\\S]{0,700})`, "g")
      let match: RegExpExecArray | null
      while ((match = re.exec(src))) {
        const tail = match[1] ?? ""
        // corta no início da próxima consulta, para não "emprestar" o limite dela
        const chain = tail.split(/\.from\("/)[0] ?? ""
        if (/^\s*\.(insert|update|upsert|delete)\(/.test(chain)) continue
        const before = src.slice(Math.max(0, match.index - 400), match.index)
        const bounded =
          /head:\s*true/.test(chain) ||
          /\.limit\(/.test(chain) ||
          /\.maybeSingle\(\)/.test(chain) ||
          before.includes("fetchAllRowsPaged")
        if (!bounded) offenders.push(`${table}: ${chain.slice(0, 120).replace(/\s+/g, " ")}`)
      }
    }
    assert.deepEqual(offenders, [], "leitura sem limite explícito seria cortada em 1.000 linhas sem aviso")
  })

  it("o repositório de revisões é a única camada que fala com as tabelas de revisão", () => {
    for (const file of [
      "src/application/review-engine/review.service.ts",
      "src/application/review-engine/review.actions.ts",
    ]) {
      const src = code(file)
      for (const table of ["review_items", "review_history"]) {
        assert.equal(src.includes(`.from("${table}")`), false, `${file} não pode consultar ${table} direto`)
      }
    }
  })

  it("nenhum .limit() acima de 1.000 sobrou nessas leituras (seria cortado em silêncio)", () => {
    for (const file of [
      "src/application/review-engine/review.service.ts",
      "src/application/review-engine/review.repository.ts",
      "src/application/study-analytics/statistics-center.action.ts",
    ]) {
      const src = code(file)
      const big = [...src.matchAll(/\.limit\((\d[\d_]*)\)/g)].filter((m) => Number((m[1] ?? "0").replace(/_/g, "")) > 1000)
      assert.deepEqual(
        big.map((m) => m[0]),
        [],
        file,
      )
    }
  })
})

describe("Fase F.1 — refresh duplicado e medição", () => {
  it("Planejamento: concluir bloco não executa getReplanInfoAction 2× (evento + await compartilham a busca)", () => {
    const src = read("src/features/planejamento/components/daily-planning-view.tsx")
    assert.ok(src.includes("replanInFlightRef"))
    assert.ok(src.includes("if (inFlight && inFlight.key === key) return inFlight.promise"))
  })

  it("instrumentação não registra dados sensíveis nem altera a autenticação", () => {
    const perf = code("src/lib/perf/server-perf.ts")
    for (const forbidden of ["cookies(", "getUser(", "userId", "email", "token"]) {
      assert.equal(perf.includes(forbidden), false, `server-perf.ts não deve conter ${forbidden}`)
    }
    const proxy = code("src/proxy.ts")
    assert.equal((proxy.match(/updateSession\(request\)/g) ?? []).length, 2) // mesma chamada, com ou sem medição
    assert.equal(proxy.includes("getUser"), false)
    assert.equal(proxy.includes("cookies"), false)
    const auth = read("src/infrastructure/supabase/proxy.ts")
    assert.ok(auth.includes("await supabase.auth.getUser()"), "autenticação do proxy inalterada")
  })
})
