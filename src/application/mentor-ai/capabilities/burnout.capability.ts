import type { Insight, IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"
import { MentorThresholds } from "@/domain/mentor-ai/mentor-ai.thresholds"
import type { CapabilityMetadata, MentorCapability } from "./mentor.capability"

export class BurnoutCapability implements MentorCapability {
  metadata: CapabilityMetadata = {
    id: "cap_burnout",
    name: "Burnout & Energy Evaluator",
    version: "1.0.0",
    enabled: true,
    priority: 100, // Alto peso para a saúde
    dependencies: [],
  }

  execute(context: IntelligenceContext): Insight[] {
    const insights: Insight[] = []
    const energy = context.studyHistory.averageEnergy

    if (energy > 0 && energy < MentorThresholds.burnout.lowEnergy) {
      insights.push({
        code: "CRITICAL_BURNOUT_RISK",
        value: energy,
        priority: 95,
        severity: "CRITICAL",
        type: "ALERT",
        sourceModule: "study-history",
      })
    } else if (energy > 0 && energy >= 4.0) {
      insights.push({
        code: "EXCELLENT_ENERGY",
        value: energy,
        priority: 40,
        severity: "LOW",
        type: "EVOLUTION",
        sourceModule: "study-history",
      })
    }

    return insights
  }
}
