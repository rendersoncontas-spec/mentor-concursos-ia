import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para o bug de timezone da Fase 5 da auditoria de
 * estabilização na contagem regressiva de dias para a prova ("dias
 * restantes").
 *
 * ACHADO REAL (src/application/concursos/concurso.action.ts e
 * src/application/dashboard/target.action.ts): `days_remaining`/
 * `daysRemaining` eram calculados com `today.setHours(0, 0, 0, 0)`, que
 * zera o horário no fuso LOCAL DO RUNTIME (UTC em produção), não no fuso de
 * negócio (America/Sao_Paulo). Entre 21h e 23h59 em São Paulo (00h-02h59
 * UTC do dia seguinte), "hoje" (meia-noite UTC) já apontava para o dia
 * seguinte ao dia real do aluno, subestimando os "dias restantes para a
 * prova" em 1 durante essa janela — uma métrica de alta visibilidade e
 * carga emocional para concurseiros.
 *
 * Corrigido para comparar chaves de calendário ("YYYY-MM-DD") calculadas em
 * São Paulo via daysBetweenSaoPauloDateKeys (src/lib/sao-paulo.ts, coberta
 * por testes de comportamento próprios em sao-paulo.test.ts). Ambas as
 * actions dependem de Supabase em runtime e não são testáveis diretamente
 * aqui, então este teste garante estruturalmente, via leitura do
 * código-fonte, que o padrão correto está em uso e que o padrão antigo
 * (setHours(0,0,0,0) local) não volte.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("getConcursoAction calcula days_remaining com chave de calendário em São Paulo, não com setHours(0,0,0,0) local", () => {
  const source = readSource("src/application/concursos/concurso.action.ts")

  it("importa os helpers necessários", () => {
    assert.match(source, /import \{ getDayInSaoPaulo, daysBetweenSaoPauloDateKeys \} from "@\/lib\/sao-paulo"/)
  })

  it("usa daysBetweenSaoPauloDateKeys(todayKey, exam_date), não today.setHours(0,0,0,0)", () => {
    assert.match(source, /const todayKey = getDayInSaoPaulo\(new Date\(\)\)/)
    assert.match(source, /days_remaining = daysBetweenSaoPauloDateKeys\(todayKey, exam_date\)/)
    assert.doesNotMatch(source, /today\.setHours\(0, 0, 0, 0\)/)
  })
})

describe("getUserTargetsAction calcula daysRemaining com chave de calendário em São Paulo, não com setHours(0,0,0,0) local", () => {
  const source = readSource("src/application/dashboard/target.action.ts")

  it("importa os helpers necessários", () => {
    assert.match(source, /import \{ getDayInSaoPaulo, daysBetweenSaoPauloDateKeys \} from "@\/lib\/sao-paulo"/)
  })

  it("usa daysBetweenSaoPauloDateKeys(todayKey, exam_date), não today.setHours(0,0,0,0)", () => {
    assert.match(source, /const todayKey = getDayInSaoPaulo\(new Date\(\)\)/)
    assert.match(source, /daysRemaining = daysBetweenSaoPauloDateKeys\(todayKey, exam_date\)/)
    assert.doesNotMatch(source, /today\.setHours\(0, 0, 0, 0\)/)
  })
})

describe("mapRowToConcurso (app/(protected)/concursos/page.tsx) calcula days_remaining com chave de calendário em São Paulo, não com setHours(0,0,0,0) local", () => {
  const source = readSource("src/app/(protected)/concursos/page.tsx")

  it("importa os helpers necessários", () => {
    assert.match(source, /import \{ getDayInSaoPaulo, daysBetweenSaoPauloDateKeys \} from "@\/lib\/sao-paulo"/)
  })

  it("usa daysBetweenSaoPauloDateKeys(todayKey, exam_date), não today.setHours(0,0,0,0)", () => {
    assert.match(source, /const todayKey = getDayInSaoPaulo\(new Date\(\)\)/)
    assert.match(source, /days_remaining = daysBetweenSaoPauloDateKeys\(todayKey, exam_date\)/)
    assert.doesNotMatch(source, /today\.setHours\(0, 0, 0, 0\)/)
  })
})
