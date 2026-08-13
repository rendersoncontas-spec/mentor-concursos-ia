import { detectColumns, detectField } from "./column-detector"
import type { ColumnInfo, ImportField, ImportedStudyRecord, ParseReport, SubjectSummary } from "./types"
import { parseCount, parseDurationSeconds, parseStartAt, parseText } from "./value-parsers"

const SHEET_NAME_HINTS = [/historico/i, /histórico/i, /estudo/i, /estudos/i, /studi/i, /study/i, /atividades/i]

interface RowValues {
  startAt: unknown
  subject: unknown
  topic: unknown
  duration: unknown
  durationMinutes: unknown
  studyType: unknown
  questions: unknown
  correctAnswers: unknown
  notes: unknown
}

function pickSheet(sheets: { name: string; rows: (unknown[])[] }[]): { name: string; rows: (unknown[])[] } {
  if (sheets.length === 0) throw new Error("Arquivo vazio")

  let best: { name: string; rows: (unknown[])[] } | undefined = sheets[0]
  let bestScore = -1
  for (const sheet of sheets) {
    let score = 0
    if (SHEET_NAME_HINTS.some((hint) => hint.test(sheet.name))) score += 10
    const headerRow = sheet.rows[0] ?? []
    for (const cell of headerRow) {
      if (detectField(cell) !== null) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = sheet
    }
  }
  if (!best) throw new Error("Arquivo vazio")
  return best
}

function findHeaderRow(rows: (unknown[])[]): number {
  const maxScan = Math.min(rows.length, 6)
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] ?? []
    let count = 0
    for (const cell of row) {
      if (detectField(cell) !== null) count++
    }
    if (count >= 2) return i
  }
  return 0
}

function buildRowValues(row: unknown[], columns: ColumnInfo[]): RowValues {
  const values: RowValues = {
    startAt: null,
    subject: null,
    topic: null,
    duration: null,
    durationMinutes: null,
    studyType: null,
    questions: null,
    correctAnswers: null,
    notes: null,
  }
  for (const column of columns) {
    if (column.field && !column.duplicateOf) {
      values[column.field] = row[column.index] ?? null
    }
  }
  return values
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function computeInFileFingerprint(record: ImportedStudyRecord): string {
  return [
    record.startAt ?? "",
    (record.subjectName ?? "").toLowerCase().trim(),
    record.durationSeconds ?? "",
    record.questions ?? "",
  ].join("|")
}

/**
 * Converte as linhas cruas em registros intermediários, com relatório de
 * qualidade. Não depende de nenhum nome de arquivo, usuário ou coluna fixa.
 * `overrides` permite corrigir manualmente o mapeamento de colunas
 * (index -> campo), ex.: depois que o usuário confirma colunas desconhecidas.
 */
export function parseFileSheets(
  sheets: { name: string; rows: (unknown[])[] }[],
  fileName: string,
  overrides?: Record<number, ImportField | null>,
): ParseReport {
  const sheet = pickSheet(sheets)
  const rows = sheet.rows
  const errors: ParseReport["errors"] = []

  const headerIndex = findHeaderRow(rows)
  const headerRow = rows[headerIndex] ?? []
  let columns: ColumnInfo[] = detectColumns(headerRow).columns.map((column) => ({
    ...column,
    sample: [],
  }))

  const samples: Record<number, string[]> = {}
  for (const column of columns) {
    const values: string[] = []
    for (let r = headerIndex + 1; r < rows.length && values.length < 3; r++) {
      const cell = rows[r]?.[column.index]
      const text = cell === null || cell === undefined ? "" : String(cell).trim()
      if (text !== "") values.push(text)
    }
    samples[column.index] = values
  }
  columns = columns.map((column) => ({ ...column, sample: samples[column.index] ?? [] }))

  if (overrides) {
    columns = columns.map((column): ColumnInfo => {
      const override = overrides[column.index]
      const field = override === undefined ? column.field : override
      return {
        ...column,
        field,
        automatic: field !== null,
        duplicateOf: null,
      }
    })
    const used = new Set<ImportField>()
    columns = columns.map((column): ColumnInfo => {
      if (column.field) {
        if (used.has(column.field)) return { ...column, duplicateOf: column.field }
        used.add(column.field)
      }
      return column
    })
  }

  const records: ImportedStudyRecord[] = []
  const subjectCounts = new Map<string, number>()
  let totalDurationSeconds = 0
  let withQuestions = 0
  let withCorrect = 0
  let withTopic = 0
  let withNotes = 0
  const seenFingerprints = new Set<string>()
  let valid = 0
  let noDate = 0
  let noSubject = 0
  let noDuration = 0
  let duplicatesInFile = 0

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const raw = rows[r]
    if (!raw || raw.every((cell) => cell === null || cell === undefined || String(cell).trim() === "")) {
      continue
    }

    const values = buildRowValues(raw, columns)

    const startAt = parseStartAt(values.startAt)
    const subjectName = parseText(values.subject)
    const topicName = parseText(values.topic)
    // "Duração (minutos)" é a fonte numérica preferencial; "Duração" textual
    // serve como fallback (e validação) quando a coluna de minutos não existe.
    let durationSeconds: number | null = parseDurationSeconds(values.durationMinutes)
    if (durationSeconds === null && values.duration !== undefined && values.duration !== null) {
      durationSeconds = parseDurationSeconds(values.duration)
    }
    const studyType = parseText(values.studyType)
    const questions = parseCount(values.questions)
    const correctAnswers = parseCount(values.correctAnswers)
    const notes = parseText(values.notes)

    const record: ImportedStudyRecord = {
      startAt: toIso(startAt),
      subjectName,
      topicName,
      durationSeconds,
      studyType,
      questions,
      correctAnswers,
      notes,
    }
    records.push(record)

    if (startAt === null) noDate++
    if (subjectName === null) noSubject++
    if (durationSeconds === null) noDuration++
    if (subjectName && durationSeconds) {
      valid++
      totalDurationSeconds += durationSeconds
    }
    if (questions !== null) withQuestions++
    if (correctAnswers !== null) withCorrect++
    if (topicName !== null) withTopic++
    if (notes !== null) withNotes++

    if (subjectName !== null) {
      subjectCounts.set(subjectName, (subjectCounts.get(subjectName) ?? 0) + 1)
    }

    const fingerprint = computeInFileFingerprint(record)
    if (seenFingerprints.has(fingerprint)) {
      duplicatesInFile++
      errors.push({ row: r + 1, message: `Registro duplicado no próprio arquivo: ${subjectName ?? "sem disciplina"}` })
    } else {
      seenFingerprints.add(fingerprint)
    }
  }

  const subjects: SubjectSummary[] = [...subjectCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    fileName,
    sheetName: sheet.name,
    totalRows: records.length,
    columns,
    records,
    subjects,
    totalDurationSeconds,
    withQuestions,
    withCorrect,
    withTopic,
    withNotes,
    quality: {
      valid,
      noDate,
      noSubject,
      noDuration,
      duplicatesInFile,
    },
    errors,
  }
}
