import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN =
  process.env["NEXT_PUBLIC_SENTRY_DSN"] ||
  "https://2113bca42700583258eb8483fce7cbe8@o4511906244657152.ingest.us.sentry.io/4511906250489856"

Sentry.init({
  dsn: SENTRY_DSN,

  // Identificador dinâmico de ambiente
  environment: process.env["VERCEL_ENV"] || process.env["NODE_ENV"] || "development",

  // Ajuste esta taxa em produção para reduzir o uso da cota (0.1 = 10%)
  tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.1 : 1.0,

  // Segurança: Remove dados sensíveis antes de enviar ao Sentry
  beforeSend(event: any) {
    if (event.request?.headers) {
      delete event.request.headers["authorization"]
      delete event.request.headers["cookie"]
    }
    return event
  },
})
