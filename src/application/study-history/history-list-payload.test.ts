import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"

import { filterHistorySessions, type HistoryFilters } from "@/features/history/lib/filter-history-sessions"
import { selectVisibleDayGroups } from "@/features/history/lib/visible-day-groups"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"

import {
  HISTORY_LIST_METADATA_KEYS,
  HISTORY_LIST_SELECT,
  packHistoryList,
  unpackHistoryList,
  type HistoryListDbRow,
} from "./history-list-payload"
import { getAllUserHistory, getUserHistoryList, getUserHistorySession } from "./study-history.service"

/**
 * Fase F.2 — Histórico com payload enxuto. Compara, com as MESMAS sessões, a
 * lista antiga (linha completa `*` + disciplina) com a nova (payload enxuto):
 * filtros, totais, agrupamento por dia, ordem e campos exibidos devem ser
 * idênticos; o payload deve ser bem menor; a edição continua recebendo a
 * linha completa.
 */

const USER = "u1"

function fullRows(n: number) {
  const base = Date.UTC(2020, 9, 25, 15)
  return Array.from({ length: n }, (_, k) => ({
    id: `h${String(k).padStart(6, "0")}`,
    user_id: USER,
    discipline_id: k % 13 === 0 ? null : `d${k % 9}`,
    started_at: new Date(base + Math.floor(k / 2) * 6.5 * 3_600_000).toISOString(),
    finished_at: new Date(base + Math.floor(k / 2) * 6.5 * 3_600_000 + 3_600_000).toISOString(),
    created_at: new Date(base + k * 1000).toISOString(),
    duration_minutes: 10 + (k % 150),
    active_minutes: 10 + (k % 150),
    paused_minutes: 0,
    planned_minutes: null,
    completed: true,
    interrupted: false,
    energy_level: 3,
    difficulty: 2,
    focus_score: 4,
    mood: null,
    notes: k % 5 === 0 ? `anotação longa da sessão ${k} `.repeat(4) : null,
    study_source: "FREE",
    study_type: k % 3 === 0 ? "QUESTOES" : "TEORIA",
    technique: k % 2 === 0 ? "POMODORO" : null,
    origin_source: k % 4 === 0 ? "planilha" : null,
    origin_source_name: k % 4 === 0 ? "Minha planilha" : null,
    origin_imported_at: k % 4 === 0 ? new Date(base).toISOString() : null,
    import_batch_id: k % 4 === 0 ? "batch-1" : null,
    client_operation_id: null,
    study_plan_item_id: null,
    metadata: {
      topic_name: `Tópico ${k % 17}`,
      audio_name: k % 7 === 0 ? "podcast" : null,
      questions_answered: k % 5,
      questions_correct: k % 3,
      pages_read: k % 11,
      imported_seconds: k % 4 === 0 ? (10 + (k % 150)) * 60 + 17 : undefined,
      flashcards_reviewed: k % 6,
      flashcards_correct: k % 2,
      focus_percentage: k % 6 === 0 ? null : k % 101,
      raw_import_row: k % 4 === 0 ? { col1: "x".repeat(40), col2: k } : undefined,
    },
    disciplines: k % 13 === 0 ? null : { id: `d${k % 9}`, name: `Disciplina ${k % 9}`, area: "Área" },
  }))
}

function db(n: number) {
  const rows = fullRows(n)
  const fake = new FakePostgrest({ study_history: rows as unknown as Record<string, unknown>[] })
  return { fake, supabase: fake as unknown as SupabaseClient, rows }
}

const EMPTY: HistoryFilters = {
  dateStart: "",
  dateEnd: "",
  disciplineId: "",
  origin: "",
  studyType: "",
  technique: "",
  timeRange: "",
  focusRange: "",
}

type ListLike = {
  id: string
  started_at: string | null
  duration_minutes: number | null
  discipline_id: string | null
  metadata?: Record<string, unknown> | null
  disciplines?: { name?: string } | null
  origin_source?: string | null
  origin_source_name?: string | null
  study_type?: string | null
  technique?: string | null
}

