export type ReviewStage = 'NEW' | 'LEARNING' | 'REVIEW' | 'MASTERED' | 'LAPSED'
export type ReviewSourceType = 'QUESTION' | 'TOPIC' | 'FLASHCARD' | 'STUDY_SESSION'

export interface ReviewItem {
  id: string
  user_id: string
  discipline_id: string
  topic_id: string | null
  
  source_type: ReviewSourceType
  source_id: string
  
  review_stage: ReviewStage
  ease_factor: number
  stability_score: number
  memory_strength: number
  forget_probability: number
  
  last_review_at: string | null
  next_review_at: string | null
  review_count: number
  lapses_count: number
  
  base_priority: number
}

export interface ReviewQueueItem {
  id: string
  user_id: string
  review_item_id: string
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED'
  due_date: string
  calculated_priority: number
  review_item?: ReviewItem // Junção comum
}

/**
 * Interface padronizada que toda estratégia matemática ou de IA deve implementar.
 */
export interface ReviewStrategy {
  /**
   * Calcula o próximo estado do item baseado no feedback do usuário.
   * @param item O item atual antes da revisão
   * @param grade A nota/desempenho da revisão (1 a 5, ou mapeada de Acerto/Erro/Tempo)
   * @param context Contexto opcional injetado (Performance Score, Confidence, Mistake Type)
   * @returns O novo estado matemático para ser salvo no banco
   */
  calculateNextState(
    item: ReviewItem, 
    grade: number,
    context?: Record<string, any>
  ): {
    next_review_at: string
    review_stage: ReviewStage
    ease_factor: number
    stability_score: number
    memory_strength: number
    forget_probability: number
  }
}
