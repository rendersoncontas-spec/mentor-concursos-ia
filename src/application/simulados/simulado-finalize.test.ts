import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import type { SupabaseClient } from "@supabase/supabase-js"

import { FakeReviewDb } from "@/lib/testing/fake-review-db"

import {
  buildSimuladoAttemptRows,
  persistSimuladoFinalization,
  type FinalizeSimuladoInput,
} from "./simulado-finalize"

// G2.9 — pipeline de question_attempts. O simulador interno é o único caminho
// que grava tentativas; estes testes provam que a finalização é idempotente
// (uma tentativa por questão respondida, nunca duplicada), que um simulado
// encerrado/cancelado/de outro usuário não recebe tentativas e que uma falha
// na gravação não perde as respostas.
//
// LIMITAÇÃO: FakeReviewDb não é um Postgres — não aplica RLS, CHECK nem
// transações. O que ele reproduz aqui é o que importa para a idempotência: um
// UPDATE com filtro só altera (e só devolve) as linhas que ainda casam com o
// filtro, exatamente a semântica do compare-and-set usado na finalização. O
// contrato real (colunas, CHECKs, RLS) foi conferido direto no banco de
// produção, só leitura — ver docs/question-review-data-pipeline.md.

const USER_A = "user-a"
const USER_B = "user-b"
const SIM = "sim-1"

const corrected = [
  { questionId: "q1", answered: true, isCorrect: true, selectedAnswer: "A", responseTimeSeconds: 40 },
  { questionId: "q2", answered: true, isCorrect: false, selectedAnswer: "C", responseTimeSeconds: 75.6 },
  { questionId: "q3", answered: false, isCorrect: null, selectedAnswer: null, responseTimeSeconds: null },
  { questionId: "q4", answered: true, isCorrect: false, selectedAnswer: null, responseTimeSeconds: null },
]

function makeDb(status: string, owner = USER_A) {
  return new FakeReviewDb(
    {
      simulados: [{ id: SIM, user_id: owner, status, finished_at: null }],
      simulado_disciplines: [],
      question_attempts: [],
    },
    [], // question_attempts não tem índice único no schema real — é justamente o risco
  )
}

function client(db: FakeReviewDb): SupabaseClient {
  return db as unknown as SupabaseClient
}

function input(userId: string, headerStatus: string): FinalizeSimuladoInput {
  return {
    userId,
    simuladoId: SIM,
    headerStatus,
    finishedUpdate: { status: "FINISHED", finished_at: "2026-10-03T12:00:00.000Z", total_questions: 4 },
    disciplineRows: [{ simulado_id: SIM, user_id: userId, discipline_name: "Português", questions_count: 4 }],
    attempts: buildSimuladoAttemptRows(corrected, userId),
  }
}

describe("buildSimuladoAttemptRows", () => {
  it("gera uma linha por questão respondida — em branco não é tentativa", () => {
    const rows = buildSimuladoAttemptRows(corrected, USER_A)
    assert.deepEqual(rows.map((r) => r.question_id), ["q1", "q2", "q4"])
  })

  it("acerto: correct=true e não exige revisão", () => {
    const [q1] = buildSimuladoAttemptRows(corrected, USER_A)
    assert.equal(q1?.correct, true)
    assert.equal(q1?.review_required, false)
    assert.equal(q1?.selected_answer, "A")
    assert.equal(q1?.response_time_seconds, 40)
  })

  it("erro: correct=false e marca review_required", () => {
    const q2 = buildSimuladoAttemptRows(corrected, USER_A)[1]
    assert.equal(q2?.correct, false)
    assert.equal(q2?.review_required, true)
    assert.equal(q2?.response_time_seconds, 76, "inteiro, como a coluna integer exige")
  })

  it("respeita as colunas NOT NULL e os CHECKs reais (selected_answer, tempo, confiança, mistake_type, origem)", () => {
    const q4 = buildSimuladoAttemptRows(corrected, USER_A)[2]
    assert.equal(q4?.selected_answer, "")
    assert.equal(q4?.response_time_seconds, 0)
    assert.equal(q4?.confidence_level, 3) // CHECK 1..5
    assert.equal(q4?.mistake_type, null) // CHECK aceita NULL
    assert.equal(q4?.attempt_source, "SIMULADO")
  })

  it("user_id vem do parâmetro do servidor, nunca de um dado da questão", () => {
    for (const row of buildSimuladoAttemptRows(corrected, USER_B)) assert.equal(row.user_id, USER_B)
  })
})

