import type { EditalDraft, EditalMetadata, StructuredDiscipline, StructuredTopic } from "./types"
import { normalizeForMatch } from "./normalize"

const MAX_TEXT_CHARS = 400_000
const MAX_DISCIPLINES = 200
const MAX_TOPICS_PER_DISCIPLINE = 500
const MAX_TITLE_CHARS = 320

const LOW_CONFIDENCE_THRESHOLD = 0.75

// ---------------------------------------------------------------------------
// Identificação de seção de conteúdo programático
// ---------------------------------------------------------------------------

const PROGRAM_START_PATTERNS = [
  /conte[uú]do program[aá]tico/i,
  /conte[uú]do do edital/i,
  /conte[uú]dos do programa/i,
  /programa de provas/i,
  /programa das provas/i,
  /conte[uú]do das provas/i,
]

const PROGRAM_END_PATTERNS = [
  /^DAS?\s+DISPOSIÇÕES?S?\s+FINAIS?/i,
  /^DOS?\s+REQUISITOS/i,
  /^DA\s+INSCRIÇÃO/i,
  /^DAS?\s+INSCRIÇÕES/i,
  /^DA\s+PROVA/i,
  /^DAS\s+PROVAS/i,
  /^DAS?\s+AVALIAÇÕES?/i,
  /^DOS?\s+RECURSOS/i,
  /^DAS?\s+VAGAS/i,
  /^DO\s+CRONOGRAMA/i,
  /^DAS?\s+ETAPAS/i,
  /^DAS?\s+CONDIÇÕES/i,
  /^DO\s+PROGRAMA/i,
]

function isSectionBoundary(line: string): boolean {
  if (line.length > 70) return false
  const upper = line.toUpperCase()
  if (upper !== line.trim()) return false
  return PROGRAM_END_PATTERNS.some((p) => p.test(line.trim()))
}

function findProgramSection(lines: string[]): { start: number; end: number } {
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (PROGRAM_START_PATTERNS.some((p) => p.test(lines[i] ?? ""))) {
      start = i + 1
      break
    }
  }
  let end = lines.length
  if (start > 0) {
    for (let i = start; i < lines.length; i++) {
      if (isSectionBoundary(lines[i] ?? "")) {
        end = i
        break
      }
    }
  }
  return { start, end }
}

// ---------------------------------------------------------------------------
// Classificação de linhas
// ---------------------------------------------------------------------------

type DisciplineOrigin = "digit" | "roman" | "letter" | "other" | null

type ClassifiedLine =
  | { kind: "discipline"; confidence: number; title: string; origin: DisciplineOrigin }
  | { kind: "topic"; confidence: number; title: string }
  | { kind: "subtopic"; confidence: number; title: string }
  | { kind: "caps"; confidence: number; title: string }
  | { kind: "plain"; title: string }
  | { kind: "skip" }

const cleanTitle = (raw: string): string =>
  raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\-–—\s]*$/, "")
    .replace(/^\s*[-–—]\s*/, "")
    .trim()

const isAllCaps = (line: string): boolean => line.toUpperCase() === line

