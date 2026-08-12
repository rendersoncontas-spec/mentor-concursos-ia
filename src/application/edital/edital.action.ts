"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export async function addCustomDisciplineAction(name: string, targetId: string): Promise<{ success: boolean; data?: { id: string; name: string }; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const discName = name.trim()
    if (!discName) return { success: false, error: "Nome da matéria é obrigatório." }

    // 1. Procurar disciplina global
    let { data: d } = await supabase.from("disciplines").select("id, name").ilike("name", discName).maybeSingle()
    
    // 2. Se não existe, cria global
    if (!d) {
      const res = await supabase.from("disciplines").insert({ name: discName, area: "Geral" }).select("id, name").single()
      if (res.error) return { success: false, error: "Erro ao criar matéria global." }
      d = res.data
    }

    if (!d) return { success: false, error: "Não foi possível resolver a matéria." }

    // 3. Adicionar ao user_disciplines
    const { error: udError } = await supabase.from("user_disciplines").upsert({
      user_id: user.id,
      target_id: targetId,
      discipline_id: d.id,
      status: "NOT_STARTED",
      mastery_level: 0
    }, { onConflict: "user_id,target_id,discipline_id", ignoreDuplicates: true })

    if (udError) return { success: false, error: "Erro ao vincular matéria ao seu perfil." }

    revalidatePath("/edital")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")
    
    return { success: true, data: d }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}

export async function saveCustomTopicsAction(targetId: string, disciplineId: string, topics: { id: string }[]): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    // 1. Buscar o target atual
    const { data: targetData } = await supabase
      .from("user_targets")
      .select("main_study_source")
      .eq("id", targetId)
      .eq("user_id", user.id)
      .single()

    if (!targetData) return { success: false, error: "Concurso não encontrado." }

    // 2. Fazer o parser do JSON e injetar as novas topics
    let meta: { customEdital?: Record<string, { id: string }[]> } = {}
    if (targetData.main_study_source) {
      if (typeof targetData.main_study_source === "object") {
        meta = { ...targetData.main_study_source }
      } else if (typeof targetData.main_study_source === "string" && targetData.main_study_source.startsWith("{")) {
        try {
          meta = JSON.parse(targetData.main_study_source)
        } catch {
          meta = {}
        }
      }
    }

    if (!meta.customEdital) meta.customEdital = {}
    meta.customEdital[disciplineId] = topics

    // 3. Salvar de volta
    const { error } = await supabase
      .from("user_targets")
      .update({ main_study_source: JSON.stringify(meta) })
      .eq("id", targetId)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao salvar tópicos." }

    revalidatePath("/edital")
    return { success: true }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}

export async function searchDisciplinesAction(query: string) {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('disciplines')
      .select('name')
      .ilike('name', `%${query}%`)
      .limit(10)
    
    return { success: true, data: data?.map(d => d.name) || [] }
  } catch {
    return { success: false, data: [] }
  }
}

export async function removeDisciplineAction(disciplineId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { error } = await supabase
      .from("user_disciplines")
      .delete()
      .eq("user_id", user.id)
      .eq("target_id", targetId)
      .eq("discipline_id", disciplineId)

    if (error) return { success: false, error: "Erro ao excluir matéria." }

    revalidatePath("/edital")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")
    
    return { success: true }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}

export async function removeCustomTopicAction(targetId: string, disciplineId: string, topicId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data: targetData } = await supabase
      .from("user_targets")
      .select("main_study_source")
      .eq("id", targetId)
      .eq("user_id", user.id)
      .single()

    if (!targetData) return { success: false, error: "Concurso não encontrado." }

    let meta: { customEdital?: Record<string, { id: string }[]> } = {}
    if (targetData.main_study_source) {
      if (typeof targetData.main_study_source === "object") {
        meta = { ...targetData.main_study_source }
      } else if (typeof targetData.main_study_source === "string" && targetData.main_study_source.startsWith("{")) {
        try {
          meta = JSON.parse(targetData.main_study_source)
        } catch {
          meta = {}
        }
      }
    }

    if (!meta.customEdital || !meta.customEdital[disciplineId]) {
      return { success: false, error: "Tópico não encontrado." }
    }

    // Filtra o tópico fora da lista
    meta.customEdital[disciplineId] = meta.customEdital[disciplineId].filter((t) => t.id !== topicId)

    const { error } = await supabase
      .from("user_targets")
      .update({ main_study_source: JSON.stringify(meta) })
      .eq("id", targetId)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao remover tópico." }

    revalidatePath("/edital")
    return { success: true }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}