import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para o bug de timezone da Fase 5 da auditoria de
 * estabilização em StudyPlanWeekView (src/features/study-plan/components/
 * study-plan-week.tsx).
 *
 * ACHADO REAL: StudyPlanWeekView é um Server Component (sem "use client")
 * usado na Grade Semanal do Cronograma. `const today = new Date().getDay()`
 * calculava o dia da semana no fuso do SERVIDOR (UTC em produção), não no
 * fuso de negócio (America/Sao_Paulo) nem no fuso do navegador do aluno.
 * Entre 21h e 23h59 em São Paulo (00h-02h59 UTC do dia seguinte), o card do
 * dia destacado como "hoje" (isToday) podia ficar incorreto, mostrando o
 * dia seguinte como o dia atual.
 *
 * Corrigido para usar os helpers de fuso de São Paulo já usados no resto do
 * projeto (getDayInSaoPaulo, dayOfWeekForDateKey, de src/lib/sao-paulo.ts).
 * Este componente não tem infraestrutura de teste de renderização no
 * projeto (sem @testing-library/react instalado), então este teste garante
 * estruturalmente, via leitura do código-fonte, que o padrão correto está
 * em uso e que o padrão antigo não volte.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("StudyPlanWeekView usa helpers de fuso de São Paulo para decidir o dia 'hoje', não new Date().getDay() do servidor", () => {
  const source = readSource("src/features/study-plan/components/study-plan-week.tsx")

  it("importa os helpers de fuso de São Paulo necessários", () => {
    assert.match(
      source,
      /import \{ getDayInSaoPaulo, dayOfWeekForDateKey \} from "@\/lib\/sao-paulo"/,
    )
  })

  it("today é derivado de dayOfWeekForDateKey(getDayInSaoPaulo(...)), não de new Date().getDay() local do servidor", () => {
    assert.match(source, /const today = dayOfWeekForDateKey\(getDayInSaoPaulo\(new Date\(\)\)\)/)
    assert.doesNotMatch(source, /const today = new Date\(\)\.getDay\(\)/)
  })
})
