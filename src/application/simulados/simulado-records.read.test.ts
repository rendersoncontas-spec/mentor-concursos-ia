import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SupabaseClient } from "@supabase/supabase-js"

import { FakeReviewDb } from "@/lib/testing/fake-review-db"
import { must } from "@/lib/testing/must"

import { readSimuladoRecords, readSimuladoSubjects } from "./simulado-records.read"

// G2.13 — leitura compartilhada dos simulados externos (tela de Simulados,
// Estudo × desempenho e Estatísticas).

const U = "user-1"
const OTHER = "user-2"

function simulado(id: string, date: string, user = U, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: user, name: id, exam_name: null, role_name: null, simulado_date: date, source: "TEC", source_custom: null,
    exam_board: null, exam_board_custom: null, total_questions: 10, total_correct: 5, total_wrong: 5, total_blank: 0,
    score_percentage: 50, time_spent_seconds: null, notes: null, scoring_rule: "PERCENTUAL", penalty_score: null,
    penalty_per_wrong: null, net_score: null, net_percentage: null, created_at: `${date}T12:00:00Z`, updated_at: `${date}T12:00:00Z`,
    mode: null, status: "FINISHED", ...extra,
  }
}

function subject(id: string, simuladoId: string, disciplineId: string, user = U) {
  return { id, simulado_id: simuladoId, user_id: user, discipline_id: disciplineId, discipline_name: `Matéria ${disciplineId}`, questions_count: 10, correct_count: 5, wrong_count: 5, blank_count: 0 }
}

const client = (db: FakeReviewDb) => db as unknown as SupabaseClient

describe("readSimuladoRecords", () => {
  it("só simulados externos finalizados do próprio usuário, mais recente primeiro, com matérias", async () => {
    const db = new FakeReviewDb(
      {
        simulados: [
          simulado("a", "2026-09-01"),
          simulado("b", "2026-09-20"),
          simulado("interno", "2026-09-25", U, { mode: "PROVA" }),
          simulado("andamento", "2026-09-26", U, { status: "IN_PROGRESS" }),
          simulado("outro", "2026-09-27", OTHER),
        ],
        simulado_disciplines: [subject("sa", "a", "d1"), subject("sb", "b", "d2"), subject("so", "outro", "d1", OTHER)],
      },
      [],
    )
    const res = await readSimuladoRecords(client(db), U)
    assert.equal(res.error, null)
    assert.deepEqual(must(res.data).map((r) => r.id), ["b", "a"])
    assert.equal(must(res.data)[0]?.subjects[0]?.disciplineId, "d2")
  })

  it("falha nas matérias é erro — nunca simulado sem matéria (que, editado, seria salvo sem elas)", async () => {
    const db = new FakeReviewDb({ simulados: [simulado("a", "2026-09-01")], simulado_disciplines: [subject("sa", "a", "d1")] }, [])
    db.failOn({ table: "simulado_disciplines" })
    const res = await readSimuladoRecords(client(db), U)
    assert.equal(res.data, null)
    assert.ok(res.error)
  })

  it("mais de 1.000 matérias: paginado, nenhuma perdida nem repetida", async () => {
    const sims = Array.from({ length: 30 }, (_, i) => simulado(`s${String(i).padStart(2, "0")}`, "2026-09-01"))
    const subjects = sims.flatMap((s) => Array.from({ length: 60 }, (_, j) => subject(`${s.id}-${j}`, s.id, `d${j}`)))
    const db = new FakeReviewDb({ simulados: sims, simulado_disciplines: subjects }, [])
    const res = await readSimuladoSubjects(client(db), U, sims.map((s) => s.id))
    assert.equal(res.error, null)
    const total = [...res.data.values()].reduce((a, l) => a + l.length, 0)
    assert.equal(total, 1800)
    assert.ok([...res.data.values()].every((l) => new Set(l.map((r) => r.id)).size === l.length))
  })

  it("sem simulados: lista vazia, sem consultar matérias", async () => {
    const db = new FakeReviewDb({ simulados: [], simulado_disciplines: [] }, [])
    const res = await readSimuladoRecords(client(db), U)
    assert.deepEqual(res.data, [])
    assert.equal(db.requests.filter((r) => r.table === "simulado_disciplines").length, 0)
  })
})
