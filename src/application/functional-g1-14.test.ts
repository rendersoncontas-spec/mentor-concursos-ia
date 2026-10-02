import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it, test } from "node:test"

/**
 * G1.14 — auditoria funcional dos fluxos principais.
 *
 * Cada teste abaixo ancora um comportamento real de ponta a ponta (ou uma
 * regressão encontrada nesta fase) com evidência executável — sem asserts
 * sobre strings de UI. Fluxos já cobertos por suítes próprias (ciclo →
 * rebuild/canônico, review → finalize idempotente, offline → sync queue,
 * paginação/timezone) NÃO são duplicados aqui; ver:
 * cycle-reconciliation.engine.test.ts, review-finalize-idempotency,
 * save-study-session.test.ts, ranking-timezone.wiring.test.ts.
 */

import { matchDraftToCatalog } from "@/features/edital-importer/lib/matcher"
import type { EditalDraft } from "@/features/edital-importer/lib/types"
import {
  deleteTopicProgress,
  fetchTopicProgress,
  normalizeTopicKey,
  saveTopicChecked,
} from "@/application/edital/edital-topic-progress.service"
import { isSafeHref } from "@/domain/library/library-url"
import { studyMinutesFromMs } from "@/domain/study-session/study-duration"
import {
  clampIntOrNull,
  finiteOrNull,
  isParsableSaoPauloDateTime,
} from "@/domain/study-session/study-input"
import {
  parseStudyDays,
  resolvePlanningPreferences,
} from "@/application/study-plan/planning-preferences"

// ─── Fake Supabase mínimo (cadeias usadas pelo serviço de progresso) ─────────

