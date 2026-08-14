"use server"

import { sendTestEmail, sendWelcomeEmail } from "@/infrastructure/email/email.service"
import { isResendConfigured } from "@/infrastructure/email/resend.client"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

/**
 * Server Action para envio de e-mail de teste para o usuário autenticado.
 * Apenas usuários com sessão ativa no Supabase podem disparar este teste.
 * O e-mail do destinatário é SEMPRE obtido do usuário autenticado no Supabase Auth.
 */
export async function sendTestEmailAction(): Promise<{
  success: boolean
  error?: string
  message?: string
  messageId?: string
  recipient?: string
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

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Buscar profile associado ao usuário autenticado
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, full_name, nickname, email")
      .eq("id", user.id)
      .maybeSingle()

    // O destinatário é o e-mail real da conta autenticada
    const recipientEmail = (user.email || profile?.email)?.trim()

    if (!recipientEmail) {
      return { success: false, error: "E-mail da conta autenticada não encontrado." }
    }

    const userName =
      profile?.nickname ||
      profile?.name ||
      profile?.full_name ||
      user.user_metadata?.["name"] ||
      user.user_metadata?.["full_name"] ||
      "Estudante"

    console.log(
      `[EmailAction] Disparando e-mail de teste para usuário autenticado (User ID: ${user.id}, Destinatário: ${recipientEmail})`,
    )

    const result = await sendTestEmail({
      to: recipientEmail,
      name: userName,
    })

    if (!result.success) {
      return {
        success: false,
        recipient: recipientEmail,
        error: result.error || "Não foi possível enviar o e-mail de teste.",
      }
    }

    const messageIdText = result.id ? ` (ID: ${result.id})` : ""
    return {
      success: true,
      recipient: recipientEmail,
      ...(result.id ? { messageId: result.id } : {}),
      message: `E-mail de teste enviado com sucesso para ${recipientEmail}!${messageIdText}`,
    }
  } catch (err: unknown) {
    const message =
      (err as { message?: string })?.message || "Erro interno ao enviar e-mail de teste."
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
  messageId?: string
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

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, full_name, nickname, email, preferences")
      .eq("id", user.id)
      .maybeSingle()

    // Respeitar se o usuário desativou e-mails nas preferências
    const prefs = profile?.preferences as Record<string, unknown> | null
    if (prefs && prefs["emails_enabled"] === false) {
      return { success: true }
    }

    const recipientEmail = (user.email || profile?.email)?.trim()
    if (!recipientEmail) {
      return { success: false, error: "E-mail do usuário não encontrado." }
    }

    const userName =
      profile?.nickname ||
      profile?.name ||
      profile?.full_name ||
      user.user_metadata?.["name"] ||
      user.user_metadata?.["full_name"] ||
      "Estudante"

    const result = await sendWelcomeEmail({
      to: recipientEmail,
      name: userName,
    })

    return {
      success: result.success,
      ...(result.id ? { messageId: result.id } : {}),
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
