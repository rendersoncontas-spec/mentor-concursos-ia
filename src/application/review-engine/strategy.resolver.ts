import { ReviewStrategy } from "@/domain/reviews/models"
import { SM2PlusStrategy } from "./strategies/sm2-plus.strategy"
import { FSRSStrategy } from "./strategies/fsrs.strategy"

/**
 * Strategy Factory
 * Retorna a classe que implementa o cálculo de retenção selecionado.
 */
export function getReviewStrategy(strategyName: string): ReviewStrategy {
  switch (strategyName) {
    case 'FSRS':
      return new FSRSStrategy()
    case 'SM2_PLUS':
    default:
      return new SM2PlusStrategy()
  }
}