function makeFakeSupabase() {
  const rows = new Map<string, { user_id: string; target_id: string; topic_key: string; checked: boolean }>()
  const owned = new Set<string>()
  const api = {
    own(userId: string, targetId: string) {
      owned.add(`${userId}|${targetId}`)
    },
    from(table: string) {
      const filters: Record<string, string> = {}
      const builder = {
        select() {
          return builder
        },
        eq(k: string, v: string) {
          filters[k] = v
          return builder
        },
        async maybeSingle() {
          if (table === "user_targets") {
            const ok = owned.has(`${filters["user_id"]}|${filters["id"]}`)
            return { data: ok ? { id: filters["id"] } : null, error: null }
          }
          return { data: null, error: null }
        },
        async upsert(payload: { user_id: string; target_id: string; topic_key: string; checked: boolean }) {
          rows.set(`${payload.user_id}|${payload.target_id}|${payload.topic_key}`, { ...payload })
          return { error: null }
        },
        delete() {
          const dels: Record<string, string> = {}
          const delBuilder = {
            eq(k: string, v: string) {
              dels[k] = v
              return delBuilder
            },
            then(resolve: (v: { error: null }) => unknown) {
              for (const [k, r] of rows) {
                if (Object.entries(dels).every(([fk, fv]) => (r as Record<string, unknown>)[fk] === fv)) {
                  rows.delete(k)
                }
              }
              return Promise.resolve({ error: null }).then(resolve)
            },
          }
          return delBuilder
        },
        then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
          const data = [...rows.values()].filter((r) =>
            Object.entries(filters).every(([fk, fv]) => (r as Record<string, unknown>)[fk] === fv),
          )
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return builder
    },
  }
  return api
}

// ─── 1–2. importação → persistência (preview segue a regra do confirm) ───────

const CATALOG = [{ id: "d1", name: "Direito Penal – Parte Geral" }]

function draftWith(names: string[]): EditalDraft {
  return {
    metadata: {},
    disciplines: names.map((name) => ({ name, confidence: 0.9, lowConfidence: false, topics: [] })),
  }
}

test("1. importação → persistência: igualdade exata (acentos/caixa) marca existente", () => {
  const matched = matchDraftToCatalog(
    draftWith(["DIREITO PENAL – PARTE GERAL"]),
    [...CATALOG, { id: "d2", name: "Língua Portuguesa" }],
    [],
    [],
  )
  assert.equal(matched.disciplines[0]?.disciplineId, "d1")
  assert.equal(matched.disciplines[0]?.isNew, false)
})

test("2. importação → persistência: nome parcial NÃO marca existente (vira linha nova no confirm)", () => {
  // G1.14: "Direito Penal" vs "Direito Penal – Parte Geral" — o preview
  // afirmava "existente" e a confirmação inseria disciplina nova.
  const matched = matchDraftToCatalog(draftWith(["Direito Penal"]), CATALOG, [], [])
  assert.equal(matched.disciplines[0]?.disciplineId, null)
  assert.equal(matched.disciplines[0]?.isNew, true)
})

// ─── 3–5. edital → progresso (server como fonte de verdade) ──────────────────

describe("edital → progresso", () => {
  it("3. check → fetch devolve o mesmo estado (round-trip)", async () => {
    const db = makeFakeSupabase()
    db.own("u1", "t1")
    const saved = await saveTopicChecked(db as never, "u1", "t1", "  Tópico A ", true)
    assert.equal(saved.status, "saved")
    const read = await fetchTopicProgress(db as never, "u1", "t1")
    assert.equal(read.status, "ok")
    assert.deepEqual(read.checked, { "Tópico A": true })
  })

  it("4. excluir tópico remove o progresso (sem inflar 'x de y')", async () => {
    // G1.14: tópico deletado mantinha a chave true e o % ficava inflado.
    const db = makeFakeSupabase()
    db.own("u1", "t1")
    await saveTopicChecked(db as never, "u1", "t1", "Tópico B", true)
    const deleted = await deleteTopicProgress(db as never, "u1", "t1", "Tópico B")
    assert.equal(deleted.status, "deleted")
    const read = await fetchTopicProgress(db as never, "u1", "t1")
    assert.deepEqual(read.checked, {})
  })

  it("5. erro honesto: sem usuário/alvo ou chave inválida não escreve", async () => {
    const db = makeFakeSupabase()
    assert.equal((await saveTopicChecked(db as never, "", "t1", "X", true)).status, "invalid-target")
    assert.equal((await saveTopicChecked(db as never, "u1", "t1", "   ", true)).status, "invalid-target")
    assert.equal((await deleteTopicProgress(db as never, "u1", "t1", "")).status, "invalid-target")
    assert.equal(normalizeTopicKey(""), null)
    assert.equal(normalizeTopicKey("x".repeat(321)), null)
  })
})

// ─── 6. edital link: só http(s) vira link ────────────────────────────────────

test("6. edital → link: javascript:/data: nunca viram <a href>", () => {
  assert.equal(isSafeHref("https://www.qconcursos.com/questoes/cadernos/1"), true)
  assert.equal(isSafeHref("http://exemplo.com/x.pdf"), true)
  assert.equal(isSafeHref("javascript:alert(1)"), false)
  assert.equal(isSafeHref("JaVaScRiPt:alert(1)"), false)
  assert.equal(isSafeHref("data:text/html,<h1>x</h1>"), false)
  assert.equal(isSafeHref("www.qconcursos.com/sem-protocolo"), false)
  assert.equal(isSafeHref(""), false)
})

// ─── 7–8. sessão → histórico (duração e validação honestas) ──────────────────

describe("sessão → histórico", () => {
  it("7. cronômetro: ms viram minutos inteiros (nunca NaN/negativo)", () => {
    assert.equal(studyMinutesFromMs(60_000), 1)
    assert.equal(studyMinutesFromMs(89_999), 1)
    assert.equal(studyMinutesFromMs(90_000), 2)
    assert.equal(studyMinutesFromMs(Number.NaN), 0)
    assert.equal(studyMinutesFromMs(-5_000), 0)
    assert.equal(studyMinutesFromMs(undefined), 0)
  })

  it("8. erro → correto: input inválido vira NULL/limite, nunca NaN silencioso", () => {
    assert.equal(finiteOrNull("abc"), null)
    assert.equal(finiteOrNull(Number.NaN), null)
    assert.equal(finiteOrNull(Infinity), null)
    assert.equal(finiteOrNull(""), null)
    assert.equal(finiteOrNull("42.5"), 42.5)
    assert.equal(clampIntOrNull(9, 1, 5), 5)
    assert.equal(clampIntOrNull(0, 1, 5), 1)
    assert.equal(clampIntOrNull("abc", 1, 5), null)
    assert.equal(isParsableSaoPauloDateTime("", null), false)
    assert.equal(isParsableSaoPauloDateTime("não-uma-data", "10:00"), false)
    assert.equal(isParsableSaoPauloDateTime("2026-09-29", "10:00"), true)
  })
})

// ─── 9. sessão → estatísticas (cache invalidado no caminho de criação) ───────

test("9. sessão → estatísticas: salvar estudo invalida o cache de 5min", () => {
  // G1.14: revalidatePath não limpa o Map em memória — Estatísticas ficava
  // obsoleta até 5min após salvar. O onRevalidate do save precisa chamar o
  // invalidate com o usuário efetivo.
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/application/study-session/study-session.action.ts"),
    "utf-8",
  )
  const start = source.indexOf("onRevalidate: () => {")
  assert.notEqual(start, -1, "saveStudySessionAction deve ter onRevalidate")
  const body = source.slice(start, source.indexOf("},", start) + 2)
  assert.ok(body.includes("revalidatePath(\"/estatisticas\")"), "deve revalidar /estatisticas")
  assert.ok(
    body.includes("invalidateStatisticsCenterCache(user.id)"),
    "deve invalidar o cache em memória de Estatísticas com o usuário efetivo",
  )
})

