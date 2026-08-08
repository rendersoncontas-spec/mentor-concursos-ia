"use server"

import { type RegisterInput, registerSchema } from "@/domain/auth/auth.schemas"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function registerAction(data: RegisterInput): Promise<AuthResponse> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const validatedData = registerSchema.parse(data)

    const supabase = await createClient()

    // Cadastro no Supabase Auth
    const { error } = await supabase.auth.signUp({
      email: validatedData.email,
      password: validatedData.password,
      options: {
        data: {
          name: validatedData.name, // salva no user_metadata
        },
        // Mudar caso queira confirmação de email ativa
        // emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })

    if (error) {
      if (error.status === 422 || error.message.includes("already registered") || error.message.includes("already exist")) {
        return { 
          success: false, 
          error: "Este e-mail já está cadastrado. Que tal fazer login?",
          code: "ALREADY_REGISTERED"
        }
      }
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Cadastro erro:", err)
    return { success: false, error: "Erro interno no servidor." }
  }
}
