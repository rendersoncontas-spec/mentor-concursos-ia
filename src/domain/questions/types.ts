export type DifficultyLabel = 'Muito Fácil' | 'Fácil' | 'Média' | 'Difícil' | 'Muito Difícil'
export type QuestionStatus = 'ACTIVE' | 'CANCELED' | 'OUTDATED'
export type MistakeType = 'CONTENT' | 'INTERPRETATION' | 'DISTRACTION' | 'TIME' | 'GUESS'

export interface QuestionSource {
  id: string
  name: string
  description: string | null
  logo_url: string | null
  created_at: string
}

export interface QuestionTopic {
  id: string
  discipline_id: string
  parent_topic_id: string | null
  name: string
  created_at: string
}

export interface Question {
  id: string
  source_id: string | null
  discipline_id: string
  topic_id: string | null
  statement: string
  correct_answer: string
  official_answer: string | null
  explanation: string | null
  exam_board: string | null
  exam_name: string | null
  exam_year: number | null
  difficulty_level: number | null // 1 to 5
  difficulty_label: DifficultyLabel | null
  estimated_time_seconds: number | null
  question_status: QuestionStatus
  created_at: string
}

export interface QuestionAttempt {
  id: string
  user_id: string
  question_id: string
  selected_answer: string
  correct: boolean
  response_time_seconds: number
  confidence_level: number | null // 1 to 5
  review_required: boolean
  mistake_type: MistakeType | null
  attempt_source: string
  answered_at: string
  created_at: string
}

export interface QuestionList {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
}

// ==========================================
// Preditivo & Recomendações (IA Prep)
// ==========================================
export interface QuestionRecommendation {
  questionId: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reason: string
  confidence: number // 0 a 100% (Grau de certeza da IA ao sugerir)
  recommendedDate: string // Data sugerida para resolução
}

// ==========================================
// Abstração de Fontes (Provider Architecture)
// ==========================================
export interface QuestionFetchOptions {
  disciplineId?: string
  topicId?: string
  limit?: number
  difficulty?: number
}

/**
 * Interface base para integrar qualquer sistema de questões no futuro.
 */
export interface QuestionProvider {
  /** Identificador único do provider (ex: 'TEC', 'QCONCURSOS', 'INTERNAL') */
  providerId: string
  
  /** Retorna questões mapeadas para o nosso formato */
  fetchQuestions(options: QuestionFetchOptions): Promise<Question[]>
  
  /** Retorna os tópicos da plataforma parceira formatados */
  fetchTopics(disciplineId: string): Promise<QuestionTopic[]>
}
