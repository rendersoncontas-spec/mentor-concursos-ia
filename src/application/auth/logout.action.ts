"use server"

import { createClient } from "@/infrastructure/supabase/server"

export async function logoutAction() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()

    return { success: true }
  } catch (err: unknown) {
    console.error("Logout erro:", err)
    return { success: false, error: "Erro interno ao sair." }
  }
}
