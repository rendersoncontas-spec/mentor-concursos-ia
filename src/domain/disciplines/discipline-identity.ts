/**
 * G2.12 — identidade canônica de disciplina (cálculo puro, sem banco).
 *
 * O catálogo global `disciplines` tem entradas que são a MESMA matéria com
 * nomes diferentes (ex.: "Raciocínio Lógico e Matemático" e "Raciocínio
 * Lógico-Matemático"). Apagar/fundir linhas quebraria o histórico (FKs em
 * study_history, simulado_disciplines, ciclos, planos...). A solução é uma
 * relação EXPLÍCITA, curada por admin, em `disciplines.canonical_discipline_id`:
 * a linha-alias continua existindo, o histórico continua apontando para ela, e
 * as ANÁLISES resolvem `discipline_id → canonical_discipline_id` aqui.
 *
 * Regras (únicas para todas as telas que cruzam fontes):
 *   - Identidade NUNCA vem de texto: nome parecido não junta nada. Só a
 *     relação gravada no catálogo junta duas linhas.
 *   - Id desconhecido, sem relação, com relação para si mesmo ou em ciclo →
 *     é a própria identidade (fail-safe: no pior caso, nada é unido).
 *   - Cadeias (A → B → C) são seguidas até a raiz, com limite e detecção de
 *     ciclo; o banco (trigger da migration G2.12) já impede cadeias novas.
 *   - Nome exibido da identidade: `custom_name` pessoal da linha canônica,
 *     senão o nome global da canônica. Nada é renomeado no banco.
 *   - Os objetos de entrada nunca são alterados (histórico intacto).
 */

import { canonicalDisciplineKey } from "./discipline-naming"

const MAX_CHAIN_DEPTH = 8

export interface DisciplineCatalogEntry {
  id: string
  name: string
  /** `disciplines.canonical_discipline_id`; null/ausente = é canônica. */
  canonicalDisciplineId?: string | null
}

export interface PersonalDisciplineName {
  disciplineId: string
  customName: string | null
}

/**
 * Forma serializável (vai do servidor para o cliente) da identidade das
 * disciplinas que aparecem nos dados de UM usuário.
 */
export interface DisciplineIdentitySnapshot {
  /** Só ids cuja identidade é OUTRA linha: alias → canônica. */
  canonicalOf: Record<string, string>
  /** Identidade canônica → nome exibido (custom_name pessoal ou global). */
  displayName: Record<string, string>
  /** Identidade canônica → nomes globais das linhas-alias carregadas. */
  memberNames: Record<string, string[]>
}

export const EMPTY_DISCIPLINE_IDENTITY: DisciplineIdentitySnapshot = Object.freeze({
  canonicalOf: {},
  displayName: {},
  memberNames: {},
}) as DisciplineIdentitySnapshot

/** Resolve alias → raiz canônica, seguindo cadeias com guarda de ciclo. */
export function resolveCanonicalIds(entries: DisciplineCatalogEntry[]): Map<string, string> {
  const parent = new Map<string, string>()
  for (const e of entries) {
    const target = typeof e.canonicalDisciplineId === "string" ? e.canonicalDisciplineId.trim() : ""
    if (target && target !== e.id) parent.set(e.id, target)
  }
  const resolved = new Map<string, string>()
  for (const id of parent.keys()) {
    const seen = new Set<string>([id])
    let current = id
    let ok = true
    for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
      const next = parent.get(current)
      if (next === undefined) break
      if (seen.has(next)) {
        ok = false // ciclo: ninguém do ciclo é unido
        break
      }
      seen.add(next)
      current = next
    }
    if (ok && parent.has(current)) ok = false // cadeia longa demais
    if (ok && current !== id) resolved.set(id, current)
  }
  return resolved
}

export function buildDisciplineIdentity(input: {
  catalog: DisciplineCatalogEntry[]
  personal?: PersonalDisciplineName[]
}): DisciplineIdentitySnapshot {
  const byId = new Map<string, DisciplineCatalogEntry>()
  for (const e of input.catalog) if (!byId.has(e.id)) byId.set(e.id, e)

  const canonicalMap = resolveCanonicalIds(input.catalog)
  const canonicalOf: Record<string, string> = {}
  for (const [alias, root] of canonicalMap) canonicalOf[alias] = root

  // Primeiro custom_name não vazio por disciplina (entrada já vem ordenada).
  const custom = new Map<string, string>()
  for (const p of input.personal ?? []) {
    const name = (p.customName ?? "").trim()
    if (name && !custom.has(p.disciplineId)) custom.set(p.disciplineId, name)
  }

  const displayName: Record<string, string> = {}
  const memberNames: Record<string, string[]> = {}
  for (const e of byId.values()) {
    const root = canonicalMap.get(e.id) ?? e.id
    if (displayName[root] === undefined) {
      const rootEntry = byId.get(root)
      const name = custom.get(root) ?? rootEntry?.name ?? e.name
      displayName[root] = name
    }
    if (root !== e.id) {
      const list = memberNames[root] ?? []
      if (!list.includes(e.name)) list.push(e.name)
      memberNames[root] = list
    }
  }
  for (const list of Object.values(memberNames)) list.sort((a, b) => a.localeCompare(b, "pt-BR"))

  return { canonicalOf, displayName, memberNames }
}

export function canonicalIdOf(identity: DisciplineIdentitySnapshot | null | undefined, id: string): string {
  return identity?.canonicalOf[id] ?? id
}

export function canonicalIdOrNull(
  identity: DisciplineIdentitySnapshot | null | undefined,
  id: string | null | undefined,
): string | null {
  return id ? canonicalIdOf(identity, id) : null
}

export function identityDisplayName(
  identity: DisciplineIdentitySnapshot | null | undefined,
  id: string,
  fallback: string,
): string {
  const root = canonicalIdOf(identity, id)
  return identity?.displayName[root] ?? fallback
}

/** Mapeia o `disciplineId` de qualquer coleção para a identidade canônica. */
export function canonicalizeDisciplineIds<T extends { disciplineId: string | null }>(
  items: T[],
  identity: DisciplineIdentitySnapshot | null | undefined,
): T[] {
  if (!identity || Object.keys(identity.canonicalOf).length === 0) return items
  return items.map((item) => {
    if (!item.disciplineId) return item
    const root = canonicalIdOf(identity, item.disciplineId)
    return root === item.disciplineId ? item : { ...item, disciplineId: root }
  })
}

/**
 * Chave de agrupamento de matéria em análises: identidade canônica quando há
 * id; sem id, a chave canônica do NOME (mesma regra do catálogo).
 */
export function subjectIdentityKey(subject: { disciplineId: string | null; disciplineName: string }): string {
  return subject.disciplineId ? `id:${subject.disciplineId}` : `name:${canonicalDisciplineKey(subject.disciplineName)}`
}
