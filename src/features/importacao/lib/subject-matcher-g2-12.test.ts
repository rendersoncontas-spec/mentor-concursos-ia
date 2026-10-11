import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AUTO_MATCH_MARGIN, similarity, suggestDisciplines } from "./subject-matcher"

// G2.12 — importação: nenhuma associação silenciosa em caso ambíguo; igualdade
// exata nunca perde empate para um nome apenas parecido.

const CATALOG = [
  // ids escolhidos para que o desempate por id favorecesse o candidato ERRADO
  { id: "a-rlm", name: "Raciocínio Lógico-Matemático", area: "Exatas" },
  { id: "b-rl-e-m", name: "Raciocínio Lógico e Matemático", area: "Geral" },
  { id: "c-rl", name: "Raciocínio Lógico", area: "Geral" },
]

describe("sugestões de disciplina na importação", () => {
  it("igualdade exata do nome normalizado vence o empate com um parecido", () => {
    // "e" é ignorado na similaridade: os dois candidatos empatam em score.
    assert.equal(similarity("Raciocinio Logico e Matematico", "Raciocínio Lógico-Matemático"), similarity("Raciocinio Logico e Matematico", "Raciocínio Lógico e Matemático"))
    const s = suggestDisciplines(["Raciocinio Logico e Matematico"], CATALOG)
    const first = s["Raciocinio Logico e Matematico"]?.[0]
    assert.equal(first?.disciplineId, "b-rl-e-m")
    assert.equal(first?.auto, true)
  })

  it("'Raciocínio Lógico' casa com 'Raciocínio Lógico' — não com a variante matemática", () => {
    const first = suggestDisciplines(["Raciocínio Lógico"], CATALOG)["Raciocínio Lógico"]?.[0]
    assert.equal(first?.disciplineId, "c-rl")
    assert.equal(first?.auto, true)
  })

  it("dois candidatos quase empatados: nada pré-selecionado, sugestões visíveis", () => {
    const list = suggestDisciplines(["Lógico Matemático"], CATALOG)["Lógico Matemático"] ?? []
    assert.ok(list.length >= 2)
    const [a, b] = list
    assert.ok((a?.score ?? 0) - (b?.score ?? 0) < AUTO_MATCH_MARGIN)
    assert.equal(a?.auto, false, "ambíguo → escolha explícita do usuário")
  })

  it("vencedor claro continua pré-selecionado (e o usuário pode trocar antes de importar)", () => {
    const catalog = [
      { id: "da", name: "Direito Administrativo", area: "Direito" },
      { id: "dc", name: "Direito Constitucional", area: "Direito" },
    ]
    const first = suggestDisciplines(["Direito Administrativo - Atos"], catalog)["Direito Administrativo - Atos"]?.[0]
    assert.equal(first?.disciplineId, "da")
    assert.equal(first?.auto, true)
  })

  it("sem nenhum candidato: sem sugestão (vira matéria nova)", () => {
    assert.equal((suggestDisciplines(["Astronomia"], CATALOG)["Astronomia"] ?? []).length, 0)
  })
})
