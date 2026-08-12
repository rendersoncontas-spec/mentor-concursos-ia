"use server"

import { createClient } from "@/infrastructure/supabase/server"

export async function getActiveTargetNameAction(): Promise<{ success: boolean; name?: string; role?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data } = await supabase
      .from("user_targets")
      .select("target_exam, target_role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (data) {
      return { success: true, name: data.target_exam || "Concurso", role: data.target_role || "" }
    }
    
    return { success: true, name: "Concurso", role: "" }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}
