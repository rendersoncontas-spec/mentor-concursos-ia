/**
 * SISTEMA CENTRAL DE CORES DE DISCIPLINAS
 *
 * A cor PERTENCE À DISCIPLINA (cadastro global), não à sessão.
 * - `color_hex` na tabela `disciplines` guarda a cor persistente.
 * - Se `color_hex` for NULL, usamos uma cor determinística derivada do ID
 *   (NUNCA aleatória por render), garantindo estabilidade mesmo antes do
 *   backfill da migration.
 * - Proibido hardcode por nome de disciplina.
 */

export const DISCIPLINE_COLOR_PALETTE = [
  "#f43f5e", // rosa forte
  "#8b5cf6", // roxo
  "#f59e0b", // âmbar
  "#0ea5e9", // azul céu
  "#10b981", // esmeralda
  "#ef4444", // vermelho
  "#6366f1", // índigo
  "#14b8a6", // teal
  "#a855f7", // violeta
  "#f97316", // laranja
  "#06b6d4", // ciano
  "#84cc16", // lima
  "#e11d48", // rosa profundo
  "#3b82f6", // azul
  "#d946ef", // fúcsia
  "#22c55e", // verde
] as const

export const DEFAULT_DISCIPLINE_COLOR = "#64748b"

/** Hash determinístico e estável de um id (não muda entre renders/sessões). */
function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * Resolve a cor de uma disciplina:
 * 1. cor persistida no banco (`color_hex`);
 * 2. senão, cor determinística derivada do ID (estável entre páginas/dias);
 * 3. senão, cor neutra de fallback.
 */
export function disciplineColorHex(
  disciplineId: string | null | undefined,
  storedColorHex: string | null | undefined,
): string {
  if (storedColorHex && storedColorHex.trim().length > 0) return storedColorHex.trim()
  if (!disciplineId) return DEFAULT_DISCIPLINE_COLOR
  return (
    DISCIPLINE_COLOR_PALETTE[hashId(disciplineId) % DISCIPLINE_COLOR_PALETTE.length] ??
    DEFAULT_DISCIPLINE_COLOR
  )
}
