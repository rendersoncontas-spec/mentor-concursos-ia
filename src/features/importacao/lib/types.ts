export type ImportField =
  | "startAt"
  | "subject"
  | "topic"
  | "duration"
  | "durationMinutes"
  | "studyType"
  | "questions"
  | "correctAnswers"
  | "notes"

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  startAt: "Data de início",
  subject: "Disciplina",
  topic: "Tópico / Conteúdo",
  duration: "Duração",
  durationMinutes: "Duração (minutos)",
  studyType: "Tipo de estudo",
  questions: "Questões",
  correctAnswers: "Acertos",
  notes: "Anotações",
}

/**
 * Modelo intermediário — independente do formato do arquivo externo.
 */
export interface ImportedStudyRecord {
  startAt: string | null
  subjectName: string | null
  topicName: string | null
  durationSeconds: number | null
  studyType: string | null
  questions: number | null
  correctAnswers: number | null
  notes: string | null
}

export interface ColumnInfo {
  index: number
  header: string
  field: ImportField | null
  sample: string[]
  automatic: boolean
  duplicateOf: ImportField | null
}

export interface SubjectSummary {
  name: string
  count: number
}

export interface QualityReport {
  valid: number
  noDate: number
  noSubject: number
  noDuration: number
  duplicatesInFile: number
}

export interface ParseReport {
  fileName: string
  sheetName: string
  totalRows: number
  columns: ColumnInfo[]
  records: ImportedStudyRecord[]
  subjects: SubjectSummary[]
  totalDurationSeconds: number
  withQuestions: number
  withCorrect: number
  withTopic: number
  withNotes: number
  quality: QualityReport
  errors: { row: number; message: string }[]
}

export interface DisciplineOption {
  id: string
  name: string
  area: string | null
}

export interface SubjectSuggestion {
  name: string
  disciplineId: string | null
  score: number
  auto: boolean
}

export interface ImportPreviewResult {
  newCount: number
  duplicateCount: number
  errorCount: number
  ignoredCount: number
  errors: string[]
}

export interface ImportChunkResult {
  imported: number
  duplicates: number
  errors: number
  createdSubjects: string[]
  errorDetails: string[]
}
