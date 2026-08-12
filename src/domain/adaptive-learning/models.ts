export type RecommendationType = 'WEIGHT_CHANGE' | 'BURNOUT_INTERVENTION' | 'REVIEW_INJECTION' | 'SESSION_CAPACITY_CHANGE'

export interface AdaptiveDecision {
  id?: string
  disciplineId: string | null
  topicId: string | null
  
  recommendationType: RecommendationType
  previousValue: number | null
  newValue: number | null
  delta: number | null // Ex: +0.20 (+20%)
  
  reason: string
  confidence: number // 0-100
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  
  engine: string
  algorithmVersion: string
  
  expiresAt: string | null // Data limite do efeito dessa decisão (ex: até o final da semana)
}

/**
 * Learning Health Score (LHS)
 * Índice global unificado (0-100) que o sistema todo passa a consumir.
 */
export interface LearningHealthScore {
  score: number
  
  components: {
    retention: number    // 0-100 (Da Sprint 6)
    consistency: number  // 0-100 (Baseado no Streak e Dias Inativos)
    performance: number  // 0-100 (Da Sprint 5, acertos vs tempo)
    energy: number       // 0-100 (Feedback do usuário, Sprint 4)
  }
  
  statusLabel: 'Excelente' | 'Boa evolução' | 'Necessita intervenção' | 'Risco crítico'
  burnoutRisk: 'LOW' | 'MEDIUM' | 'HIGH'
}

// Interfaces IA-Ready para o futuro
export interface RecommendationEngine {
  generateRecommendations(context: unknown): Promise<AdaptiveDecision[]>
}

export interface PriorityEngine {
  calculateDisciplinePriority(disciplineId: string, context: unknown): number
}
