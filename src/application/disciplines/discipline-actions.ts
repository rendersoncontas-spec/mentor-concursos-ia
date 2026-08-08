"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

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
  } catch (err: any) {
    return { success: false, error: err.message || "Erro desconhecido." }
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
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao remover." }
  }
}
