import { canonicalIdOf, type DisciplineIdentitySnapshot } from "@/domain/disciplines/discipline-identity"
import { normalizeText, similarity } from "@/features/importacao/lib/subject-matcher"

/**
 * Qual item do ciclo recebe um estudo (puro; extraído de
 * cycle-study-registration.service.ts sem mudar o contrato).
 *
 * Ordem — a primeira que casar vence:
 *   1. "id"         — mesmo `discipline_id` (caso A);
 *   2. "identity"   — G2.14: mesma IDENTIDADE CANÔNICA (alias ↔ canônica,
 *                     vínculo gravado no catálogo; caso B). Só existe quando o
 *                     catálogo declara vínculos — sem eles, este passo não faz
 *                     nada e o resultado é idêntico ao anterior;
 *   3. "name"       — nome normalizado igual (contrato legado);
 *   4. "similarity" — similaridade ≥ 0,8 (contrato legado, preservado: cobre
 *                     histórico importado com nomes diferentes do item).
 *
 * Atenção (documentado na G2.14): o passo 4 também casa matérias que o
 * produto considera DIFERENTES (caso C, ex.: "Raciocínio Lógico" → "Raciocínio
 * Lógico e Matemático", score 0,80). Mudar isso altera o progresso de ciclos
 * reais e depende de decisão de produto — não é feito aqui.
 */

export const CYCLE_SIMILARITY_THRESHOLD = 0.8

export type CycleMatchKind = "id" | "identity" | "name" | "similarity"

export interface CycleMatchItem {
  id: string
  disciplineId: string
  disciplineName: string
}

export function buildCycleItemMatcher<T extends CycleMatchItem>(
  items: T[],
  identity?: DisciplineIdentitySnapshot | null,
): (study: { disciplineId: string | null; disciplineName: string }) => { item: T; kind: CycleMatchKind } | null {
  const byId = new Map(items.map((item) => [item.disciplineId, item]))
  const byName = new Map(items.map((item) => [normalizeText(item.disciplineName || ""), item]))

  // Identidade → item (na ordem do ciclo; prefere o item cujo id É a canônica).
  const hasAliases = !!identity && Object.keys(identity.canonicalOf).length > 0
  const byRoot = new Map<string, T>()
  if (hasAliases) {
    for (const item of items) {
      const root = canonicalIdOf(identity, item.disciplineId)
      const current = byRoot.get(root)
      if (!current || (item.disciplineId === root && current.disciplineId !== root)) byRoot.set(root, item)
    }
  }

  const bySimilarity = (name: string): T | null => {
    let best: T | null = null
    let score = 0
    for (const item of items) {
      const candidate = similarity(name, item.disciplineName || "")
      if (candidate > score) {
        best = item
        score = candidate
      }
    }
    return score >= CYCLE_SIMILARITY_THRESHOLD ? best : null
  }

  return (study) => {
    const direct = study.disciplineId ? byId.get(study.disciplineId) : undefined
    if (direct) return { item: direct, kind: "id" }
    if (hasAliases && study.disciplineId) {
      const viaIdentity = byRoot.get(canonicalIdOf(identity, study.disciplineId))
      if (viaIdentity) return { item: viaIdentity, kind: "identity" }
    }
    if (!study.disciplineName) return null
    const exact = byName.get(normalizeText(study.disciplineName))
    if (exact) return { item: exact, kind: "name" }
    const similar = bySimilarity(study.disciplineName)
    return similar ? { item: similar, kind: "similarity" } : null
  }
}
