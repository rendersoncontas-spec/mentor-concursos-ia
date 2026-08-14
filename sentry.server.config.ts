import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = process.env["NEXT_PUBLIC_SENTRY_DSN"] || "https://2113bca42700583258eb8483fce7cbe8@o4511906244657152.ingest.us.sentry.io/4511906250489856"

Sentry.init({
  dsn: SENTRY_DSN,

  // Identificador dinâmico de ambiente
  environment: process.env["VERCEL_ENV"] || process.env["NODE_ENV"] || "development",

  // Ajuste esta taxa em produção para reduzir o uso da cota (0.1 = 10%)
  tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.1 : 1.0,

  // Segurança: Remove dados sensíveis antes de enviar ao Sentry
  beforeSend(event: any) {
    // 1. Remover headers com tokens e chaves
    if (event.request?.headers) {
      delete event.request.headers["authorization"]
      delete event.request.headers["cookie"]
      delete event.request.headers["x-supabase-auth"]
    }

    // 2. Limpar payload se for Rota de API (Resend, Auth)
    if (event.request?.url?.includes("resend") || event.request?.url?.includes("auth")) {
      delete event.request.data
    }

    // 3. Bloqueia envios se a rota for indesejada
    const url = event.request?.url
    if (url && url.includes("/api/debug") && process.env["NODE_ENV"] === "production") {
      return null // Não envia o erro pro Sentry
    }

    return event
  },

  beforeBreadcrumb(breadcrumb: any, hint?: any) {
    if (breadcrumb.category === "console") {
      const msg = String(breadcrumb.message)
      if (msg.includes("RESEND_API_KEY") || msg.includes("SUPABASE") || msg.includes("password")) {
        return null
      }
    }
    return breadcrumb
  },
})
