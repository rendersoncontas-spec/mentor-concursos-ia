/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import * as XLSX from "xlsx"
import { readWorkbook } from "./excel-reader"
import { parseFileSheets } from "./normalize"
import { detectField } from "./column-detector"
import { parseStartAt, parseDurationSeconds, parseCount, formatDuration } from "./value-parsers"
import { detectStudyType, studyTypeToSource } from "./study-map"
import { similarity, suggestDisciplines, AUTO_MATCH_THRESHOLD } from "./subject-matcher"

const REAL_FILE = "src/features/importacao/lib/fixtures/historico.xlsx"

function buildWorkbook(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, "Histórico")
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" })
  return out
}

function parseRows(rows: unknown[][]): ReturnType<typeof parseFileSheets> {
  const wb = buildWorkbook(rows)
  const sheets = readWorkbook(wb)
  return parseFileSheets(sheets, "teste.xlsx")
}

test("coluna 'Duração (minutos)' vence 'Duração'", () => {
  assert.equal(detectField("Duração (minutos)"), "durationMinutes")
  assert.equal(detectField("Duração"), "duration")
  assert.equal(detectField("Início"), "startAt")
  assert.equal(detectField("Matéria"), "subject")
  assert.equal(detectField("Conteúdo"), "topic")
  assert.equal(detectField("Exercicios feitos"), "questions")
  assert.equal(detectField("Acertos"), "correctAnswers")
  assert.equal(detectField("Anotações"), "notes")
  assert.equal(detectField("Tipo"), "studyType")
})

test("valores de data", () => {
  const serial = parseStartAt(46245.50475694444)
  assert.ok(serial, "serial deve ser data")
  assert.equal(serial!.getUTCFullYear(), 2026)

  const iso = parseStartAt("2026-07-01T14:30:00")
  assert.ok(iso)

  const dmy = parseStartAt("01/07/2026 14:30")
  assert.ok(dmy)
  assert.equal(dmy!.getFullYear(), 2026)

  const dmy2 = parseStartAt("2026-07-01")
  assert.ok(dmy2)

  const ambiguous = parseStartAt("05/06/2026")
  assert.ok(ambiguous)
  assert.equal(ambiguous!.getDate(), 5, "ambíguo interpreta como dia/mês (BR)")
})

test("valores de duração", () => {
  assert.equal(parseDurationSeconds("4m 37s"), 277)
  assert.equal(parseDurationSeconds("25m 9s"), 1509)
  assert.equal(parseDurationSeconds("1h 25m 30s"), 5130)
  assert.equal(parseDurationSeconds("40m"), 2400)
  assert.equal(parseDurationSeconds("01:25:32"), 5132)
  assert.equal(parseDurationSeconds("04:37"), 277)
  assert.equal(parseDurationSeconds("4.61785"), 277)
  assert.equal(parseDurationSeconds(4.61785), 277)
  assert.equal(parseDurationSeconds("1 hora e 25 minutos"), 5100)
  assert.equal(parseDurationSeconds("1h25min30s"), 5130)
  assert.equal(parseDurationSeconds(""), null)
  assert.equal(parseDurationSeconds(null), null)
  assert.equal(formatDuration(277), "4m")
  assert.equal(formatDuration(5130), "1h 25m")
})

test("contagens", () => {
  assert.equal(parseCount(20), 20)
  assert.equal(parseCount("20"), 20)
  assert.equal(parseCount("20 questões"), 20)
  assert.equal(parseCount(null), null)
  assert.equal(parseCount(""), null)
})

test("mapeamento de tipos externos", () => {
  assert.equal(detectStudyType("Video"), "VIDEOAULA")
  assert.equal(detectStudyType("FlashCards"), "FLASHCARDS")
  assert.equal(detectStudyType("Baralho Anki"), "FLASHCARDS")
  assert.equal(detectStudyType("Audio"), "AUDIO")
  assert.equal(detectStudyType("Exercicios feitos"), "QUESTOES")
  assert.equal(detectStudyType("MapaMental"), "MAPA_MENTAL")
  assert.equal(detectStudyType("Leitura"), "LEITURA")
  assert.equal(detectStudyType("Revisao"), "REVISAO")
  assert.equal(detectStudyType("Resumo"), "RESUMO")
  assert.equal(detectStudyType("xyz-desconhecido"), null)
  assert.equal(detectStudyType(null), null)
  assert.equal(studyTypeToSource("VIDEOAULA"), "VIDEO")
  assert.equal(studyTypeToSource("QUESTOES"), "QUESTOES")
  assert.equal(studyTypeToSource("REVISAO"), "REVIEW")
  assert.equal(studyTypeToSource("SIMULADO"), "SIMULADO")
  assert.equal(studyTypeToSource(null), "FREE")
})

