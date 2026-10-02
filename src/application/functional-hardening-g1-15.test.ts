import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it, test } from "node:test"

/**
 * G1.15 — hardening dos P1 SUSPECTS da auditoria funcional (G1.14).
 *
 * Método: cada hipótese vira reprodução executável com fakes/harness local
 * (FakeReviewDb, orquestrador de idempotência injetável, motor puro do ciclo)
 * — sem banco real, sem COMMIT concorrente, sem dados de produção.
 *
 * Vereditos possíveis por suspect: PROVADO (bug reproduzido → corrigido),
 * REFUTADO (comportamento correto demonstrado) ou PENDENTE (exige duas
 * conexões concorrentes / runtime de request — infraestrutura indisponível).
 */

process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

import { FakeReviewDb } from "@/lib/testing/fake-review-db"
import { reconcileCycleFromStudies } from "@/application/study-cycle/cycle-reconciliation.engine"
import {
  saveOrReplayStudyHistory,
  type InsertResultLike,
  type LookupResult,
} from "@/application/study-session/study-session-idempotency"
import { resolvePlanningPreferences } from "@/application/study-plan/planning-preferences"

import type * as ReviewService from "@/application/review-engine/review.service"

type Service = typeof ReviewService

let service: Service

async function loadService(): Promise<Service> {
  service ??= await import("@/application/review-engine/review.service")
  return service
}

const USER = "user-a"
const DISCIPLINE = "disc-1"
const NOW = "2026-03-10T15:00:00.000Z"
const LATER = "2026-03-10T15:20:00.000Z"

function fixture(): FakeReviewDb {
  return new FakeReviewDb({
    disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
    user_disciplines: [
      {
        user_id: USER,
        discipline_id: DISCIPLINE,
        disciplines: { id: DISCIPLINE, name: "Direito Administrativo" },
      },
    ],
    topics: [
      { id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null },
      { id: "topic-2", name: "Licitações", discipline_id: DISCIPLINE, user_id: null },
    ],
    subtopics: [],
    review_items: [],
    review_history: [],
    review_sessions: [],
    study_history: [],
  })
}

function client(db: FakeReviewDb): Parameters<Service["answerReviewCard"]>[0] {
  return db as unknown as Parameters<Service["answerReviewCard"]>[0]
}

// ─── A. review suspensa no meio da sessão ─────────────────────────────────────

describe("A. item suspenso no meio da sessão (G1.15)", () => {
  it("resposta em item suspenso é rejeitada sem gravar nada (sem corrupção)", async () => {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    const db = fixture()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)
    const headItemId = String(started.data?.card?.itemId)
    assert.ok(sessionId && headItemId)

    // Outro dispositivo/aba suspende o item da cabeça da fila.
    const head = db.rows("review_items").find((r) => r["id"] === headItemId)
    assert.ok(head)
    head["suspended_at"] = NOW

    const res = await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: headItemId, grade: 3, durationSeconds: 10, clientOperationId: "op-susp" },
      LATER,
    )
    assert.equal(res.error, "Este item está suspenso ou arquivado.")
    assert.equal(res.session, null)
    assert.equal(db.table("review_history").length, 0, "nenhum evento pode nascer de item suspenso")
    assert.equal(
      db.table("review_items").find((r) => r["id"] === headItemId)?.["review_count"],
      0,
      "memória do item intacta",
    )
    // Sessão continua ACTIVE (recovery possível, nunca "travada com perda").
    assert.equal(
      db.table("review_sessions").find((r) => r["id"] === sessionId)?.["status"],
      "ACTIVE",
    )
  })

  it("reabrir a sessão retoma no próximo card válido (recovery, sem perda)", async () => {
    const { addEditalContentToReview, startReviewSession } = await loadService()
    const db = fixture()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)
    const first = await startReviewSession(client(db), USER, {}, NOW)
    const headItemId = String(first.data?.card?.itemId)
    db.rows("review_items").find((r) => r["id"] === headItemId)!["suspended_at"] = NOW

    const reopened = await startReviewSession(client(db), USER, {}, LATER)
    assert.equal(reopened.error, null)
    assert.ok(reopened.data?.card, "fila retoma em vez de ficar vazia/travada")
    assert.notEqual(String(reopened.data?.card?.itemId), headItemId, "pula o item suspenso")
    assert.equal(reopened.data?.sessionId, first.data?.sessionId, "mesma sessão retomada")
  })
})

// ─── B. double finalize: exatamente um estudo ─────────────────────────────────

