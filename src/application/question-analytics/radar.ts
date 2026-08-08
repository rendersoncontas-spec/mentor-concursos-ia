import { SupabaseClient } from "@supabase/supabase-js"

export type RadarMetric = {
  subject: string
  score: number
  fullMark: number
}

/**
 * Agrega as tentativas de questões do usuário para gerar o Radar de Desempenho.
 * O Radar considera a % de Acerto por disciplina.
 */
export async function getPerformanceRadar(
  supabase: SupabaseClient,
  userId: string,
  periodDays: number = 30
): Promise<RadarMetric[]> {
  const d = new Date()
  d.setDate(d.getDate() - periodDays)

  // Trazemos as tentativas com a disciplina
  const { data, error } = await supabase
    .from("question_attempts")
    .select(`
      correct,
      questions!inner (
        disciplines ( name )
      )
    `)
    .eq("user_id", userId)
    .gte("answered_at", d.toISOString())

  if (error || !data) {
    console.error("Radar Fetch Error:", error)
    return []
  }

  const map = new Map<string, { correct: number, total: number }>()

  data.forEach((attempt: any) => {
    // Tratamento de navegação no objeto aninhado
    const disciplineName = attempt.questions?.disciplines?.name
    if (!disciplineName) return

    const current = map.get(disciplineName) || { correct: 0, total: 0 }
    current.total += 1
    if (attempt.correct) current.correct += 1

    map.set(disciplineName, current)
  })

  const radar: RadarMetric[] = []
  
  map.forEach((stats, name) => {
    // Calculamos o percentual de acerto e o convertemos no Score do Radar (0 a 100)
    const score = Math.round((stats.correct / stats.total) * 100)
    radar.push({
      subject: name,
      score,
      fullMark: 100
    })
  })

  // Retorna pelo menos 3 eixos (ou vazio se 0) pois radares precisam de polígonos
  return radar.sort((a, b) => b.score - a.score)
}