test("coluna 'Duração (minutos)' é a fonte preferencial", () => {
  const report = parseRows([
    ["Início", "Matéria", "Duração", "Duração (minutos)", "Tipo"],
    ["01/07/2026 10:00", "Matemática", "1h 30m", 25.5, "Video"],
  ])
  assert.equal(report.totalRows, 1)
  assert.equal(report.records[0]!.durationSeconds, 1530, "25.5 min (1530s) vence a coluna textual")
})

test("similaridade de disciplinas", () => {
  assert.equal(similarity("Direito Penal", "Direito Penal"), 1)
  assert.ok(similarity("Direito Penal e Processo Penal", "Direito Penal") > 0.5)
  assert.ok(similarity("TI", "Tecnologia da Informação") > 0.7)
  assert.ok(similarity("Matemática", "Matematica") === 1)
  assert.ok(similarity("Literatura Inglesa", "Direito Constitucional") < 0.3)
})

test("sugestões auto", () => {
  const disciplines = [
    { id: "d1", name: "Direito Penal", area: "Direito" },
    { id: "d2", name: "Tecnologia da Informação", area: "TI" },
  ]
  const suggestions = suggestDisciplines(["Direito Penal e Processo Penal", "TI", "Física"], disciplines)
  assert.equal(suggestions["Direito Penal e Processo Penal"]?.[0]?.disciplineId, "d1")
  assert.equal(suggestions["Direito Penal e Processo Penal"]?.[0]?.auto, true)
  assert.equal(suggestions["TI"]?.[0]?.disciplineId, "d2")
  assert.equal(suggestions["TI"]?.[0]?.auto, true)
  assert.equal(suggestions["Física"]?.length ?? 0, 0)
})

test("matéria de 1 token não auto-associa a disciplina maior (regressão)", () => {
  assert.ok(similarity("Direito", "Direito Constitucional") < AUTO_MATCH_THRESHOLD)
  assert.ok(similarity("Direito", "Direito") === 1)
  assert.ok(similarity("Direito Penal e Processo Penal", "Direito Penal") >= AUTO_MATCH_THRESHOLD)

  const catalog = [
    { id: "d1", name: "Direito Constitucional", area: "Direito" },
    { id: "d2", name: "Direito Administrativo", area: "Direito" },
  ]
  const suggestions = suggestDisciplines(["Direito"], catalog)
  assert.equal(suggestions["Direito"]?.[0]?.auto, false, "sem auto-match em caso ambíguo")
  assert.ok((suggestions["Direito"]?.[0]?.score ?? 0) > 0, "continua como sugestão manual")
})

test("parse do arquivo real do Aprovado (historico.xlsx)", { skip: !fs.existsSync(REAL_FILE) }, () => {
  const buf = fs.readFileSync(REAL_FILE)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const sheets = readWorkbook(ab)
  assert.equal(sheets.length, 1)
  assert.equal(sheets[0]!.name, "Histórico")

  const report = parseFileSheets(sheets, "historico.xlsx")
  assert.equal(report.totalRows, 2479, "2479 linhas de dados")
  assert.equal(report.sheetName, "Histórico")
  assert.equal(report.quality.noDate, 0)
  assert.equal(report.quality.noSubject, 0)
  assert.equal(report.quality.noDuration, 7, "7 registros com duração 0 no arquivo real")
  assert.equal(report.quality.valid, 2472)
  assert.equal(report.quality.duplicatesInFile, 0)

  const first = report.records[0]!
  assert.equal(first.subjectName, "Tecnologia da Informação - TI")
  assert.equal(first.durationSeconds, 277, "4m 37s -> 277s")
  assert.equal(first.studyType, "Video")
  assert.equal(first.questions, null)

  const last = report.records[report.records.length - 1]!
  assert.ok(last.startAt)
  assert.equal(last.durationSeconds, 1509, "25m 9s -> 1509s")

  const ti = report.subjects.find((s) => s.name === "Tecnologia da Informação - TI")
  assert.ok(ti && ti.count > 0)

  assert.ok(report.totalDurationSeconds > 0)
})

