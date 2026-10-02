import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it, test } from "node:test"

/**
 * G1.17 — completude funcional: VISÍVEL = FUNCIONAL ou LIMITAÇÃO explícita.
 *
 * Método: antes de implementar, buscar o contrato no próprio projeto
 * (tipos, validação compartilhada, testes P1.x, backend existente).
 * Resultado da investigação:
 * - Wizard: o contrato do planner é {horas, pesos} → blocos; dias/escala/
 *   âncora → preferências consumidas pela disponibilidade semanal/replan;
 *   min/max/style são memória-only por decisão P1.5 test-guardada. Nada a
 *   implementar no backend; a etapa 4 ganhou nota honesta (G1.16).
 * - Reviews: nenhum modelo de filtro por período existe → chips removidos.
 * - Som: sem mapeamento entre as opções do modal e useFocusSound →
 *   preview removido; select mantido como preferência armazenada.
 */

import {
  buildPlanningPayload,
  validatePlanningForm,
  type PlanningFormValues,
} from "@/features/planejamento/lib/planning-form"
import { isAvailableStudyDate } from "@/application/study-plan/weekly-planner.service"

function readSource(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), "utf-8")
}

function baseForm(): PlanningFormValues {
  return {
    mode: "semanal",
    weeklyHours: 20,
    dayConfigMode: "semana",
    scale: "normal",
    customWorkDays: 3,
    customOffDays: 2,
    firstShiftDay: 2,
    studyDays: ["Segunda", "Quarta"],
    minMinutes: 45,
    maxMinutes: 90,
    sessionStyle: "equilibradas",
    selectedDisciplines: ["Matemática", "Português"],
    importanceMap: { Matemática: 4 },
    knowledgeMap: {},
  }
}

describe("G1.17 — contrato do wizard (planejamento)", () => {
  it("payload leva horas + mapas completos (nenhuma disciplina some)", () => {
    const payload = buildPlanningPayload(baseForm())
    assert.equal(payload.horasSemana, 20)
    assert.deepEqual(payload.importanceMap, { Matemática: 4, Português: 2.5 })
    assert.deepEqual(payload.knowledgeMap, { Matemática: 2.5, Português: 2.5 })
  })

  it("validação compartilhada barra wizard e servidor com a mesma regra", () => {
    assert.equal(validatePlanningForm(baseForm()).ok, true)
    assert.equal(validatePlanningForm({ ...baseForm(), weeklyHours: 200 }).ok, false)
    assert.equal(validatePlanningForm({ ...baseForm(), selectedDisciplines: [] }).ok, false)
    assert.equal(
      validatePlanningForm({ ...baseForm(), minMinutes: 120, maxMinutes: 60 }).ok,
      false,
    )
  })

  it("servidor consome o ritmo validado (contrato G2.1 Opção A)", () => {
    // G2.1: o planner recebe {horas, pesos, ritmo}; dias/escala/âncora
    // continuam vindo de profiles (disponibilidade), e o ritmo viaja no
    // payload validado no boundary (parseRhythmConfig) — nunca dummy.
    const source = readSource("src/application/study-plan/generate-study-plan.action.ts")
    assert.ok(source.includes("parseRhythmConfig(config.ritmo)"), "ritmo validado no boundary")
    assert.ok(source.includes("rhythm.explicit ? rhythm.rhythm : undefined"), "ritmo encaminhado ao draft (ausente = legado)")
    assert.ok(
      source.includes("minMinutes: rhythm.bounds.min"),
      "validação usa o ritmo real, não dummies",
    )
  })

  it("dias/escala configurados moldam a disponibilidade semanal (efeito real)", () => {
    // 2026-09-28 = segunda-feira, 2026-09-29 = terça. Com studyDays só
    // ["seg"], terça não é dia de estudo — prova que a escolha de dias do
    // wizard tem efeito real via disponibilidade.
    const onlyMonday = {
      studyDays: ["seg"],
      scheduleMode: "normal",
      firstShiftDay: 2,
    }
    assert.equal(isAvailableStudyDate("2026-09-28", onlyMonday), true)
    assert.equal(isAvailableStudyDate("2026-09-29", onlyMonday), false)
    assert.equal(
      isAvailableStudyDate("2026-09-30", {
        ...onlyMonday,
        studyDays: ["seg", "ter", "qua", "qui", "sex"],
      }),
      true,
    )
  })
})

describe("G1.17 — controles mortos removidos", () => {
  it("sem bloco de período nas reviews (não existe modelo de filtro)", () => {
    const source = readSource("src/features/profile/components/account-settings-modal.tsx")
    // O comentário G1.17 documenta a remoção; o que não pode existir é o
    // controle em si (JSX executável, não prosa de comentário).
    assert.equal(
      /\["1d", "7d", "30d", "60d", "120d"\]/.test(source),
      false,
      "chips decorativos removidos",
    )
    assert.equal(
      /<label[^>]*>\s*PERÍODO DAS REVISÕES/.test(source),
      false,
      "seção morta removida",
    )
  })

  it("sem botão de preview de som (sem handler e sem mapeamento)", () => {
    const source = readSource("src/features/profile/components/account-settings-modal.tsx")
    assert.equal(
      source.includes('aria-label="Ouvir som do timer"'),
      false,
      "botão morto removido",
    )
    assert.equal(source.includes("Volume2"), false, "import morto removido junto")
  })

  it("select de som mantido (preferência armazenada, sem regressão)", () => {
    const source = readSource("src/features/profile/components/account-settings-modal.tsx")
    assert.ok(source.includes("value={somTimer}"), "controle de preferência intacto")
    assert.ok(source.includes("timerSound: somTimer"), "persistência intacta")
  })
})

test("G2.1 — etapa 4 declara o efeito (ritmo molda os blocos — Opção A)", () => {
  const source = readSource("src/features/planejamento/components/planning-wizard-modal.tsx")
  assert.ok(source.includes("define o tamanho dos blocos do cronograma gerado"))
})
