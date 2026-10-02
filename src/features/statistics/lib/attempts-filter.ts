// ============================================================================
// S1.2 — filtro de attempts por período/disciplina/TIPO DE ESTUDO (puro).
// ----------------------------------------------------------------------------
// Extraído sem mudança de semântica de statistics-center-view.tsx para ser
// testável. question_attempts não tem study_type nem sessão; o único vínculo
// existente é attempt_source ("SIMULADO", "MANUAL", ...):
//   - studyType "all" → comportamento anterior (só período + disciplina);
//   - studyType específico → só attempts atribuíveis (attempt_source igual);
//     o resto é excluído para não contaminar outro tipo (a parte das sessões
//     já respeita o filtro via sessions, somada no engine separadamente).
// ============================================================================

import { dateKeyOf, type QuestionAttemptRecord } from "@/application/study-analytics/engine/stats-engine"

export function filterAttempts(
  attempts: QuestionAttemptRecord[],
  rangeKeys: string[],
  disciplineId: string,
  studyType: string,
  timezone: string,
  isAllRange: boolean,
): QuestionAttemptRecord[] {
  // G1.3 (G-22): filtro explícito é exato — attempt sem disciplina NÃO
  // pertence a nenhuma disciplina filtrada (antes, `null` passava e inflava
  // questões/corretas). "all" preserva o comportamento anterior.
  const inDiscipline = (a: QuestionAttemptRecord): boolean =>
    disciplineId === "all" || (a.disciplineId !== null && a.disciplineId === disciplineId)
  // S1.2: sem vínculo com o tipo filtrado, o attempt não entra.
  const inStudyType = (a: QuestionAttemptRecord): boolean =>
    studyType === "all" || (a.attemptSource ?? null) === studyType

  if (isAllRange) {
    return attempts.filter((a) => {
      if (!inDiscipline(a)) return false
      if (!inStudyType(a)) return false
      return true
    })
  }
  const min = rangeKeys[0]
  const max = rangeKeys[rangeKeys.length - 1]
  return attempts.filter((a) => {
    if (!inDiscipline(a)) return false
    if (!inStudyType(a)) return false
    if (!a.answeredAt) return true
    const k = dateKeyOf(a.answeredAt, timezone)
    if (!k || !min || !max) return false
    return k >= min && k <= max
  })
}
