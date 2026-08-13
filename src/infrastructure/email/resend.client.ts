import { Resend } from "resend"

const resendApiKey = process.env["RESEND_API_KEY"]

/**
 * Cliente Resend inicializado no servidor.
 * Retorna uma instância do Resend se a chave estiver presente, ou null com aviso em dev.
 */
let resendInstance: Resend | null = null

export function getResendClient(): Resend | null {
  if (resendInstance) return resendInstance

  const key = process.env["RESEND_API_KEY"]
  if (!key || key.trim() === "") {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Resend] Variável RESEND_API_KEY não configurada. O serviço de e-mail funcionará em modo simulação/log."
      )
    }
    return null
  }

  resendInstance = new Resend(key.trim())
  return resendInstance
}

export function isResendConfigured(): boolean {
  const key = process.env["RESEND_API_KEY"]
  return Boolean(key && key.trim().length > 0)
}

export function getDefaultFromEmail(): string {
  return (
    process.env["EMAIL_FROM"] ||
    process.env["NEXT_PUBLIC_EMAIL_FROM"] ||
    "Mentor IA <onboarding@resend.dev>"
  )
}

export function getAppUrl(): string {
  return (
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    "https://mentor-ia.vercel.app"
  )
}