/** Exatamente o que a tela mostra/soma por sessão (history-view.tsx). */
function visibleFields(s: ListLike) {
  const m = s.metadata ?? {}
  return {
    id: s.id,
    started_at: s.started_at,
    discipline: s.disciplines?.name || "Estudo livre",
    discipline_id: s.discipline_id,
    duration: Number(m["imported_seconds"] || 0) > 0 ? Number(m["imported_seconds"]) : (Number(s.duration_minutes) || 0) * 60,
    study_type: s.study_type ?? null,
    origin: s.origin_source ? s.origin_source_name ?? null : null,
    questions: `${Number(m["questions_correct"] || 0)}/${Number(m["questions_answered"] || 0)}`,
    flashcards: `${Number(m["flashcards_reviewed"] || 0)}/${Number(m["flashcards_correct"] || 0)}`,
    focus: m["focus_percentage"] !== null && m["focus_percentage"] !== undefined ? String(m["focus_percentage"]) : "—",
    pages: Number(m["pages_read"] || 0),
  }
}

function totals(list: ListLike[]) {
  return {
    minutes: list.reduce((a, s) => a + (s.duration_minutes || 0), 0),
    correct: list.reduce((a, s) => a + Number(s.metadata?.["questions_correct"] || 0), 0),
    answered: list.reduce((a, s) => a + Number(s.metadata?.["questions_answered"] || 0), 0),
    pages: list.reduce((a, s) => a + Number(s.metadata?.["pages_read"] || 0), 0),
  }
}

function dayGroups(list: ListLike[]) {
  const map = new Map<string, number>()
  for (const s of list) {
    const d = getDayInSaoPaulo(s.started_at as string)
    map.set(d, (map.get(d) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, activityCount]) => ({ day, activityCount }))
}

