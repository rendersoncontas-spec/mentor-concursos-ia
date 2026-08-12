import type { Insight } from "@/domain/mentor-ai/mentor-ai.models"

export class Prioritizer {
  /**
   * Ordena os insights decrescentemente pelo score de prioridade.
   * Assim, urgências (score 90+) furam a fila de métricas triviais.
   */
  static rank(insights: Insight[]): Insight[] {
    return insights.sort((a, b) => b.priority - a.priority)
  }

  static getTopUrgent(insights: Insight[], limit: number = 3): Insight[] {
    return this.rank(insights.filter(i => i.severity === "CRITICAL" || i.severity === "HIGH")).slice(0, limit)
  }
}
