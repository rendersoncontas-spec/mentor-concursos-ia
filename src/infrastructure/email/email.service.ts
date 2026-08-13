import { getResendClient, getDefaultFromEmail, getAppUrl, isResendConfigured } from "./resend.client"
import type {
  SendEmailOptions,
  SendEmailResult,
  WeeklySummaryStats,
  ImportCompletedStats,
  StudyReminderDetails,
} from "./email.types"
import {
  getTestEmailTemplate,
  getWelcomeEmailTemplate,
  getWeeklySummaryEmailTemplate,
  getImportCompletedEmailTemplate,
  getStudyReminderEmailTemplate,
} from "./email.templates"

// Rate limit em memória: máximo de 5 e-mails por destinatário a cada 60 segundos
const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_EMAILS = 5

// Idempotência / Prevenção de duplo clique (30 segundos)
const idempotencyMap = new Map<string, { timestamp: number; result: SendEmailResult }>()
const IDEMPOTENCY_WINDOW_MS = 30 * 1000

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***@***"
  const [user, domain] = email.split("@")
  const maskedUser = user ? (user.length > 2 ? `${user.slice(0, 2)}***` : `${user}***`) : "***"
  return `${maskedUser}@${domain}`
}

function checkRateLimit(recipient: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(recipient) || []
  const recentTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)

  if (recentTimestamps.length >= RATE_LIMIT_MAX_EMAILS) {
    return false
  }

  recentTimestamps.push(now)
  rateLimitMap.set(recipient, recentTimestamps)
  return true
}

function cleanupMaps() {
  const now = Date.now()
  for (const [key, value] of idempotencyMap.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_WINDOW_MS) {
      idempotencyMap.delete(key)
    }
  }
}

/**
 * Envia um e-mail transacional via Resend com tratamento centralizado de erros,
 * rate limit, logs seguros e suporte a simulação em ambiente de desenvolvimento.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  cleanupMaps()

  const toAddress = Array.isArray(options.to) ? options.to[0] : options.to
  if (!toAddress) {
    return { success: false, error: "Destinatário não especificado." }
  }

  const primaryRecipient = toAddress.trim().toLowerCase()

  // 1. Verificação de idempotência (previne duplo clique)
  const idempotencyKey =
    options.idempotencyKey || `${primaryRecipient}:${options.subject.trim()}`
  const existing = idempotencyMap.get(idempotencyKey)
  if (existing && Date.now() - existing.timestamp < IDEMPOTENCY_WINDOW_MS) {
    console.log(
      `[EmailService] Idempotência ativa. Disparo duplicado ignorado para ${maskEmail(primaryRecipient)}.`
    )
    return existing.result
  }

  // 2. Verificação de Rate Limit
  if (!checkRateLimit(primaryRecipient)) {
    console.warn(
      `[EmailService] Rate limit excedido para ${maskEmail(primaryRecipient)}. Limite de ${RATE_LIMIT_MAX_EMAILS} emails/minuto.`
    )
    return {
      success: false,
      error: "Muitos e-mails enviados recentemente para este endereço. Aguarde um momento.",
    }
  }

  const client = getResendClient()
  const from = options.from || getDefaultFromEmail()

  // Se o Resend não estiver configurado (sem API key), registra log e simula sucesso em dev
  if (!client || !isResendConfigured()) {
    console.log(`\n================== [EMAIL SIMULADO (RESEND_API_KEY AUSENTE)] ==================`)
    console.log(`Para: ${maskEmail(primaryRecipient)}`)
    console.log(`De: ${from}`)
    console.log(`Assunto: ${options.subject}`)
    console.log(`===============================================================================\n`)

    const simulatedResult: SendEmailResult = {
      success: true,
      id: `sim_${Date.now()}`,
      simulated: true,
    }
    idempotencyMap.set(idempotencyKey, { timestamp: Date.now(), result: simulatedResult })
    return simulatedResult
  }

  try {
    const startTime = Date.now()

    const emailPayload = {
      from,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      ...(options.text ? { text: options.text } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options.tags ? { tags: options.tags } : {}),
    }

    const response = await client.emails.send(emailPayload)

    const durationMs = Date.now() - startTime

    if (response.error) {
      console.error(
        `[EmailService] Falha ao enviar e-mail para ${maskEmail(primaryRecipient)}:`,
        response.error.message
      )
      return {
        success: false,
        error: response.error.message || "Erro desconhecido ao enviar e-mail via Resend.",
      }
    }

    console.log(
      `[EmailService] E-mail enviado com sucesso para ${maskEmail(primaryRecipient)} | ID: ${response.data?.id} (${durationMs}ms)`
    )

    const result: SendEmailResult = {
      success: true,
      ...(response.data?.id ? { id: response.data.id } : {}),
    }

    idempotencyMap.set(idempotencyKey, { timestamp: Date.now(), result })
    return result
  } catch (err: unknown) {
    const errorMsg = (err as { message?: string })?.message || "Erro de conexão com o serviço de e-mail."
    console.error(`[EmailService] Exceção no envio para ${maskEmail(primaryRecipient)}:`, errorMsg)
    return {
      success: false,
      error: errorMsg,
    }
  }
}

/**
 * Envia e-mail de teste para validação de infraestrutura
 */
export async function sendTestEmail({
  to,
  name,
}: {
  to: string
  name?: string | null
}): Promise<SendEmailResult> {
  const appUrl = getAppUrl()
  const template = getTestEmailTemplate({
    ...(name ? { name } : {}),
    email: to,
    appUrl,
  })

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "test" }],
  })
}

/**
 * Envia e-mail de boas-vindas para novos usuários
 */
export async function sendWelcomeEmail({
  to,
  name,
}: {
  to: string
  name?: string | null
}): Promise<SendEmailResult> {
  const appUrl = getAppUrl()
  const template = getWelcomeEmailTemplate({
    ...(name ? { name } : {}),
    appUrl,
  })

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "welcome" }],
  })
}

/**
 * Envia resumo semanal de estudos
 */
export async function sendWeeklySummaryEmail({
  to,
  name,
  stats,
}: {
  to: string
  name?: string | null
  stats: WeeklySummaryStats
}): Promise<SendEmailResult> {
  const appUrl = getAppUrl()
  const template = getWeeklySummaryEmailTemplate({
    ...(name ? { name } : {}),
    stats,
    appUrl,
  })

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "weekly_summary" }],
  })
}

/**
 * Envia notificação de importação de histórico concluída
 */
export async function sendImportCompletedEmail({
  to,
  name,
  stats,
}: {
  to: string
  name?: string | null
  stats: ImportCompletedStats
}): Promise<SendEmailResult> {
  const appUrl = getAppUrl()
  const template = getImportCompletedEmailTemplate({
    ...(name ? { name } : {}),
    stats,
    appUrl,
  })

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "import_completed" }],
  })
}

/**
 * Envia lembrete de estudos ou revisões pendentes
 */
export async function sendStudyReminderEmail({
  to,
  name,
  details,
}: {
  to: string
  name?: string | null
  details: StudyReminderDetails
}): Promise<SendEmailResult> {
  const appUrl = getAppUrl()
  const template = getStudyReminderEmailTemplate({
    ...(name ? { name } : {}),
    details,
    appUrl,
  })

  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [{ name: "category", value: "study_reminder" }],
  })
}
