// ============================================================================
// Fase I.8 — INTEGRIDADE TRANSVERSAL DOS DADOS (Estatísticas: loadAttempts,
// loadDisciplines, loadActivePlan/fetchActivePlan, loadWeekStartDay).
//
// As quatro leituras vivem dentro de `statistics-center.action.ts`, um módulo
// "use server" cujas funções não são exportadas (por design: são detalhes
// internos da action, e exportá-las só para teste arriscaria transformá-las em
// Server Actions de verdade — uma delas recebe um client Supabase inteiro como
// parâmetro, que não é serializável). O mesmo já valia para `loadSessions` na
// Fase I.7, e a solução foi a mesma de lá: testar por COMPORTAMENTO a peça que
// dá para isolar sem tocar no Supabase (aqui, a extensão de `FakePostgrest` com
// injeção de erro, que é o mecanismo real de "erro de leitura" que as quatro
// funções tratam), e fixar por FIAÇÃO (inspeção do código-fonte) que a função
// de verdade usa exatamente esse padrão — nenhuma reimplementação da lógica de
// negócio é duplicada aqui.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { FakePostgrest } from "@/lib/testing/fake-postgrest"

const ACTION = "src/application/study-analytics/statistics-center.action.ts"

function code(relativePath: string): string {
  return readFileSync(relativePath, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

function fnBody(src: string, name: string, nextName: string): string {
  const start = src.indexOf(`async function ${name}`)
  assert.ok(start > 0, `função ${name} não encontrada`)
  const end = src.indexOf(`async function ${nextName}`)
  return src.slice(start, end > 0 ? end : undefined)
}

describe("Fase I.8 — a base de teste (FakePostgrest.failOn) distingue erro de ausência real", () => {
  it("sem failOn: leitura normal, mesmo comportamento de sempre", async () => {
    const db = new FakePostgrest({ profiles: [{ id: "u1", week_start_day: 3 }] })
    const res = await db.from("profiles").select("week_start_day").eq("id", "u1").maybeSingle()
    assert.deepEqual(res, { data: { week_start_day: 3 }, error: null, count: null })
  })

  it("tabela genuinamente vazia: data = [] (ou null em maybeSingle), error = null", async () => {
    const db = new FakePostgrest({ profiles: [] })
    const res = await db.from("profiles").select("week_start_day").eq("id", "u1").maybeSingle()
    assert.deepEqual(res, { data: null, error: null, count: null })
  })

  it("com failOn: a mesma consulta responde com erro — não confundir com tabela vazia", async () => {
    const db = new FakePostgrest({ profiles: [{ id: "u1", week_start_day: 3 }] })
    db.failOn("profiles")
    const res = await db.from("profiles").select("week_start_day").eq("id", "u1").maybeSingle()
    assert.equal(res.data, null)
    assert.ok(res.error)
  })

  it("failOn é consumido: a 2ª leitura da mesma tabela já volta ao normal", async () => {
    const db = new FakePostgrest({ profiles: [{ id: "u1", week_start_day: 3 }] })
    db.failOn("profiles", 1)
    const primeira = await db.from("profiles").select("week_start_day").eq("id", "u1").maybeSingle()
    const segunda = await db.from("profiles").select("week_start_day").eq("id", "u1").maybeSingle()
    assert.ok(primeira.error)
    assert.equal(segunda.error, null)
    assert.deepEqual(segunda.data, { week_start_day: 3 })
  })

  it("failOn(times) cobre várias leituras seguidas (útil para consultas com mais de uma tabela)", async () => {
    const db = new FakePostgrest({ study_plans: [{ id: "p1", active: true }] })
    db.failOn("study_plans", 2)
    const a = await db.from("study_plans").select("id").eq("active", true).maybeSingle()
    const b = await db.from("study_plans").select("id").eq("active", true).maybeSingle()
    const c = await db.from("study_plans").select("id").eq("active", true).maybeSingle()
    assert.ok(a.error)
    assert.ok(b.error)
    assert.equal(c.error, null)
  })

  it("tabelas diferentes falham de forma independente", async () => {
    const db = new FakePostgrest({ profiles: [{ id: "u1" }], user_targets: [{ id: "t1" }] })
    db.failOn("profiles")
    const perfil = await db.from("profiles").select("*").maybeSingle()
    const meta = await db.from("user_targets").select("*").maybeSingle()
    assert.ok(perfil.error)
    assert.equal(meta.error, null)
  })
})

describe("Fase I.8 — loadAttempts distingue leitura vazia real de leitura que falhou", () => {
  const src = code(ACTION)
  const body = fnBody(src, "loadAttempts", "loadDisciplines")

  it("assinatura devolve QuestionAttemptRecord[] | null", () => {
    assert.match(src, /async function loadAttempts\([^)]*\): Promise<QuestionAttemptRecord\[\] \| null>/)
  })

  it("o valor começa null e só é trocado por uma lista dentro do ramo de sucesso", () => {
    assert.match(body, /let attempts: QuestionAttemptRecord\[\] \| null = null/)
    // O `attempts = (...)` só existe dentro do `if (!attemptsError) { ... }`.
    const successBranch = body.slice(body.indexOf("if (!attemptsError)"), body.indexOf("} else {"))
    assert.match(successBranch, /attempts = \(rawAttempts \?\? \[\]\)/)
  })

  it("o ramo de erro não reatribui attempts (continua null) — nada de [] escondido", () => {
    const errorBranch = body.slice(body.indexOf("} else {"), body.indexOf("}\n  } catch"))
    assert.equal(/attempts\s*=/.test(errorBranch), false, "o ramo de erro não deve reatribuir attempts")
    assert.match(errorBranch, /console\.error/)
  })

  it("a action nunca colapsa attempts:null em [] antes de expor no payload", () => {
    const actionBody = src.slice(src.indexOf("export async function getStatisticsCenterAction"))
    assert.match(actionBody, /attempts,\n/, "o payload usa a variável attempts direto, sem ?? []")
  })
})

describe("Fase I.8 — loadDisciplines distingue edital vazio real de leitura que falhou", () => {
  const src = code(ACTION)
  const body = fnBody(src, "loadDisciplines", "loadReviewItems")

  it("assinatura devolve null quando a leitura falha (não duas listas vazias)", () => {
    assert.match(
      src,
      /async function loadDisciplines\([^)]*\): Promise<\{ userDisciplines: UserDisciplineInput\[\]; disciplines: DisciplineMeta\[\] \} \| null>/,
    )
  })

  it('usa uma flag "lida" que só vira true no ramo de sucesso, e o retorno depende dela', () => {
    assert.match(body, /let lida = false/)
    assert.match(body, /lida = true/)
    assert.match(body, /return lida \? \{ userDisciplines, disciplines \} : null/)
  })

  it("o ramo de erro (else) não marca lida como true", () => {
    const elseBranch = body.slice(body.indexOf("} else {\n      console.error"), body.indexOf("}\n  } catch"))
    assert.equal(/lida\s*=\s*true/.test(elseBranch), false)
  })

  it("a action deriva userDisciplines/disciplines com ?? null (não ?? []) a partir do resultado", () => {
    const actionBody = src.slice(src.indexOf("export async function getStatisticsCenterAction"))
    assert.match(actionBody, /const userDisciplines = disciplineData\?\.userDisciplines \?\? null/)
    assert.match(actionBody, /const disciplines = disciplineData\?\.disciplines \?\? null/)
  })
})

