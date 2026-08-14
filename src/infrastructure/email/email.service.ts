import {
  getImportCompletedEmailTemplate,
  getStudyReminderEmailTemplate,
  getTestEmailTemplate,
  getWeeklySummaryEmailTemplate,
  getWelcomeEmailTemplate,
} from "./email.templates"
import type {
  ImportCompletedStats,
  SendEmailOptions,
  SendEmailResult,
  StudyReminderDetails,
  WeeklySummaryStats,
} from "./email.types"
import {
  getAppUrl,
  getDefaultFromEmail,
  getResendClient,
  getResendDiagnosticInfo,
  isResendConfigured,
} from "./resend.client"

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
 * rate limit, logs estruturados e proteção contra duplicidade.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  cleanupMaps()

  const toAddress = Array.isArray(options.to) ? options.to[0] : options.to
  if (!toAddress) {
    return { success: false, error: "Destinatário não especificado." }
  }

  const primaryRecipient = toAddress.trim().toLowerCase()
  const timestamp = new Date().toISOString()
  const categoryTag = options.tags?.find((t) => t.name === "category")?.value || "general"
  const diagnostic = getResendDiagnosticInfo()

  // 1. Verificação de idempotência (previne duplo clique e reenvios acidentais em 30s)
  const idempotencyKey = options.idempotencyKey || `${primaryRecipient}:${options.subject.trim()}`
  const existing = idempotencyMap.get(idempotencyKey)
  if (existing && Date.now() - existing.timestamp < IDEMPOTENCY_WINDOW_MS) {
    console.log(
      `[EmailService] [${timestamp}] [IDEMPOTENCIA] Disparo duplicado bloqueado para ${maskEmail(primaryRecipient)} (categoria: ${categoryTag}).`,
    )
    return existing.result
  }

  // 2. Verificação de Rate Limit (5 e-mails/minuto por destinatário)
  if (!checkRateLimit(primaryRecipient)) {
    console.warn(
      `[EmailService] [${timestamp}] [RATE_LIMIT_EXCEEDED] Limite de 5 envios/min excedido para ${maskEmail(primaryRecipient)}.`,
    )
    return {
      success: false,
      error:
        "Limite de envios excedido para este e-mail (máximo 5 por minuto). Aguarde antes de tentar novamente.",
    }
  }

  const client = getResendClient()
  const from = options.from || getDefaultFromEmail()

  // 3. Verificação de API Key no servidor (process.env.RESEND_API_KEY)
  if (!client || !isResendConfigured()) {
    console.error(
      `[EmailService] [${timestamp}] [CONFIG_ERROR] Falha no disparo para ${maskEmail(primaryRecipient)}: RESEND_API_KEY não encontrada no process.env.`,
      JSON.stringify(diagnostic),
    )

    const unconfiguredResult: SendEmailResult = {
      success: false,
      error:
        "Serviço de e-mail não configurado no servidor. A variável RESEND_API_KEY precisa ser adicionada ao ambiente (Vercel ou .env.local).",
      simulated: true,
    }
    return unconfiguredResult
  }

  // 4. Disparo Real via API Resend
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
        `[EmailService] [${timestamp}] [RESEND_ERROR] Falha para ${maskEmail(primaryRecipient)} | Categoria: ${categoryTag} | Erro: ${response.error.message} (${durationMs}ms)`,
      )
      return {
        success: false,
        error: response.error.message || "Erro retornado pela API do Resend.",
      }
    }

    const messageId = response.data?.id
    console.log(
      `[EmailService] [${timestamp}] [SUCCESS] E-mail entregue ao Resend para ${maskEmail(primaryRecipient)} | Categoria: ${categoryTag} | Message ID: ${messageId} (${durationMs}ms)`,
    )

    const result: SendEmailResult = {
      success: true,
      ...(messageId ? { id: messageId } : {}),
    }

    idempotencyMap.set(idempotencyKey, { timestamp: Date.now(), result })
    return result
  } catch (err: unknown) {
    const errorMsg =
      (err as { message?: string })?.message || "Erro de conexão com o servidor do Resend."
    console.error(
      `[EmailService] [${timestamp}] [EXCEPTION] Exceção ao enviar para ${maskEmail(primaryRecipient)}: ${errorMsg}`,
    )
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