// ─── 10–11. preferences → profile / planejamento → plano ─────────────────────

describe("preferences → profile", () => {
  it("10. banco vence cache local obsoleto (sem ressuscitar valor antigo)", () => {
    const resolved = resolvePlanningPreferences(
      { workScale: "12x36", firstShiftDay: 5, shiftAnchorDate: "", studyDays: ["seg", "qua"] },
      {
        workScale: "normal",
        firstShiftDay: "2",
        shiftAnchorDate: "",
        studyDays: '["seg","ter"]',
        customScale: null,
      },
    )
    assert.equal(resolved.source, "database")
    assert.equal(resolved.workScale, "12x36")
    assert.deepEqual(resolved.studyDays, ["seg", "qua"])
  })

  it("11. dias duplicados/lixo não viram planejamento (dedupe + rejeição)", () => {
    assert.deepEqual(parseStudyDays(["seg", "SEG", "ter", "seg"]), ["seg", "ter"])
    assert.equal(parseStudyDays(["seg", "não-dia"]), null)
    assert.equal(parseStudyDays([]), null)
    assert.equal(parseStudyDays("lixo"), null)
  })
})

// ─── 12. ciclo → sessão: vínculo preservado para o motor do ciclo ────────────

test("12. ciclo → sessão → offline: snapshot pendente segue a mesma regra de study_source da action", async () => {
  // O study_source do banco é restrito pelo CHECK (sem "CYCLE"); o snapshot
  // offline precisa mapear IGUAL à action, senão o Histórico mostra uma
  // origem antes do sync e outra depois. Ancora o contrato compartilhado.
  const { buildPendingStudySession } = await import("@/infrastructure/offline/pending-study-session")
  const pending = buildPendingStudySession(
    {
      discipline_id: "d1",
      discipline_name: "Direito Penal",
      studyType: "TEORIA",
      study_source: "CYCLE",
      sessionStartTime: Date.now() - 3_600_000,
      sessionTotalPausedMs: 0,
      planned_minutes: 60,
      energy_level: 3,
    },
    "op-1",
    "u1",
  )
  assert.equal(pending.study_source, "FREE")
  assert.equal(pending._operationId, "op-1")
  assert.equal(pending.user_id, "u1")
  const activeMinutes = pending.active_minutes ?? 0
  assert.ok(activeMinutes >= 59 && activeMinutes <= 60)
  const roundTripped = JSON.parse(JSON.stringify(pending)) as typeof pending
  assert.equal(roundTripped.study_source, pending.study_source)
  assert.equal(roundTripped._operationId, "op-1")
})
