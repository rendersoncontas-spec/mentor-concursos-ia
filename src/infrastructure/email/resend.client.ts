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
  const configured =
    process.env["NEXT_PUBLIC_APP_URL"]?.trim() ||
    process.env["NEXT_PUBLIC_SITE_URL"]?.trim() ||
    (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : null)

  if (configured) return configured

  // BUG CORRIGIDO (hardening 2026-09-21): o fallback para localhost:3000 já
  // existia (só é alcançado se NENHUMA das três variáveis acima estiver
  // definida — NEXT_PUBLIC_APP_URL é a variável já usada por este projeto,
  // ver .env.local; NEXT_PUBLIC_SITE_URL e VERCEL_URL são fallbacks
  // adicionais). Não inventamos uma variável nova: NEXT_PUBLIC_APP_URL já é
  // a configurada localmente e deve ser a mesma configurada em produção. O
  // que faltava era visibilidade: se esse fallback for atingido em
  // produção, os links enviados por e-mail (recuperação de senha,
  // confirmação, boas-vindas) apontariam silenciosamente para
  // localhost:3000 e quebrariam para o usuário sem nenhum log de erro. Este
  // aviso não muda a URL retornada (comportamento de dev preservado
  // exatamente como antes) — só torna o problema visível caso ocorra fora
  // do ambiente de desenvolvimento.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[RESEND] getAppUrl(): nenhuma de NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL ou VERCEL_URL " +
        "está definida em produção — usando http://localhost:3000 como URL base dos links de e-mail. " +
        "Configure NEXT_PUBLIC_APP_URL no ambiente de produção.",
    )
  }

  return "http://localhost:3000"
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
