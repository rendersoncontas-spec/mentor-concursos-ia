import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { SimuladoRecordInput } from "@/domain/simulados/types"
import { FakeReviewDb } from "@/lib/testing/fake-review-db"

import { deleteSimuladoRecord, saveSimuladoRecord } from "./simulado-record-persistence"

// G2.10 — persistência dos simulados externos com um banco em memória.
// LIMITAÇÃO: o duplo não aplica RLS nem CHECKs; o isolamento testado aqui é o
// do código (todo acesso filtra por user_id do servidor e mode nulo). A RLS
// real de simulados/simulado_disciplines (auth.uid() = user_id em todas as
// operações) foi conferida no banco de produção, somente leitura.

const TODAY = "2026-10-03"
const A = "user-a"
const B = "user-b"
const PT = "11111111-1111-4111-8111-111111111111"
const CT = "22222222-2222-4222-8222-222222222222"
const REQ = "33333333-3333-4333-8333-333333333333"
const OTHER_REQ = "44444444-4444-4444-8444-444444444444"

function db(extra: Record<string, Record<string, unknown>[]> = {}) {
  return new FakeReviewDb(
    {
      simulados: [],
      simulado_disciplines: [],
      disciplines: [
        { id: PT, name: "Língua Portuguesa" },
        { id: CT, name: "Contabilidade Geral" },
      ],
      ...extra,
    },
    [{ table: "simulados", columns: ["id"] }], // PK real
  )
}
const client = (d: FakeReviewDb) => d as unknown as SupabaseClient

function input(overrides: Partial<SimuladoRecordInput> = {}): SimuladoRecordInput {
  return {
    name: "Simulado 1",
    examName: "Receita",
    roleName: "Auditor",
    simuladoDate: "2026-09-20",
    source: "TEC",
    exam_board: "FGV",
    totalQuestions: 40,
    totalCorrect: 28,
    totalWrong: 12,
    totalBlank: 0,
    scoringRule: "PERCENTUAL",
    subjects: [
      { disciplineId: PT, disciplineName: "Português", questionsCount: 20, correctCount: 16, wrongCount: 4 },
      { disciplineId: CT, disciplineName: "Contabilidade", questionsCount: 20, correctCount: 12, wrongCount: 8 },
    ],
    ...overrides,
  }
}

describe("criar", () => {
  it("grava cabeçalho com totais derivados e as matérias com o nome do catálogo", async () => {
    const d = db()
    const res = await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    assert.equal(res.error, null)
    assert.equal(res.data?.id, REQ)
    const [sim] = d.table("simulados")
    assert.equal(sim?.["user_id"], A)
    assert.equal(sim?.["total_questions"], 40)
    assert.equal(sim?.["score_percentage"], 70)
    assert.equal(sim?.["status"], "FINISHED")
    assert.deepEqual(d.table("simulado_disciplines").map((r) => r["discipline_name"]).sort(), ["Contabilidade Geral", "Língua Portuguesa"])
  })

  it("matéria fora do catálogo é recusada antes de gravar", async () => {
    const d = db()
    const bad = input({ subjects: [{ disciplineId: OTHER_REQ, disciplineName: "Inventada", questionsCount: 10, correctCount: 5, wrongCount: 5 }] })
    const res = await saveSimuladoRecord(client(d), A, bad, TODAY)
    assert.match(res.error ?? "", /não foi encontrada no catálogo/)
    assert.equal(d.table("simulados").length, 0)
  })

  it("dados inválidos não chegam ao banco", async () => {
    const d = db()
    const res = await saveSimuladoRecord(client(d), A, input({ simuladoDate: "2030-01-01" }), TODAY)
    assert.match(res.error ?? "", /futuro/)
    assert.equal(d.requests.filter((r) => r.method !== "select").length, 0)
  })

  it("duplo clique / reenvio com o mesmo requestId não duplica (e aplica os valores mais recentes)", async () => {
    const d = db()
    await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    const again = await saveSimuladoRecord(client(d), A, input({ requestId: REQ, name: "Simulado 1 (corrigido)" }), TODAY)
    assert.equal(again.data?.id, REQ)
    assert.equal(d.table("simulados").length, 1)
    assert.equal(d.table("simulados")[0]?.["name"], "Simulado 1 (corrigido)")
    assert.equal(d.table("simulado_disciplines").length, 2, "matérias substituídas, não acumuladas")
  })

  it("dois envios concorrentes do mesmo formulário geram um único registro", async () => {
    const d = db()
    const results = await Promise.all([
      saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY),
      saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY),
    ])
    assert.ok(results.every((r) => r.data?.id === REQ))
    assert.equal(d.table("simulados").length, 1)
  })

  it("formulários diferentes (requestIds diferentes) criam registros diferentes", async () => {
    const d = db()
    await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    await saveSimuladoRecord(client(d), A, input({ requestId: OTHER_REQ }), TODAY)
    assert.equal(d.table("simulados").length, 2)
  })

  it("falha ao gravar matérias desfaz o cabeçalho; o reenvio cria tudo", async () => {
    const d = db()
    d.failOn({ table: "simulado_disciplines", method: "insert", times: 1 })
    const failed = await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    assert.match(failed.error ?? "", /não foi registrado/)
    assert.equal(d.table("simulados").length, 0)
    const retried = await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    assert.equal(retried.error, null)
    assert.equal(d.table("simulados").length, 1)
    assert.equal(d.table("simulado_disciplines").length, 2)
  })

  it("requestId de um simulado de OUTRO usuário não o alcança", async () => {
    const d = db({ simulados: [{ id: REQ, user_id: B, name: "do B", mode: null, status: "FINISHED" }] })
    const res = await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    assert.ok(res.error)
    assert.equal(d.table("simulados").length, 1)
    assert.equal(d.table("simulados")[0]?.["name"], "do B")
  })
})

