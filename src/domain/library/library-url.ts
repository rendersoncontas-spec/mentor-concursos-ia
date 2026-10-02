/**
 * G1.1 (G-28) — validação server-side de URLs da Biblioteca.
 *
 * Regra mínima: somente `http://` e `https://`. Nunca `javascript:`, `data:`,
 * `vbscript:`, `file:` ou schemes arbitrários. A UI pode validar também, mas
 * a decisão que vale é esta (server).
 */

export type LibraryUrlKind = "empty" | "valid" | "invalid"

/** "" / ausente = "sem link" (permitido — material sem URL é um estado válido). */
export function normalizeLibraryUrlInput(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function classifyLibraryUrl(value: unknown): LibraryUrlKind {
  const trimmed = normalizeLibraryUrlInput(value)
  if (trimmed === "") return "empty"
  return isAllowedLibraryUrl(trimmed) ? "valid" : "invalid"
}

export function isAllowedLibraryUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  if (trimmed === "") return false
  // Caracteres de controle / espaços internos / <> quebram ou escondem o destino.
  if (/[\s<>\\]/.test(trimmed)) return false
  let parsed: URL
  try {
    // URL relativa ("/x", "www.x", "pagina") lança → inválida.
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  const protocol = parsed.protocol.toLowerCase()
  return protocol === "http:" || protocol === "https:"
}

/** Defesa em profundidade na leitura: links legados inseguros não viram <a href>. */
export function isSafeHref(value: unknown): boolean {
  return isAllowedLibraryUrl(value)
}
