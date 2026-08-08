export interface IntelligenceContext {
  version: "1.0.0"
  generatedAt: Date
  snapshotId: string
  userId: string

  // Agregações de Performance
  performance: {
    overallAccuracy: number
    disciplinesAccuracy: Record<string, number>
    weakestDisciplines: string[]
    strongestDisciplines: string[]
  }

  // Agregações de Revisão
  reviews: {
    totalOverdue: number
    criticalOverdue: number
    itemsToReviewToday: number
  }

  // Histórico de Estudos (Últimos 7 dias)
  studyHistory: {
    totalMinutes: number
    averageEnergy: number
    averageFocus: number
    daysStudied: number
    streak: number
  }

  // Plano e Metas
  goals: {
    weeklyHoursTarget: number
    examId?: string
  }
}

export interface GlobalScore {
  score: number // 0 a 100
  grade: string // A, B, C, D, E
  trend: "UP" | "DOWN" | "STABLE"
  confidence: number // 0 a 100
  breakdown: {
    consistency: number
    performance: number
    retention: number
    burnout: number // Invertido: 100 significa sem burnout
    questions: number
  }
}

export interface Insight {
  code: string // Ex: "CRITICAL_BURNOUT"
  value?: number | string | boolean
  priority: number // 0 a 100 (ajuda o Prioritizer)
  severity: "LOW" | "HIGH" | "CRITICAL"
  type: "ACTION" | "ALERT" | "EVOLUTION" | "MOTIVATION"
  sourceModule: string
  message?: string // Tradução em pt-BR preenchida pelo ExplanationEngine
}
