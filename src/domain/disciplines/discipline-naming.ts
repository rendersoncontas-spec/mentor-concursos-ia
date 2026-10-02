/**
 * G1.1 (G-02/G-17/G-27) — normalização canônica de nomes do catálogo global.
 *
 * Problema: `disciplines` é global (sem dono) e vários fluxos resolviam nomes
 * com regras diferentes (`trim` + `ilike` exato aqui, `sameNormalized` ali,
 * `.in("name")` case-sensitive acolá). Resultado: "Direito Penal",
 * "direito penal" e " Direito Penal " podiam virar 3 linhas globais.
 *
 * Contrato:
 * - `canonicalDisciplineKey` é a CHAVE de comparação (resolve/busca/insert/
 *   dedupe usam sempre ela; persistida em `disciplines.name_key`).
 * - O nome original exibido (`name`, apenas `trim` + espaços colapsados) NUNCA
 *   é destruído — display vs chave canônica são coisas separadas.
 */

export const DISCIPLINE_DISPLAY_NAME_MAX_LENGTH = 120

const COMBINING_DIACRITICALS_START = 0x0300
const COMBINING_DIACRITICALS_END = 0x036f

/** Remove marcas diacríticas combinantes (U+0300–U+036F) após NFD. */
function stripCombiningMarks(value: string): string {
  let out = ""
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= COMBINING_DIACRITICALS_START && cp <= COMBINING_DIACRITICALS_END) continue
    out += ch
  }
  return out
}

/**
 * Chave canônica: trim, acentos removidos, minúsculas, tudo que não é
 * alfanumérico vira espaço (hífen/variações incluídos), espaços colapsados.
 * " Direito-Penal " → "direito penal". "Raciocínio Lógico" → "raciocinio logico".
 */
export function canonicalDisciplineKey(name: string): string {
  const withoutAccents = stripCombiningMarks(name.normalize("NFD"))
  return withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function sameCanonicalDisciplineName(a: string, b: string): boolean {
  return canonicalDisciplineKey(a) === canonicalDisciplineKey(b)
}

/** Display: preserva caixa/acentos/hífens, só remove espaços das bordas e duplos. */
export function normalizeDisciplineDisplay(name: string): string {
  return name.replace(/\s+/g, " ").trim()
}

export function isValidDisciplineDisplayName(name: unknown): boolean {
  if (typeof name !== "string") return false
  const clean = normalizeDisciplineDisplay(name)
  return clean.length >= 1 && clean.length <= DISCIPLINE_DISPLAY_NAME_MAX_LENGTH
}

/** Cor personalizada/global: null (automática) ou #rrggbb. */
export function isValidDisciplineColorHex(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  if (trimmed === "") return true
  return /^#[0-9a-fA-F]{6}$/.test(trimmed)
}

export function normalizeDisciplineColorHex(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === "") return null
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : null
}
