import {
  canonicalIdOf,
  identityDisplayName,
  type DisciplineIdentitySnapshot,
} from "@/domain/disciplines/discipline-identity"

/**
 * G2.14 — identidade canônica da disciplina no Dashboard (cálculo puro).
 *
 * Mesmo desenho das Estatísticas (G2.13): a tradução `discipline_id →
 * identidade` acontece UMA vez, sobre os dados lidos, e os cálculos do
 * Dashboard (ranking por matéria, desempenho por matéria, cobertura do
 * edital, contexto plano/ciclo/30 dias) continuam agrupando por id — agora o
 * id canônico. Nada é gravado; o histórico real não muda.
 *
 * Sem vínculo no catálogo (ou migration G2.12 ainda não aplicada), a
 * identidade é o próprio id e tudo fica como antes.
 */

type JoinedName = { name: string | null; area?: string | null } | { name: string | null; area?: string | null }[] | null | undefined

function firstJoined(value: JoinedName) {
  return Array.isArray(value) ? value[0] : value
}

/** Mantém a primeira ocorrência de cada id real (página repetida não duplica). */
function uniqueById<T extends { id?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row.id) return true
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

export function collectDashboardDisciplineIds(input: {
  history?: { discipline_id: string | null }[]
  attempts?: { discipline_id: string | null }[]
  userDisciplines?: { discipline_id?: string | null; discipline?: { id?: string | null } | null }[]
  planItems?: { discipline_id?: string | null }[]
  cycleBlocks?: { disciplineId?: string | null }[]
}): string[] {
  const ids = new Set<string>()
  const add = (id: string | null | undefined) => {
    if (typeof id === "string" && id) ids.add(id)
  }
  input.history?.forEach((h) => add(h.discipline_id))
  input.attempts?.forEach((a) => add(a.discipline_id))
  input.userDisciplines?.forEach((u) => {
    add(u.discipline_id)
    add(u.discipline?.id)
  })
  input.planItems?.forEach((p) => add(p.discipline_id))
  input.cycleBlocks?.forEach((b) => add(b.disciplineId))
  return [...ids].sort()
}

/**
 * Sessões de estudo na identidade canônica: `discipline_id` e o nome do join
 * `disciplines` passam a ser os da identidade (custom_name do aluno na
 * canônica, senão o nome global). Cópias; entrada intacta.
 */
export function canonicalizeHistoryRows<T extends { id?: string | null; discipline_id: string | null; disciplines?: JoinedName }>(
  rows: T[],
  identity: DisciplineIdentitySnapshot,
): T[] {
  return uniqueById(rows).map((row) => {
    if (!row.discipline_id) return row
    const root = canonicalIdOf(identity, row.discipline_id)
    const joined = firstJoined(row.disciplines)
    const name = identityDisplayName(identity, root, joined?.name ?? "")
    if (root === row.discipline_id && (!joined || name === joined.name)) return row
    return {
      ...row,
      discipline_id: root,
      disciplines: joined ? { ...joined, name } : row.disciplines,
    }
  })
}

export function canonicalizeAttemptRows<T extends { id?: string | null; discipline_id: string | null }>(
  rows: T[],
  identity: DisciplineIdentitySnapshot,
): T[] {
  return uniqueById(rows).map((row) => {
    if (!row.discipline_id) return row
    const root = canonicalIdOf(identity, row.discipline_id)
    return root === row.discipline_id ? row : { ...row, discipline_id: root }
  })
}

/**
 * Vínculos do aluno (`user_disciplines`) na identidade canônica: UMA entrada
 * por identidade. Com alias e canônica vinculados, vale a linha da própria
 * canônica (status, id da linha); sem ela, a do primeiro alias. O nome passa a
 * ser o da identidade. É o que alimenta a cobertura do edital e o
 * "Desempenho por matéria" do Dashboard — a tela "Disciplinas" (gestão dos
 * vínculos) continua mostrando cada vínculo real.
 */
export function mergeUserDisciplinesByIdentity<
  D extends { id: string; name: string },
  T extends { discipline_id: string; discipline: D },
>(rows: T[], identity: DisciplineIdentitySnapshot): T[] {
  const byRoot = new Map<string, { row: T; fromRoot: boolean }>()
  for (const row of rows) {
    const original = row.discipline?.id ?? row.discipline_id
    const root = canonicalIdOf(identity, original)
    const fromRoot = root === original
    const current = byRoot.get(root)
    if (current && (current.fromRoot || !fromRoot)) continue
    const name = identityDisplayName(identity, root, row.discipline?.name ?? "")
    byRoot.set(root, {
      row: { ...row, discipline_id: root, discipline: { ...row.discipline, id: root, name } },
      fromRoot,
    })
  }
  return [...byRoot.values()].map((v) => v.row)
}

/**
 * "Estudos de Hoje": o estudo do dia casa com o bloco do plano pela mesma
 * disciplina. Se o estudo foi lançado num alias e o bloco está na canônica
 * (ou o contrário), a entrada recebe o id do BLOCO da mesma identidade —
 * assim o componente do plano (não alterado) encontra o bloco. Sem bloco da
 * mesma identidade, a entrada fica como veio.
 */
export function alignHistoryToBlocks<T extends { disciplineId: string }>(
  history: T[],
  blockDisciplineIds: string[],
  identity: DisciplineIdentitySnapshot | null | undefined,
): T[] {
  if (!identity || Object.keys(identity.canonicalOf).length === 0) return history
  const blockIds = new Set(blockDisciplineIds)
  // Identidade → id do bloco (prefere o bloco cujo id É a canônica).
  const blockByRoot = new Map<string, string>()
  for (const id of [...blockIds].sort()) {
    const root = canonicalIdOf(identity, id)
    if (!blockByRoot.has(root) || id === root) blockByRoot.set(root, id)
  }
  return history.map((h) => {
    if (!h.disciplineId || blockIds.has(h.disciplineId)) return h
    const target = blockByRoot.get(canonicalIdOf(identity, h.disciplineId))
    return target ? { ...h, disciplineId: target } : h
  })
}
