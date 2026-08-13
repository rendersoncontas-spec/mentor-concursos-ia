import { type TopicSuggestion } from "@/domain/topic-catalog/topic-catalog.types"

export type TopicSource = "catalog" | "custom" | "free"

export interface TopicSuggestionCandidate {
  key: string
  label: string
  source: Exclude<TopicSource, "free">
  topicName: string
  topicId: string
  userTopic: boolean
  isSubTopic: boolean
  parentName?: string
}

export interface TopicSearchResult {
  candidates: TopicSuggestionCandidate[]
  exactMatchExists: boolean
}

// Abreviações comuns usadas na prática pelos candidatos a concurso
const TOPIC_ALIASES: Record<string, string> = {
  rl: "raciocinio logico",
  rlm: "raciocinio logico matematico",
  ti: "tecnologia da informacao",
  port: "portugues",
  concord: "concordancia",
  concor: "concordancia",
}

// Normaliza para busca: remove acentos, minúsculas, colapsa espaços
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

// Expande abreviações conhecidas dentro da query normalizada
function expandAliases(query: string): string {
  const tokens = query.split(" ")
  const expanded = tokens.map((token) => TOPIC_ALIASES[token] ?? token)
  if (expanded.join(" ") === query) return query
  return expanded.join(" ")
}

// 0 exato > 1 alias > 2 prefixo > 3 todos os tokens > 4 contém
function rankCandidate(name: string, query: string, queryAlias: string): number {
  if (name === query) return 0
  if (queryAlias !== query && name === queryAlias) return 1
  if (name.startsWith(query)) return 2
  const tokens = query.split(" ")
  if (tokens.length > 1 && tokens.every((t) => name.includes(t))) return 3
  if (name.includes(query)) return 4
  return -1
}

export function searchTopicCandidates(
  rawQuery: string,
  topics: TopicSuggestion[],
  limit = 8
): TopicSearchResult {
  const query = normalizeForSearch(rawQuery)

  if (!query) {
    return {
      candidates: topics.slice(0, limit).map((topic) => ({
        key: `topic-${topic.id}`,
        label: topic.name,
        source: topic.userTopic ? "custom" : "catalog",
        topicName: topic.name,
        topicId: topic.id,
        userTopic: topic.userTopic,
        isSubTopic: false,
      })),
      exactMatchExists: false,
    }
  }

  const queryAlias = expandAliases(query)

  const ranked: { candidate: TopicSuggestionCandidate; rank: number }[] = []

  for (const topic of topics) {
    const topicRank = rankCandidate(normalizeForSearch(topic.name), query, queryAlias)
    if (topicRank >= 0) {
      ranked.push({
        rank: topicRank,
        candidate: {
          key: `topic-${topic.id}`,
          label: topic.name,
          source: topic.userTopic ? "custom" : "catalog",
          topicName: topic.name,
          topicId: topic.id,
          userTopic: topic.userTopic,
          isSubTopic: false,
        },
      })
    }
    for (const sub of topic.subtopics) {
      const subRank = rankCandidate(normalizeForSearch(sub.name), query, queryAlias)
      if (subRank >= 0) {
        ranked.push({
          rank: subRank,
          candidate: {
            key: `sub-${sub.id}`,
            label: sub.name,
            source: "catalog",
            topicName: topic.name,
            topicId: topic.id,
            userTopic: false,
            isSubTopic: true,
            parentName: topic.name,
          },
        })
      }
    }
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.candidate.label.localeCompare(b.candidate.label, "pt-BR")
  })

  const exactMatchExists = ranked.some((r) => r.rank === 0)

  return {
    candidates: ranked.slice(0, limit).map((r) => r.candidate),
    exactMatchExists,
  }
}
