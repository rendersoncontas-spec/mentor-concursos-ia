import assert from "node:assert/strict"

/**
 * Fase G — só para testes: devolve o valor garantindo (com asserção) que ele
 * existe. Substitui o operador `!` (non-null assertion), que apenas silencia o
 * TypeScript e, se o valor faltar, falha mais tarde com um TypeError confuso.
 */
export function must<T>(value: T | null | undefined, label = "valor esperado"): T {
  assert.ok(value !== null && value !== undefined, `${label} não encontrado`)
  return value
}
