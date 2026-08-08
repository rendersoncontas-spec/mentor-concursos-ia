"use server"

import { type LoginInput, loginSchema } from "@/domain/auth/auth.schemas"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function loginAction(data: LoginInput): Promise<AuthResponse> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }

  try {
    const validatedData = loginSchema.parse(data)

    try {
      const supabase = await createClient()

      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      })

      if (error) {
        if (error.message === "Email not confirmed") {
          return { 
            success: false, 
            error: "Por favor, confirme seu e-mail antes de entrar.", 
            code: "UNCONFIRMED_EMAIL" 
          }
        }
        return { 
          success: false, 
          error: "E-mail ou senha incorretos. Verifique suas credenciais.",
          code: "INVALID_CREDENTIALS"
        }
      }

      return { success: true }
    } catch (supabaseError: any) {
      console.warn("Supabase auth unreachable:", supabaseError?.message || supabaseError)

      // Em modo de desenvolvimento, se o Supabase Cloud antigo estiver inacessível, libera acesso local de demonstração
      // @ts-expect-error: TS4111 prevents dot notation, but Next.js requires it for build-time inline replacement
      const isDev = process.env.NEXT_PUBLIC_APP_MODE === 'development' || process.env.NODE_ENV === 'development'
      if (isDev) {
        return { success: true }
      }

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
