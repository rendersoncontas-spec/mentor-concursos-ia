import type { ImportedStudyRecord } from "./types"

/**
 * Registro compacto para trafegar em server actions sem estourar o limite
 * de payload: [startAt, subjectName, durationSeconds, questions, correctAnswers, studyType, notes, topicName]
 */
export type CompactRecord = [
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
  string | null,
  string | null,
  string | null,
]

export function toCompact(records: ImportedStudyRecord[]): CompactRecord[] {
  return records.map((r) => [
    r.startAt,
    r.subjectName,
    r.durationSeconds,
    r.questions,
    r.correctAnswers,
    r.studyType,
    r.notes,
    r.topicName,
  ])
}

export function compactToRecords(compact: CompactRecord[]): ImportedStudyRecord[] {
  return compact.map(([startAt, subjectName, durationSeconds, questions, correctAnswers, studyType, notes, topicName]) => ({
    startAt,
    subjectName,
    topicName,
    durationSeconds,
    studyType,
    questions,
    correctAnswers,
    notes,
  }))
}

export interface SubjectImportConfig {
  mode: "existing" | "create" | "ignore"
  disciplineId?: string
}

export type SubjectImportMap = Record<string, SubjectImportConfig>
