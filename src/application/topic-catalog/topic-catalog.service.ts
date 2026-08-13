import { type SupabaseClient } from "@supabase/supabase-js"
import {
  type CatalogDiscipline,
  type CatalogDisciplineSummary,
  type CatalogDisciplineWithTopics,
  type CatalogSubTopic,
  type CatalogTopic,
  type CatalogTopicWithSubTopics,
  type CatalogTree,
} from "@/domain/topic-catalog/topic-catalog.types"

// Lista as disciplinas do catálogo com contagens de tópicos e subtópicos
export async function getCatalogDisciplines(
  supabase: SupabaseClient
): Promise<CatalogDisciplineSummary[]> {
  const [disciplinesRes, topicsRes, subtopicsRes] = await Promise.all([
    supabase.from("disciplines").select("id, name, area, created_at").order("name"),
    supabase.from("topics").select("discipline_id, id"),
    supabase.from("subtopics").select("topic_id, id"),
  ])

  if (disciplinesRes.error) {
    console.error("Error fetching catalog disciplines:", disciplinesRes.error)
    return []
  }

  const topicIdsByDiscipline = new Map<string, string[]>()
  for (const t of topicsRes.data ?? []) {
    const list = topicIdsByDiscipline.get(t.discipline_id) ?? []
    list.push(t.id)
    topicIdsByDiscipline.set(t.discipline_id, list)
  }

  const subtopicCountByTopic = new Map<string, number>()
  for (const s of subtopicsRes.data ?? []) {
    subtopicCountByTopic.set(s.topic_id, (subtopicCountByTopic.get(s.topic_id) ?? 0) + 1)
  }

  return (disciplinesRes.data as CatalogDiscipline[]).map((d) => {
    const topicIds = topicIdsByDiscipline.get(d.id) ?? []
    const subtopicsCount = topicIds.reduce((acc, topicId) => acc + (subtopicCountByTopic.get(topicId) ?? 0), 0)
    return { ...d, topics_count: topicIds.length, subtopics_count: subtopicsCount }
  })
}

// Busca a árvore completa do catálogo (disciplines → topics → subtopics)
export async function getCatalogTree(supabase: SupabaseClient): Promise<CatalogTree | null> {
  const [disciplinesRes, topicsRes, subtopicsRes] = await Promise.all([
    supabase.from("disciplines").select("id, name, area, created_at").order("name"),
    supabase.from("topics").select("id, discipline_id, name, created_at").order("name"),
    supabase.from("subtopics").select("id, topic_id, name, created_at").order("name"),
  ])

  if (disciplinesRes.error) {
    console.error("Error fetching catalog tree:", disciplinesRes.error)
    return null
  }

  const subtopicsByTopic = new Map<string, CatalogSubTopic[]>()
  for (const s of (subtopicsRes.data ?? []) as CatalogSubTopic[]) {
    const list = subtopicsByTopic.get(s.topic_id) ?? []
    list.push(s)
    subtopicsByTopic.set(s.topic_id, list)
  }

  const topicsByDiscipline = new Map<string, CatalogTopicWithSubTopics[]>()
  for (const t of (topicsRes.data ?? []) as CatalogTopic[]) {
    const node: CatalogTopicWithSubTopics = { ...t, subtopics: subtopicsByTopic.get(t.id) ?? [] }
    const list = topicsByDiscipline.get(t.discipline_id) ?? []
    list.push(node)
    topicsByDiscipline.set(t.discipline_id, list)
  }

  const disciplines: CatalogDisciplineWithTopics[] = ((disciplinesRes.data ?? []) as CatalogDiscipline[]).map(
    (d) => ({ ...d, topics: topicsByDiscipline.get(d.id) ?? [] })
  )

  return { disciplines }
}

// Busca os tópicos (com subtópicos) de uma disciplina do catálogo
export async function getCatalogTopicsByDiscipline(
  supabase: SupabaseClient,
  disciplineId: string
): Promise<CatalogTopicWithSubTopics[]> {
  const { data, error } = await supabase
    .from("topics")
    .select(`
      id,
      discipline_id,
      name,
      created_at,
      subtopics ( id, topic_id, name, created_at )
    `)
    .eq("discipline_id", disciplineId)
    .order("name")

  if (error) {
    console.error("Error fetching catalog topics:", error)
    return []
  }

  type RawRow = {
    id: string
    discipline_id: string
    name: string
    created_at: string
    subtopics: CatalogSubTopic[] | null
  }

  return (data as unknown as RawRow[]).map((row) => ({
    id: row.id,
    discipline_id: row.discipline_id,
    name: row.name,
    created_at: row.created_at,
    subtopics: row.subtopics ?? [],
  }))
}

// Localiza uma disciplina do catálogo por nome (ignora caixa)
export async function getCatalogDisciplineByName(
  supabase: SupabaseClient,
  name: string
): Promise<CatalogDiscipline | null> {
  const { data, error } = await supabase
    .from("disciplines")
    .select("id, name, area, created_at")
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Error fetching catalog discipline by name:", error)
    return null
  }

  return (data as CatalogDiscipline | null) ?? null
}
