import { ReviewItem, ReviewStrategy, ReviewStage } from "@/domain/reviews/models"

/**
 * SM-2+ Strategy
 * Uma evolução do SM-2 original adaptada para as heurísticas do Mentor IA.
 * Em vez de julgar apenas a qualidade de 0 a 5 com base no clique do usuário,
 * nós calibramos a "Qualidade" injetando o Performance Score e Confidence da Sprint 5.
 */
export class SM2PlusStrategy implements ReviewStrategy {
  calculateNextState(
    item: ReviewItem, 
    grade: number, // 1 (Errou Feio) a 5 (Acertou Fácil)
    context?: Record<string, any>
  ) {
    let easeFactor = item.ease_factor || 2.5
    let lapses = item.lapses_count || 0
    let stage = item.review_stage

    // Modificador Heurístico SM2+ (Contexto da Sprint 5)
    // Se o usuário errou por 'DISTRACTION', não punimos o ease_factor tão severamente
    // Se ele acertou, mas o Performance Score foi baixo (demorou, chutou), ajustamos a nota base (grade)
    let adjustedGrade = grade
    if (context?.['mistakeType'] === 'DISTRACTION' && grade < 3) {
      adjustedGrade = Math.min(3, grade + 1) // Suaviza o erro
    }
    if (context?.['performanceScore'] !== undefined) {
      if (context['performanceScore'] < 40 && grade >= 3) {
        adjustedGrade = 3 // Força um "Hard" mesmo se acertou, pois o desempenho foi sofrível
      }
    }

    // Lógica core do SM-2
    // Se a nota for < 3, ele errou.
    let intervalDays = 1
    
    if (adjustedGrade >= 3) {
      // Acerto
      if (item.review_count === 0 || stage === 'NEW' || stage === 'LEARNING') {
        intervalDays = 1
        stage = 'LEARNING'
      } else if (item.review_count === 1) {
        intervalDays = 6
        stage = 'REVIEW'
      } else {
        // Obter intervalo anterior
        const prevInterval = this.getPreviousInterval(item)
        intervalDays = Math.round(prevInterval * easeFactor)
        stage = intervalDays > 21 ? 'MASTERED' : 'REVIEW'
      }

      // Calcula novo Ease Factor (A fórmula mágica do SuperMemo 2)
      // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
      const diff = 5 - adjustedGrade
      easeFactor = easeFactor + (0.1 - diff * (0.08 + diff * 0.02))
      if (easeFactor < 1.3) easeFactor = 1.3 // Piso mínimo
      
    } else {
      // Erro
      lapses += 1
      stage = 'LAPSED'
      intervalDays = 1
      easeFactor = Math.max(1.3, easeFactor - 0.2) // Reduz facilidade
    }

    // Calcula próximas datas e força de memória
    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + intervalDays)

    // Memory Strength (0 a 100): Métrica visual nossa
    const memoryStrength = Math.min(100, Math.round((easeFactor / 2.5) * 50 + (intervalDays > 30 ? 50 : intervalDays * 1.5)))

    return {
      next_review_at: nextReview.toISOString(),
      review_stage: stage,
      ease_factor: easeFactor,
      stability_score: item.stability_score, // FSRS cuida disso, SM-2 ignora
      memory_strength: memoryStrength,
      forget_probability: adjustedGrade < 3 ? 0.9 : 0.1 // Reset provisório, a cron job vai recalcular o decaimento diário
    }
  }

  private getPreviousInterval(item: ReviewItem): number {
    if (!item.last_review_at || !item.next_review_at) return 1
    // Aproximação do intervalo anterior baseado nas datas gravadas, ou usando fallback
    // Se a lógica do app rodar perfeitamente, podemos salvar o `last_interval` no banco tbm.
    const last = new Date(item.last_review_at).getTime()
    const currentNext = new Date(item.next_review_at).getTime()
    if (currentNext <= last) return 1
    return Math.max(1, Math.round((currentNext - last) / (1000 * 3600 * 24)))
  }
}
