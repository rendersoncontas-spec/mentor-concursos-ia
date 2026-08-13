export type StudySource = 'PLAN' | 'FREE' | 'REVIEW' | 'SIMULADO' | 'QUESTOES' | 'VIDEO' | 'PDF'

/**
 * Plataforma de origem do estudo importado.
 * slug: "aprovado" | "estudei" | "gran" | "tec" | "qconcursos" | "outra" (nome customizado)
 * Sessões criadas no Mentor IA têm origin_source = null.
 */
export type OriginSource = 'aprovado' | 'estudei' | 'outra' | 'gran' | 'tec' | 'qconcursos'

export type StudyType =
  | 'TEORIA'
  | 'QUESTOES'
  | 'REVISAO'
  | 'RESUMO'
  | 'MAPA_MENTAL'
  | 'FLASHCARDS'
  | 'VIDEOAULA'
  | 'AUDIO'
  | 'AULA_VIVO'
  | 'LEITURA'
  | 'LEI_SECA'
  | 'JURISPRUDENCIA'
  | 'INFORMATIVOS'
  | 'DOUTRINA'
  | 'SIMULADO'
  | 'MONITORIA'
  | 'ESTUDO_IA'
  | 'DISCUSSAO'
  | 'OUTRO'

export type StudyTechnique =
  | 'LIVRE'
  | 'POMODORO_25_5'
  | 'POMODORO_50_10'
  | 'FLOWTIME'
  | 'DEEP_WORK'
  | 'PERSONALIZADO'

export type StudyHistory = {
  id: string
  user_id: string
  discipline_id: string
  study_plan_item_id: string | null
  study_source: StudySource
  study_type: StudyType | null
  technique: StudyTechnique | null
  started_at: string
  finished_at: string | null
  duration_minutes: number | null
  active_minutes: number | null
  paused_minutes: number | null
  planned_minutes: number | null
  completed: boolean
  interrupted: boolean
  energy_level: number | null
  difficulty: number | null
  focus_score: number | null
  mood: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  origin_source?: OriginSource | null
  origin_source_name?: string | null
  origin_imported_at?: string | null
  import_batch_id?: string | null
  created_at: string
}

export type StudyHistoryInsert = Omit<StudyHistory, 'id' | 'created_at' | 'user_id'>

export type StudyStats = {
  dailyMinutes: number
  weeklyMinutes: number
  monthlyMinutes: number
  totalMinutes: number
  longestSession: number
  bestStudyHour: string | null
  bestWeekday: number | null
  mostStudiedDisciplineId: string | null
  averageFocus: number | null
  consecutiveStreak: number
}

// Interfaces futuras para IA
export type DisciplineTrend = {
  disciplineId: string
  trend: 'UP' | 'DOWN' | 'STABLE'
  averageFocus: number
  averageDifficulty: number
}
