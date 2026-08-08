import { ReviewItem, ReviewStrategy, ReviewStage } from "@/domain/reviews/models"

/**
 * FSRS Strategy (Free Spaced Repetition Scheduler)
 * Estratégia moderna baseada em DSR (Difficulty, Stability, Retrievability).
 * 
 * NOTA: Esta é uma heurística base simplificada. A implementação completa do FSRS 
 * requer um otimizador de pesos (Weights Array) rodando em background. A estrutura
 * abaixo simula o crescimento da estabilidade baseado na tese de Wozniak/FSRS4.
 */
export class FSRSStrategy implements ReviewStrategy {
  
  // Weights padrões do FSRS v4 (Aproximação)
  private readonly w = [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 
    2.18, 0.05, 0.34, 1.26, 0.29, 2.61
  ]

  calculateNextState(
    item: ReviewItem, 
    grade: number, // 1 (Errou), 2 (Difícil), 3 (Bom), 4 (Fácil)
    context?: Record<string, any>
  ) {
    let S = item.stability_score || 0
    let stage = item.review_stage
    let difficulty = item.ease_factor // Reusaremos o campo para Dificuldade Inicial (1 a 10 no FSRS)

    if (S === 0 || stage === 'NEW') {
      // First review
      S = this.w[grade - 1] || 1.0
      difficulty = this.w[4]! - (grade - 3) * this.w[5]!
      stage = grade > 1 ? 'LEARNING' : 'LAPSED'
    } else {
      if (grade > 1) {
        // Success
        // Fórmula de crescimento da Estabilidade (S)
        const R = this.calculateRetrievability(item)
        const sGrowth = Math.exp(this.w[8]!) * 
                       (11 - difficulty) * 
                       Math.pow(S, -this.w[9]!) * 
                       (Math.exp((1 - R) * this.w[10]!) - 1)
        
        S = S * (1 + sGrowth)
        stage = S > 21 ? 'MASTERED' : 'REVIEW'
        
      } else {
        // Lapsed (Failure)
        difficulty = Math.min(10, difficulty + 1)
        const sLapse = this.w[11]! * 
                       Math.pow(difficulty, -this.w[12]!) * 
                       Math.pow(S + 1, this.w[13]!)
        S = sLapse
        stage = 'LAPSED'
      }
    }

    difficulty = Math.max(1, Math.min(10, difficulty)) // Clamp

    // Calcula intervalo usando a estabilidade (Em dias)
    // O FSRS agenda baseando-se em quando a Retrievability cairá para 90%
    const requestRetention = 0.9
    const intervalDays = Math.max(1, Math.round((S / 9) * (1 / requestRetention - 1)))

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + intervalDays)

    return {
      next_review_at: nextReview.toISOString(),
      review_stage: stage,
      ease_factor: difficulty, // Salvamos no ease_factor como Dificuldade para economizar colunas
      stability_score: S,
      memory_strength: Math.min(100, Math.round((S / 100) * 100)), // Mapeia Estabilidade (dias) para 0-100%
      forget_probability: grade === 1 ? 0.9 : 0.1 
    }
  }

  /**
   * R = (1 + t / (9 * S)) ^ -1
   */
  private calculateRetrievability(item: ReviewItem): number {
    if (!item.last_review_at || item.stability_score === 0) return 0
    const now = new Date().getTime()
    const last = new Date(item.last_review_at).getTime()
    const tDays = (now - last) / (1000 * 3600 * 24)
    return Math.pow(1 + tDays / (9 * item.stability_score), -1)
  }
}
