/**
 * Classificação de erro de sincronização (item 12 do pedido):
 *  - erro de rede (offline, timeout, DNS, etc.) -> retryable;
 *  - 5xx do servidor -> retryable;
 *  - 4xx funcional (dado inválido, não autorizado, etc.) -> NÃO retryable,
 *    marcar FAILED e parar (nunca tentar indefinidamente).
 *
 * Função pura e isolada de propósito: quem decide o que fazer com o
 * resultado (mover para FAILED vs. deixar para o próximo retry) é o
 * chamador (o worker de sincronização, que chega numa fase seguinte) — este
 * módulo só classifica.
 */
export interface SyncErrorClassification {
  retryable: boolean
  reason: string
}

interface HttpLikeError {
  status?: number
  statusCode?: number
}

function extractHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null
  const candidate = error as HttpLikeError
  if (typeof candidate.status === "number") return candidate.status
  if (typeof candidate.statusCode === "number") return candidate.statusCode
  return null
}

function looksLikeNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true
  if (error instanceof TypeError) return true // fetch lança TypeError para falha de rede
  if (typeof error === "object" && error !== null) {
    const message = String((error as { message?: unknown }).message ?? "")
    return /network|fetch failed|failed to fetch|offline|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)
  }
  return false
}

export function classifySyncError(error: unknown): SyncErrorClassification {
  if (looksLikeNetworkError(error)) {
    return { retryable: true, reason: "network_error" }
  }

  const status = extractHttpStatus(error)
  if (status !== null) {
    if (status >= 500) return { retryable: true, reason: `server_error_${status}` }
    if (status >= 400) return { retryable: false, reason: `client_error_${status}` }
  }

  // Erro desconhecido (ex.: exceção inesperada no cliente Supabase): por
  // segurança, tratamos como retryable — perder a operação silenciosamente
  // seria pior do que tentar de novo. O limite de tentativas fica a cargo
  // do worker de sincronização (retryCount), evitando retry infinito.
  return { retryable: true, reason: "unknown_error" }
}
