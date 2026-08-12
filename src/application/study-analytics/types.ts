import type { StudyHistory } from "@/domain/study-history/study-history.types"

export type DateRange = {
  start: Date
  end: Date
}

// ==============================================================================
// Contexto do Analytics Engine
// ==============================================================================
export interface AnalyticsContext {
  // Dados brutos
  history: StudyHistory[]
  periodDays: number
  timezone: string
  weekStartDay?: number
  
  // Instância de cache interno para evitar recálculos
  cache: Map<string, unknown>
  
  // Métodos de utilidade que o contexto expõe
  getCache<T>(key: string, computeFn: () => T): T
}

// ==============================================================================
// Tipos de Saída Visual
// ==============================================================================

export type HeatmapDay = {
  date: string // YYYY-MM-DD
  minutes: number
  sessions: number
  intensity: number // 0 a 100 (%)
}

export type TimeSeriesDataPoint = {
  date: string // ISO ou YYYY-MM-DD dependendo da escala
  value: number // geralmente minutos
}

export type TrendDirection = 'UP' | 'DOWN' | 'STABLE'

export type RankingItem = {
  id: string
  name: string
  value: number
  secondaryValue?: number
  trend?: {
    direction: TrendDirection
    percentage: number // Ex: 18 para +18%
  }
}

export type InsightSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'POSITIVE'

export type Insight = {
  id: string
  title: string
  description: string
  severity: InsightSeverity
  score: number // 0 a 100
  action?: {
    label: string
    href: string
  }
}

export type GoalProgress = {
  target: number
  achieved: number
  percentage: number
  remaining: number
}
