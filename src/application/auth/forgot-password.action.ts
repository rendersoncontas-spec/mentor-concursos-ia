"use server"

import { type ForgotPasswordInput, forgotPasswordSchema } from "@/domain/auth/auth.schemas"
import { type AuthResponse } from "@/domain/auth/auth.types"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function forgotPasswordAction(
  data: ForgotPasswordInput,
  redirectTo?: string,
): Promise<AuthResponse> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const validatedData = forgotPasswordSchema.parse(data)

    const supabase = await createClient()

    // redirectTo vem de window.location.origin no client (mesmo padrão do
    // botão do Google em google-auth-button.tsx) — não é um parâmetro de
    // URL de uma requisição alheia, então não há risco de open redirect
    // aqui. Sem isso, o link do e-mail de recuperação usa o Site URL padrão
    // configurado no projeto Supabase, que pode nem apontar para a página
    // que realmente trata a troca de senha (/update-password).
    const { error } = await supabase.auth.resetPasswordForEmail(
      validatedData.email,
      redirectTo ? { redirectTo: `${redirectTo}/update-password` } : {},
    )

    if (error) {
      return { success: false, error: "Erro ao enviar e-mail de recuperação." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Forgot password erro:", err)
    return { success: false, error: "Erro interno no servidor." }
  }
}
