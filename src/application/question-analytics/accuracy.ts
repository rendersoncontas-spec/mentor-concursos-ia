import { SupabaseClient } from "@supabase/supabase-js"

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

  const { data, error } = await supabase
    .from("question_attempts")
    .select(`
      correct,
      questions!inner (
        discipline_id,
        disciplines ( name )
      )
    `)
    .eq("user_id", userId)
    .gte("answered_at", d.toISOString())

  if (error || !data) return []

  const map = new Map<string, { name: string, total: number, correct: number }>()

  data.forEach((attempt: any) => {
    const disciplineId = attempt.questions?.discipline_id
    const disciplineName = attempt.questions?.disciplines?.name
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
