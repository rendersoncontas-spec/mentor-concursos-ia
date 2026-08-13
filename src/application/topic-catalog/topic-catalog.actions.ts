"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import { type TopicSuggestion, type TopicSuggestionSubTopic } from "@/domain/topic-catalog/topic-catalog.types"
import { normalizeForSearch } from "@/features/topic-catalog/lib/topic-search"

// Busca os tópicos de uma disciplina para sugestão (catálogo global + personalizados do usuário)
export async function getTopicSuggestionsAction(
  disciplineId: string
): Promise<{ success: boolean; topics: TopicSuggestion[]; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível.", topics: [] }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado.", topics: [] }

    const { data, error } = await supabase
      .from("topics")
      .select(`
        id,
        discipline_id,
        name,
        user_id,
        created_at,
        subtopics ( id, name )
      `)
      .eq("discipline_id", disciplineId)
      .order("name")

    if (error) {
      console.error("Error fetching topic suggestions:", error)
      return { success: false, error: error.message, topics: [] }
    }

    type RawRow = {
      id: string
      discipline_id: string
      name: string
      user_id: string | null
      created_at: string
      subtopics: TopicSuggestionSubTopic[] | null
    }

    const topics: TopicSuggestion[] = ((data ?? []) as unknown as RawRow[]).map((row) => ({
      id: row.id,
      discipline_id: row.discipline_id,
      name: row.name,
      user_id: row.user_id,
      created_at: row.created_at,
      userTopic: row.user_id !== null,
      subtopics: row.subtopics ?? [],
    }))

    return { success: true, topics }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message, topics: [] }
  }
}

// Cria um tópico personalizado (dedupe normalizado em JS; seguro para re-execução)
export async function createCustomTopicAction(
  disciplineId: string,
  name: string
): Promise<{ success: boolean; topic?: TopicSuggestion; existed?: boolean; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const cleanName = name.trim()
    if (!cleanName) return { success: false, error: "Nome do tópico é obrigatório." }

    const normalized = normalizeForSearch(cleanName)

    // 1. Dedupe: verifica se já existe (global ou do próprio usuário) com o mesmo nome normalizado
    const { data: existing } = await supabase
      .from("topics")
      .select("id, discipline_id, name, user_id, created_at")
      .eq("discipline_id", disciplineId)

    if (existing) {
      const match = (existing as Array<{ id: string; discipline_id: string; name: string; user_id: string | null; created_at: string }>).find(
        (t) => normalizeForSearch(t.name) === normalized
      )
      if (match) {
        return {
          success: true,
          existed: true,
          topic: { ...match, userTopic: match.user_id !== null, subtopics: [] },
        }
      }
    }

    // 2. Cria com user_id = auth.uid() (RLS exige)
    const { data: created, error } = await supabase
      .from("topics")
      .insert({ discipline_id: disciplineId, name: cleanName, user_id: user.id })
      .select("id, discipline_id, name, user_id, created_at")
      .single()

    // 3. Corrida entre dois cliques: se outra requisição criou o mesmo nome, refaz o dedupe
    if (error && error.code === "23505") {
      const { data: reExisting } = await supabase
        .from("topics")
        .select("id, discipline_id, name, user_id, created_at")
        .eq("discipline_id", disciplineId)

      const match = (reExisting ?? []).find((t) => normalizeForSearch(t.name) === normalized)
      if (match) {
        return {
          success: true,
          existed: true,
          topic: { ...match, userTopic: match.user_id !== null, subtopics: [] },
        }
      }
      return { success: false, error: "Não foi possível criar o tópico." }
    }

    if (error || !created) {
      console.error("Error creating custom topic:", error)
      return { success: false, error: error?.message || "Erro ao criar tópico." }
    }

    return {
      success: true,
      topic: { ...(created as TopicSuggestion), userTopic: true, subtopics: [] },
    }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message }
  }
}
