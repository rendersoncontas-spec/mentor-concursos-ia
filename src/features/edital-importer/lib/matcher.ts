import type {
  CatalogDiscipline,
  CatalogSubTopic,
  CatalogTopic,
  EditalDraft,
  MatchedDiscipline,
  MatchedEdital,
  MatchedSubTopic,
  MatchedTopic,
} from "./types"
import { normalizeForMatch } from "./normalize"
import { computeOverallConfidence, countLowConfidence } from "./structurer"

type MatchScore = { id: string; score: number }

function bestMatch(name: string, candidates: { id: string; name: string }[]): MatchScore | null {
  const target = normalizeForMatch(name)
  if (!target) return null
  let best: MatchScore | null = null
  for (const c of candidates) {
    const candidate = normalizeForMatch(c.name)
    if (!candidate) continue
    if (candidate === target) {
      best = { id: c.id, score: 1 }
      break
    }
    const [shorter, longer] =
      candidate.length <= target.length ? [candidate, target] : [target, candidate]
    if (shorter.length >= 6 && longer.includes(shorter)) {
      const score = Math.max(0.85, 1 - 0.1 * (longer.length - shorter.length) / longer.length)
      if (!best || score > best.score) best = { id: c.id, score }
    }
  }
  return best
}

export function matchDraftToCatalog(
  draft: EditalDraft,
  disciplines: CatalogDiscipline[],
  topics: CatalogTopic[],
  subtopics: CatalogSubTopic[],
): MatchedEdital {
  const topicsByDiscipline = new Map<string, { id: string; name: string }[]>()
  for (const t of topics) {
    const list = topicsByDiscipline.get(t.disciplineId)
    if (list) list.push({ id: t.id, name: t.name })
    else topicsByDiscipline.set(t.disciplineId, [{ id: t.id, name: t.name }])
  }
  const subtopicsByTopic = new Map<string, { id: string; name: string }[]>()
  for (const s of subtopics) {
    const list = subtopicsByTopic.get(s.topicId)
    if (list) list.push({ id: s.id, name: s.name })
    else subtopicsByTopic.set(s.topicId, [{ id: s.id, name: s.name }])
  }

  const matchedDisciplines: MatchedDiscipline[] = draft.disciplines.map((d) => {
    const discMatch = bestMatch(d.name, disciplines)
    const discId = discMatch?.id ?? null
    const candidates = discId ? topicsByDiscipline.get(discId) ?? [] : []

    const matchedTopics: MatchedTopic[] = d.topics.map((t) => {
      const topicMatch = bestMatch(t.title, candidates)
      const topicId = topicMatch?.id ?? null
      const subCandidates = topicId ? subtopicsByTopic.get(topicId) ?? [] : []

      const matchedSubtopics: MatchedSubTopic[] = t.subtopics.map((s) => {
        const subMatch = bestMatch(s.title, subCandidates)
        return {
          ...s,
          subtopicId: subMatch?.id ?? null,
          isNew: subMatch === null,
        }
      })

      return {
        ...t,
        topicId,
        isNew: topicMatch === null,
        subtopics: matchedSubtopics,
      }
    })

    return {
      ...d,
      disciplineId: discId,
      isNew: discMatch === null,
      topics: matchedTopics,
    }
  })

  return {
    metadata: draft.metadata,
    disciplines: matchedDisciplines,
    overallConfidence: computeOverallConfidence(matchedDisciplines),
    lowConfidenceCount: countLowConfidence(matchedDisciplines),
  }
}