function classifyLine(
  line: string,
  disciplineOrigin: DisciplineOrigin,
  disciplineHasTopics: boolean,
  previousEndedWithSemicolon: boolean,
): ClassifiedLine {
  // 1.1.1 (3+ níveis) -> subtópico
  const subNum = line.match(/^(\d{1,2}(?:\.\d{1,2}){2,})[.)]?\s+(.+)$/)
  if (subNum) return { kind: "subtopic", confidence: 0.95, title: cleanTitle(subNum[2] ?? "") }
  // 1.1 / A.1 / I.1 (2 níveis) -> tópico
  const topicNum = line.match(/^(\d{1,2}\.\d{1,2})[.)]?\s+(.+)$/)
  if (topicNum) return { kind: "topic", confidence: 0.95, title: cleanTitle(topicNum[2] ?? "") }
  const topicLetterNum = line.match(/^([A-Z])\.(\d{1,2})[.)]?\s+(.+)$/)
  if (topicLetterNum) return { kind: "topic", confidence: 0.9, title: cleanTitle(topicLetterNum[3] ?? "") }
  const topicRomanNum = line.match(/^([IVXL]{1,4})\.(\d{1,2})[.)]?\s+(.+)$/)
  if (topicRomanNum) return { kind: "topic", confidence: 0.9, title: cleanTitle(topicRomanNum[3] ?? "") }
  // a) -> subtópico (ou tópico se a disciplina ainda não tiver tópicos)
  const subLetter = line.match(/^[a-z]\)\s+(.+)$/)
  if (subLetter) {
    if (disciplineOrigin && !disciplineHasTopics) {
      return { kind: "topic", confidence: 0.7, title: cleanTitle(subLetter[1] ?? "") }
    }
    return { kind: "subtopic", confidence: 0.9, title: cleanTitle(subLetter[1] ?? "") }
  }
  // "- item" / "• item" -> subtópico
  const dash = line.match(/^[-–•▪·]\s+(.+)$/)
  if (dash) {
    if (disciplineOrigin && !disciplineHasTopics) {
      return { kind: "topic", confidence: 0.6, title: cleanTitle(dash[1] ?? "") }
    }
    return { kind: "subtopic", confidence: 0.7, title: cleanTitle(dash[1] ?? "") }
  }
  // Número de disciplina (1.) — tópico se a disciplina aberta não for numérica
  const discNum = line.match(/^(\d{1,2})\.\s+(.+)$/)
  if (discNum) {
    if (disciplineOrigin && disciplineOrigin !== "digit") {
      return { kind: "topic", confidence: 0.9, title: cleanTitle(discNum[2] ?? "") }
    }
    return { kind: "discipline", confidence: 0.95, title: cleanTitle(discNum[2] ?? ""), origin: "digit" }
  }
  // Romano (I.) — tópico se a disciplina aberta não for romana
  const discRoman = line.match(/^([IVXL]{1,4})[.)]\s+(.+)$/)
  if (discRoman) {
    if (disciplineOrigin && disciplineOrigin !== "roman") {
      return { kind: "topic", confidence: 0.85, title: cleanTitle(discRoman[2] ?? "") }
    }
    return { kind: "discipline", confidence: 0.9, title: cleanTitle(discRoman[2] ?? ""), origin: "roman" }
  }
  // Letra (A.) -> disciplina se não houver disciplina aberta ou se a disciplina é de letras (A., B., C.)
  const discLetter = line.match(/^([A-Z])\.\s+(.+)$/)
  if (discLetter) {
    if (disciplineOrigin && disciplineOrigin !== "letter") {
      return { kind: "topic", confidence: 0.85, title: cleanTitle(discLetter[2] ?? "") }
    }
    return { kind: "discipline", confidence: 0.85, title: cleanTitle(discLetter[2] ?? ""), origin: "letter" }
  }
  // Encerra com ":" -> cabeçalho de enumeração (tópico)
  if (/[:]$/.test(line.trim()) && line.length >= 6 && line.length <= 140) {
    return { kind: "caps", confidence: 0.7, title: cleanTitle(line.replace(/[:;]+$/, "")) }
  }
  // Título em caixa alta (sem numeração)
  if (isAllCaps(line) && line.length >= 5 && line.length <= 140) {
    return {
      kind: "caps",
      confidence: disciplineOrigin && !disciplineHasTopics ? 0.65 : 0.75,
      title: cleanTitle(line),
    }
  }
  // Enumeração por ";" (tópicos sem numeração)
  if (/[;]$/.test(line.trim()) && disciplineOrigin && !disciplineHasTopics && line.length <= 140) {
    return { kind: "topic", confidence: 0.65, title: cleanTitle(line.replace(/[;]+$/, "")) }
  }
  // Item de enumeração anterior terminou com ";" -> nova linha é um novo item (não continuação)
  if (previousEndedWithSemicolon && line.length <= 100) {
    return { kind: "topic", confidence: 0.55, title: cleanTitle(line) }
  }
  return { kind: "plain", title: line }
}