describe("B. double finalize (G1.15)", () => {
  it("perdedor da corrida confirma sem duplicar (1 linha em study_history)", async () => {
    // G1.15: o caminho do VENCEDOR (CAS + INSERT + ciclo) exige runtime de
    // request do Next; aqui se prova o invariante do PERDEDOR — segunda
    // chamada encontra o estudo e confirma sem gravar de novo.
    const { finalizeSession } = await loadService()
    const db = fixture()
    db.rows("review_sessions").push({
      id: "sess-1",
      user_id: USER,
      status: "COMPLETED",
      started_at: NOW,
      finished_at: LATER,
      items_answered: 1,
    })
    db.rows("review_items").push({
      id: "item-1",
      user_id: USER,
      discipline_id: DISCIPLINE,
      source_type: "EDITAL_TOPIC",
      source_id: "topic-1",
      review_stage: "LEARNING",
      suspended_at: null,
      archived_at: null,
    })
    db.rows("review_history").push({
      id: "ev-1",
      user_id: USER,
      review_item_id: "item-1",
      session_id: "sess-1",
      grade: 3,
      client_operation_id: "op-9",
    })
    db.rows("study_history").push({
      id: "hist-1",
      user_id: USER,
      metadata: { review_session_id: "sess-1" },
    })

    const first = await finalizeSession(client(db), USER, "sess-1", LATER)
    const second = await finalizeSession(client(db), USER, "sess-1", LATER)
    assert.equal(first.completed, true)
    assert.equal(second.completed, true)
    assert.equal(
      db.table("study_history").filter((r) => (r["metadata"] as { review_session_id?: string })?.review_session_id === "sess-1").length,
      1,
      "exatamente um estudo por sessão, mesmo finalizando duas vezes",
    )
  })
})

// ─── C. activate-first (planos e ciclo) ───────────────────────────────────────

describe("C. ativação sem strand de zero-ativo (G1.15)", () => {
  function readSource(p: string): string {
    return fs.readFileSync(path.join(process.cwd(), p), "utf-8")
  }

  it("activatePlanAction: ativa o alvo ANTES de desativar os demais", () => {
    const source = readSource("src/application/study-plan/list-plans.action.ts")
    const start = source.indexOf("export async function activatePlanAction")
    assert.notEqual(start, -1)
    const end = source.indexOf("\nexport async function", start + 1)
    const body = source.slice(start, end === -1 ? source.length : end)
    const activateAt = body.indexOf('.update({ active: true, status: "ACTIVE" })')
    const deactivateAt = body.indexOf('.update({ active: false, status: "ARCHIVED" })')
    assert.ok(activateAt !== -1 && deactivateAt !== -1)
    assert.ok(
      activateAt < deactivateAt,
      "alvo primeiro: plano inexistente aborta antes de desativar os demais",
    )
    assert.ok(body.includes('if (!activated) return { success: false, error: "Plano não encontrado." }'))
    assert.ok(body.includes(".neq("), "desativação exclui o alvo recém-ativado")
  })

  it("togglePausePlanAction: reativação segue a mesma ordem segura", () => {
    const source = readSource("src/application/study-plan/list-plans.action.ts")
    const start = source.indexOf("export async function togglePausePlanAction")
    assert.notEqual(start, -1)
    const end = source.indexOf("\nexport async function", start + 1)
    const body = source.slice(start, end === -1 ? source.length : end)
    assert.ok(body.includes('if (!reactivated) return { success: false, error: "Plano não encontrado." }'))
  })

  it("activateCycleAction: mesma ordem (alvo inexistente não zera os ciclos)", () => {
    const source = readSource("src/application/study-cycle/study-cycle.actions.ts")
    const start = source.indexOf("activateCycleAction")
    assert.notEqual(start, -1)
    const body = source.slice(start, start + 2500)
    const activateAt = body.indexOf('.update({ status: "ACTIVE" })')
    const pauseAt = body.indexOf('.update({ status: "PAUSED" })')
    assert.ok(activateAt !== -1 && pauseAt !== -1 && activateAt < pauseAt)
    assert.ok(body.includes("Ciclo não encontrado."))
  })
})

// ─── D. double-save cross-tab: mesma operação vs duas operações ───────────────

