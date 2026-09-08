"use server"

import { cookies } from "next/headers"
import { createClient } from "@/infrastructure/supabase/server"
import { SUPPORT_SESSION_COOKIE_NAME } from "@/application/admin/auth-guard"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function logoutAction() {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()

    const cookieStore = await cookies()
    cookieStore.delete(SUPPORT_SESSION_COOKIE_NAME)

    return { success: true }
  } catch (err: unknown) {
    console.error("Logout erro:", err)
    return { success: false, error: "Erro interno ao sair." }
  }
}
