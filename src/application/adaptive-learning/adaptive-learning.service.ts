import type { AdaptiveDecision, LearningHealthScore } from "@/domain/adaptive-learning/models"
import { GlobalEventBus, EVENTS } from "@/infrastructure/events/event-bus"

/**
 * Constantes de Calibração do Adaptive Learning Engine (ALE)
 *
 * Cadência de medição: SEMANAL (alinhada aos ciclos de replanejamento e estatísticas).
 * A combinação de EMA (suavização contínua) com Histerese de 2 janelas evita o efeito ioiô,
 * onde o peso de uma matéria aumentava e diminuía alternadamente a cada oscilação semanal.
 *
 * TODO(BACKLOG): Alerta de retenção crítica em janela única (caminho rápido).
 * Adiado deliberadamente: uma queda abrupta severa (<50% de retenção com alto volume de questões)
 * em uma única janela semanal acionará intervenção acelerada sem esperar pela histerese de 2 janelas.
 * O adiamento evita falsos positivos e oscilações prematuras antes que tenhamos amostragem estatística.
 */
export const DEFAULT_EMA_ALPHA = 0.35 // Fator de amortecimento exponencial (ajustável)
export const MIN_CONSECUTIVE_WINDOWS_FOR_ADJUSTMENT = 2 // Janelas semanais consecutivas exigidas
export const LOW_RETENTION_THRESHOLD = 70 // Retenção < 70% qualifica para reforço (+20%)
export const HIGH_RETENTION_THRESHOLD = 85 // Retenção > 85% com volume alto qualifica para alívio (-15%)
export const MIN_QUESTIONS_VOLUME_THRESHOLD = 10 // Volume mínimo de questões para validar dominância real

export interface DisciplineAnalytics {
  id: string
  name: string
  weight: number
  performanceScore: number // 0-100
  retentionRate: number // 0-100 (valor da medição atual)
  retentionHistory?: number[] // Histórico cronológico das janelas anteriores [w1, w2, ...]
  questionsAnsweredCount?: number // Volume de questões resolvidas na janela
  lapsesCount: number
  daysSinceLastStudy: number
}

/**
 * AnalyticsContext
 * Consolidado de métricas injetado no motor (função pura sem I/O direto).
 */
export interface AnalyticsContext {
  userId: string
  disciplines: DisciplineAnalytics[]
  userStats: {
    averageEnergy: number // 1-5
    weeklyHoursStudied: number
    currentStreak: number
    totalBacklogReviews: number
  }
}

/**
 * Calcula a Média Móvel Exponencial (EMA) sobre uma série temporal de retenção.
 * EMA_0 = R_0
 * EMA_t = alpha * R_t + (1 - alpha) * EMA_{t-1}
 */
export function calculateRetentionEMA(
  rates: number[],
  alpha: number = DEFAULT_EMA_ALPHA
): number {
  const validRates = rates.filter((r) => r > 0)
  if (validRates.length === 0) return 0
  if (validRates.length === 1) return validRates[0]!

  let ema = validRates[0]!
  for (let i = 1; i < validRates.length; i++) {
    ema = alpha * validRates[i]! + (1 - alpha) * ema
  }
  return parseFloat(ema.toFixed(2))
}

export interface HysteresisEvaluation {
  shouldIncreaseWeight: boolean
  shouldDecreaseWeight: boolean
  smoothedRetention: number
  consecutiveLowWindows: number
  consecutiveHighWindows: number
}

/**
 * Avalia histerese e estabilidade da retenção por disciplina ao longo de janelas consecutivas.
 */
export function evaluateRetentionHysteresis(
  discipline: DisciplineAnalytics,
  alpha: number = DEFAULT_EMA_ALPHA,
  minConsecutiveWindows: number = MIN_CONSECUTIVE_WINDOWS_FOR_ADJUSTMENT
): HysteresisEvaluation {
  const history =
    discipline.retentionHistory && discipline.retentionHistory.length > 0
      ? [...discipline.retentionHistory, discipline.retentionRate]
      : [discipline.retentionRate]

  const validWindows = history.filter((r) => r > 0)
  const smoothedRetention = calculateRetentionEMA(validWindows, alpha)

  // Conta quantas janelas consecutivas mais recentes estão abaixo do limiar
  let consecutiveLow = 0
  for (let i = validWindows.length - 1; i >= 0; i--) {
    if (validWindows[i]! < LOW_RETENTION_THRESHOLD) {
      consecutiveLow++
    } else {
      break
    }
  }

  // Conta quantas janelas consecutivas mais recentes estão acima do limiar
  let consecutiveHigh = 0
  for (let i = validWindows.length - 1; i >= 0; i--) {
    if (validWindows[i]! > HIGH_RETENTION_THRESHOLD) {
      consecutiveHigh++
    } else {
      break
    }
  }

  const hasHighVolume =
    (discipline.questionsAnsweredCount ?? 0) >= MIN_QUESTIONS_VOLUME_THRESHOLD ||
    discipline.questionsAnsweredCount === undefined

  // Aumento de peso (+20%): exige sinal baixo por no mínimo N janelas consecutivas E EMA abaixo do limiar
  const shouldIncreaseWeight =
    validWindows.length >= minConsecutiveWindows &&
    consecutiveLow >= minConsecutiveWindows &&
    smoothedRetention < LOW_RETENTION_THRESHOLD

  // Redução de peso (-15%): exige alta retenção com volume e boa performance por no mínimo N janelas
  const shouldDecreaseWeight =
    validWindows.length >= minConsecutiveWindows &&
    consecutiveHigh >= minConsecutiveWindows &&
    smoothedRetention > HIGH_RETENTION_THRESHOLD &&
    discipline.performanceScore >= 85 &&
    hasHighVolume

  return {
    shouldIncreaseWeight,
    shouldDecreaseWeight,
    smoothedRetention,
    consecutiveLowWindows: consecutiveLow,
    consecutiveHighWindows: consecutiveHigh,
  }
}