describe("D. double-save: mesma operação dedupica, operações distintas coexistem (G1.15)", () => {
  // Mensagem espelha o Postgres real (isOperationIdConflict exige o nome
  // do índice — qualquer outro 23505 continua sendo erro real).
  const CONFLICT = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "study_history_client_operation_id_idx"',
    details: null,
    hint: null,
  }

  it("mesma operação (mesmo operationId) em duas abas: 1 linha efetiva + ciclo 1x", async () => {
    let inserts = 0
    let cycles = 0
    const row = { id: "hist-X", client_operation_id: "op-X" }
    const run = () =>
      saveOrReplayStudyHistory({
        operationId: "op-X",
        insert: async (): Promise<InsertResultLike> => {
          inserts++
          if (inserts === 1) return { data: row, error: null }
          return { data: null, error: CONFLICT }
        },
        lookupByOperationId: async (): Promise<LookupResult> => ({ data: row, error: null }),
        shouldRegisterCycle: true,
        registerCycle: async () => {
          cycles++
          return { success: true }
        },
        onRevalidate: () => {},
      })
    const [a, b] = [await run(), await run()]
    assert.equal(a.success, true)
    assert.equal(b.success, true)
    assert.equal(b.idempotentReplay, true)
    assert.equal(cycles, 1, "ciclo acionado uma única vez pela operação efetiva")
  })

  it("operações distintas (operationIds diferentes): ambas legítimas pelo contrato", async () => {
    let n = 0
    const run = (op: string) =>
      saveOrReplayStudyHistory({
        operationId: op,
        insert: async (): Promise<InsertResultLike> => {
          n++
          return { data: { id: `hist-${n}`, client_operation_id: op }, error: null }
        },
        lookupByOperationId: async (): Promise<LookupResult> => {
          throw new Error("lookup indevido sem conflito")
        },
        shouldRegisterCycle: false,
        registerCycle: async () => ({ success: true }),
        onRevalidate: () => {},
      })
    const [a, b] = [await run("op-1"), await run("op-2")]
    assert.equal(a.success, true)
    assert.equal(b.success, true)
    assert.equal(n, 2)
  })
})

// ─── E. skip em round obsoleto não corrompe o cursor ──────────────────────────

describe("E. skip obsoleto é inócuo no motor (G1.15)", () => {
  const items = [
    { id: "a", disciplineId: "d", disciplineName: "A", targetSeconds: 3600 },
    { id: "b", disciplineId: "d", disciplineName: "B", targetSeconds: 3600 },
  ]
  const studies = [
    { id: "s1", cycleItemId: "a", disciplineId: "d", seconds: 3600, startedAt: "2026-03-01T10:00:00Z" },
    { id: "s2", cycleItemId: "b", disciplineId: "d", seconds: 3600, startedAt: "2026-03-02T10:00:00Z" },
  ]

  it("skip do round 1 com o ciclo já no round 2 não move nada", () => {
    const clean = reconcileCycleFromStudies(items, studies, [], [])
    assert.equal(clean.state.currentRound, 2, "round 1 fechou por estudo real")
    const withStale = reconcileCycleFromStudies(items, studies, [{ cycleItemId: "a", roundNumber: 1 }], [])
    assert.deepEqual(withStale.state, clean.state, "skip obsoleto não altera cursor/round/progresso")
  })

  it("skip do round corrente continua funcionando (não quebrou o caminho feliz)", () => {
    const partial = reconcileCycleFromStudies(
      items,
      [{ id: "s1", cycleItemId: "a", disciplineId: "d", seconds: 3600, startedAt: "2026-03-01T10:00:00Z" }],
      [{ cycleItemId: "b", roundNumber: 1 }],
      [],
    )
    assert.equal(partial.state.currentRound, 2, "skip válido do round corrente fecha a volta")
  })
})

// ─── F. first-paint: local obsoleto nunca sobe ao banco com perfil válido ─────

describe("F. first-paint de prefs (G1.15)", () => {
  it("perfil válido no banco ignora local obsoleto (sem migrateUp)", () => {
    const resolved = resolvePlanningPreferences(
      { workScale: "12x36", firstShiftDay: 5, shiftAnchorDate: "", studyDays: ["seg", "qua"] },
      {
        workScale: "normal",
        firstShiftDay: "2",
        shiftAnchorDate: "",
        studyDays: '["seg","ter","qua","qui","sex"]',
        customScale: null,
      },
    )
    assert.equal(resolved.source, "database")
    assert.equal(resolved.migrateUp, null, "nada do local sobe quando o banco tem valor")
    assert.deepEqual(resolved.studyDays, ["seg", "qua"])
  })

  it("migração preguiçosa só acontece com banco vazio (direção segura)", () => {
    const resolved = resolvePlanningPreferences(
      { workScale: null, firstShiftDay: null, shiftAnchorDate: null, studyDays: null },
      {
        workScale: "12x36",
        firstShiftDay: "5",
        shiftAnchorDate: "",
        studyDays: '["seg","qua"]',
        customScale: null,
      },
    )
    assert.equal(resolved.source, "migrated")
    assert.ok(resolved.migrateUp, "sobe uma única vez quando o banco está vazio")
  })
})

// ─── A (UI): recarregar a fila ao rejeitar item suspenso ──────────────────────

test("A (UI). modal recarrega a fila quando a resposta é rejeitada por suspensão", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/features/reviews/components/review-session-modal.tsx"),
    "utf-8",
  )
  const answerAt = source.indexOf("const answer = useCallback")
  assert.notEqual(answerAt, -1)
  const body = source.slice(answerAt, answerAt + 3000)
  assert.ok(
    body.includes("suspenso ou arquivado") && body.includes("await load()"),
    "ao rejeitar por suspensão, o modal recarrega a fila (avança ao próximo card válido) em vez de travar no card morto",
  )
})
