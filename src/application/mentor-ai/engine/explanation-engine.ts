import type { Insight } from "@/domain/mentor-ai/mentor-ai.models"

export class ExplanationEngine {
  static translate(insights: Insight[]): Insight[] {
    return insights.map(insight => {
      // Cria uma cópia com a mensagem humanizada
      return { ...insight, message: this.getHumanText(insight) }
    })
  }

  private static getHumanText(insight: Insight): string {
    switch (insight.code) {
      case "CRITICAL_BURNOUT_RISK":
        return `Atenção: Sua energia média de estudos está crítica (${insight.value}). Tire uma pausa longa hoje.`
      case "EXCELLENT_ENERGY":
        return `Você está estudando com altíssimo nível de energia mental (${insight.value}). Aproveite o fluxo para matérias difíceis!`
      case "LOW_RETENTION":
        return `Sua retenção despencou para ${insight.value}%. Faça blocos de revisão antes de avançar.`
      default:
        return `[Insight não traduzido: ${insight.code}]`
    }
  }
}
