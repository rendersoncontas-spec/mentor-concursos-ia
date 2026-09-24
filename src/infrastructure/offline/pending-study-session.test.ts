import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { buildPendingStudySession } from "./pending-study-session"

describe("buildPendingStudySession (Fase C, item 3/6)", () => {
  it("cronômetro: calcula os minutos ativos a partir dos timestamps, igual ao servidor", () => {
    const startTime = Date.now() - 12 * 60 * 1000 // 12 minutos atrás
    const session = buildPendingStudySession(
      {
        is_manual_mode: false,
        discipline_id: "d1",
        discipline_name: "Português",
        sessionStartTime: startTime,
        sessionTotalPausedMs: 0,
        sessionLastPauseStartTime: null,
      },
      "op-1",
      "user-1",
    )
    assert.equal(session.id, "pending:op-1")
    assert.equal(session._offlinePending, true)
    assert.equal(session._operationId, "op-1")
    assert.equal(session.user_id, "user-1")
    assert.equal(session.discipline_id, "d1")
    assert.equal(session.disciplines?.name, "Português")
    const activeMinutes = session.active_minutes
    assert.ok(activeMinutes !== null && activeMinutes >= 11 && activeMinutes <= 12)
  })

  it("lançamento manual: usa activeMinutes/pausedMinutes já calculados pelo formulário, sem recalcular por timestamp", () => {
    const session = buildPendingStudySession(
      {
        is_manual_mode: true,
        discipline_id: "d2",
        discipline_name: "RLM",
        activeMinutes: 30,
        pausedMinutes: 0,
      },
      "op-2",
      "user-2",
    )
    assert.equal(session.active_minutes, 30)
    assert.equal(session.paused_minutes, 0)
    assert.equal(session.completed, true)
  })

  it("lançamento manual com data/hora específica usa buildIsoFromSaoPauloDateTime, não 'agora'", () => {
    const session = buildPendingStudySession(
      {
        is_manual_mode: true,
        discipline_id: "d3",
        discipline_name: "RLM",
        activeMinutes: 20,
        study_date: "2026-09-01",
        study_time: "08:00",
      },
      "op-3",
      "user-3",
    )
    assert.ok(session.started_at.startsWith("2026-09-01"))
  })

  it("duas operações independentes (RLM 30 e RLM 20) geram dois objetos pendentes com ids diferentes — nunca colapsam (item 5)", () => {
    const a = buildPendingStudySession(
      { is_manual_mode: true, discipline_id: "d4", discipline_name: "RLM", activeMinutes: 30 },
      "op-a",
      "user-4",
    )
    const b = buildPendingStudySession(
      { is_manual_mode: true, discipline_id: "d4", discipline_name: "RLM", activeMinutes: 20 },
      "op-b",
      "user-4",
    )
    assert.notEqual(a.id, b.id)
    assert.equal(a.active_minutes, 30)
    assert.equal(b.active_minutes, 20)
  })

  it("sem discipline_name: usa um rótulo genérico em vez de quebrar a exibição", () => {
    const session = buildPendingStudySession(
      { is_manual_mode: true, discipline_id: "d5", activeMinutes: 10 },
      "op-5",
      "user-5",
    )
    assert.equal(session.disciplines?.name, "Estudo")
  })
})
