// ============================================================================
// Fase I.8 — testes de comportamento para os helpers que fazem o Dashboard
// distinguir "a leitura falhou" de "não há dado" (`dashboard-read-outcome.ts`).
//
// São puros (nenhum Supabase, nenhum Next.js), então testam comportamento de
// verdade — não apenas "o texto X aparece no arquivo".
// ============================================================================

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readOrFlag, resolveMaybeSingle } from "./dashboard-read-outcome"

describe("Fase I.8 — readOrFlag", () => {
  it("leitura bem-sucedida: value = dado real, failed = false", async () => {
    const outcome = await readOrFlag(Promise.resolve([{ id: "a" }, { id: "b" }]), [])
    assert.deepEqual(outcome, { value: [{ id: "a" }, { id: "b" }], failed: false })
  })

  it("leitura bem-sucedida com resultado genuinamente vazio: value = [], failed = false", async () => {
    const outcome = await readOrFlag(Promise.resolve([] as unknown[]), [])
    assert.deepEqual(outcome, { value: [], failed: false })
  })

  it("leitura que rejeita: value = fallback, failed = true (não confundir com vazio real)", async () => {
    const outcome = await readOrFlag(Promise.reject(new Error("timeout")), [] as unknown[])
    assert.deepEqual(outcome, { value: [], failed: true })
  })

  it("failed nunca muda o fallback recebido — cada chamador escolhe o default seguro", async () => {
    const outcome = await readOrFlag(Promise.reject(new Error("boom")), null)
    assert.equal(outcome.value, null)
    assert.equal(outcome.failed, true)
  })

  it("uma nova chamada com a mesma leitura funcionando de novo recupera failed=false (sem cache preso no erro anterior)", async () => {
    const primeira = await readOrFlag(Promise.reject(new Error("instável")), [] as unknown[])
    assert.equal(primeira.failed, true)

    const segunda = await readOrFlag(Promise.resolve([{ id: "x" }]), [] as unknown[])
    assert.equal(segunda.failed, false)
    assert.deepEqual(segunda.value, [{ id: "x" }])
  })
})

describe("Fase I.8 — resolveMaybeSingle (profiles/user_targets via .maybeSingle())", () => {
  it("linha existe, sem erro: value = a linha, failed = false", () => {
    const outcome = resolveMaybeSingle({ data: { id: "t1", name: "Concurso X" }, error: null })
    assert.deepEqual(outcome, { value: { id: "t1", name: "Concurso X" }, failed: false })
  })

  it("ausência real (sem erro, sem linha): value = null, failed = false", () => {
    const outcome = resolveMaybeSingle({ data: null, error: null })
    assert.deepEqual(outcome, { value: null, failed: false })
  })

  it("erro de leitura: value = null, failed = true — NÃO é o mesmo caso da ausência real", () => {
    const outcome = resolveMaybeSingle({ data: null, error: { message: "conexão perdida" } })
    assert.deepEqual(outcome, { value: null, failed: true })
  })

  it("erro de leitura mesmo se `data` viesse preenchido: nunca confiar em dado ao lado de um erro", () => {
    // PostgREST não faz isso na prática (error implica data: null), mas o
    // guard deve ser defensivo: erro presente sempre vence.
    const outcome = resolveMaybeSingle({
      data: { id: "suspeito" },
      error: { message: "algo inconsistente" },
    })
    assert.equal(outcome.failed, true)
    assert.equal(outcome.value, null)
  })

  it("resultado ausente (undefined/null) não é tratado como erro — é lido como ausência", () => {
    assert.deepEqual(resolveMaybeSingle(undefined), { value: null, failed: false })
    assert.deepEqual(resolveMaybeSingle(null), { value: null, failed: false })
  })
})
