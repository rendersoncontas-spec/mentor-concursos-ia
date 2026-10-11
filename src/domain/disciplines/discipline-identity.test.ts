import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildDisciplineIdentity,
  canonicalIdOf,
  canonicalizeDisciplineIds,
  EMPTY_DISCIPLINE_IDENTITY,
  identityDisplayName,
  resolveCanonicalIds,
  subjectIdentityKey,
} from "./discipline-identity"
import { canonicalDisciplineKey, sameCanonicalDisciplineName } from "./discipline-naming"

// G2.12 — identidade canônica de disciplina: chave de nome (texto) para
// deduplicar o catálogo; identidade (relação explícita) para as análises.

const RL = "rl"
const RLEM = "rl-e-m"
const RLM = "rl-m"
const TI = "ti"
const TI_SIGLA = "ti-sigla"

const CATALOG = [
  { id: RL, name: "Raciocínio Lógico" },
  { id: RLEM, name: "Raciocínio Lógico e Matemático" },
  { id: RLM, name: "Raciocínio Lógico-Matemático", canonicalDisciplineId: RLEM },
  { id: TI, name: "Tecnologia da Informação", canonicalDisciplineId: TI_SIGLA },
  { id: TI_SIGLA, name: "Tecnologia da Informação (TI)" },
]

describe("chave canônica de nome (deduplicação do catálogo)", () => {
  it("nomes idênticos, caixa, espaços, acentos e hífen dão a mesma chave", () => {
    assert.equal(canonicalDisciplineKey("Língua Portuguesa"), "lingua portuguesa")
    assert.equal(canonicalDisciplineKey("  LÍNGUA   portuguesa "), "lingua portuguesa")
    assert.equal(canonicalDisciplineKey("Lingua Portuguesa"), "lingua portuguesa")
    assert.equal(canonicalDisciplineKey("Direito-Penal"), canonicalDisciplineKey("Direito Penal"))
    assert.equal(canonicalDisciplineKey("Ética"), "etica", "acento decomposto (NFD) também")
  })

  it("matérias diferentes NÃO colidem — nem as parecidas", () => {
    assert.equal(sameCanonicalDisciplineName("Raciocínio Lógico", "Raciocínio Lógico e Matemático"), false)
    assert.equal(sameCanonicalDisciplineName("Raciocínio Lógico e Matemático", "Raciocínio Lógico-Matemático"), false)
    assert.equal(sameCanonicalDisciplineName("Direito Administrativo", "Noções de Direito Administrativo"), false)
    assert.equal(sameCanonicalDisciplineName("Ética", "Ética no Serviço Público"), false)
    assert.equal(sameCanonicalDisciplineName("Tecnologia da Informação", "Tecnologia da Informação (TI)"), false)
  })
})

describe("resolução de identidade (relação explícita, nunca texto)", () => {
  it("alias declarado aponta para a canônica; o resto é a própria identidade", () => {
    const map = resolveCanonicalIds(CATALOG)
    assert.equal(map.get(RLM), RLEM)
    assert.equal(map.get(TI), TI_SIGLA)
    assert.equal(map.has(RL), false, "Raciocínio Lógico ≠ Raciocínio Lógico e Matemático sem vínculo")
    assert.equal(map.size, 2)
  })

  it("nome parecido sem vínculo gravado continua separado", () => {
    const identity = buildDisciplineIdentity({
      catalog: [
        { id: "da", name: "Direito Administrativo" },
        { id: "nda", name: "Noções de Direito Administrativo" },
      ],
    })
    assert.equal(canonicalIdOf(identity, "nda"), "nda")
    assert.deepEqual(identity.canonicalOf, {})
  })

  it("cadeia é seguida até a raiz; ciclo e auto-referência não unem nada", () => {
    const chain = resolveCanonicalIds([
      { id: "a", name: "A", canonicalDisciplineId: "b" },
      { id: "b", name: "B", canonicalDisciplineId: "c" },
      { id: "c", name: "C" },
    ])
    assert.equal(chain.get("a"), "c")
    assert.equal(chain.get("b"), "c")
    const cycle = resolveCanonicalIds([
      { id: "x", name: "X", canonicalDisciplineId: "y" },
      { id: "y", name: "Y", canonicalDisciplineId: "x" },
      { id: "z", name: "Z", canonicalDisciplineId: "z" },
    ])
    assert.equal(cycle.size, 0)
  })

  it("id desconhecido é ele mesmo; snapshot vazio não muda nada", () => {
    const identity = buildDisciplineIdentity({ catalog: CATALOG })
    assert.equal(canonicalIdOf(identity, "nao-existe"), "nao-existe")
    assert.equal(canonicalIdOf(EMPTY_DISCIPLINE_IDENTITY, RLM), RLM)
    assert.equal(canonicalIdOf(null, RLM), RLM)
  })

  it("nome exibido: custom_name pessoal da canônica > nome global; aliases listados", () => {
    const identity = buildDisciplineIdentity({
      catalog: CATALOG,
      personal: [
        { disciplineId: RLEM, customName: "  RLM (meu nome) " },
        { disciplineId: RLEM, customName: "segundo vínculo ignorado" },
        { disciplineId: TI, customName: "nome pessoal do alias" },
      ],
    })
    assert.equal(identityDisplayName(identity, RLM, "x"), "RLM (meu nome)", "alias exibe a canônica personalizada")
    assert.equal(identityDisplayName(identity, TI, "x"), "Tecnologia da Informação (TI)", "custom do alias não vira nome da identidade")
    assert.deepEqual(identity.memberNames[RLEM], ["Raciocínio Lógico-Matemático"])
    assert.deepEqual(identity.memberNames[TI_SIGLA], ["Tecnologia da Informação"])
    assert.equal(identityDisplayName(identity, RL, "x"), "Raciocínio Lógico")
  })

  it("custom_name vazio volta ao nome global", () => {
    const identity = buildDisciplineIdentity({ catalog: CATALOG, personal: [{ disciplineId: RL, customName: "   " }] })
    assert.equal(identityDisplayName(identity, RL, "x"), "Raciocínio Lógico")
  })

  it("canonicalizeDisciplineIds devolve cópias e nunca altera a entrada (histórico intacto)", () => {
    const identity = buildDisciplineIdentity({ catalog: CATALOG })
    const sessions = [
      { id: "s1", disciplineId: RLM },
      { id: "s2", disciplineId: RL },
      { id: "s3", disciplineId: null },
    ]
    const frozen = JSON.stringify(sessions)
    const out = canonicalizeDisciplineIds(sessions, identity)
    assert.deepEqual(out.map((s) => s.disciplineId), [RLEM, RL, null])
    assert.equal(JSON.stringify(sessions), frozen)
    assert.equal(out[1], sessions[1], "linha sem alias é a mesma referência")
  })

  it("chave de agrupamento: id quando há; sem id, a chave canônica do nome", () => {
    assert.equal(subjectIdentityKey({ disciplineId: "abc", disciplineName: "Qualquer" }), "id:abc")
    assert.equal(
      subjectIdentityKey({ disciplineId: null, disciplineName: "Língua-Portuguesa" }),
      subjectIdentityKey({ disciplineId: null, disciplineName: "lingua portuguesa" }),
    )
  })
})
