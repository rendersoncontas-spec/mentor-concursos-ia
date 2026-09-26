import type { Insight, IntelligenceContext } from "./mentor-ai.models"

export interface MentorResponse {
  // Fase I.6 (M1): sem `globalScore` — ver mentor-ai.models.ts.
  feed: {
    now: Insight[]      // 🎯 Faça primeiro / Urgências
    today: Insight[]    // 📅 Hoje
    week: Insight[]     // 📆 Esta semana
    longTerm: Insight[] // 🎯 Longo prazo / Evolução
  }
  rawInsights: Insight[] // Caso a UI queira usar para algo
}

export interface MentorSession {
  context: IntelligenceContext
  response: MentorResponse
  provider: string // "HEURISTIC" | "OPENAI"
  prompt?: string
  createdAt: Date
}

export interface MentorAIProvider {
  analyze(context: IntelligenceContext): Promise<MentorResponse>
}
