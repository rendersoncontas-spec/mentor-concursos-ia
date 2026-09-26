import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para os bugs de timezone da Fase 5 da auditoria de
 * estabilização nos limites de período do RANKING público.
 *
 * ACHADO REAL 1 (src/application/study-analytics/study-analytics.actions.ts,
 * getRankingViaDirectQuery — fallback de query direta do ranking): "hoje",
 * "esta semana", "semana passada" e "este mês" eram calculados com
 * accessors de Date no fuso LOCAL DO RUNTIME (UTC em produção: getDay,
 * getDate, getFullYear, getMonth, setHours(0,0,0,0)), não no fuso de
 * negócio (America/Sao_Paulo). Entre 21h e 23h59 em São Paulo (00h-02h59
 * UTC do dia seguinte), uma sessão de estudo podia ser contada no período
 * errado do ranking (ex.: "semana passada" quando na verdade ainda era
 * "esta semana" para o aluno).
 *
 * ACHADO REAL 2 (src/application/ranking/public-study-profile.action.ts,
 * getPublicStudyProfileAction — perfil PÚBLICO de estudo, visível a outros
 * usuários): o mesmo padrão de bug (getMonday local + setHours(0,0,0,0))
 * calculava "esta semana"/"semana passada" para o total de minutos
 * estudados exibido no perfil público.
 *
 * Corrigidos para usar os helpers de fuso de São Paulo já usados no resto
 * do projeto (getDayInSaoPaulo, daysAgoKeyInSaoPaulo, startOfDayInSaoPauloMs,
 * endOfDayInSaoPauloMs de src/lib/sao-paulo.ts, e getSaoPauloWeekRange de
 * src/lib/study-time-calculator.ts). Ambas as funções dependem de Supabase
 * em runtime e não são testáveis diretamente aqui, então este teste garante
 * estruturalmente, via leitura do código-fonte, que o padrão correto está
 * em uso e que o padrão antigo (getDay/getDate/setHours locais) não volte.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("getRankingViaDirectQuery usa helpers de fuso de São Paulo para os limites de período, não accessors locais do runtime", () => {
  const source = readSource("src/application/study-analytics/study-analytics.actions.ts")

  it("importa os helpers de fuso de São Paulo necessários", () => {
    assert.match(
      source,
      /import \{ getDayInSaoPaulo, daysAgoKeyInSaoPaulo, startOfDayInSaoPauloMs, endOfDayInSaoPauloMs \} from "@\/lib\/sao-paulo"/,
    )
    // Fase H: o mesmo import agora também traz resolveWeekStartDay.
    assert.match(source, /import \{[^}]*\bgetSaoPauloWeekRange\b[^}]*\} from "@\/lib\/study-time-calculator"/)
  })

  it("os limites de semana/mês vêm de chaves de calendário em SP, não de getDay()/getFullYear() locais", () => {
    assert.match(source, /const todayKey = getDayInSaoPaulo\(now\)/)
    assert.match(source, /const weekRange = getSaoPauloWeekRange\(todayKey, 1\)/)
    assert.doesNotMatch(source, /const day = date\.getDay\(\)/)
    assert.doesNotMatch(source, /const monthStart = new Date\(now\.getFullYear\(\), now\.getMonth\(\), 1\)/)
  })

  it("getRankingViaDirectQuery aceita um `now` opcional injetável (testabilidade determinística)", () => {
    assert.match(
      source,
      /async function getRankingViaDirectQuery\(supabase: Supabase, period: RankingPeriod, currentUserId\?: string, weekOffset: number = 0, now: Date = new Date\(\)\)/,
    )
  })
})

describe("getPublicStudyProfileAction usa helpers de fuso de São Paulo para 'esta semana'/'semana passada', não accessors locais do runtime", () => {
  const source = readSource("src/application/ranking/public-study-profile.action.ts")

  it("importa os helpers de fuso de São Paulo necessários", () => {
    assert.match(
      source,
      /import \{ getDayInSaoPaulo, daysAgoKeyInSaoPaulo, startOfDayInSaoPauloMs \} from "@\/lib\/sao-paulo"/,
    )
    assert.match(source, /import \{ getSaoPauloWeekRange \} from "@\/lib\/study-time-calculator"/)
  })

  it("thisMondayMs/lastMondayMs vêm de chaves de calendário em SP, não do antigo getMonday() local", () => {
    assert.match(source, /const thisMondayMs = startOfDayInSaoPauloMs\(weekRange\.mondayKey\)/)
    assert.match(
      source,
      /const lastMondayMs = startOfDayInSaoPauloMs\(daysAgoKeyInSaoPaulo\(7, weekRange\.mondayKey\)\)/,
    )
    assert.doesNotMatch(source, /const day = date\.getDay\(\)/)
  })

  it("getPublicStudyProfileAction aceita um `now` opcional injetável (testabilidade determinística)", () => {
    assert.match(
      source,
      /export async function getPublicStudyProfileAction\(\s*targetUserId: string,\s*now: Date = new Date\(\),\s*\)/,
    )
  })
})