function isNoiseLine(line: string): boolean {
  if (!line) return true
  if (/^\d{1,4}$/.test(line)) return true
  if (/^[-–—_=*•·.\s]{3,}$/.test(line)) return true
  if (/^(PÁGINA|PAGINA|FL\.|FLS\.)\s*\d+/i.test(line)) return true
  if (/^EDITAL\s*N?[ºo]?\s*\d+/i.test(line)) return true
  return false
}

// ---------------------------------------------------------------------------
// Estruturação
// ---------------------------------------------------------------------------

export function structureEditalText(rawText: string): EditalDraft {
  const text = rawText.slice(0, MAX_TEXT_CHARS).replace(/\uFEFF/g, "")
  const allLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !isNoiseLine(l))

  const { start, end } = findProgramSection(allLines)
  const from = start > 0 ? start : 0
  const lines = allLines.slice(from, end)

  const disciplines: StructuredDiscipline[] = []
  const origins: DisciplineOrigin[] = []
  let currentOrigin: DisciplineOrigin = null
  let currentDiscipline: StructuredDiscipline | null = null
  let currentTopic: StructuredTopic | null = null
  let previousEndedWithSemicolon = false
  const seenRepeated: Record<string, number> = {}

  const pushDiscipline = (
    name: string,
    confidence: number,
    origin: DisciplineOrigin,
  ): StructuredDiscipline => {
    const discipline: StructuredDiscipline = {
      name: name.slice(0, MAX_TITLE_CHARS),
      confidence,
      lowConfidence: confidence < LOW_CONFIDENCE_THRESHOLD,
      topics: [],
    }
    disciplines.push(discipline)
    origins.push(origin)
    currentOrigin = origin
    currentTopic = null
    return discipline
  }

  for (const line of lines) {
    const norm = normalizeForMatch(line)
    if (!norm) continue
    // Cabeçalhos/rodapés repetidos
    seenRepeated[norm] = (seenRepeated[norm] || 0) + 1
    if (seenRepeated[norm] > 3) continue

    const hasTopics = (currentDiscipline?.topics.length ?? 0) > 0
    const cls = classifyLine(line, currentOrigin, hasTopics, previousEndedWithSemicolon)
    previousEndedWithSemicolon = /[;]$/.test(line)
    if (disciplines.length >= MAX_DISCIPLINES) break

    switch (cls.kind) {
      case "skip":
        continue
      case "discipline": {
        if (!cls.title) break
        currentDiscipline = pushDiscipline(cls.title, cls.confidence, cls.origin)
        break
      }
      case "topic": {
        if (!cls.title) break
        if (!currentDiscipline) {
          currentDiscipline = pushDiscipline("(Conteúdo programático)", 0.4, "other")
        }
        if (currentDiscipline.topics.length >= MAX_TOPICS_PER_DISCIPLINE) break
        currentTopic = {
          title: cls.title.slice(0, MAX_TITLE_CHARS),
          confidence: cls.confidence,
          lowConfidence: cls.confidence < LOW_CONFIDENCE_THRESHOLD,
          subtopics: [],
        }
        currentDiscipline.topics.push(currentTopic)
        break
      }
      case "subtopic": {
        if (!cls.title) break
        if (!currentTopic) {
          if (currentDiscipline) {
            currentTopic = {
              title: "(Itens)",
              confidence: 0.5,
              lowConfidence: true,
              subtopics: [],
            }
            currentDiscipline.topics.push(currentTopic)
          } else {
            break
          }
        }
        currentTopic.subtopics.push({
          title: cls.title.slice(0, MAX_TITLE_CHARS),
          confidence: cls.confidence,
          lowConfidence: cls.confidence < LOW_CONFIDENCE_THRESHOLD,
        })
        break
      }
      case "caps": {
        if (!cls.title) break
        if (!currentDiscipline) {
          currentDiscipline = pushDiscipline(cls.title, cls.confidence, "other")
        } else if (currentDiscipline.topics.length > 0) {
          currentDiscipline = pushDiscipline(cls.title, cls.confidence, "other")
        } else {
          currentTopic = {
            title: cls.title.slice(0, MAX_TITLE_CHARS),
            confidence: cls.confidence,
            lowConfidence: cls.confidence < LOW_CONFIDENCE_THRESHOLD,
            subtopics: [],
          }
          currentDiscipline.topics.push(currentTopic)
        }
        break
      }
      case "plain": {
        if (!cls.title) continue
        if (!currentDiscipline) {
          currentDiscipline = pushDiscipline(cls.title, 0.5, "other")
        } else if (currentDiscipline.topics.length === 0 && cls.title.length <= 140) {
          currentTopic = {
            title: cls.title.slice(0, MAX_TITLE_CHARS),
            confidence: 0.6,
            lowConfidence: true,
            subtopics: [],
          }
          currentDiscipline.topics.push(currentTopic)
        } else if (currentTopic) {
          currentTopic.title = `${currentTopic.title} ${cls.title}`.slice(0, MAX_TITLE_CHARS)
        } else {
          currentDiscipline.name = `${currentDiscipline.name} ${cls.title}`.slice(0, MAX_TITLE_CHARS)
        }
        break
      }
    }
  }

  dedupeHierarchy(disciplines, origins)

  return {
    metadata: guessMetadata(allLines),
    disciplines,
  }
}

