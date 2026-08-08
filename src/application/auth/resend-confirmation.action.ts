"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { z } from "zod"
import { isMaintenanceMode } from "@/lib/maintenance"

const resendSchema = z.object({
  email: z.string().email("E-mail inválido."),
})

export async function resendConfirmationAction(email: string): Promise<AuthResponse> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const validated = resendSchema.parse({ email })
    const supabase = await createClient()

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: validated.email,
    })

    if (error) {
      console.error("Resend erro:", error)
      // Evitar expor se o e-mail existe ou não. Vamos retornar uma mensagem genérica caso dê erro.
      // Se for rate limit, o Supabase já retorna erro (ex: 429).
      return { success: false, error: "Não foi possível reenviar o e-mail. Tente novamente mais tarde." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Resend catch:", err)
    return { success: false, error: "Erro interno no servidor." }
  }
}
