"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function logoutAction() {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()

    return { success: true }
  } catch (err: unknown) {
    console.error("Logout erro:", err)
    return { success: false, error: "Erro interno ao sair." }
  }
}