/**
 * 1. Calcula o Learning Health Score (LHS)
 * Índice mestre de 0 a 100 indicando a saúde geral do aprendizado.
 */
export function calculateLearningHealthScore(context: AnalyticsContext): LearningHealthScore {
  // A. Retenção Média Suavizada por EMA
  const activeDisciplines = context.disciplines.filter((d) => d.retentionRate > 0)
  const retention = activeDisciplines.length
    ? activeDisciplines.reduce((acc, d) => {
        const history = d.retentionHistory?.length
          ? [...d.retentionHistory, d.retentionRate]
          : [d.retentionRate]
        return acc + calculateRetentionEMA(history)
      }, 0) / activeDisciplines.length
    : 0

  // B. Performance Média
  const perfDisciplines = context.disciplines.filter((d) => d.performanceScore > 0)
  const performance = perfDisciplines.length
    ? perfDisciplines.reduce((acc, d) => acc + d.performanceScore, 0) / perfDisciplines.length
    : 0

  // C. Consistência (Streak)
  const consistency = Math.min(100, context.userStats.currentStreak * 10) // 10 dias seguidos = 100%

  // D. Energia / Burnout Inverso
  const energy = Math.min(100, (context.userStats.averageEnergy / 5) * 100)

  // Média ponderada do LHS
  const score = Math.round(retention * 0.4 + performance * 0.3 + consistency * 0.2 + energy * 0.1)

  // Burnout Risk
  let burnoutRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW"
  if (energy < 40 && context.userStats.weeklyHoursStudied > 30) burnoutRisk = "HIGH"
  else if (energy < 60) burnoutRisk = "MEDIUM"

  // Label
  let statusLabel: "Excelente" | "Boa evolução" | "Necessita intervenção" | "Risco crítico"
  if (score >= 85) statusLabel = "Excelente"
  else if (score >= 60) statusLabel = "Boa evolução"
  else if (score >= 35) statusLabel = "Necessita intervenção"
  else statusLabel = "Risco crítico"

  return {
    score,
    components: { retention, consistency, performance, energy },
    statusLabel,
    burnoutRisk,
  }
}

/**
 * 2. Motor Heurístico de Recomendações
 * Retorna as decisões adaptativas com proteção de histerese e EMA.
 */
export function generateAdaptiveDecisions(context: AnalyticsContext): AdaptiveDecision[] {
  const decisions: AdaptiveDecision[] = []
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // Validade da decisão: 1 semana

  const lhs = calculateLearningHealthScore(context)

  // Heurística Global: Intervenção de Burnout
  if (lhs.burnoutRisk === "HIGH") {
    decisions.push({
      disciplineId: null,
      topicId: null,
      recommendationType: "SESSION_CAPACITY_CHANGE",
      previousValue: null,
      newValue: null,
      delta: -0.2, // Cortar carga horária global em 20%
      reason: "Risco alto de Burnout detectado. A carga semanal será reduzida.",
      confidence: 90,
      priority: "CRITICAL",
      engine: "ALE_HEURISTIC",
      algorithmVersion: "v1.1.0",
      expiresAt: expiresAt.toISOString(),
    })
  }

  // Heurísticas por Disciplina com EMA e Histerese de 2 janelas
  for (const disc of context.disciplines) {
    const evaluation = evaluateRetentionHysteresis(disc)

    // 1. Queda de Retenção Persistente (Aumentar peso +20%)
    if (evaluation.shouldIncreaseWeight) {
      decisions.push({
        disciplineId: disc.id,
        topicId: null,
        recommendationType: "WEIGHT_CHANGE",
        previousValue: disc.weight,
        newValue: parseFloat((disc.weight * 1.2).toFixed(2)),
        delta: 0.2, // +20%
        reason: `Queda persistente na retenção (${Math.round(evaluation.smoothedRetention)}% em ${evaluation.consecutiveLowWindows} janelas).`,
        confidence: 85,
        priority: "HIGH",
        engine: "ALE_HEURISTIC",
        algorithmVersion: "v1.1.0",
        expiresAt: expiresAt.toISOString(),
      })
    }

    // 2. Disciplina Dominada Persistente com Volume Alto (Reduzir peso -15%)
    if (evaluation.shouldDecreaseWeight) {
      decisions.push({
        disciplineId: disc.id,
        topicId: null,
        recommendationType: "WEIGHT_CHANGE",
        previousValue: disc.weight,
        newValue: parseFloat((disc.weight * 0.85).toFixed(2)),
        delta: -0.15, // -15%
        reason: `Disciplina dominada com alto volume (${Math.round(evaluation.smoothedRetention)}% de retenção estável em ${evaluation.consecutiveHighWindows} janelas).`,
        confidence: 95,
        priority: "LOW",
        engine: "ALE_HEURISTIC",
        algorithmVersion: "v1.1.0",
        expiresAt: expiresAt.toISOString(),
      })
    }
  }

  // Dispara evento de auditoria / telemetria
  GlobalEventBus.publish({
    eventName: EVENTS.ADAPTIVE_RECOMMENDATION_GENERATED,
    timestamp: new Date(),
    payload: { userId: context.userId, decisionsCount: decisions.length },
  })

  return decisions
}
