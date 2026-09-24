import type { SupabaseClient } from "@supabase/supabase-js"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

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
  // Fase F.1: paginado (question_attempts pode passar de 1.000 linhas em 30
  // dias para quem resolve muitas questões; antes 1 requisição cortada em
  // 1.000). Mesmo formato { data, error } de antes.
  const { data, error } = await fetchAllRowsPaged<{
    correct: boolean
    questions: { disciplines: { name: string } | { name: string }[] | null } | { disciplines: { name: string } | { name: string }[] | null }[] | null
  }>(
    (withCount) =>
      supabase
        .from("question_attempts")
        .select(`
      correct,
      questions!inner (
        disciplines ( name )
      )
    `, countOption(withCount))
        .eq("user_id", userId)
        .gte("answered_at", d.toISOString()),
    [{ column: "id", ascending: true }],
  )

  if (error || !data) {
    console.error("Radar Fetch Error:", error)
    return []
  }

  const map = new Map<string, { correct: number, total: number }>()

  data.forEach((attempt) => {
    // Tratamento de navegação no objeto aninhado
    const questions = Array.isArray(attempt.questions) ? attempt.questions[0] : attempt.questions
    let disciplineName: string | undefined
    if (questions) {
      const raw = questions.disciplines
      const node = Array.isArray(raw) ? raw[0] : raw
      disciplineName = node?.name
    }
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
