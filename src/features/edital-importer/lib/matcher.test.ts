import assert from "node:assert/strict"
import { test } from "node:test"

import { matchDraftToCatalog } from "./matcher"
import type { EditalDraft } from "./types"

const CATALOG_DISCIPLINES = [
  { id: "d1", name: "Língua Portuguesa" },
  { id: "d2", name: "Direito Constitucional" },
]

const CATALOG_TOPICS = [
  { id: "t1", disciplineId: "d1", name: "Compreensão de Textos" },
  { id: "t2", disciplineId: "d1", name: "Ortografia Oficial" },
  { id: "t3", disciplineId: "d2", name: "Princípios Fundamentais" },
]

const CATALOG_SUBTOPICS = [{ id: "s1", topicId: "t1", name: "Tipos e Gêneros Textuais" }]

function makeDraft(disciplines: EditalDraft["disciplines"]): EditalDraft {
  return { metadata: {}, disciplines }
}

test("corresponde disciplina ignorando acentos e maiúsculas", () => {
  const draft = makeDraft([
    {
      name: "LÍNGUA PORTUGUESA",
      confidence: 0.95,
      lowConfidence: false,
      topics: [],
    },
  ])
  const matched = matchDraftToCatalog(draft, CATALOG_DISCIPLINES, [], [])

  assert.equal(matched.disciplines[0]?.disciplineId, "d1")
  assert.equal(matched.disciplines[0]?.isNew, false)
})

test("marca disciplina desconhecida como nova", () => {
  const draft = makeDraft([
    {
      name: "Engenharia de Software",
      confidence: 0.95,
      lowConfidence: false,
      topics: [],
    },
  ])
  const matched = matchDraftToCatalog(draft, CATALOG_DISCIPLINES, [], [])

  assert.equal(matched.disciplines[0]?.disciplineId, null)
  assert.equal(matched.disciplines[0]?.isNew, true)
})

test("corresponde por semelhança quando o nome do edital é mais curto", () => {
  const draft = makeDraft([
    {
      name: "PORTUGUÊS",
      confidence: 0.85,
      lowConfidence: false,
      topics: [],
    },
  ])
  const matched = matchDraftToCatalog(draft, CATALOG_DISCIPLINES, [], [])

  assert.equal(matched.disciplines[0]?.disciplineId, "d1")
  assert.equal(matched.disciplines[0]?.isNew, false)
})

test("corresponde tópico dentro da disciplina certa", () => {
  const draft = makeDraft([
    {
      name: "Língua Portuguesa",
      confidence: 0.95,
      lowConfidence: false,
      topics: [
        {
          title: "compreensão de textos",
          confidence: 0.95,
          lowConfidence: false,
          subtopics: [
            {
              title: "Tipos e gêneros textuais",
              confidence: 0.95,
              lowConfidence: false,
            },
            {
              title: "Coesão e coerência",
              confidence: 0.95,
              lowConfidence: false,
            },
          ],
        },
      ],
    },
  ])
  const matched = matchDraftToCatalog(draft, CATALOG_DISCIPLINES, CATALOG_TOPICS, CATALOG_SUBTOPICS)

  const topic = matched.disciplines[0]?.topics[0]
  assert.equal(topic?.topicId, "t1")
  assert.equal(topic?.isNew, false)
  assert.equal(topic?.subtopics[0]?.subtopicId, "s1")
  assert.equal(topic?.subtopics[0]?.isNew, false)
  assert.equal(topic?.subtopics[1]?.subtopicId, null)
  assert.equal(topic?.subtopics[1]?.isNew, true)
})

test("não usa tópico de outra disciplina", () => {
  const draft = makeDraft([
    {
      name: "Direito Constitucional",
      confidence: 0.95,
      lowConfidence: false,
      topics: [
        {
          title: "Compreensão de Textos",
          confidence: 0.95,
          lowConfidence: false,
          subtopics: [],
        },
      ],
    },
  ])
  const matched = matchDraftToCatalog(draft, CATALOG_DISCIPLINES, CATALOG_TOPICS, [])

  // "Compreensão de Textos" existe apenas em d1; não deve ser reutilizada em d2
  assert.equal(matched.disciplines[0]?.topics[0]?.topicId, null)
  assert.equal(matched.disciplines[0]?.topics[0]?.isNew, true)
})

test("calcula confiança geral do edital", () => {
  const draft = makeDraft([
    {
      name: "Língua Portuguesa",
      confidence: 0.95,
      lowConfidence: false,
      topics: [
        {
          title: "Compreensão de Textos",
          confidence: 0.95,
          lowConfidence: false,
          subtopics: [],
        },
      ],
    },
  ])
  const matched = matchDraftToCatalog(draft, CATALOG_DISCIPLINES, CATALOG_TOPICS, [])

  assert.ok(matched.overallConfidence > 0.9)
  assert.ok(matched.overallConfidence <= 1)
})
