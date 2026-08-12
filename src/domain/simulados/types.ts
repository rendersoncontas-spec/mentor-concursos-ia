// ============================================================================
// Tipos do módulo Simulados (Mentor Concursos IA)
// ============================================================================

export type SimuladoMode =
  | "COMPLETO"
  | "DISCIPLINA"
  | "MATERIA"
  | "TOPICO"
  | "REVISAO"
  | "ERROS"
  | "PERSONALIZADO"
  | "RAPIDO"
  | "DESAFIO"
  | "ADAPTATIVO"

export type DifficultyFilter = "TODAS" | "FACIL" | "MEDIA" | "DIFICIL" | "ADAPTATIVO"

export type SimuladoStatus = "CONFIG" | "IN_PROGRESS" | "FINISHED" | "CANCELED"

export type ScoreBand = "EXCELENTE" | "BOM" | "REGULAR" | "BAIXO"

export interface SimuladoAlternative {
  label: string
  text: string
}

/** Questão pronta para o player (sem gabarito). */
export interface PlayerQuestion {
  id: string
  orderIndex: number
  statement: string
  alternatives: SimuladoAlternative[] | null
  isCertoErrado: boolean
  disciplineId: string
  disciplineName: string
  topicName: string | null
  difficultyLabel: string | null
}

/** Configuração pedida pelo usuário ao criar o simulado. */
export interface SimuladoConfigInput {
  name: string
  examName: string | null
  roleName: string | null
  mode: SimuladoMode
  total: number
  disciplineIds: string[]
  /** Distribuição personalizada: disciplineId -> quantidade (soma deve ser === total). */
  distribution: Record<string, number>
  topicIds: string[]
  difficulty: DifficultyFilter
  /** true = somente questões erradas anteriormente; false = sem restrição. */
  onlyWrong: boolean
  /** true = priorizar questões erradas dentro de cada disciplina. */
  prioritizeWrong: boolean
  allTopics: boolean
  onlyStudiedTopics: boolean
  onlyPendingTopics: boolean
  durationLimitSeconds: number | null
}

export interface SimuladoConfigSnapshot {
  name: string
  examName: string | null
  roleName: string | null
  mode: SimuladoMode
  total: number
  disciplineIds: string[]
  distribution: Record<string, number>
  topicIds: string[]
  difficulty: DifficultyFilter
  onlyWrong: boolean
  prioritizeWrong: boolean
  durationLimitSeconds: number | null
}

export interface SimuladoHeader {
  id: string
  name: string
  examName: string | null
  roleName: string | null
  examBoard: string | null
  mode: SimuladoMode
  status: SimuladoStatus
  simuladoDate: string | null
  startedAt: string | null
  finishedAt: string | null
  timeSpentSeconds: number | null
  durationLimitSeconds: number | null
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalBlank: number
  accuracy: number | null
  score: ScoreBand | null
  avgTimePerQuestionSeconds: number | null
  difficulty: DifficultyFilter | null
}

export interface SimuladoAnswerRow {
  questionId: string
  orderIndex: number
  selectedAnswer: string | null
  isMarked: boolean
  answered: boolean
  isCorrect: boolean | null
  responseTimeSeconds: number | null
}

export interface SimuladoDisciplineResult {
  disciplineId: string | null
  disciplineName: string
  questions: number
  correct: number
  wrong: number
  blank: number
  accuracy: number | null
}

export interface SimuladoTopicResult {
  topicId: string | null
  topicName: string
  disciplineName: string
  questions: number
  correct: number
  accuracy: number | null
}

export interface SimuladoQuestionResult {
  questionId: string
  orderIndex: number
  statement: string
  alternatives: SimuladoAlternative[] | null
  isCertoErrado: boolean
  disciplineId: string | null
  disciplineName: string
  topicId: string | null
  topicName: string | null
  selectedAnswer: string | null
  correctAnswer: string
  explanation: string | null
  isCorrect: boolean | null
  isMarked: boolean
  answered: boolean
  responseTimeSeconds: number | null
  difficultyLabel: string | null
}

export interface SimuladoTimeStats {
  totalSeconds: number
  avgPerQuestionSeconds: number | null
  avgPerCorrectSeconds: number | null
  avgPerWrongSeconds: number | null
}

export interface SimuladoComparisonEntry {
  id: string
  name: string
  date: string | null
  accuracy: number | null
  correct: number
  wrong: number
  total: number
  timeSpentSeconds: number | null
}

export interface TrendSummary {
  accuracy: "UP" | "STABLE" | "DOWN" | null
  correct: "UP" | "STABLE" | "DOWN" | null
  time: "FASTER" | "STABLE" | "SLOWER" | null
}

export interface PersonalBests {
  bestAccuracy: { value: number; simuladoId: string; name: string } | null
  bestCorrect: { value: number; simuladoId: string; name: string } | null
  fastestTime: { value: number; simuladoId: string; name: string } | null
  bestByDiscipline: { disciplineName: string; accuracy: number | null; simuladoId: string } | null
}

export interface SimuladoAnalysisInsight {
  severity: "info" | "positive" | "warning"
  message: string
}

export interface SimuladoResultPayload {
  header: SimuladoHeader
  byDiscipline: SimuladoDisciplineResult[]
  byTopic: SimuladoTopicResult[]
  questions: SimuladoQuestionResult[]
  timeStats: SimuladoTimeStats
  markedCount: number
  insights: SimuladoAnalysisInsight[]
  comparison: SimuladoComparisonEntry[]
  trend: TrendSummary
  bests: PersonalBests
  previousAvgAccuracy: number | null
}

export interface SimuladoConfigData {
  hasQuestions: boolean
  concursos: { id: string; targetExam: string; targetRole: string | null; isActive: boolean }[]
  disciplines: { id: string; name: string; area: string | null; availableCount: number; studied: boolean }[]
  topics: { id: string; disciplineId: string; name: string }[]
  wrongQuestionCount: number
  hasDifficultyData: boolean
}

export interface SimuladoPreview {
  ok: boolean
  available: number
  byDiscipline: Record<string, number>
  wrongOnlyAvailable: number
  hasDifficultyData: boolean
  message: string | null
}

export interface SimuladoDraft {
  simuladoId: string
  answers: Record<string, { selected: string | null; marked: boolean; elapsed: number }>
  currentIndex: number
  elapsedMs: number
  savedAt: number
}