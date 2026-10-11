import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

// G2.23 — garantias estruturais das abas (padrão APG) nas telas auditadas.
// Os comportamentos de teclado/foco são exercitados no navegador
// (e2e/specs/tabs-keyboard.spec.ts); aqui ficam as regras que não podem regredir
// em silêncio: toda barra de abas usa o helper compartilhado, tem painel
// associado e o modelo de ativação escolhido.

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf-8")

const SCREENS = [
  { name: "Histórico", file: "src/features/history/components/history-view.tsx", activation: "manual", tabs: 2 },
  { name: "Planejamento", file: "src/features/planejamento/components/planning-view.tsx", activation: "manual", tabs: 5 },
  { name: "Minha conta", file: "src/features/profile/components/account-settings-modal.tsx", activation: "automatic", tabs: 6 },
] as const

describe("G2.23 — abas: estrutura APG", () => {
  for (const s of SCREENS) {
    describe(s.name, () => {
      const src = read(s.file)

      it("usa o helper compartilhado com o modelo de ativação decidido", () => {
        assert.ok(src.includes('from "@/lib/a11y/tab-keyboard"'))
        assert.ok(src.includes(`activation: "${s.activation}"`), `${s.name} deve usar ativação ${s.activation}`)
        assert.equal(src.match(/role="tablist"/g)?.length, 1)
      })

      it("cada aba tem id, aria-selected, aria-controls e tabIndex móvel", () => {
        const tabs = src.match(/role="tab"/g)?.length ?? 0
        assert.equal(tabs, s.tabs)
        assert.equal(src.match(/aria-controls=\{/g)?.length, s.tabs)
        assert.equal(src.match(/aria-selected=\{/g)?.length, s.tabs)
        assert.equal(src.match(/tabIndex=\{/g)?.length, s.tabs)
      })

      it("há UM painel (role=tabpanel) rotulado pela aba ativa", () => {
        assert.equal(src.match(/role="tabpanel"/g)?.length, 1)
        assert.ok(/role="tabpanel"[^>]*aria-labelledby=|aria-labelledby=[^>]*role="tabpanel"/.test(src))
      })
    })
  }

  it("Minha conta é vertical e o diálogo tem nome acessível (DialogTitle)", () => {
    const src = read("src/features/profile/components/account-settings-modal.tsx")
    assert.ok(src.includes('aria-orientation="vertical"'))
    assert.ok(src.includes('orientation: "vertical"'))
    assert.ok(/<DialogTitle[^>]*>\s*Minha Conta\s*<\/DialogTitle>/.test(src))
  })

  it("Histórico e Planejamento não ativam ao mover o foco (visões buscam dados)", () => {
    for (const f of [SCREENS[0].file, SCREENS[1].file]) assert.equal(read(f).includes('activation: "automatic"'), false, f)
  })

  it("o harness das telas de abas só existe como page.e2e.tsx e sem acesso a banco/segredos", () => {
    for (const dir of ["history", "planning"]) {
      const files = fs.readdirSync(path.join(process.cwd(), "src/app/e2e-harness", dir))
      assert.ok(files.includes("page.e2e.tsx"), dir)
      assert.equal(files.includes("page.tsx"), false, `${dir}: page.tsx viraria rota sem a flag`)
      for (const f of files) {
        const code = read(`src/app/e2e-harness/${dir}/${f}`)
        assert.equal(/createClient|supabase|\.from\(|service_role|SERVICE_ROLE|process\.env|cookies\(/i.test(code), false, `${dir}/${f}`)
      }
    }
  })
})
