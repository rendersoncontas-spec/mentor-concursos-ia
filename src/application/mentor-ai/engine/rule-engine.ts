import type { Insight, IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"
import { CapabilityRegistry } from "./capability-registry"

/**
 * Fase I.6 (achado M1): o RuleEngine deixou de compor um "Global Score".
 *
 * O score somava cinco componentes, três deles (desempenho, retenção e questões)
 * iguais a `overallAccuracy` — fixa em 0 no IntelligenceHub —, com tendência
 * sempre "STABLE" e confiança fixa em 85. Era um número inventado, apresentado
 * como medição e gravado em `mentor_history`.
 *
 * O que sobrou é o que de fato vem de dado real: os insights produzidos pelas
 * capabilities a partir do histórico de estudo do aluno. Nenhum score novo foi
 * criado no lugar.
 */
export class RuleEngine {
  /** Executa todos os plugins registrados e devolve os insights reais. */
  static executeAll(context: IntelligenceContext): { insights: Insight[] } {
    const activeCaps = CapabilityRegistry.getActiveCapabilities()
    let allInsights: Insight[] = []

    activeCaps.forEach((cap) => {
      const insights = cap.execute(context)
      allInsights = allInsights.concat(insights)
    })

    return { insights: allInsights }
  }
}
