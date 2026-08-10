"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export interface ProfileData {
  id: string
  name: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  weekly_study_hours: number | null
  weekly_questions_goal: number | null
  weekly_revisions_goal: number | null
  weekly_study_days_goal: number | null
  week_start_day: number | null
  work_regime: string | null
  experience_level: string | null
  onboarding_completed: boolean | null
}

export async function getProfileAction(): Promise<{ success: boolean; data?: ProfileData; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    if (error) {
      console.error("Erro ao buscar profile:", error)
      return { success: false, error: "Erro ao carregar perfil." }
    }

    return {
      success: true,
      data: {
        id: user.id,
        name: data?.["name"] ?? null,
        full_name: data?.["full_name"] ?? null,
        email: user.email ?? null,
        avatar_url: data?.["avatar_url"] ?? null,
        weekly_study_hours: data?.["weekly_study_hours"] ?? null,
        weekly_questions_goal: data?.["weekly_questions_goal"] ?? null,
        weekly_revisions_goal: data?.["weekly_revisions_goal"] ?? null,
        weekly_study_days_goal: data?.["weekly_study_days_goal"] ?? null,
        week_start_day: data?.["week_start_day"] ?? null,
        work_regime: data?.["work_regime"] ?? null,
        experience_level: data?.["experience_level"] ?? null,
        onboarding_completed: data?.["onboarding_completed"] ?? null,
      }
    }
  } catch (err: unknown) {
    console.error("Erro em getProfileAction:", err)
    return { success: false, error: "Erro interno ao carregar perfil." }
  }
}

export interface UpdateProfileInput {
  name?: string | null
  full_name?: string | null
  avatar_url?: string | null
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const name = input['name']
    const full_name = input['full_name']
    const avatar_url = input['avatar_url']
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData['name'] = name
    if (full_name !== undefined) updateData['full_name'] = full_name
    if (avatar_url !== undefined) updateData['avatar_url'] = avatar_url

    if (Object.keys(updateData).length === 0) {
      return { success: true }
    }

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)

    if (error) {
      console.error("Erro ao atualizar profile:", error)
      return { success: false, error: "Falha ao salvar perfil." }
    }

    revalidatePath("/dashboard")
    revalidatePath("/profile")
    return { success: true }
  } catch (err: unknown) {
    console.error("Erro em updateProfileAction:", err)
    return { success: false, error: "Erro interno ao salvar perfil." }
  }
}
