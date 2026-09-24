/**
 * Gerador de operationId (item 7 do pedido): sempre um UUID, nunca timestamp,
 * para que a mesma operação continue identificável de forma estável entre
 * retries e para servir de chave de idempotência quando ela chegar ao servidor.
 */
export function generateOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Fallback apenas para ambientes sem crypto.randomUUID (não deveria ocorrer
  // em Node >= 20 nem em navegadores modernos, mas evita quebrar o app).
  return "op-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12)
}