describe("persistSimuladoFinalization", () => {
  it("finaliza um simulado em andamento: FINISHED, tentativas e agregados gravados", async () => {
    const db = makeDb("IN_PROGRESS")
    const out = await persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS"))
    assert.equal(out.status, "FINALIZED")
    assert.equal(db.table("simulados")[0]?.["status"], "FINISHED")
    assert.equal(db.table("question_attempts").length, 3)
    assert.equal(db.table("simulado_disciplines").length, 1)
  })

  it("segunda finalização (duplo clique / retry após sucesso) não duplica tentativas", async () => {
    const db = makeDb("IN_PROGRESS")
    await persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS"))
    // A segunda requisição leu o cabeçalho ANTES da primeira terminar (estado antigo).
    const again = await persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS"))
    assert.equal(again.status, "ALREADY_CLOSED")
    assert.equal(db.table("question_attempts").length, 3)
  })

  it("duas finalizações concorrentes: só uma grava", async () => {
    const db = makeDb("IN_PROGRESS")
    const outs = await Promise.all([
      persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS")),
      persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS")),
    ])
    assert.deepEqual(outs.map((o) => o.status).sort(), ["ALREADY_CLOSED", "FINALIZED"])
    assert.equal(db.table("question_attempts").length, 3)
    assert.equal(db.table("simulado_disciplines").length, 1)
  })

  it("simulado já FINISHED (aba antiga/reload): nenhuma escrita", async () => {
    const db = makeDb("FINISHED")
    const out = await persistSimuladoFinalization(client(db), input(USER_A, "FINISHED"))
    assert.equal(out.status, "ALREADY_CLOSED")
    assert.equal(db.requests.filter((r) => r.method !== "select").length, 0)
    assert.equal(db.table("question_attempts").length, 0)
  })

  it("simulado CANCELED continua cancelado e não recebe tentativas", async () => {
    const db = makeDb("CANCELED")
    const out = await persistSimuladoFinalization(client(db), input(USER_A, "CANCELED"))
    assert.equal(out.status, "ALREADY_CLOSED")
    assert.equal(db.table("simulados")[0]?.["status"], "CANCELED")
    assert.equal(db.table("question_attempts").length, 0)
  })

  it("usuário diferente não finaliza nem grava tentativas no simulado de outro", async () => {
    const db = makeDb("IN_PROGRESS", USER_A)
    const out = await persistSimuladoFinalization(client(db), input(USER_B, "IN_PROGRESS"))
    assert.equal(out.status, "ALREADY_CLOSED")
    assert.equal(db.table("simulados")[0]?.["status"], "IN_PROGRESS")
    assert.equal(db.table("question_attempts").length, 0)
    assert.equal(db.table("simulado_disciplines").length, 0)
  })

  it("falha ao gravar tentativas: erro devolvido, simulado volta a IN_PROGRESS e o retry grava uma vez só", async () => {
    const db = makeDb("IN_PROGRESS")
    db.failOn({ table: "question_attempts", method: "insert", times: 1 })
    const failed = await persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS"))
    assert.equal(failed.status, "FAILED")
    assert.ok(failed.error)
    assert.equal(db.table("simulados")[0]?.["status"], "IN_PROGRESS")
    assert.equal(db.table("simulados")[0]?.["finished_at"], null)
    assert.equal(db.table("question_attempts").length, 0)

    const retried = await persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS"))
    assert.equal(retried.status, "FINALIZED")
    assert.equal(db.table("question_attempts").length, 3)
    assert.equal(db.table("simulado_disciplines").length, 1, "agregado reescrito, não acumulado")
  })

  it("erro na transição de status: nada é gravado", async () => {
    const db = makeDb("IN_PROGRESS")
    db.failOn({ table: "simulados", method: "update", times: 1 })
    const out = await persistSimuladoFinalization(client(db), input(USER_A, "IN_PROGRESS"))
    assert.equal(out.status, "FAILED")
    assert.equal(db.table("question_attempts").length, 0)
    assert.equal(db.table("simulado_disciplines").length, 0)
  })

  it("simulado sem nenhuma resposta: finaliza sem tentar inserir lista vazia", async () => {
    const db = makeDb("IN_PROGRESS")
    const out = await persistSimuladoFinalization(client(db), { ...input(USER_A, "IN_PROGRESS"), attempts: [] })
    assert.equal(out.status, "FINALIZED")
    assert.equal(db.requests.filter((r) => r.table === "question_attempts").length, 0)
  })
})

describe("wiring — simulados.actions.ts", () => {
  const src = readFileSync("src/application/simulados/simulados.actions.ts", "utf-8")

  it("a finalização passa pelo compare-and-set e não insere question_attempts diretamente", () => {
    assert.ok(src.includes("persistSimuladoFinalization(supabase"))
    assert.ok(!src.includes('from("question_attempts").insert'), "insert direto voltaria a permitir duplicatas")
    assert.ok(!src.includes('update(update).eq("id", simuladoId)'), "update de status sem condição removido")
  })

  it("finishSimuladoAction não sobrescreve mais finished_at a cada chamada", () => {
    const fn = src.slice(src.indexOf("export async function finishSimuladoAction"), src.indexOf("export async function getSimuladoResultAction"))
    assert.ok(!fn.includes(".update("), "nenhum update fora da transição condicional")
  })

  it("a contagem de 'só erradas' da configuração usa a mesma leitura ordenada do pool", () => {
    const fn = src.slice(src.indexOf("export async function getSimuladorConfigAction"), src.indexOf("export async function previewSimuladoAction"))
    assert.ok(fn.includes("fetchLastAttemptMap(supabase, user.id)"))
    assert.ok(!fn.includes('.from("question_attempts")'))
  })
})
