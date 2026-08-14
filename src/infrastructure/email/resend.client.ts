import { Resend } from "resend"

/**
 * Cliente Resend inicializado no servidor.
 * Retorna uma instância do Resend se a chave estiver presente no process.env.
 */
let cachedClient: Resend | null = null
let cachedKey: string | null = null

export function getResendClient(): Resend | null {
  const key = process.env["RESEND_API_KEY"]?.trim()
  if (!key) {
    cachedClient = null
    cachedKey = null
    return null
  }

  if (cachedClient && cachedKey === key) {
    return cachedClient
  }

  cachedClient = new Resend(key)
  cachedKey = key
  return cachedClient
}

export function isResendConfigured(): boolean {
  const key = process.env["RESEND_API_KEY"]?.trim()
  return Boolean(key && key.length > 0)
}

export function getDefaultFromEmail(): string {
  return (
    process.env["EMAIL_FROM"]?.trim() ||
    process.env["NEXT_PUBLIC_EMAIL_FROM"]?.trim() ||
    "NomeIA <onboarding@resend.dev>"
  )
}

export function getAppUrl(): string {
  return (
    process.env["NEXT_PUBLIC_APP_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_SITE_URL"]?.trim() ||
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "http://localhost:3000")
  )
}

export function getResendDiagnosticInfo(): {
  resendConfigured: boolean
  hasEmailFrom: boolean
  hasAppUrl: boolean
  environment: string
  appUrl: string
} {
  return {
    resendConfigured: isResendConfigured(),
    hasEmailFrom: Boolean(process.env["EMAIL_FROM"]?.trim()),
    hasAppUrl: Boolean(process.env["NEXT_PUBLIC_APP_URL"]?.trim()),
    environment: process.env.NODE_ENV || "development",
    appUrl: getAppUrl(),
  }
}