describe("Fase I.8 — fetchActivePlan/loadActivePlan distingue \"sem plano\" de \"não deu para consultar\"", () => {
  const src = code(ACTION)
  const body = fnBody(src, "fetchActivePlan", "loadSessions")

  it("assinatura: o null EXTERNO é falha; { plan: null } interno é ausência real", () => {
    assert.match(src, /async function fetchActivePlan\([^)]*\): Promise<\{ plan: ActivePlan \| null \} \| null>/)
  })

  it("as três leituras internas (study_plans, study_plan_items, profiles) retornam null em erro, não { plan: null }", () => {
    const planErrorReturn = body.slice(body.indexOf("if (planError)"), body.indexOf("if (!plan)"))
    assert.match(planErrorReturn, /return null/)
    assert.equal(/return \{ plan: null \}/.test(planErrorReturn), false)

    const itemsErrorReturn = body.slice(body.indexOf("if (itemsError)"), body.indexOf("const planItems"))
    assert.match(itemsErrorReturn, /return null/)

    const profileErrorReturn = body.slice(body.indexOf("if (profileError)"), body.indexOf("// Carga semanal"))
    assert.match(profileErrorReturn, /return null/)
  })

  it("ausência real (sem plano ativo, ou plano sem blocos com duração) usa { plan: null }, não null", () => {
    assert.match(body, /if \(!plan\) return \{ plan: null \}/)
    assert.match(body, /if \(planItems\.length === 0\) return \{ plan: null \}/)
  })

  it("loadActivePlan propaga o null externo em caso de exceção, sem virar { plan: null }", () => {
    const loadActivePlanBody = fnBody(src, "loadActivePlan", "loadWeekStartDay")
    assert.match(loadActivePlanBody, /catch \(err\) \{[\s\S]*return null/)
  })

  it("a action distingue os dois null (activePlan null vs. activePlanError) no payload", () => {
    const actionBody = src.slice(src.indexOf("export async function getStatisticsCenterAction"))
    assert.match(actionBody, /activePlan: activePlan\?\.plan \?\? null,/)
    assert.match(actionBody, /activePlanError: activePlan === null,/)
  })
})

