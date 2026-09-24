/**
 * Classifica o RESULTADO de `saveStudySessionAction` quando ele responde
 * normalmente (não lança exceção) mas com `success: false`.
 *
 * Isso é diferente de `classifySyncError` (item 12 do pedido de Fase B):
 * aquele classifica uma EXCEÇÃO (erro de rede, status HTTP) lançada ao tentar
 * falar com o servidor. Este classifica uma RESPOSTA de negócio que o
 * servidor já processou e devolveu — ex.: "disciplina não encontrada" nunca
 * vai ter sucesso só de tentar de novo, mas "Usuário não autenticado" pode
 * (item 10 do pedido: sessão expirada não pode perder a operação).
 */
export interface SaveResultClassification {
  retryable: boolean
  reason: string
}

interface SaveStudySessionResultLike {
  success: boolean
  error?: string | null
  code?: string | null
}

/** Códigos de erro do Postgres que indicam um problema transitório (retryable). */
const RETRYABLE_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "57014", // query_canceled (timeout)
])

export function classifySaveStudySessionResult(
  result: SaveStudySessionResultLike,
): SaveResultClassification {
  if (result.success) {
    return { retryable: false, reason: "success" }
  }

  const message = (result.error || "").toLowerCase()

  // Item 10 do pedido: sessão local expirada -> não perder a operação, ela
  // deve continuar elegível para nova tentativa (ex.: depois que o usuário
  // fizer login de novo em outra aba e o token local for renovado).
  if (message.includes("não autenticado") || message.includes("faça login")) {
    return { retryable: true, reason: "auth_session_expired" }
  }

  if (result.code) {
    if (RETRYABLE_PG_CODES.has(result.code)) {
      return { retryable: true, reason: `postgres_${result.code}` }
    }
    // Qualquer outro código do Postgres (FK inválida, check constraint, etc.)
    // é um erro de dado — tentar de novo com o mesmo payload nunca resolve.
    return { retryable: false, reason: `postgres_${result.code}` }
  }

  // "Disciplina não encontrada", "selecione uma disciplina" e afins: erro de
  // dado/validação — não retryable, tentar de novo nunca vai funcionar.
  if (message.includes("disciplina") || message.includes("selecione")) {
    return { retryable: false, reason: "invalid_discipline" }
  }

  // Erro desconhecido: por segurança, mesma filosofia do classifySyncError —
  // retryable, para nunca perder a operação silenciosamente.
  return { retryable: true, reason: "unknown_functional_error" }
}