// ---------------------------------------------------------------------------
// Deduplicação por nome normalizado (mantém a primeira ocorrência)
// ---------------------------------------------------------------------------

function filterDuplicates<T>(items: T[], keyOf: (t: T) => string): number[] {
  const keep: number[] = []
  const seen: Record<string, number> = {}
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    const key = keyOf(item)
    if (!key) continue
    seen[key] = (seen[key] || 0) + 1
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    const key = keyOf(item)
    if (!key) continue
    if ((seen[key] ?? 0) > 1) {
      seen[key] = (seen[key] ?? 0) - 1
      continue
    }
    keep.push(i)
  }
  return keep
}

function dedupeHierarchy(disciplines: StructuredDiscipline[], origins: (DisciplineOrigin)[]): void {
  const discKeep = filterDuplicates(disciplines, (d) => normalizeForMatch(d.name))
  const discKeepSet = new Set(discKeep)
  const keptDiscs = disciplines.filter((_, i) => discKeepSet.has(i))
  const keptOrigins = origins.filter((_, i) => discKeepSet.has(i))

  for (const d of keptDiscs) {
    const topicKeep = filterDuplicates(d.topics, (t) => normalizeForMatch(t.title))
    const topicKeepSet = new Set(topicKeep)
    d.topics = d.topics.filter((_, i) => topicKeepSet.has(i))
    for (const t of d.topics) {
      const subKeep = filterDuplicates(t.subtopics, (s) => normalizeForMatch(s.title))
      const subKeepSet = new Set(subKeep)
      t.subtopics = t.subtopics.filter((_, i) => subKeepSet.has(i))
    }
  }

  disciplines.length = 0
  disciplines.push(...keptDiscs)
  origins.length = 0
  origins.push(...keptOrigins)
}

// ---------------------------------------------------------------------------
// Metadados (apenas com evidência textual)
// ---------------------------------------------------------------------------

const DATE_RE_G = /(\d{2}\/\d{2}\/\d{4})/g
const DATE_RE_GROUP = /(\d{2}\/\d{2}\/\d{4})/
const DATE_RE = /\d{2}\/\d{2}\/\d{4}/

