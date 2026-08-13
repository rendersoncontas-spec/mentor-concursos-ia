import type { DisciplineOption, SubjectSuggestion } from "./types"

/**
 * Normalização que PRESERVA as palavras (para tokens de disciplina):
 * minúsculas, sem acentos, sem pontuação, espaços colapsados.
 * Não usa normalizeHeader (que remove espaços).
 */
export function normalizeText(value: string): string {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const ABBREVIATIONS: Record<string, string> = {
  ti: "tecnologia da informacao",
  tic: "tecnologia da informacao e comunicacao",
  inf: "informatica",
  rlm: "raciocinio logico matematico",
  rl: "raciocinio logico",
  mat: "matematica",
  port: "lingua portuguesa",
  dir: "direito",
  dcon: "direito constitucional",
  dadm: "direito administrativo",
  dpc: "direito penal e processual penal",
  dpen: "direito penal",
  dpp: "direito processual penal",
  dciv: "direito civil",
  dprc: "direito processual civil",
  dtrab: "direito do trabalho",
  dpt: "direito processual do trabalho",
  dtrib: "direito tributario",
  damb: "direito ambiental",
  ddic: "direito digital e cibernetico",
  dfin: "direito financeiro",
  decon: "direito economico",
  dinte: "direito internacional",
  dpub: "direito publico",
  adm: "administracao",
  cont: "contabilidade",
  aud: "auditoria",
  finpub: "financas publicas",
  eng: "engenharia",
  legi: "legislacao",
  atad: "atendimento ao publico",
  atpub: "atendimento ao publico",
  red: "redacao",
  disc: "discursiva",
  obs: "observacoes",
}

const GENERIC_STOPWORDS = new Set([
  "curso",
  "estudo",
  "estudos",
  "aula",
  "aulas",
  "disciplina",
  "materia",
  "conteudo",
  "geral",
  "banca",
  "concurso",
  "concursos",
  "preparacao",
  "basico",
  "basica",
  "completo",
])

function expandTokens(text: string): string[] {
  const tokens = text.split(" ").filter((t) => t.length > 0)
  const expanded: string[] = []
  for (const token of tokens) {
    if (GENERIC_STOPWORDS.has(token)) continue
    const abbr = ABBREVIATIONS[token]
    if (abbr) {
      for (const word of abbr.split(" ")) expanded.push(word)
    } else {
      expanded.push(token)
    }
  }
  return expanded
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false
  for (const token of a) {
    if (!b.has(token)) return false
  }
  return true
}

/**
 * Similaridade 0..1 entre nome do arquivo e nome de disciplina do banco,
 * com expansão de abreviações e bônus de contido/prefixo.
 */
export function similarity(subjectName: string, candidate: string): number {
  if (!subjectName || !candidate) return 0

  const subjectNorm = normalizeText(subjectName)
  const candidateNorm = normalizeText(candidate)
  if (subjectNorm === candidateNorm) return 1

  const subjectTokens = new Set(expandTokens(subjectNorm).filter((t) => t.length >= 2))
  const candidateTokens = expandTokens(candidateNorm).filter((t) => t.length >= 2)
  const candidateSet = new Set(candidateTokens)

  const subjectTokenCount = subjectNorm.split(" ").length
  const candidateTokenCount = candidateNorm.split(" ").length
  if (subjectNorm.includes(candidateNorm) || candidateNorm.includes(subjectNorm)) {
    // Contenção só vira match automático quando os dois lados têm 2+ tokens:
    // evita gravar "Direito" (1 token) em "Direito Constitucional" sem confirmação.
    if (subjectTokenCount >= 2 && candidateTokenCount >= 2) return 0.8
    return 0.45
  }

  const base = jaccard(subjectTokens, candidateSet)
  if (base === 0) return 0

  let score = base
  if (isSubset(subjectTokens, candidateSet) || isSubset(candidateSet, subjectTokens)) {
    score += 0.15
  }
  const prefix = expandTokens(subjectNorm)[0]
  const candidatePrefix = expandTokens(candidateNorm)[0]
  if (prefix && candidatePrefix && prefix === candidatePrefix) {
    score += 0.1
  }
  return Math.min(1, score)
}

export const AUTO_MATCH_THRESHOLD = 0.55

/**
 * Retorna as top-3 sugestões de disciplina existente para cada matéria do
 * arquivo. A primeira sugestão com score >= AUTO_MATCH_THRESHOLD é marcada
 * como auto (pré-selecionada).
 */
export function suggestDisciplines(
  subjectNames: string[],
  disciplines: DisciplineOption[],
): Record<string, SubjectSuggestion[]> {
  const result: Record<string, SubjectSuggestion[]> = {}

  for (const name of subjectNames) {
    const ranked = disciplines
      .map((discipline) => ({
        name,
        disciplineId: discipline.id,
        score: similarity(name, discipline.name),
        auto: false,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    const first = ranked[0]
    if (first) {
      first.auto = first.score >= AUTO_MATCH_THRESHOLD
    }
    result[name] = ranked
  }

  return result
}