describe("Histórico — payload enxuto × linha completa (mesmas sessões)", () => {
  it("2.797 sessões: mesma ordem, mesmos campos exibidos, mesmos totais, mesmos grupos por dia", async () => {
    const { supabase } = db(2797)
    const oldList = (await getAllUserHistory(supabase, USER)) as unknown as ListLike[]
    const newList = unpackHistoryList(await getUserHistoryList(supabase, USER)) as unknown as ListLike[]
    assert.equal(newList.length, 2797)
    assert.deepEqual(
      newList.map((s) => s.id),
      oldList.map((s) => s.id),
    )
    assert.deepEqual(newList.map(visibleFields), oldList.map(visibleFields))
    assert.deepEqual(totals(newList), totals(oldList))
    assert.deepEqual(dayGroups(newList), dayGroups(oldList))
    assert.deepEqual(
      selectVisibleDayGroups(dayGroups(newList), 150),
      selectVisibleDayGroups(dayGroups(oldList), 150),
    )
  })

  it("todos os filtros devolvem exatamente as mesmas sessões (e os mesmos totais)", async () => {
    const { supabase } = db(2797)
    const oldList = (await getAllUserHistory(supabase, USER)) as unknown as Parameters<typeof filterHistorySessions>[0]
    const newList = unpackHistoryList(await getUserHistoryList(supabase, USER)) as unknown as Parameters<
      typeof filterHistorySessions
    >[0]
    const cases: Array<[Partial<HistoryFilters>, string | null]> = [
      [{}, null],
      [{ disciplineId: "d3" }, null],
      [{ origin: "mentor" }, null],
      [{ origin: "Minha planilha" }, null],
      [{ studyType: "QUESTOES" }, null],
      [{ technique: "POMODORO" }, null],
      [{ timeRange: "30-60" }, null],
      [{ timeRange: "120+" }, null],
      [{ focusRange: "70-89" }, null],
      [{ focusRange: "90-100" }, null],
      [{ dateStart: "2021-03-01", dateEnd: "2021-06-30" }, null],
      [{ disciplineId: "d1", studyType: "TEORIA" }, "batch-1"],
    ]
    for (const [f, importId] of cases) {
      const a = filterHistorySessions(oldList, { ...EMPTY, ...f }, importId)
      const b = filterHistorySessions(newList, { ...EMPTY, ...f }, importId)
      assert.deepEqual(
        b.map((s) => (s as unknown as { id: string }).id),
        a.map((s) => (s as unknown as { id: string }).id),
        JSON.stringify(f),
      )
      assert.deepEqual(totals(b as unknown as ListLike[]), totals(a as unknown as ListLike[]), JSON.stringify(f))
    }
  })

  it("payload bem menor: sem notes, sem metadata completo, disciplina 1× por disciplina", async () => {
    const { supabase } = db(2797)
    const oldJson = JSON.stringify(await getAllUserHistory(supabase, USER))
    const payload = await getUserHistoryList(supabase, USER)
    const newJson = JSON.stringify(payload)
    assert.ok(newJson.length < oldJson.length * 0.5, `novo ${newJson.length} × antigo ${oldJson.length}`)
    assert.equal(newJson.includes("anotação longa"), false)
    assert.equal(newJson.includes("topic_name"), false)
    assert.equal(newJson.includes("raw_import_row"), false)
    assert.equal(newJson.includes('"user_id"'), false)
    assert.equal(Object.keys(payload.disciplines).length, 9)
    for (const row of payload.rows) {
      for (const key of Object.keys(row.metadata)) {
        assert.ok((HISTORY_LIST_METADATA_KEYS as readonly string[]).includes(key), key)
      }
    }
  })

  it("SELECT da lista não pede `*`, notes nem o metadata inteiro", () => {
    assert.equal(/(^|,\s*)\*(\s*,|$)/.test(HISTORY_LIST_SELECT), false)
    assert.equal(HISTORY_LIST_SELECT.includes("notes"), false)
    assert.equal(/(^|,\s*)metadata(\s*,|$)/.test(HISTORY_LIST_SELECT), false)
    for (const key of HISTORY_LIST_METADATA_KEYS) assert.ok(HISTORY_LIST_SELECT.includes(`metadata->${key}`))
  })

  it("created_at só vai quando started_at é nulo (fallback de ordenação)", () => {
    const base = { duration_minutes: 1, discipline_id: null, study_type: null, technique: null, origin_source: null, origin_source_name: null, import_batch_id: null }
    const packed = packHistoryList([
      { ...base, id: "a", started_at: "2024-01-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
      { ...base, id: "b", started_at: null, created_at: "2024-01-02T00:00:00Z" },
    ] as HistoryListDbRow[])
    assert.equal("created_at" in (packed.rows[0] ?? {}), false)
    assert.equal(packed.rows[1]?.created_at, "2024-01-02T00:00:00Z")
  })

  it("leitura da lista pagina acima de 1.000 (sem truncar) e só lê", async () => {
    const { supabase, fake } = db(3500)
    const payload = await getUserHistoryList(supabase, USER)
    assert.equal(payload.rows.length, 3500)
    const pages = fake.requests.filter((r) => r.table === "study_history")
    assert.equal(pages.length, 4)
    assert.ok(pages.every((p) => p.ordered && p.from !== null && p.to !== null && p.to - p.from + 1 <= 1000))
    assert.equal(fake.writes.length, 0)
  })
})

describe("Edição: busca a linha COMPLETA da sessão", () => {
  it("getUserHistorySession devolve a linha inteira (notes, metadata completo, disciplina) só do próprio usuário", async () => {
    const { supabase, rows } = db(50)
    const target = rows[10]
    assert.ok(target)
    const full = await getUserHistorySession(supabase, USER, target.id)
    assert.deepEqual(full, target)
    assert.equal(await getUserHistorySession(supabase, "outro", target.id), null)
  })

  it("a tela busca a linha completa antes de abrir o modal e não abre com dados parciais", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/features/history/components/history-view.tsx"), "utf-8")
    const fn = src.slice(src.indexOf("const handleEditSession = async"), src.indexOf("const handleModalClose"))
    assert.ok(fn.includes("await getHistorySessionForEditAction(session.id)"))
    assert.ok(fn.indexOf("return") < fn.indexOf("setEditingSession(full"))
    assert.ok(src.includes("const { data: payload, error } = await getHistoryListAction()"))
    assert.equal(src.includes("getAllHistoryAction("), false)
  })

  it("pendentes offline, SAVED, QUEUED e OFFLINE_RESOLVED continuam tratados como antes", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/features/history/components/history-view.tsx"), "utf-8")
    assert.ok(src.includes("const stillPending = prev.filter((s) => s._offlinePending)"))
    assert.ok(src.includes("window.addEventListener(STUDY_SESSION_SAVED_EVENT, handler)"))
    assert.ok(src.includes("window.addEventListener(STUDY_SESSION_QUEUED_EVENT, handleQueued)"))
    assert.ok(src.includes("window.addEventListener(STUDY_SESSION_OFFLINE_RESOLVED_EVENT, handleResolved)"))
    assert.ok(src.includes("selectVisibleDayGroups(dayGroups, sessionBudget)"))
  })
})
