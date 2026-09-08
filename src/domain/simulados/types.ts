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
  examBoard?: string | null
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

// ============================================================================
// MÓDULO DE REGISTRO DE SIMULADOS EXTERNOS (novo conceito)
// ============================================================================

/** Fonte onde o aluno fez o simulado fora do sistema. */
export type SimuladoRecordSource =
  | "TEC"
  | "GRAN"
  | "ESTRATEGIA"
  | "QCONCURSOS"
  | "PDF"
  | "PROVA_ANTERIOR"
  | "OUTRO"

/** Regra de pontuação escolhida pelo usuário. */
export type SimuladoScoringRule = "PERCENTUAL" | "CEBRASPE" | "PENALIZACAO" | "PERSONALIZADO"

/** Penalização padrão CEBRASPE/CESPE: 1 erro anula 1 acerto. */
export const CEBRASPE_DEFAULT_PENALTY = 1

/** Faixas de desempenho configuradas centralizadas. */
export const PERFORMANCE_BANDS = {
  EXCELENTE: { min: 85, label: "Excelente", color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  BOM: { min: 75, label: "Bom", color: "text-sky-600", bg: "bg-sky-500/10", border: "border-sky-500/30" },
  ATENCAO: { min: 60, label: "Atenção", color: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  FRACO: { min: 0, label: "Fraco", color: "text-rose-600", bg: "bg-rose-500/10", border: "border-rose-500/30" },
} as const

/** Um simulado registrado manualmente pelo aluno (feito fora do sistema). */
export interface SimuladoRecordInput {
  id?: string | undefined
  name: string
  examName: string
  roleName: string
  simuladoDate: string // YYYY-MM-DD
  source: SimuladoRecordSource
  sourceCustom?: string | undefined
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalBlank: number
  timeSpentSeconds?: number | null | undefined
  notes?: string | null | undefined
  scoringRule: SimuladoScoringRule
  /** Penalização por erro (CEBRASPE/PENALIZACAO). Default 1 = 1 erro anula 1 acerto. */
  penaltyPerWrong?: number | null | undefined
  /** Percentual final informado manualmente (PENALIZACAO/PERSONALIZADO). */
  penaltyScore?: number | null | undefined
  subjects: SimuladoRecordSubjectInput[]
  exam_board: string // Banca examinadora (ex: CEBRASPE, FCC, FGV, VUNESP, FUMARC, FUNDEP, IBFC, Instituto AOCP, CETAP, Consulplan, Outra)
  exam_board_custom?: string | null // Banca personalizada quando "Outra" for selecionada
}

/** Resultado por matéria informado pelo aluno. */
export interface SimuladoRecordSubjectInput {
  disciplineId?: string | null
  disciplineName: string
  questionsCount: number
  correctCount: number
  wrongCount: number
  blankCount?: number
}

/** Linha de registro de simulado completa (com valores computados). */
export interface SimuladoRecord {
  id: string
  userId: string
  name: string
  examName: string
  roleName: string
  simuladoDate: string
  source: SimuladoRecordSource
  sourceCustom: string | null
  exam_board: string | null
  exam_board_custom: string | null
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalBlank: number
  accuracy: number | null
  /** Pontuação líquida considerando a regra (ex: CEBRASPE). */
  netScore?: number | null
  /** Percentual líquido de aproveitamento (netScore / totalQuestions). */
  netAccuracy?: number | null
  timeSpentSeconds: number | null
  notes: string | null
  scoringRule: SimuladoScoringRule
  /** Penalização por erro (CEBRASPE). Null quando não aplicável. */
  penaltyPerWrong?: number | null
  penaltyScore: number | null
  subjects: SimuladoRecordSubject[]
  createdAt: string
  updatedAt: string
}

export interface SimuladoRecordSubject {
  disciplineId: string | null
  disciplineName: string
  questionsCount: number
  correctCount: number
  wrongCount: number
  blankCount: number
  accuracy: number | null
  /** Pontuação líquida por matéria (quando regra CEBRASPE). */
  netScore?: number | null
}

/** Estatísticas gerais do painel de simulados. */
export interface SimuladoPanelStats {
  totalSimulados: number
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  averageAccuracy: number | null
  bestAccuracy: number | null
  lastAccuracy: number | null
  last5AverageAccuracy: number | null
  worstAccuracy: number | null
  evolutionPp: number | null
  trend: "UP" | "STABLE" | "DOWN" | null
  trendMessage: string | null
}

/** Ponto do gráfico de evolução. */
export interface SimuladoEvolutionPoint {
  simuladoId: string
  name: string
  date: string
  accuracy: number | null
}

/** Análise por matéria agregada entre simulados. */
export interface SimuladoSubjectAnalysis {
  disciplineId: string | null
  disciplineName: string
  totalQuestions: number
  totalCorrect: number
  accuracy: number | null
  band: keyof typeof PERFORMANCE_BANDS
  evolutionPp: number | null
  history: { simuladoId: string; name: string; date: string; accuracy: number | null }[]
}

/** Comparação entre dois simulados. */
export interface SimuladoComparisonResult {
  firstId: string
  secondId: string
  accuracyDeltaPp: number | null
  subjects: {
    disciplineName: string
    firstAccuracy: number | null
    secondAccuracy: number | null
    deltaPp: number | null
  }[]
}