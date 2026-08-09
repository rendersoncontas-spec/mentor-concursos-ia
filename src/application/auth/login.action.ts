"use server"

import { type LoginInput, loginSchema } from "@/domain/auth/auth.schemas"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function loginAction(data: LoginInput): Promise<AuthResponse> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }

  try {
    const validatedData = loginSchema.parse(data)
    console.log("LOGIN_ATTEMPT:", { email: validatedData.email })

    try {
      const supabase = await createClient()

      const { error, data: authData } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      })
      console.log("SUPABASE_AUTH_RESULT:", { error, session: authData.session ? "present" : "missing" })

      if (error || !authData.session) {
        return { 
          success: false, 
          error: "Email ou senha incorretos.",
          code: "INVALID_CREDENTIALS"
        }
      }

      return { success: true }
    } catch (supabaseError: any) {
      console.warn("Supabase auth unreachable:", supabaseError?.message || supabaseError)

      return {
        success: false,
        error: "Erro de conexão com o banco de dados. Configure as novas credenciais do Supabase no .env.local."
      }
    }
  } catch (err: unknown) {
    console.error("Login erro:", err)
    return { success: false, error: "Dados de login inválidos." }
  }
}
