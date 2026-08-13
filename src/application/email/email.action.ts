"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { sendTestEmail, sendWelcomeEmail } from "@/infrastructure/email/email.service"
import { isResendConfigured } from "@/infrastructure/email/resend.client"
import { isMaintenanceMode } from "@/lib/maintenance"

/**
 * Server Action para envio de e-mail de teste para o usuário autenticado.
 * Apenas usuários com sessão ativa no Supabase podem disparar este teste.
 */
export async function sendTestEmailAction(): Promise<{
  success: boolean
  error?: string
  message?: string
  simulated?: boolean
}> {
  if (isMaintenanceMode()) {
    return { success: false, error: "Sistema temporariamente indisponível." }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user || !user.email) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Buscar nome do perfil se disponível
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, full_name, nickname")
      .eq("id", user.id)
      .maybeSingle()

    const userName =
      profile?.nickname ||
      profile?.name ||
      profile?.full_name ||
      user.user_metadata?.["name"] ||
      "Estudante"

    const result = await sendTestEmail({
      to: user.email,
      name: userName,
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Não foi possível enviar o e-mail de teste.",
      }
    }

    if (result.simulated) {
      return {
        success: true,
        simulated: true,
        message:
          "E-mail de teste simulado com sucesso nos logs do servidor (RESEND_API_KEY não configurada no .env.local).",
      }
    }

    return {
      success: true,
      simulated: false,
      message: `E-mail de teste enviado com sucesso para ${user.email}! Verifique sua caixa de entrada ou spam.`,
    }
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "Erro interno ao enviar e-mail de teste."
    console.error("Erro em sendTestEmailAction:", err)
    return { success: false, error: message }
  }
}

/**
 * Server Action para envio de e-mail de boas-vindas pós-onboarding/cadastro.
 */
export async function sendWelcomeEmailAction(): Promise<{
  success: boolean
  error?: string
}> {
  if (isMaintenanceMode()) {
    return { success: false, error: "Sistema temporariamente indisponível." }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user || !user.email) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, full_name, nickname, preferences")
      .eq("id", user.id)
      .maybeSingle()

    // Respeitar se o usuário desativou e-mails nas preferências
    const prefs = profile?.preferences as Record<string, unknown> | null
    if (prefs && prefs["emails_enabled"] === false) {
      return { success: true }
    }

    const userName =
      profile?.nickname ||
      profile?.name ||
      profile?.full_name ||
      user.user_metadata?.["name"] ||
      "Estudante"

    const result = await sendWelcomeEmail({
      to: user.email,
      name: userName,
    })

    return {
      success: result.success,
      ...(result.error ? { error: result.error } : {}),
    }
  } catch (err: unknown) {
    console.error("Erro em sendWelcomeEmailAction:", err)
    return { success: false, error: "Erro interno ao enviar boas-vindas." }
  }
}

/**
 * Verifica no servidor se o Resend está configurado com API Key.
 */
export async function checkResendStatusAction(): Promise<{
  configured: boolean
}> {
  return { configured: isResendConfigured() }
}
