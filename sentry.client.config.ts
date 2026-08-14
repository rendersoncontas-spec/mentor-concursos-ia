import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = process.env["NEXT_PUBLIC_SENTRY_DSN"] || "https://2113bca42700583258eb8483fce7cbe8@o4511906244657152.ingest.us.sentry.io/4511906250489856";

Sentry.init({
  dsn: SENTRY_DSN,

  // Identificador dinâmico de ambiente
  environment: process.env["NEXT_PUBLIC_VERCEL_ENV"] || process.env["NODE_ENV"] || "development",

  // Ajuste esta taxa em produção para reduzir o uso da cota (0.1 = 10%)
  tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.1 : 1.0,

  // Segurança: Remove dados sensíveis antes de enviar ao Sentry
  beforeSend(event: any) {
    if (event.request) {
      delete event.request.cookies
    }

    // Limpar emails se vazados nos breadcrumbs/dados do client
    if (event.user && event.user.email) {
      delete event.user.email
    }

    // Bloqueia envios se a rota for indesejada
    const url = event.request?.url;
    if (url && url.includes("/api/debug") && process.env["NODE_ENV"] === "production") {
      return null;
    }

    return event;
  },

  beforeBreadcrumb(breadcrumb: any, hint?: any) {
    // Remover conteúdo de requests que podem conter e-mails ou conteúdo privado
    if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
      if (breadcrumb.data && breadcrumb.data.url) {
        if (breadcrumb.data.url.includes("supabase.co") || breadcrumb.data.url.includes("resend")) {
          // Filtra a URL inteira para não vazar query params
          breadcrumb.data.url = "[FILTERED_URL]"
        }
      }
    }
    return breadcrumb
  },
})
