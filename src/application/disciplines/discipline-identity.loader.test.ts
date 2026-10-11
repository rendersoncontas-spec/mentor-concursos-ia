import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SupabaseClient } from "@supabase/supabase-js"

import { canonicalIdOf, identityDisplayName } from "@/domain/disciplines/discipline-identity"
import { FakeReviewDb } from "@/lib/testing/fake-review-db"

import { loadDisciplineIdentity } from "./discipline-identity.loader"

// G2.12 — leitura da identidade canônica (catálogo + custom_name do usuário).

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

const USER_A = "user-a"
const USER_B = "user-b"

function catalogDb(withCanonicalColumn = true) {
  const disciplines = CATALOG.map((d) =>
    withCanonicalColumn ? { id: d.id, name: d.name, canonical_discipline_id: d.canonicalDisciplineId ?? null } : { id: d.id, name: d.name },
  )
  return new FakeReviewDb(
    {
      disciplines,
      user_disciplines: [
        { id: "ud1", user_id: USER_A, discipline_id: RLEM, custom_name: "Lógica (A)", created_at: "2026-01-01" },
        { id: "ud2", user_id: USER_B, discipline_id: RLEM, custom_name: "Lógica (B)", created_at: "2026-01-01" },
      ],
    },
    [],
  )
}

/** Simula o banco SEM a migration G2.12: selecionar a coluna nova falha (42703). */
function withoutCanonicalColumn(db: FakeReviewDb): SupabaseClient {
  return {
    from(table: string) {
      const q = db.from(table)
      const originalSelect = q.select.bind(q)
      ;(q as unknown as { select: (c?: string) => unknown }).select = (cols?: string) => {
        if (table === "disciplines" && cols?.includes("canonical_discipline_id")) {
          return {
            in: async () => ({ data: null, error: { code: "42703", message: "column disciplines.canonical_discipline_id does not exist" } }),
          }
        }
        return originalSelect(cols)
      }
      return q
    },
  } as unknown as SupabaseClient
}

describe("loadDisciplineIdentity", () => {
  it("carrega a canônica que não estava entre os ids e usa só o custom_name do PRÓPRIO usuário", async () => {
    const db = catalogDb()
    const res = await loadDisciplineIdentity(db as unknown as SupabaseClient, USER_A, [RLM, RL])
    assert.equal(res.error, null)
    assert.equal(canonicalIdOf(res.data, RLM), RLEM)
    assert.equal(identityDisplayName(res.data, RLM, "x"), "Lógica (A)")
    assert.notEqual(identityDisplayName(res.data, RLM, "x"), "Lógica (B)")
    const udReads = db.requests.filter((r) => r.table === "user_disciplines")
    assert.ok(udReads.length >= 1)
  })

  it("usuário B vê o próprio nome; a identidade (global) é a mesma", async () => {
    const res = await loadDisciplineIdentity(catalogDb() as unknown as SupabaseClient, USER_B, [RLM])
    assert.equal(canonicalIdOf(res.data, RLM), RLEM)
    assert.equal(identityDisplayName(res.data, RLM, "x"), "Lógica (B)")
  })

  it("banco sem a migration: cada id é ele mesmo, sem erro", async () => {
    const db = catalogDb(false)
    const res = await loadDisciplineIdentity(withoutCanonicalColumn(db), USER_A, [RLM, TI])
    assert.equal(res.error, null)
    assert.equal(canonicalIdOf(res.data, RLM), RLM)
    assert.equal(canonicalIdOf(res.data, TI), TI)
    assert.equal(identityDisplayName(res.data, TI, "x"), "Tecnologia da Informação")
  })

  it("sem ids não consulta nada; erro real de leitura do catálogo é devolvido", async () => {
    const db = catalogDb()
    const empty = await loadDisciplineIdentity(db as unknown as SupabaseClient, USER_A, [])
    assert.equal(empty.error, null)
    assert.equal(db.requests.length, 0)
    db.failOn({ table: "disciplines" })
    const failed = await loadDisciplineIdentity(db as unknown as SupabaseClient, USER_A, [RL])
    assert.ok(failed.error)
  })

  it("lotes de 100 ids: 250 ids = 3 leituras do catálogo (sem N+1)", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `d${String(i).padStart(3, "0")}`, name: `Matéria ${i}`, canonical_discipline_id: null }))
    const db = new FakeReviewDb({ disciplines: many, user_disciplines: [] }, [])
    const res = await loadDisciplineIdentity(db as unknown as SupabaseClient, USER_A, many.map((m) => m.id))
    assert.equal(res.error, null)
    assert.equal(db.requests.filter((r) => r.table === "disciplines").length, 3)
    assert.equal(Object.keys(res.data.displayName).length, 250)
  })
})
