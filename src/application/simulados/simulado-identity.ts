import {
  canonicalIdOf,
  identityDisplayName,
  subjectIdentityKey,
  type DisciplineIdentitySnapshot,
} from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"

import { accuracyOf } from "./simulado-stats.service"

function sumNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  return a + b
}

/**
 * G2.12 — cópia dos registros com as matérias na identidade canônica da
 * disciplina (ver `discipline-identity.ts`).
 *
 * Se um mesmo simulado tiver alias e canônica (ex.: "Noções de X" e "X", depois
 * de o admin declarar o vínculo), as matérias são SOMADAS numa linha só — os
 * totais do simulado não mudam. Os registros originais não são alterados: a
 * lista e a edição continuam usando os ids gravados; só as ANÁLISES (evolução
 * por matéria, gargalos, estudo × desempenho) usam esta cópia.
 */
export function canonicalizeSimuladoRecords(
  records: SimuladoRecord[],
  identity: DisciplineIdentitySnapshot | null | undefined,
): SimuladoRecord[] {
  if (!identity) return records
  const hasAliases = Object.keys(identity.canonicalOf).length > 0
  const hasNames = Object.keys(identity.displayName).length > 0
  if (!hasAliases && !hasNames) return records

  return records.map((record) => {
    const merged = new Map<string, SimuladoRecordSubject>()
    for (const subject of record.subjects) {
      const root = subject.disciplineId ? canonicalIdOf(identity, subject.disciplineId) : null
      const name = root ? identityDisplayName(identity, root, subject.disciplineName) : subject.disciplineName
      const next: SimuladoRecordSubject = { ...subject, disciplineId: root, disciplineName: name }
      const key = subjectIdentityKey(next)
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, next)
        continue
      }
      const questionsCount = existing.questionsCount + next.questionsCount
      const correctCount = existing.correctCount + next.correctCount
      merged.set(key, {
        ...existing,
        questionsCount,
        correctCount,
        wrongCount: existing.wrongCount + next.wrongCount,
        blankCount: existing.blankCount + next.blankCount,
        accuracy: accuracyOf(correctCount, questionsCount),
        netScore: sumNullable(existing.netScore, next.netScore),
      })
    }
    return { ...record, subjects: [...merged.values()] }
  })
}