describe("Fase I.8 — loadWeekStartDay distingue \"nunca configurou\" (0 real) de \"não deu para ler\"", () => {
  const src = code(ACTION)
  const body = fnBody(src, "loadWeekStartDay", "getStatisticsCenterAction".replace("getStatisticsCenterAction", "export async function getStatisticsCenterAction"))

  it("assinatura devolve number | null", () => {
    assert.match(src, /async function loadWeekStartDay\([^)]*\): Promise<number \| null>/)
  })

  it("erro de leitura devolve null ANTES de calcular o valor padrão (não deixa 0 escapar)", () => {
    const errorReturn = body.slice(body.indexOf("if (error) {"), body.indexOf("const prefs ="))
    assert.match(errorReturn, /return null/)
  })

  it("a regra de negócio (Segunda=1, Domingo=0, coluna numérica, senão 0) continua igual — I.8 não mudou a regra, só a falha", () => {
    assert.match(body, /firstDayPref === "Segunda-feira"/)
    assert.match(body, /weekStartDay = 1/)
    assert.match(body, /firstDayPref === "Domingo"/)
    assert.match(body, /typeof profile\?\.\["week_start_day"\] === "number"/)
  })

  it("a action expõe weekStartDay direto (sem ?? 0 escondendo uma falha de leitura)", () => {
    const actionBody = src.slice(src.indexOf("export async function getStatisticsCenterAction"))
    assert.match(actionBody, /weekStartDay,\n\s*\}/)
  })
})

// ─── Ranking (study-analytics.actions.ts) ───────────────────────────────────
// A fórmula/posição/desempate/metas do ranking não mudam nesta fase — só o
// tratamento de falha na leitura de histórico e de public_study_stats.

describe("Fase I.8 — Ranking: erro de leitura não vira posição/minutos zerados", () => {
  const rankingSrc = code("src/application/study-analytics/study-analytics.actions.ts")

  it("historyResult.error retorna erro explícito, não segue com lista vazia", () => {
    const idx = rankingSrc.indexOf("if (historyResult.error)")
    assert.ok(idx > 0, "precisa existir a guarda de erro do histórico do ranking")
    const guard = rankingSrc.slice(idx, rankingSrc.indexOf("const historyData = historyResult.data"))
    assert.match(guard, /data: null/)
    assert.match(guard, /error: "Não foi possível calcular o ranking agora/)
  })

  it("historyData só é lido depois da guarda (nunca antes de saber que não houve erro)", () => {
    const guardIdx = rankingSrc.indexOf("if (historyResult.error)")
    const dataIdx = rankingSrc.indexOf("const historyData = historyResult.data")
    assert.ok(guardIdx > 0 && dataIdx > guardIdx)
  })

  it("public_study_stats agora tem seu error checado (antes não era nem destruturado)", () => {
    assert.match(rankingSrc, /error: statsError/)
    const idx = rankingSrc.indexOf("if (statsError)")
    assert.ok(idx > 0, "precisa existir a guarda de erro de public_study_stats")
    const guard = rankingSrc.slice(idx, idx + 300)
    assert.match(guard, /data: null/)
    assert.match(guard, /error: "Não foi possível calcular o ranking agora/)
  })

  it("a fórmula/RPC de ranking (caminho feliz) não foi alterada por esta fase", () => {
    // Guardas de fumaça: os nomes que compõem o ranking continuam lá.
    assert.match(rankingSrc, /rlsLimited/)
    assert.match(rankingSrc, /public_study_stats/)
  })
})
