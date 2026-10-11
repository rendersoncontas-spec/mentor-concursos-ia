import { canonicalizeSimuladoRecords } from "@/application/simulados/simulado-identity"
import {
  canonicalIdOf,
  identityDisplayName,
  type DisciplineIdentitySnapshot,
} from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecord } from "@/domain/simulados/types"

import type {
  ActivePlan,
  DisciplineMeta,
  QuestionAttemptRecord,
  ReviewItemRow,
  SessionRecord,
  UserDisciplineInput,
} from "./engine/stats-engine"

/**
 * G2.13 — Estatísticas pela IDENTIDADE CANÔNICA da disciplina.
 *
 * Um único ponto de tradução, na fronteira servidor → tela: cada registro que
 * carrega `discipline_id` (sessão, tentativa de questão, item de revisão, bloco
 * do plano, vínculo do edital, matéria de simulado) sai daqui com o id da
 * identidade canônica (`discipline-identity.ts`). O motor de estatísticas e a
 * tela NÃO mudam: eles já agrupam por `disciplineId`, então alias e canônica
 * passam a cair no mesmo grupo — em todas as seções, filtros e gráficos ao
 * mesmo tempo, sem uma regra por tela.
 *
 * Garantias:
 *   - o histórico real não é alterado (tudo é cópia, feita na leitura);
 *   - cada registro entra UMA vez (dedupe pelo id real da linha);
 *   - sem vínculo no catálogo, nada muda (a identidade é o próprio id);
 *   - nome exibido = `custom_name` do aluno na canônica, senão o nome global.
 */

export interface StatisticsIdentityInput {
  sessions: SessionRecord[]
  attempts: QuestionAttemptRecord[] | null
  disciplines: DisciplineMeta[] | null
  userDisciplines: UserDisciplineInput[] | null
  reviewItems: ReviewItemRow[] | null
  activePlan: ActivePlan | null
  simulados: SimuladoRecord[] | null
}

/** Todos os ids de disciplina que aparecem no payload (para carregar a identidade de uma vez). */
export function collectStatisticsDisciplineIds(input: StatisticsIdentityInput): string[] {
  const ids = new Set<string>()
  const add = (id: string | null | undefined) => {
    if (typeof id === "string" && id) ids.add(id)
  }
  input.sessions.forEach((s) => add(s.disciplineId))
  input.attempts?.forEach((a) => add(a.disciplineId))
  input.disciplines?.forEach((d) => add(d.id))
  input.userDisciplines?.forEach((u) => add(u.disciplineId))
  input.reviewItems?.forEach((r) => add(r.disciplineId))
  input.activePlan?.items.forEach((i) => add(i.disciplineId))
  input.simulados?.forEach((r) => r.subjects.forEach((s) => add(s.disciplineId)))
  return [...ids].sort()
}

/** Mantém a primeira ocorrência de cada id real (página repetida não conta duas vezes). */
export function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

function remap<T extends { disciplineId: string | null }>(rows: T[], identity: DisciplineIdentitySnapshot): T[] {
  return rows.map((row) => {
    if (!row.disciplineId) return row
    const root = canonicalIdOf(identity, row.disciplineId)
    return root === row.disciplineId ? row : { ...row, disciplineId: root }
  })
}

/**
 * Vínculos do edital (status por disciplina) na identidade canônica. Se o
 * aluno tem a canônica E um alias vinculados, fica UMA entrada: vale o status
 * do vínculo da própria canônica; sem ele, o do primeiro alias.
 */
function mergeUserDisciplines(
  rows: UserDisciplineInput[],
  identity: DisciplineIdentitySnapshot,
): UserDisciplineInput[] {
  const byRoot = new Map<string, { entry: UserDisciplineInput; fromRoot: boolean }>()
  for (const row of rows) {
    const root = canonicalIdOf(identity, row.disciplineId)
    const fromRoot = root === row.disciplineId
    const current = byRoot.get(root)
    if (!current || (fromRoot && !current.fromRoot)) {
      byRoot.set(root, { entry: { ...row, disciplineId: root }, fromRoot })
    }
  }
  return [...byRoot.values()].map((v) => v.entry)
}

function mergeDisciplineMeta(rows: DisciplineMeta[], identity: DisciplineIdentitySnapshot): DisciplineMeta[] {
  const byRoot = new Map<string, { entry: DisciplineMeta; fromRoot: boolean }>()
  for (const row of rows) {
    const root = canonicalIdOf(identity, row.id)
    const fromRoot = root === row.id
    const current = byRoot.get(root)
    if (!current || (fromRoot && !current.fromRoot)) {
      byRoot.set(root, {
        entry: { ...row, id: root, name: identityDisplayName(identity, root, row.name) },
        fromRoot,
      })
    }
  }
  return [...byRoot.values()].map((v) => v.entry)
}

export function canonicalizeStatisticsInput<T extends StatisticsIdentityInput>(
  input: T,
  identity: DisciplineIdentitySnapshot,
): T {
  const sessions = uniqueById(input.sessions).map((s) => {
    if (!s.disciplineId) return s
    const root = canonicalIdOf(identity, s.disciplineId)
    const name = identityDisplayName(identity, root, s.disciplineName ?? root)
    if (root === s.disciplineId && name === s.disciplineName) return s
    return { ...s, disciplineId: root, disciplineName: name }
  })

  return {
    ...input,
    sessions,
    attempts: input.attempts === null ? null : remap(uniqueById(input.attempts), identity),
    reviewItems: input.reviewItems === null ? null : remap(uniqueById(input.reviewItems), identity),
    userDisciplines: input.userDisciplines === null ? null : mergeUserDisciplines(input.userDisciplines, identity),
    disciplines: input.disciplines === null ? null : mergeDisciplineMeta(input.disciplines, identity),
    activePlan: input.activePlan === null ? null : { ...input.activePlan, items: remap(input.activePlan.items, identity) },
    simulados: input.simulados === null ? null : canonicalizeSimuladoRecords(uniqueById(input.simulados), identity),
  }
}