test("variante A: cabeçalhos em inglês e colunas em outra ordem", () => {
  const report = parseRows([
    ["Study Type", "Start", "Minutes", "Subject", "Questions Answered", "Correct Answers", "Notes"],
    ["Video", "07/01/2026 14:30", "25", "Direito Constitucional", "10", "8", "anotação x"],
    ["FlashCards", "08/01/2026 09:00", "40", "Raciocínio Lógico", "0", "0", ""],
  ])
  assert.equal(report.totalRows, 2)
  assert.equal(report.records[0]!.subjectName, "Direito Constitucional")
  assert.equal(report.records[0]!.durationSeconds, 1500)
  assert.equal(report.records[0]!.studyType, "Video")
  assert.equal(report.records[0]!.questions, 10)
  assert.equal(report.records[0]!.correctAnswers, 8)
})

test("variante B: apenas 'Duração (minutos)' numérica", () => {
  const report = parseRows([
    ["Início", "Matéria", "Duração (minutos)", "Tipo"],
    [46245.50475694444, "TI", 4.61785, "Video"],
  ])
  assert.equal(report.totalRows, 1)
  assert.equal(report.records[0]!.durationSeconds, 277)
  assert.ok(report.records[0]!.startAt)
})

test("variante C: cabeçalho na segunda linha (título na primeira)", () => {
  const report = parseRows([
    ["Exportado em 2026"],
    ["Início", "Matéria", "Conteúdo", "Duração"],
    ["01/07/2026 10:00", "Matemática", "Funções", "1h"],
  ])
  assert.equal(report.totalRows, 1)
  assert.equal(report.records[0]!.subjectName, "Matemática")
  assert.equal(report.records[0]!.topicName, "Funções")
  assert.equal(report.records[0]!.durationSeconds, 3600)
})

test("variante D: datas ISO + duração em relógio HH:MM:SS", () => {
  const report = parseRows([
    ["Started At", "Subject", "Duration", "Type", "Questions", "Correct"],
    ["2026-07-01T14:30:00", "Direito Penal", "01:25:32", "Questões", "20", "15"],
  ])
  assert.equal(report.records[0]!.durationSeconds, 5132)
  assert.equal(report.records[0]!.questions, 20)
  assert.equal(report.records[0]!.studyType, "Questões")
})

test("variante E: duplicados dentro do arquivo são contados", () => {
  const report = parseRows([
    ["Início", "Matéria", "Duração"],
    ["01/07/2026 10:00", "Matemática", "1h"],
    ["01/07/2026 10:00", "Matemática", "1h"],
    ["01/07/2026 10:00", "Matemática", "1h"],
  ])
  assert.equal(report.totalRows, 3)
  assert.equal(report.quality.duplicatesInFile, 2)
})

test("variante F: múltiplas planilhas — escolhe a de nome e colunas", () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["nome", "email"]]), "Leads")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Início", "Matéria", "Duração"],
    ["01/07/2026 10:00", "Matemática", "1h"],
  ]), "Histórico de Estudos")
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" })
  const sheets = readWorkbook(out)
  const report = parseFileSheets(sheets, "multi.xlsx")
  assert.equal(report.sheetName, "Histórico de Estudos")
  assert.equal(report.totalRows, 1)
})

test("variante G: célula de data real (Date object) e linhas vazias ignoradas", () => {
  const wb = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Início", "Matéria", "Duração"],
    [new Date("2026-07-01T10:00:00"), "História", "30m"],
    [null, null, null],
    ["", "", ""],
  ])
  XLSX.utils.book_append_sheet(wb, sheet, "Histórico")
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" })
  const report = parseFileSheets(readWorkbook(out), "dates.xlsx")
  assert.equal(report.totalRows, 1)
  assert.ok(report.records[0]!.startAt)
  assert.equal(report.records[0]!.subjectName, "História")
})

test("overrides manuais de colunas corrigem mapeamento", () => {
  const wb = buildWorkbook([
    ["Início", "Matéria", "Item ID", "Tipo"],
    ["01/07/2026 10:00", "Matemática", "xyz-123", "Video"],
  ])
  const sheets = readWorkbook(wb)
  const parsed = parseFileSheets(sheets, "override.xlsx")
  assert.equal(parsed.columns[2]!.field, null, "coluna desconhecida sem override")

  const overridden = parseFileSheets(sheets, "override.xlsx", { 2: "topic" })
  assert.equal(overridden.columns[2]!.field, "topic")
  assert.equal(overridden.records[0]!.topicName, "xyz-123")
})
