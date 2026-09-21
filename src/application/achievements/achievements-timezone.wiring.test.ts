import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para o bug de timezone da Fase 5 da auditoria de
 * estabilização em getAchievementsAction (src/application/achievements/
 * achievements.action.ts).
 *
 * ACHADO REAL: todayDow, weekStart, a hora de cada sessão (morningSessions/
 * afternoonSessions/nightSessions) e o dia da semana de cada sessão
 * (studiedDow, usado em facts.planDaysDone/adherencePercentage — a
 * "aderência ao plano" mostrada ao aluno) eram todos calculados com
 * accessors de Date no fuso LOCAL DO RUNTIME (UTC em produção: getDay,
 * getHours, getFullYear/getMonth/getDate), não no fuso de negócio
 * (America/Sao_Paulo). Isso causava um desvio de até ~3h na virada do dia:
 * uma sessão estudada às 22h de sábado em São Paulo (01h de domingo em UTC)
 * era contada como domingo, e o "hoje"/"esta semana" usados para comparação
 * também podiam estar um dia à frente do real em São Paulo durante essa
 * janela — potencialmente fazendo o aluno ver uma aderência ao plano
 * incorreta (dia planejado não reconhecido como estudado, ou o inverso).
 *
 * Corrigido para usar os helpers de fuso de São Paulo já usados no resto do
 * projeto (getDayInSaoPaulo, daysAgoKeyInSaoPaulo, dayOfWeekForDateKey,
 * getHourInSaoPaulo, de src/lib/sao-paulo.ts) em vez dos accessors locais.
 * Este teste não executa a action (que depende de Supabase/Sentry em
 * runtime), apenas garante estruturalmente que o padrão antigo não volte.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("getAchievementsAction usa helpers de fuso de São Paulo, não accessors locais do runtime", () => {
  const source = readSource("src/application/achievements/achievements.action.ts")

  it("importa os helpers de fuso de São Paulo necessários", () => {
    assert.match(
      source,
      /import \{ getDayInSaoPaulo, daysAgoKeyInSaoPaulo, dayOfWeekForDateKey, getHourInSaoPaulo \} from "@\/lib\/sao-paulo"/,
    )
  })

  it("todayDow e weekStartKey são derivados de getDayInSaoPaulo, não de now.getDay()/getFullYear() local", () => {
    assert.match(source, /const todayKey = getDayInSaoPaulo\(now\)/)
    assert.match(source, /const todayDow = dayOfWeekForDateKey\(todayKey\)/)
    assert.match(source, /const weekStartKey = daysAgoKeyInSaoPaulo\(todayDow, todayKey\)/)
    assert.doesNotMatch(source, /const todayDow = now\.getDay\(\)/)
    assert.doesNotMatch(source, /new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\) - todayDow\)/)
  })

  it("a hora da sessão vem de getHourInSaoPaulo, não de date.getHours()", () => {
    assert.match(source, /const hour = getHourInSaoPaulo\(date\)/)
    assert.doesNotMatch(source, /const hour = date\.getHours\(\)/)
  })

  it("o dia da semana estudado (studiedDow) compara chaves YYYY-MM-DD em SP, não Date locais", () => {
    assert.match(
      source,
      /if \(key >= weekStartKey && key <= todayKey\) studiedDow\.add\(dayOfWeekForDateKey\(key\)\)/,
    )
    assert.doesNotMatch(source, /if \(date >= weekStart && date <= now\) studiedDow\.add\(date\.getDay\(\)\)/)
  })
})