function lineHas(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

export function guessMetadata(lines: string[]): EditalMetadata {
  const meta: EditalMetadata = {}

  const nameLine = lines.find((l) => /EDITAL\s*N?[ºo]?\s*\d+/i.test(l))
  if (nameLine) {
    meta.name = nameLine.replace(/\s{2,}/g, " ").slice(0, 160)
  } else {
    const concurso = lines.slice(0, 25).find((l) => /CONCURSO\s+PÚBLICO/i.test(l))
    if (concurso) meta.name = concurso.replace(/\s{2,}/g, " ").slice(0, 160)
  }

  const orgLine = lines.slice(0, 30).find((l) => /^(?:ÓRGÃO|ORGAO)\s*:?/i.test(l))
  if (orgLine) {
    const value = orgLine.replace(/^(?:ÓRGÃO|ORGAO)\s*:?\s*/i, "").split(/\s+BANCA/i)[0]?.trim()
    if (value) meta.organizer = value.slice(0, 80)
  } else {
    const oc = lines.slice(0, 25).find((l) => /CONCURSO\s+PÚBLICO\s+(?:DA|DO|DE|DAS|DOS)\s+([A-ZÀ-Ú])/i.test(l))
    if (oc) meta.organizer = oc.slice(0, 80)
  }

  const bancaMatch = lines.slice(0, 40).find((l) => /BANCA\s*(?:EXAMINADORA|ORGANIZADORA)?\s*:?/i.test(l))
  if (bancaMatch) {
    const value = bancaMatch.replace(/BANCA\s*(?:EXAMINADORA|ORGANIZADORA)?\s*:?\s*/i, "")
    if (value.trim()) meta.banca = value.trim().slice(0, 80)
  }

  const roleMatch = lines.slice(0, 40).find((l) => /(?:CARGO|FUNÇÃO|FUNCAO)\s*:?\s*[A-ZÀ-Ú]/i.test(l))
  if (roleMatch) {
    const value = roleMatch.replace(/(?:CARGO|FUNÇÃO|FUNCAO)\s*:?\s*/i, "")
    if (value.trim()) meta.role = value.trim().slice(0, 80)
  }

  const allDates: string[] = []
  for (const l of lines.slice(0, 80)) {
    for (const m of l.matchAll(DATE_RE_G)) {
      const d = m[1]
      if (d && !allDates.includes(d)) allDates.push(d)
    }
  }

  const provaDate = lines.slice(0, 80).find((l) => /PROVA/i.test(l) && lineHas(l, DATE_RE))
  const examDate = provaDate?.match(DATE_RE_GROUP)?.[1] ?? allDates[0]
  if (examDate) meta.examDate = examDate

  const pubLine = lines.slice(0, 60).find((l) => /PUBLICAÇ|PUBLICAC/i.test(l) && lineHas(l, DATE_RE))
  const publicationDate = pubLine?.match(DATE_RE_GROUP)?.[1]
  if (publicationDate) meta.publicationDate = publicationDate

  const regLine = lines.slice(0, 60).find((l) => /INSCRIÇ|INSCRIC/i.test(l) && lineHas(l, DATE_RE))
  const registrationDate = regLine?.match(DATE_RE_GROUP)?.[1]
  if (registrationDate) meta.registrationDate = registrationDate

  return meta
}

// ---------------------------------------------------------------------------
// Confiança geral
// ---------------------------------------------------------------------------

export function computeOverallConfidence(disciplines: StructuredDiscipline[]): number {
  if (disciplines.length === 0) return 0
  let total = 0
  let count = 0
  for (const d of disciplines) {
    total += d.confidence * 0.5
    count += 0.5
    for (const t of d.topics) {
      total += t.confidence * 0.35
      count += 0.35
      for (const s of t.subtopics) {
        total += s.confidence * 0.15
        count += 0.15
      }
    }
  }
  return count === 0 ? 0 : Math.round((total / count) * 100) / 100
}

export function countLowConfidence(disciplines: StructuredDiscipline[]): number {
  let count = 0
  for (const d of disciplines) {
    if (d.lowConfidence) count += 1
    for (const t of d.topics) {
      if (t.lowConfidence) count += 1
      for (const s of t.subtopics) {
        if (s.lowConfidence) count += 1
      }
    }
  }
  return count
}
