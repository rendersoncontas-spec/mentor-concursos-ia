import { QuestionRecommendation } from "@/domain/questions/types"
import { SupabaseClient } from "@supabase/supabase-js"

/**
 * Motor Heurístico Preparatório para IA
 * Vasculha as questões recentes para encontrar perfis de fraqueza e sugerir revisão no cronograma futuro.
 */
export async function getWeaknessProfileAndRecommendations(
  supabase: SupabaseClient,
  userId: string
): Promise<QuestionRecommendation[]> {
  
  // Exemplo de Heurística:
  // 1. Buscamos todas as questões erradas nos últimos 15 dias.
  const d = new Date()
  d.setDate(d.getDate() - 15)

  const { data, error } = await supabase
    .from("question_attempts")
    .select(`
      question_id,
      correct,
      mistake_type,
      review_required,
      answered_at
    `)
    .eq("user_id", userId)
    .gte("answered_at", d.toISOString())

  if (error || !data) return []

  // Mapear quantas vezes ele errou a mesma questão
  const errorMap = new Map<string, number>()
  const requireReviewSet = new Set<string>()

  data.forEach(attempt => {
    if (!attempt.correct) {
      errorMap.set(attempt.question_id, (errorMap.get(attempt.question_id) || 0) + 1)
    }
    if (attempt.review_required) {
      requireReviewSet.add(attempt.question_id)
    }
  })

  const recommendations: QuestionRecommendation[] = []

  errorMap.forEach((errorCount, qId) => {
    // Se errou mais de 1 vez a mesma questão -> HIGH
    // Se a tentativa marcou "review_required" explícito (ex: Mistake=CONTENT) -> CRITICAL
    let priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW"
    let confidence = 50
    let reason = "Erro mapeado recentemente."

    if (requireReviewSet.has(qId)) {
      priority = "CRITICAL"
      confidence = 90
      reason = "O padrão de erro indica defasagem de conteúdo ou pegadinha severa."
    } else if (errorCount > 1) {
      priority = "HIGH"
      confidence = 80
      reason = "Você errou esta mesma questão múltiplas vezes."
    } else {
      priority = "MEDIUM"
    }

    // Recomendar revisão para amanhã
    const recDate = new Date()
    recDate.setDate(recDate.getDate() + 1)

    recommendations.push({
      questionId: qId,
      priority,
      reason,
      confidence,
      recommendedDate: recDate.toISOString()
    })
  })

  // Retornamos as mais críticas primeiro
  const weight = { "CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1 }
  return recommendations.sort((a, b) => weight[b.priority] - weight[a.priority])
}

export function predictRetention(accuracyPercent: number, daysSinceLastReview: number): number {
  // Simulação simples da Curva de Esquecimento (Ebbinghaus)
  // R = e^(-t/S) onde S é a força da memória (acurácia base)
  const strength = Math.max(1, accuracyPercent / 10) // 1 a 10
  const retention = Math.exp(-daysSinceLastReview / strength) * 100
  return Math.max(0, Math.min(100, Math.round(retention)))
}
