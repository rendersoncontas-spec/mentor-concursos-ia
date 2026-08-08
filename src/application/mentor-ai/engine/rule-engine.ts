import { GlobalScore, Insight, IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"
import { CapabilityRegistry } from "./capability-registry"

export class RuleEngine {
  /**
   * Executa todos os plugins registrados e compila o Global Score.
   */
  static executeAll(context: IntelligenceContext): { insights: Insight[], globalScore: GlobalScore } {
    const activeCaps = CapabilityRegistry.getActiveCapabilities()
    let allInsights: Insight[] = []

    activeCaps.forEach((cap) => {
      const insights = cap.execute(context)
      allInsights = allInsights.concat(insights)
    })

    const globalScore = this.calculateGlobalScore(context)

    return { insights: allInsights, globalScore }
  }

  private static calculateGlobalScore(context: IntelligenceContext): GlobalScore {
    const consistency = Math.min(100, context.studyHistory.streak * 5)
    const performance = context.performance.overallAccuracy || 0
    const retention = context.performance.overallAccuracy || 0
    const burnout = (context.studyHistory.averageEnergy || 0) * 20
    const questions = context.performance.overallAccuracy || 0
    
    const score = Math.round((consistency + performance + retention + burnout + questions) / 5)

    let grade = "C"
    if (score >= 90) grade = "A"
    else if (score >= 80) grade = "B"
    else if (score < 60) grade = "D"

    return {
      score,
      grade,
      trend: "STABLE",
      confidence: 85,
      breakdown: {
        consistency,
        performance,
        retention,
        burnout,
        questions
      }
    }
  }
}
