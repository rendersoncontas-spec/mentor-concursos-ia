import type { IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"
import type { MentorAIProvider, MentorResponse } from "@/domain/mentor-ai/mentor-ai.types"
import { RuleEngine } from "../engine/rule-engine"
import { Prioritizer } from "../engine/prioritizer"
import { ExplanationEngine } from "../engine/explanation-engine"

export class HeuristicProvider implements MentorAIProvider {
  async analyze(context: IntelligenceContext): Promise<MentorResponse> {
    
    // 1. Processamento bruto
    const { insights, globalScore } = RuleEngine.executeAll(context)
    
    // 2. Priorização
    const sortedInsights = Prioritizer.rank(insights)

    // 3. Tradução Humana
    const humanInsights = ExplanationEngine.translate(sortedInsights)

    // 4. Montagem do Feed
    // Fake logic para separar nos tempos (na versão real checará severidades e naturezas)
    const now = humanInsights.filter(i => i.severity === "CRITICAL")
    const today = humanInsights.filter(i => i.severity === "HIGH")
    const week = humanInsights.filter(i => i.severity === "LOW" && i.type === "ACTION")
    const longTerm = humanInsights.filter(i => i.type === "EVOLUTION" || i.type === "MOTIVATION")

    return {
      globalScore,
      feed: {
        now,
        today,
        week,
        longTerm
      },
      rawInsights: humanInsights
    }
  }
}