describe("editar", () => {
  async function seeded() {
    const d = db()
    await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    return d
  }

  it("atualiza o cabeçalho e substitui as matérias", async () => {
    const d = await seeded()
    const res = await saveSimuladoRecord(
      client(d),
      A,
      input({ id: REQ, subjects: [{ disciplineId: PT, disciplineName: "Português", questionsCount: 10, correctCount: 9, wrongCount: 1 }] }),
      TODAY,
    )
    assert.equal(res.error, null)
    assert.equal(d.table("simulados")[0]?.["total_questions"], 10)
    assert.equal(d.table("simulado_disciplines").length, 1)
  })

  it("falha ao gravar as novas matérias: nada muda (antes o simulado ficava sem matérias)", async () => {
    const d = await seeded()
    d.failOn({ table: "simulado_disciplines", method: "insert", times: 1 })
    const res = await saveSimuladoRecord(client(d), A, input({ id: REQ, name: "Novo nome" }), TODAY)
    assert.match(res.error ?? "", /Nada foi alterado/)
    assert.equal(d.table("simulados")[0]?.["name"], "Simulado 1")
    assert.equal(d.table("simulado_disciplines").length, 2)
  })

  it("falha ao atualizar o cabeçalho: as matérias novas são removidas e as antigas ficam", async () => {
    const d = await seeded()
    d.failOn({ table: "simulados", method: "update", times: 1 })
    const res = await saveSimuladoRecord(client(d), A, input({ id: REQ, name: "Novo nome" }), TODAY)
    assert.match(res.error ?? "", /Nada foi alterado/)
    assert.equal(d.table("simulado_disciplines").length, 2)
    assert.equal(d.table("simulados")[0]?.["name"], "Simulado 1")
  })

  it("trocar de 'por matéria' para 'resultado geral' remove as matérias", async () => {
    const d = await seeded()
    await saveSimuladoRecord(client(d), A, input({ id: REQ, subjects: [], totalQuestions: 50, totalCorrect: 40, totalWrong: 10 }), TODAY)
    assert.equal(d.table("simulado_disciplines").length, 0)
    assert.equal(d.table("simulados")[0]?.["total_questions"], 50)
  })

  it("usuário B não edita o simulado de A", async () => {
    const d = await seeded()
    const res = await saveSimuladoRecord(client(d), B, input({ id: REQ, name: "hack" }), TODAY)
    assert.equal(res.error, "Simulado não encontrado.")
    assert.equal(d.table("simulados")[0]?.["name"], "Simulado 1")
    assert.equal(d.table("simulado_disciplines").length, 2)
  })

  it("simulado do simulador interno (mode preenchido) não é editável pelo formulário de registro", async () => {
    const d = db({ simulados: [{ id: REQ, user_id: A, name: "interno", mode: "PERSONALIZADO", status: "FINISHED" }] })
    const res = await saveSimuladoRecord(client(d), A, input({ id: REQ }), TODAY)
    assert.equal(res.error, "Simulado não encontrado.")
    assert.equal(d.table("simulados")[0]?.["name"], "interno")
  })
})

describe("excluir", () => {
  it("exclui o próprio registro", async () => {
    const d = db()
    await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    assert.equal((await deleteSimuladoRecord(client(d), A, REQ)).error, null)
    assert.equal(d.table("simulados").length, 0)
  })

  it("B não exclui o registro de A; id inexistente ou inválido responde 'não encontrado'", async () => {
    const d = db()
    await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    assert.equal((await deleteSimuladoRecord(client(d), B, REQ)).error, "Simulado não encontrado.")
    assert.equal((await deleteSimuladoRecord(client(d), A, OTHER_REQ)).error, "Simulado não encontrado.")
    assert.equal((await deleteSimuladoRecord(client(d), A, "x")).error, "Simulado não encontrado.")
    assert.equal(d.table("simulados").length, 1)
  })

  it("segundo clique em excluir não finge sucesso", async () => {
    const d = db()
    await saveSimuladoRecord(client(d), A, input({ requestId: REQ }), TODAY)
    await deleteSimuladoRecord(client(d), A, REQ)
    assert.equal((await deleteSimuladoRecord(client(d), A, REQ)).error, "Simulado não encontrado.")
  })
})
