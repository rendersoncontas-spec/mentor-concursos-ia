// ============================================================================
// G1.10 — UX, ACESSIBILIDADE E CONSISTÊNCIA INTERATIVA.
// Estrutural (sem browser/E2E): travas dos contratos corrigidos.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// G-49 — rollback de reorder.
// ---------------------------------------------------------------------------

describe("G-49 — reorder com rollback em falha", () => {
  const body = src("src/features/dashboard/components/dashboard-layout.tsx")

  it("1. handleReorder fotografa o anterior e reverte estado + cache", () => {
    assert.match(body, /const previous = layout/)
    assert.match(body, /setLayout\(previous\)/)
    assert.match(body, /persistLocal\(previous\)/)
  })

  it("2. handleSaveLayout tem o mesmo rollback", () => {
    const fn = body.slice(body.indexOf("const handleSaveLayout"))
    assert.match(fn, /const previous = layout/)
    assert.match(fn, /setLayout\(previous\)/)
  })

  it("3. falha continua com erro explícito (sem sucesso fingido)", () => {
    assert.match(body, /toast\.error\("Erro ao salvar ordem dos widgets\."\)/)
  })
})

// ---------------------------------------------------------------------------
// G-47 — nomes acessíveis nos controles de ícone.
// ---------------------------------------------------------------------------

describe("G-47 — controles de ícone com nome acessível", () => {
  const cases: Array<[string, string, string[]]> = [
    ["edit-cycle-modal.tsx", "src/features/study-cycle/components/edit-cycle-modal.tsx", [
      'aria-label="Diminuir 15 minutos"',
      'aria-label="Aumentar 15 minutos"',
      'aria-label="Mover para cima"',
      'aria-label="Mover para baixo"',
      'aria-label="Remover matéria"',
    ]],
    ["create-cycle-modal.tsx", "src/features/study-cycle/components/create-cycle-modal.tsx", [
      'aria-label="Diminuir 15 minutos"',
      'aria-label="Aumentar 15 minutos"',
      'aria-label="Mover para cima"',
      'aria-label="Mover para baixo"',
      'aria-label="Remover matéria"',
    ]],
    ["login-form.tsx", "src/features/auth/components/login-form.tsx", [
      'aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}',
    ]],
    ["study-calendar-view.tsx", "src/features/planejamento/components/study-calendar-view.tsx", [
      'aria-label="Mês anterior"',
      'aria-label="Próximo mês"',
      'aria-label="Plantão de referência"',
    ]],
    ["study-calendar.tsx", "src/features/history/components/study-calendar.tsx", [
      'aria-label="Editar sessão"',
      'aria-label="Excluir sessão"',
    ]],
    ["simulados-view.tsx", "src/features/simulados/components/simulados-view.tsx", [
      'role="dialog"',
      'aria-label="Fechar detalhes"',
    ]],
    ["simulado-record-modal.tsx", "src/features/simulados/components/simulado-record-modal.tsx", [
      'aria-label="Remover matéria"',
    ]],
    ["edital-importer.tsx", "src/features/edital-importer/components/edital-importer.tsx", [
      'aria-label="Nome da disciplina"',
      'aria-label={`Renomear',
      'aria-label={`Remover',
    ]],
    ["edit-discipline-modal.tsx", "src/features/disciplines/components/edit-discipline-modal.tsx", [
      'aria-label="Editar tópico"',
      'aria-label="Excluir tópico"',
    ]],
    // G1.17: agulha do preview removida junto com o botão morto
    // (sem handler, sem mapeamento com useFocusSound) — ver account-settings.
    ["sticky-notes-widget.tsx", "src/features/dashboard/components/sticky-notes-widget.tsx", [
      'role="button"',
      'aria-label="Restaurar Bloco de Notas"',
    ]],
  ]
  for (const [label, path, needles] of cases) {
    it(`4. ${label} nomeia seus controles`, () => {
      const body = src(path)
      for (const needle of needles) assert.ok(body.includes(needle), `${label}: sem ${needle}`)
    })
  }
})

// ---------------------------------------------------------------------------
// Ações destrutivas: sem duplo submit; pill por teclado.
// ---------------------------------------------------------------------------

describe("G1.10 — ações seguras e teclado", () => {
  it("5. edit-discipline trava reentrância e desabilita no save", () => {
    const body = src("src/features/disciplines/components/edit-discipline-modal.tsx")
    assert.match(body, /if \(isSaving\) return/)
    assert.match(body, /disabled=\{isSaving\}/)
    assert.match(body, /finally \{\s*\n?\s*setIsSaving\(false\)/)
  })

  it("6. pill minimizada é operável por teclado", () => {
    const body = src("src/features/dashboard/components/sticky-notes-widget.tsx")
    assert.match(body, /onKeyDown=\{\(e\) => \{/)
    assert.match(body, /tabIndex=\{0\}/)
  })

  it("7. nenhuma correção introduziu glass/gradient/blur (identidade preservada)", () => {
    for (const path of [
      "src/features/dashboard/components/dashboard-layout.tsx",
      "src/features/dashboard/components/sticky-notes-widget.tsx",
      "src/features/simulados/components/simulados-view.tsx",
    ]) {
      const body = src(path)
      assert.doesNotMatch(body, /backdrop-blur/)
      assert.doesNotMatch(body, /bg-gradient/)
      assert.doesNotMatch(body, /glassmorphism/)
    }
  })
})
