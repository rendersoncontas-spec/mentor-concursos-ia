import { getDayInSaoPaulo } from "@/lib/sao-paulo"

/**
 * Fase F.1 — filtros do Histórico como função pura (movidos sem alteração de
 * `history-view.tsx`, onde viviam dentro de um useMemo), para ficarem
 * cobertos por testes (filter-history-sessions.test.ts).
 *
 * O dia de estudo é o dia em São Paulo de `started_at` (mesmo getStudyDate
 * da tela).
 */

export interface HistoryFilters {
  dateStart: string
  dateEnd: string
  disciplineId: string
  origin: string
  studyType: string
  technique: string
  timeRange: string
  focusRange: string
}

export interface FilterableSession {
  started_at: string
  discipline_id: string | null
  import_batch_id?: string | null
  origin_source?: string | null
  origin_source_name?: string | null
  study_type?: string | null
  technique?: string | null
  duration_minutes?: number | null
  metadata?: Record<string, unknown> | null
}

function getStudyDate(session: FilterableSession): string {
  return getDayInSaoPaulo(session.started_at)
}

export function filterHistorySessions<S extends FilterableSession>(
  sessions: readonly S[],
  filters: HistoryFilters,
  importFilterId: string | null,
): S[] {
  let result = [...sessions]

  if (importFilterId) {
    result = result.filter((s) => s.import_batch_id === importFilterId)
  }
  if (filters.dateStart) {
    result = result.filter((s) => getStudyDate(s) >= filters.dateStart)
  }
  if (filters.dateEnd) {
    result = result.filter((s) => getStudyDate(s) <= filters.dateEnd)
  }
  if (filters.disciplineId) {
    result = result.filter((s) => s.discipline_id === filters.disciplineId)
  }
  if (filters.origin) {
    if (filters.origin === "mentor") {
      result = result.filter((s) => !s.origin_source)
    } else {
      result = result.filter((s) => s.origin_source_name === filters.origin)
    }
  }
  if (filters.studyType) {
    result = result.filter((s) => s.study_type === filters.studyType)
  }
  if (filters.technique) {
    result = result.filter((s) => s.technique === filters.technique)
  }
  if (filters.timeRange) {
    result = result.filter((s) => {
      const mins = s.duration_minutes || 0
      switch (filters.timeRange) {
        case "0-30":
          return mins <= 30
        case "30-60":
          return mins > 30 && mins <= 60
        case "60-120":
          return mins > 60 && mins <= 120
        case "120+":
          return mins > 120
        default:
          return true
      }
    })
  }
  if (filters.focusRange) {
    result = result.filter((s) => {
      const rawFocus = s.metadata?.["focus_percentage"]
      if (rawFocus === null || rawFocus === undefined) return false
      const focus = Number(rawFocus)
      switch (filters.focusRange) {
        case "0-49":
          return focus >= 0 && focus < 50
        case "50-69":
          return focus >= 50 && focus < 70
        case "70-89":
          return focus >= 70 && focus < 90
        case "90-100":
          return focus >= 90 && focus <= 100
        default:
          return true
      }
    })
  }

  return result
}
