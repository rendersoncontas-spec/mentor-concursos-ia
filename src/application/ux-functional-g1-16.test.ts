import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

/**
 * G1.16 — UX funcional e consistência de feedback.
 *
 * Estes testes são travas de regressão de wiring (padrão já usado no repo:
 * planning-view-remove-guard, google-auth.wiring, statistics-cache-
 * invalidation): cada um ancora um bug funcional PROVADO por leitura do
 * caminho de código — toast falso, flag presa, reentrância, controle morto.
 * O comportamento foi verificado no código; o teste impede o retorno
 * silencioso. Cobertura comportamental pura vive nos testes G1.14/G1.15.
 */

function readSource(p: string): string {
  return fs.readFileSync(path.join(process.cwd(), p), "utf-8")
}

function handlerBody(source: string, marker: string, length = 2500): string {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `handler ${marker} deve existir`)
  return source.slice(start, start + length)
}

describe("G1.16 — feedback honesto (sem toast prematuro)", () => {
  it("iniciar estudo não afirma sucesso antes de navegar (3 telas)", () => {
    for (const file of [
      "src/features/planejamento/components/planning-view.tsx",
      "src/features/planejamento/components/study-calendar-view.tsx",
      "src/features/planejamento/components/daily-planning-view.tsx",
    ]) {
      const source = readSource(file)
      assert.equal(
        /toast\.success\(`Iniciando[^`]*`\)\s*\n[^]*?router\.push/.test(source),
        false,
        `${file}: nenhum toast "Iniciando…" pode anteceder router.push`,
      )
    }
  })

  it("fixar nota não afirma antes do autosave (status pill é a verdade)", () => {
    const source = readSource("src/features/dashboard/components/sticky-notes-widget.tsx")
    const start = source.indexOf("const handleTogglePin")
    assert.notEqual(start, -1)
    const end = source.indexOf("const handleCreateNewNote")
    const body = source.slice(start, end === -1 ? start + 600 : end)
    assert.equal(body.includes("toast.success"), false)
  })

  it("excluir nota com falha no servidor restaura a lista (rollback)", () => {
    const body = handlerBody(
      readSource("src/features/dashboard/components/sticky-notes-widget.tsx"),
      "const handleDeleteNote",
      4000,
    )
    assert.ok(body.includes("previousNotes"), "snapshot prévio para rollback")
    assert.ok(body.includes("setNotes(previousNotes)"), "restaura a lista em falha")
  })

  it("adicionar tópico do edital com falha restaura a lista (rollback)", () => {
    const body = handlerBody(
      readSource("src/features/edital/components/edital-accordion.tsx"),
      "const handleAddTopic",
      3500,
    )
    assert.ok(body.includes("previousTopics"), "snapshot prévio para rollback")
    assert.ok(body.includes("toast.error"), "falha vira erro honesto, não sucesso")
  })
})

describe("G1.16 — sem flags presas (TRAP 1/2)", () => {
  it("edital: return precoce reseta isSaving", () => {
    const body = handlerBody(
      readSource("src/features/edital/components/edital-accordion.tsx"),
      "const handleDeleteDiscipline",
      1500,
    )
    const earlyReturn = body.indexOf('toast.error("Nenhum concurso ativo.")')
    assert.notEqual(earlyReturn, -1)
    assert.ok(
      body.slice(earlyReturn, earlyReturn + 400).includes("setIsSaving(false)"),
      "return precoce precisa resetar isSaving",
    )
  })

  it("review finish/answer usam finally (throw nunca trava a UI)", () => {
    const source = readSource("src/features/reviews/components/review-session-modal.tsx")
    const finish = handlerBody(source, "const finish = useCallback", 1200)
    assert.ok(finish.includes("if (loading) return"), "trava de reentrância")
    assert.ok(finish.includes("finally"), "finally libera loading")
    const answer = handlerBody(source, "const answer = useCallback", 4500)
    assert.ok(answer.includes("} finally {"), "finally libera answering")
  })
})

describe("G1.16 — travas de reentrância", () => {
  const cases: Array<[string, string, string]> = [
    ["src/features/edital/components/edital-accordion.tsx", "const handleAddDiscipline", "if (isSaving) return"],
    ["src/features/edital/components/edital-accordion.tsx", "const handleAddTopic", "if (isSaving) return"],
    ["src/features/edital/components/edital-accordion.tsx", "const handleDeleteDiscipline", "if (isSaving) return"],
    ["src/features/edital/components/edital-accordion.tsx", "const handleDeleteTopic", "if (isSaving) return"],
    ["src/features/edital-importer/components/edital-importer.tsx", "const handleConfirm", "if (busy) return"],
    ["src/features/study-cycle/components/create-cycle-modal.tsx", "const handleCreate", "if (isSubmitting) return"],
    ["src/features/study-cycle/components/edit-cycle-modal.tsx", "const handleSave", "if (isSubmitting) return"],
    ["src/features/simulados/components/simulado-record-modal.tsx", "const handleSave", "if (submitting) return"],
    ["src/features/profile/components/account-settings-modal.tsx", "const handleSave", "if (isSaving) return"],
    ["src/features/study-session/components/study-register-modal.tsx", "const onSubmit", "if (isSubmitting) return"],
  ]
  for (const [file, handler, guard] of cases) {
    it(`${file.split("/").pop()} ${handler} tem trava`, () => {
      const body = handlerBody(readSource(file), handler)
      assert.ok(body.includes(guard), `${handler} deve conter "${guard}"`)
    })
  }
})

describe("G1.16 — controles mortos removidos ou honestos", () => {
  it("edital sem lápis fantasma (edição sem persistência removida)", () => {
    const source = readSource("src/features/edital/components/edital-accordion.tsx")
    assert.equal(source.includes("setEditingDiscipline"), false, "estado morto removido")
    assert.equal(
      source.includes("EditDisciplineModal"),
      false,
      "modal sem persistência removido deste contexto",
    )
    assert.equal(source.includes("SquarePen"), false, "botão fantasma removido")
  })

  it("heatmap sem cursor-pointer sem clique; chevrons decorativas honestas", () => {
    const heat = readSource("src/features/statistics/components/statistics-charts.tsx")
    assert.equal(heat.includes("cursor-pointer"), false, "célula só tem tooltip, não drill-down")
    const weekly = readSource("src/features/planejamento/components/weekly-planning-view.tsx")
    assert.equal(
      /Chevron(Left|Right) className="[^"]*cursor-pointer/.test(weekly),
      false,
      "setas decorativas não prometem navegação",
    )
  })

  it("maintenance sem link morto", () => {
    const source = readSource("src/components/system/maintenance-page.tsx")
    assert.equal(source.includes('href="#"'), false)
  })

  it("wizard etapa 4 declara que ritmo molda os blocos (G2.1 Opção A)", () => {
    const source = readSource("src/features/planejamento/components/planning-wizard-modal.tsx")
    assert.ok(
      source.includes("define o tamanho dos blocos do cronograma gerado"),
      "nota honesta sobre o contrato vigente",
    )
  })
})

describe("G1.16 — empty states com orientação", () => {
  it("review vazia orienta de onde vêm as revisões", () => {
    const source = readSource("src/features/reviews/components/review-session-modal.tsx")
    assert.ok(source.includes("Adicione tópicos do edital às revisões"))
  })

  it("disciplinas vazias têm CTA (sem beco sem saída)", () => {
    const source = readSource("src/features/disciplines/components/disciplines-view.tsx")
    const emptyAt = source.indexOf("Nenhuma disciplina encontrada")
    assert.notEqual(emptyAt, -1)
    assert.ok(
      source.slice(emptyAt, emptyAt + 1200).includes("setIsModalOpen(true)"),
      "empty state abre a criação",
    )
  })
})
