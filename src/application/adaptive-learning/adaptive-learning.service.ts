import { AdaptiveDecision, LearningHealthScore } from "@/domain/adaptive-learning/models"
import { GlobalEventBus, EVENTS } from "@/infrastructure/events/event-bus"

/**
 * AnalyticsContext
 * Um consolidado injetado no motor, evitando que o ALE consulte os bancos.
 */
export interface AnalyticsContext {
  userId: string
  disciplines: {
    id: string
    name: string
    weight: number
    performanceScore: number // 0-100
    retentionRate: number    // 0-100
    lapsesCount: number
    daysSinceLastStudy: number
  }[]
  userStats: {
    averageEnergy: number // 1-5
    weeklyHoursStudied: number
    currentStreak: number
    totalBacklogReviews: number
  }
}

/**
 * 1. Calcula o Learning Health Score (LHS)
 * Índice mestre de 0 a 100 indicando a saúde geral do aprendizado.
 */
export function calculateLearningHealthScore(context: AnalyticsContext): LearningHealthScore {
  // A. Retenção Média
  const activeDisciplines = context.disciplines.filter(d => d.retentionRate > 0)
  const retention = activeDisciplines.length 
    ? activeDisciplines.reduce((acc, d) => acc + d.retentionRate, 0) / activeDisciplines.length
    : 0

  // B. Performance Média
  const perfDisciplines = context.disciplines.filter(d => d.performanceScore > 0)
  const performance = perfDisciplines.length
    ? perfDisciplines.reduce((acc, d) => acc + d.performanceScore, 0) / perfDisciplines.length
    : 0

  // C. Consistência (Streak)
  const consistency = Math.min(100, context.userStats.currentStreak * 10) // 10 dias seguidos = 100%

  // D. Energia / Burnout Inverso
  // 5 estrelas = 100%, 1 estrela = 20%
  const energy = Math.min(100, (context.userStats.averageEnergy / 5) * 100)

  // Média ponderada do LHS
  const score = Math.round((retention * 0.4) + (performance * 0.3) + (consistency * 0.2) + (energy * 0.1))

  // Burnout Risk
  let burnoutRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
  if (energy < 40 && context.userStats.weeklyHoursStudied > 30) burnoutRisk = 'HIGH'
  else if (energy < 60) burnoutRisk = 'MEDIUM'

  // Label
  let statusLabel: 'Excelente' | 'Boa evolução' | 'Necessita intervenção' | 'Risco crítico'
  if (score >= 85) statusLabel = 'Excelente'
  else if (score >= 60) statusLabel = 'Boa evolução'
  else if (score >= 35) statusLabel = 'Necessita intervenção'
  else statusLabel = 'Risco crítico'

  return {
    score,
    components: { retention, consistency, performance, energy },
    statusLabel,
    burnoutRisk
  }
}

/**
 * 2. Motor Heurístico de Recomendações
 * Retorna as decisões (Adjustments) que o Cronograma deverá aplicar.
 */
export function generateAdaptiveDecisions(context: AnalyticsContext): AdaptiveDecision[] {
  const decisions: AdaptiveDecision[] = []
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // Vale pela próxima semana gerada

  const lhs = calculateLearningHealthScore(context)

  // Heurística Global: Intervenção de Burnout
  if (lhs.burnoutRisk === 'HIGH') {
    decisions.push({
      disciplineId: null,
      topicId: null,
      recommendationType: 'SESSION_CAPACITY_CHANGE',
      previousValue: null,
      newValue: null,
      delta: -0.20, // Cortar carga horária global em 20%
      reason: "Risco alto de Burnout detectado. A carga semanal será reduzida.",
      confidence: 90,
      priority: 'CRITICAL',
      engine: 'ALE_HEURISTIC',
      algorithmVersion: 'v1.0.0',
      expiresAt: expiresAt.toISOString()
    })
  }

  // Heurísticas por Disciplina
  for (const disc of context.disciplines) {
    // 1. Queda de Retenção (Aumentar peso)
    if (disc.retentionRate > 0 && disc.retentionRate < 70) {
      decisions.push({
        disciplineId: disc.id,
        topicId: null,
        recommendationType: 'WEIGHT_CHANGE',
        previousValue: disc.weight,
        newValue: disc.weight * 1.20,
        delta: 0.20, // +20%
        reason: `Queda na retenção detectada (${Math.round(disc.retentionRate)}%).`,
        confidence: 85,
        priority: 'HIGH',
        engine: 'ALE_HEURISTIC',
        algorithmVersion: 'v1.0.0',
        expiresAt: expiresAt.toISOString()
      })
    }

    // 2. Disciplina Dominada (Reduzir peso)
    if (disc.performanceScore > 90 && disc.retentionRate > 90) {
      decisions.push({
        disciplineId: disc.id,
        topicId: null,
        recommendationType: 'WEIGHT_CHANGE',
        previousValue: disc.weight,
        newValue: disc.weight * 0.85,
        delta: -0.15, // -15%
        reason: "Disciplina com alta dominância. Tempo será realocado.",
        confidence: 95,
        priority: 'LOW',
        engine: 'ALE_HEURISTIC',
        algorithmVersion: 'v1.0.0',
        expiresAt: expiresAt.toISOString()
      })
    }
  }

  // Dispara o evento de que recomendações foram geradas
  GlobalEventBus.publish({
    eventName: EVENTS.ADAPTIVE_RECOMMENDATION_GENERATED,
    timestamp: new Date(),
    payload: { userId: context.userId, decisionsCount: decisions.length }
  })

  return decisions
}
