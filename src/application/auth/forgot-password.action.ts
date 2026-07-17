"use server"

import { type ForgotPasswordInput, forgotPasswordSchema } from "@/domain/auth/auth.schemas"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { createClient } from "@/infrastructure/supabase/server"

export async function forgotPasswordAction(data: ForgotPasswordInput): Promise<AuthResponse> {
  try {
    const validatedData = forgotPasswordSchema.parse(data)

    const supabase = await createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(validatedData.email)

    if (error) {
      return { success: false, error: "Erro ao enviar e-mail de recuperação." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Forgot password erro:", err)
    return { success: false, error: "Erro interno no servidor." }
  }
}
