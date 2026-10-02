// ============================================================================
// Fase F.3 (performance) — payload enxuto das sessões de Estatísticas.
//
// `mapSessionRow` (study-sessions-read.ts) só usa 6 chaves de `metadata`
// (pages_read, questions_answered, questions_correct, flashcards_reviewed,
// topic_name, focus_percentage) para montar um SessionRecord, e nada em
// src/features/statistics ou no motor de estatísticas lê `.notes` ou o objeto
// `metadata` inteiro de uma sessão (conferido por leitura de código). `
// loadSessions` (statistics-center.action.ts) passou a pedir só essas 6
// chaves pelo caminho JSON (`metadata->chave`, mesmo padrão do Dashboard na
// Fase F.2) e parou de selecionar `notes`. Este arquivo trava que:
//   1. o SELECT realmente mudou (wiring);
//   2. os valores sanitizados continuam corretos quando a leitura chega no
//      formato "enxuto" (meta_* + sem notes) — comportamento.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { toStudySessions } from "@/application/study-analytics/study-sessions-read"

const ACTION = "src/application/study-analytics/statistics-center.action.ts"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("F.3 — SESSION_SELECT das Estatísticas pede só as chaves de metadata usadas, sem notes", () => {
  const src = readSource(ACTION)

  it("não seleciona mais a coluna notes nem o objeto metadata inteiro", () => {
    const block = src.slice(src.indexOf("const SESSION_SELECT"), src.indexOf("disciplines ( id, name, area )"))
    assert.equal(/\bnotes\b/.test(block), false, "notes não deveria mais aparecer no SELECT")
    assert.equal(/,\s*metadata,/.test(block), false, "metadata inteiro não deveria mais ser pedido")
  })

  it("pede as 6 chaves de metadata por caminho JSON (mesmo padrão do Dashboard, Fase F.2)", () => {
    // SESSION_METADATA_SELECT monta `meta_${k}:metadata->${k}` a partir de
    // SESSION_METADATA_KEYS (mesma técnica de `getStudyHistoryForAnalytics`,
    // Fase F.2) — por isso a verificação é na lista de chaves e no template,
    // não numa string literal interpolada (que não existe no código-fonte).
    assert.match(src, /`meta_\$\{k\}:metadata->\$\{k\}`/, "SESSION_METADATA_SELECT deveria montar meta_${k}:metadata->${k}")
    const keysBlock = src.slice(src.indexOf("const SESSION_METADATA_KEYS"), src.indexOf("as const"))
    for (const key of [
      "pages_read",
      "questions_answered",
      "questions_correct",
      "flashcards_reviewed",
      "topic_name",
      "focus_percentage",
    ]) {
      assert.ok(keysBlock.includes(`"${key}"`), `esperava "${key}" em SESSION_METADATA_KEYS`)
    }
  })

  it("remonta metadata a partir das chaves meta_* antes de devolver as linhas (mesma reconstrução do Dashboard)", () => {
    assert.match(src, /row\["metadata"\] = metadata/)
    assert.match(src, /delete row\[`meta_\$\{k\}`\]/)
  })
})

describe("F.3 — com o SELECT enxuto, sanitizeSession ainda produz os mesmos valores", () => {
  /** Simula o que o PostgREST devolve para SESSION_SELECT (sem notes, metadata vindo como meta_*). */
  function trimmedRow(id: string, startedAt: string, minutes: number): Record<string, unknown> {
    return {
      id,
      discipline_id: "disc-1",
      disciplines: { id: "disc-1", name: "Direito Administrativo", area: "Direito" },
      started_at: startedAt,
      finished_at: startedAt,
      duration_minutes: minutes,
      active_minutes: minutes,
      paused_minutes: 0,
      planned_minutes: minutes,
      completed: true,
      interrupted: false,
      energy_level: 4,
      difficulty: 3,
      focus_score: 4,
      study_type: "TEORIA",
      study_source: "TIMER",
      origin_source: null,
      meta_pages_read: 12,
      meta_questions_answered: 20,
      meta_questions_correct: 15,
      meta_flashcards_reviewed: 3,
      meta_topic_name: "Controle de Constitucionalidade",
      meta_focus_percentage: 87,
      // notes: ausente de propósito — a coluna não é mais pedida.
    }
  }

  /** Mesma reconstrução que loadSessions faz linha a linha após a leitura. */
  function reconstructMetadata(row: Record<string, unknown>): Record<string, unknown> {
    const keys = [
      "pages_read",
      "questions_answered",
      "questions_correct",
      "flashcards_reviewed",
      "topic_name",
      "focus_percentage",
    ] as const
    const metadata: Record<string, unknown> = {}
    for (const k of keys) {
      const value = row[`meta_${k}`]
      if (value !== null && value !== undefined) metadata[k] = value
      delete row[`meta_${k}`]
    }
    row["metadata"] = metadata
    return row
  }

  it("as 6 chaves chegam corretas ao SessionRecord sanitizado", () => {
    const row = reconstructMetadata(trimmedRow("s-1", "2026-03-10T12:00:00.000Z", 45))
    const [out] = toStudySessions({ data: [row], error: null }) ?? []

    assert.ok(out)
    assert.equal(out.pagesRead, 12)
    assert.equal(out.questionsAnswered, 20)
    assert.equal(out.questionsCorrect, 15)
    assert.equal(out.flashcardsReviewed, 3)
    assert.equal(out.topicName, "Controle de Constitucionalidade")
    assert.equal(out.focusPercentage, 87)
    assert.equal(out.durationMinutes, 45, "campos fora de metadata continuam intactos")
  })

  it("notes vem null quando a coluna não é selecionada (ninguém lê esse campo nas Estatísticas)", () => {
    const row = reconstructMetadata(trimmedRow("s-2", "2026-03-11T12:00:00.000Z", 30))
    const [out] = toStudySessions({ data: [row], error: null }) ?? []

    assert.ok(out)
    assert.equal(out.notes, null)
  })

  it("uma sessão sem nenhuma chave de metadata continua sã (valores default, não erro)", () => {
    const row = trimmedRow("s-3", "2026-03-12T12:00:00.000Z", 20)
    delete row["meta_pages_read"]
    delete row["meta_questions_answered"]
    delete row["meta_questions_correct"]
    delete row["meta_flashcards_reviewed"]
    delete row["meta_topic_name"]
    delete row["meta_focus_percentage"]
    const reconstructed = reconstructMetadata(row)
    const [out] = toStudySessions({ data: [reconstructed], error: null }) ?? []

    assert.ok(out)
    assert.equal(out.pagesRead, 0)
    assert.equal(out.questionsAnswered, 0)
    assert.equal(out.questionsCorrect, 0)
    assert.equal(out.flashcardsReviewed, 0)
    assert.equal(out.topicName, null)
    assert.equal(out.focusPercentage, null)
  })
})
