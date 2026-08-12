export interface DomainEvent {
  eventName: string
  timestamp: Date
  payload: unknown
}

type EventHandler = (event: DomainEvent) => Promise<void> | void

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map()

  subscribe(eventName: string, handler: EventHandler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, [])
    }
    const handlers = this.handlers.get(eventName)
    if (handlers) {
      handlers.push(handler)
    }
  }

  async publish(event: DomainEvent) {
    const eventHandlers = this.handlers.get(event.eventName) || []
    
    // Dispara todos os handlers em paralelo para não bloquear o fluxo (Fire and Forget)
    // No futuro, isso pode ser trocado por Kafka, RabbitMQ ou SQ/SNS mantendo a interface
    const promises = eventHandlers.map(handler => {
      try {
        return handler(event)
      } catch (err) {
        console.error(`Error processing event ${event.eventName}:`, err)
        return Promise.resolve()
      }
    })

    await Promise.allSettled(promises)
  }
}

// Singleton Global Instance
export const GlobalEventBus = new EventBus()

// ==========================================
// Constantes de Eventos do Mentor IA
// ==========================================
export const EVENTS = {
  STUDY_SESSION_COMPLETED: 'StudySessionCompleted',
  QUESTION_ANSWERED: 'QuestionAnswered',
  REVIEW_FINISHED: 'ReviewFinished',
  PERFORMANCE_UPDATED: 'PerformanceUpdated',
  ADAPTIVE_RECOMMENDATION_GENERATED: 'AdaptiveRecommendationGenerated',
  STUDY_PLAN_GENERATED: 'StudyPlanGenerated'
} as const
