import type { SupabaseClient } from "@supabase/supabase-js"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

export type AccuracyMetric = {
  id: string
  name: string
  totalAttempts: number
  correctAttempts: number
  accuracyPercent: number
}

export async function getAccuracyByDiscipline(
  supabase: SupabaseClient,
  userId: string,
  periodDays: number = 30
): Promise<AccuracyMetric[]> {
  const d = new Date()
  d.setDate(d.getDate() - periodDays)

  // Fase F.1: paginado (question_attempts pode passar de 1.000 linhas em 30
  // dias para quem resolve muitas questões; antes 1 requisição cortada em
  // 1.000). Mesmo formato { data, error } de antes.
  const { data, error } = await fetchAllRowsPaged<{
    correct: boolean
    questions:
      | { discipline_id: string; disciplines: { name: string } }
      | { discipline_id: string; disciplines: { name: string } }[]
      | null
  }>(
    (withCount) =>
      supabase
        .from("question_attempts")
        .select(`
      correct,
      questions!inner (
        discipline_id,
        disciplines ( name )
      )
    `, countOption(withCount))
        .eq("user_id", userId)
        .gte("answered_at", d.toISOString()),
    [{ column: "id", ascending: true }],
  )

  if (error || !data) return []

  const map = new Map<string, { name: string, total: number, correct: number }>()

  data.forEach((attempt) => {
    const questions = Array.isArray(attempt.questions) ? attempt.questions[0] : attempt.questions
    if (!questions) return
    const disciplines = Array.isArray(questions.disciplines) ? questions.disciplines[0] : questions.disciplines
    const disciplineId = questions.discipline_id
    const disciplineName = disciplines?.name
    if (!disciplineId) return

    const current = map.get(disciplineId) || { name: disciplineName, total: 0, correct: 0 }
    current.total += 1
    if (attempt.correct) current.correct += 1

    map.set(disciplineId, current)
  })

  const result: AccuracyMetric[] = []
  map.forEach((stats, id) => {
    result.push({
      id,
      name: stats.name,
      totalAttempts: stats.total,
      correctAttempts: stats.correct,
      accuracyPercent: Math.round((stats.correct / stats.total) * 100)
    })
  })

  return result.sort((a, b) => b.accuracyPercent - a.accuracyPercent)
}
