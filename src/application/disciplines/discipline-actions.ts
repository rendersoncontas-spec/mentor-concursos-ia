"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import { getCatalogDisciplineByName, getCatalogTopicsByDiscipline } from "@/application/topic-catalog/topic-catalog.service"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"

// Busca os tópicos do catálogo (com subtópicos) de uma disciplina por nome
export async function getDisciplineCatalogTopicsAction(
  disciplineName: string
): Promise<{ success: boolean; topics: CatalogTopicWithSubTopics[]; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível.", topics: [] }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado.", topics: [] }

    const discipline = await getCatalogDisciplineByName(supabase, disciplineName)
    if (!discipline) return { success: true, topics: [] }

    const topics = await getCatalogTopicsByDiscipline(supabase, discipline.id)
    return { success: true, topics }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message, topics: [] }
  }
}

export interface DisciplineDetailStats {
  minutes: number
  questionsAnswered: number
  correct: number
  pagesRead: number
}

// Métricas reais de uma disciplina: tempo estudado (study_history), questões
// respondidas/corretas (question_attempts) e páginas lidas (metadata). Tudo
// agregado por discipline_id; retorna null se a disciplina não existir.
export async function getDisciplineDetailStatsAction(
  disciplineName: string
): Promise<{ success: boolean; data: DisciplineDetailStats | null; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível.", data: null }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado.", data: null }

    const { data: disc } = await supabase
      .from("disciplines")
      .select("id")
      .ilike("name", disciplineName.trim())
      .maybeSingle()
    if (!disc) return { success: true, data: null }

    const [historyRes, attemptsRes] = await Promise.all([
      supabase
        .from("study_history")
        .select("duration_minutes, metadata")
        .eq("user_id", user.id)
        .eq("discipline_id", disc.id),
      supabase.from("question_attempts").select("correct").eq("user_id", user.id).eq("discipline_id", disc.id),
    ])

    let minutes = 0
    let pagesRead = 0
    for (const row of historyRes.data ?? []) {
      minutes += Number(row.duration_minutes) || 0
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      pagesRead += Number(meta["pages_read"]) || 0
    }

    const attempts = attemptsRes.data ?? []
    const correct = attempts.filter((a: { correct: boolean }) => a.correct).length

    return {
      success: true,
      data: { minutes, questionsAnswered: attempts.length, correct, pagesRead },
    }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message, data: null }
  }
}

export async function addUserDisciplineAction(name: string) {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data: target } = await supabase
      .from("user_targets")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    let { data: disc } = await supabase
      .from("disciplines")
      .select("id")
      .ilike("name", name.trim())
      .maybeSingle()

    if (!disc) {
      const res = await supabase
        .from("disciplines")
        .insert({ name: name.trim(), area: "Geral" })
        .select("id")
        .single()
      disc = res.data
    }

    if (!disc) return { success: false, error: "Erro ao cadastrar disciplina." }

    const { error } = await supabase
      .from("user_disciplines")
      .upsert({
        user_id: user.id,
        target_id: target?.id || null,
        discipline_id: disc.id,
        status: "STUDYING",
      }, { onConflict: "user_id,target_id,discipline_id", ignoreDuplicates: true })

    if (error) return { success: false, error: error.message }

    revalidatePath("/disciplines")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message }
  }
}

export async function removeUserDisciplineAction(id: string) {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { error } = await supabase
      .from("user_disciplines")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) return { success: false, error: error.message }

    revalidatePath("/disciplines")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro ao remover."
    return { success: false, error: message }
  }
}
