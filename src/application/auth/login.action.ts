"use server"

import { type LoginInput, loginSchema } from "@/domain/auth/auth.schemas"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { createClient } from "@/infrastructure/supabase/server"

export async function loginAction(data: LoginInput): Promise<AuthResponse> {
  try {
    const validatedData = loginSchema.parse(data)

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email: validatedData.email,
      password: validatedData.password,
    })

    if (error) {
      return { success: false, error: "Credenciais inválidas. Verifique seu e-mail e senha." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Login erro:", err)
    return { success: false, error: "Erro interno no servidor." }
  }
}
