import { GlobalScore, Insight, IntelligenceContext } from "./mentor-ai.models"

export interface MentorResponse {
  globalScore: GlobalScore
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
