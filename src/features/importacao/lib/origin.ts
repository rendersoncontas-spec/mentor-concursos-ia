import type { OriginSource } from "@/domain/study-history/study-history.types"

/**
 * Arquitetura de fonte/plataforma de origem, reutilizável.
 * Para adicionar uma nova plataforma no futuro, basta incluir aqui.
 */

export interface ImportOrigin {
  source: OriginSource
  sourceName: string
}

export const ORIGIN_OPTIONS: { value: OriginSource; label: string }[] = [
  { value: "aprovado", label: "Aprovado" },
  { value: "estudei", label: "Estudei" },
  { value: "outra", label: "Outra" },
]

const KNOWN_PLATFORMS: { slug: OriginSource; label: string; match: string }[] = [
  { slug: "gran", label: "Gran", match: "gran" },
  { slug: "tec", label: "TEC Concursos", match: "tec concursos" },
  { slug: "qconcursos", label: "Qconcursos", match: "qconcursos" },
]

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Normaliza a seleção do usuário em um ImportOrigin persistível.
 * Retorna null quando "outra" foi escolhida sem informar um nome.
 */
export function normalizeOrigin(source: OriginSource, sourceName: string): ImportOrigin | null {
  if (source === "aprovado") return { source: "aprovado", sourceName: "Aprovado" }
  if (source === "estudei") return { source: "estudei", sourceName: "Estudei" }

  const name = (sourceName ?? "").trim()
  if (!name) return null

  const normalized = normalizeText(name)
  if (normalized.length > 60) {
    throw new Error("Nome da plataforma deve ter no máximo 60 caracteres")
  }

  const known = KNOWN_PLATFORMS.find((p) => p.match === normalized)
  if (known) return { source: known.slug, sourceName: known.label }
  return { source: "outra", sourceName: name.slice(0, 60) }
}

/**
 * Nome de exibição de uma origem persistida (fallback para dados antigos).
 */
export function originDisplayName(
  source: OriginSource | null | undefined,
  sourceName: string | null | undefined,
): string {
  if (sourceName) return sourceName
  if (source === "aprovado") return "Aprovado"
  if (source === "estudei") return "Estudei"
  if (source === "gran") return "Gran"
  if (source === "tec") return "TEC Concursos"
  if (source === "qconcursos") return "Qconcursos"
  return "Outra"
}
