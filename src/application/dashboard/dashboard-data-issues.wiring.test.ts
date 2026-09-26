// ============================================================================
// Fase I.8 — INTEGRIDADE TRANSVERSAL DOS DADOS (Dashboard).
//
// `getDashboardData` tem 8 leituras independentes (profiles, user_targets,
// ciclo ativo, plano de hoje, histórico de estudo, atividades recentes,
// tentativas de questões, disciplinas) mais um `Promise.all` e uma etapa de
// processamento síncrono grande demais para reconstruir com um cliente
// Supabase falso fiel a todos os serviços que ela chama por baixo (ciclo,
// plano, analytics, histórico, disciplinas — cada um com suas próprias
// tabelas). O comportamento de classificação erro-vs-ausência em si já está
// coberto por teste comportamental de verdade em
// `dashboard-read-outcome.test.ts` (que é o que `getDashboardData` usa para
// as 8 leituras). Este arquivo fixa, por inspeção do código-fonte, que a
// função realmente está com essas leituras ligadas a esses helpers — e não
// apenas "parece certo" — e que nenhum `.catch(() => [])`/`.catch(() => null)`
// silencioso sobrou solto por fora deles.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const SERVICE_PATH = "src/application/dashboard/dashboard.service.ts"
const source = readFileSync(SERVICE_PATH, "utf8")

describe("Fase I.8 — dashboard.service.ts usa os helpers de erro≠ausência", () => {
  it("importa readOrFlag e resolveMaybeSingle de dashboard-read-outcome", () => {
    assert.match(source, /import\s*\{\s*readOrFlag,\s*resolveMaybeSingle\s*\}\s*from\s*"@\/application\/dashboard\/dashboard-read-outcome"/)
  })

  it("profiles e user_targets passam por resolveMaybeSingle (não usam .data direto sem checar error)", () => {
    assert.match(source, /const profileOutcome = resolveMaybeSingle\(profileResult\)/)
    assert.match(source, /const targetOutcome = resolveMaybeSingle\(targetResult\)/)
    // Não deve sobrar o padrão antigo, que ignorava `error` de profiles/user_targets.
    assert.doesNotMatch(source, /const profile = profileResult\?\.data \|\| null/)
    assert.doesNotMatch(source, /const rawTarget = targetResult\?\.data \|\| null/)
  })

  it("ciclo, plano de hoje, histórico, atividades e disciplinas usam readOrFlag em vez de .catch(() => ...) direto", () => {
    assert.match(source, /readOrFlag\(getCycleOverviewData\(supabase, userId\), null\)/)
    assert.match(source, /readOrFlag\(getTodayStudyItems\(supabase, userId\), \[\]\)/)
    assert.match(source, /readOrFlag\(\s*getStudyHistoryForAnalytics\(/)
    assert.match(source, /readOrFlag\(getRecentActivities\(supabase, userId, 5\), \[\]\)/)
    assert.match(source, /readOrFlag\(getUserDisciplines\(supabase, userId, rawTarget\?\.id\), \[\]\)/)
  })

  it("nenhum .catch(() => []) ou .catch(() => null) solto sobrou fora do helper readOrFlag", () => {
    // O único lugar em que essas strings literais podem aparecer agora é
    // dentro da implementação do próprio helper (outro arquivo). Neste
    // arquivo (dashboard.service.ts) elas não devem mais existir.
    assert.doesNotMatch(source, /\.catch\(\(\) => \[\]\)/)
    assert.doesNotMatch(source, /\.catch\(\(\) => null\)/)
  })

  it("attemptsError é derivado de data === null, preservando o sinal que fetchAllRowsPaged já dava (Fase F.1) em vez de descartá-lo", () => {
    assert.match(source, /const attemptsError = questionAttemptsResult\?\.data === null/)
  })

  it("o payload de sucesso expõe dataIssues com as 8 leituras", () => {
    assert.match(source, /const dataIssues: DashboardDataIssues = \{/)
    for (const key of [
      "profile: profileError",
      "target: targetError",
      "cycle: cycleError",
      "todayPlan: todayPlanError",
      "history: historyError",
      "activities: activitiesError",
      "attempts: attemptsError",
      "disciplines: disciplinesError",
    ]) {
      assert.ok(source.includes(key), `dataIssues deveria incluir "${key}"`)
    }
    // E o payload de retorno de sucesso realmente inclui a variável.
    assert.match(source, /recentActivities,\s*\n\s*dataIssues,\s*\n\s*analytics: \{/)
  })

  it("o fallback do catch-all externo marca as 8 leituras como indisponíveis (é falha total, não uma leitura isolada)", () => {
    const catchAllIdx = source.indexOf("} catch (error) {")
    assert.ok(catchAllIdx > 0, "deveria existir um catch externo em getDashboardData")
    const afterCatch = source.slice(catchAllIdx)
    assert.match(afterCatch, /dataIssues: \{\s*profile: true,\s*target: true,\s*cycle: true,\s*todayPlan: true,\s*history: true,\s*activities: true,\s*attempts: true,\s*disciplines: true,\s*\}/)
  })

  it("getDashboardData continua com um único try/catch externo (não removemos a rede de segurança para bugs inesperados)", () => {
    const opens = source.match(/export async function getDashboardData/g)
    assert.equal(opens?.length, 1)
    assert.match(source, /\btry \{/)
    assert.match(source, /\} catch \(error\) \{/)
  })
})

describe("Fase I.8 — DashboardSnapshot tem o tipo dataIssues", () => {
  const typesSource = readFileSync("src/domain/dashboard/dashboard.types.ts", "utf8")

  it("declara DashboardDataIssues com as 8 chaves", () => {
    assert.match(typesSource, /export interface DashboardDataIssues \{/)
    for (const key of ["profile", "target", "cycle", "todayPlan", "history", "activities", "attempts", "disciplines"]) {
      assert.match(typesSource, new RegExp(`\\b${key}: boolean`))
    }
  })

  it("DashboardSnapshot expõe dataIssues (opcional, por compatibilidade com fixtures existentes)", () => {
    assert.match(typesSource, /dataIssues\?: DashboardDataIssues/)
  })
})
