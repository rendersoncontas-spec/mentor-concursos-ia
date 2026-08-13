import type { ImportField } from "./types"

/**
 * Normaliza qualquer cabeçalho para comparação semântica:
 * remove acentos, caixa e tudo que não for letra/dígito.
 * Ex.: "Duração (minutos)" -> "duracaominutos"
 */
export function normalizeHeader(value: unknown): string {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
  return text.trim()
}

export function normalizeForMatch(value: string): string {
  return normalizeHeader(value)
}

const ALIASES: Record<ImportField, string[]> = {
  startAt: [
    "inicio",
    "datadeinicio",
    "datainicio",
    "iniciadoem",
    "iniciadoas",
    "quando",
    "comeceiem",
    "comecouem",
    "data",
    "datahora",
    "start",
    "startedat",
    "datetime",
    "timestamp",
  ],
  subject: [
    "materia",
    "materias",
    "disciplina",
    "subject",
    "categoria",
    "areatematica",
    "assunto",
    "nome",
  ],
  topic: [
    "conteudo",
    "topico",
    "assuntoestudado",
    "assuntodoconteudo",
    "conteudoestudado",
    "topic",
    "content",
    "modulo",
    "unidade",
    "conteudodarevisao",
  ],
  duration: [
    "duracao",
    "duracaototal",
    "duracaodatividade",
    "tempototal",
    "tempodeestudo",
    "tempototaldeestudo",
    "tempodestudo",
    "tempo",
    "tempoestudado",
    "tempodeduracao",
    "duration",
    "horastudada",
    "horas",
    "horaestudada",
    "tempoemestudo",
  ],
  durationMinutes: [
    "duracaominutos",
    "duracaomin",
    "duracaoemminutos",
    "minutos",
    "minutostotais",
    "minutosestudados",
    "minutosestudado",
    "tempoemminutos",
    "min",
    "durationminutes",
    "durationmin",
    "minutes",
    "minutosestudadosnototal",
  ],
  studyType: [
    "tipo",
    "tipodeestudo",
    "tipoatividade",
    "modalidade",
    "modo",
    "metodo",
    "formatodeestudo",
    "studytype",
    "tipoestudo",
    "tipo de estudo",
  ],
  questions: [
    "exerciciosfeitos",
    "exercicios",
    "questoes",
    "questoesfeitas",
    "questoesrespondidas",
    "exerciciosresolvidos",
    "qtdexercicios",
    "numerodequestoes",
    "nquestoes",
    "totalquestoes",
    "questions",
    "questionanswered",
    "questionsanswered",
    "qtdquestoes",
    "questoescertas",
    "nquestoes",
  ],
  correctAnswers: [
    "acertos",
    "nracertos",
    "numeroacertos",
    "questoesacertadas",
    "respostascorretas",
    "corretas",
    "correct",
    "correctanswers",
    "acertoscertas",
    "qtdacertos",
  ],
  notes: [
    "anotacoes",
    "anotacao",
    "observacoes",
    "observacao",
    "notas",
    "nota",
    "notes",
    "comentarios",
    "comentario",
    "descricao",
    "resumodasessao",
    "log",
    "detalhes",
  ],
}

export const IMPORT_FIELDS: ImportField[] = [
  "startAt",
  "subject",
  "durationMinutes",
  "duration",
  "topic",
  "studyType",
  "questions",
  "correctAnswers",
  "notes",
]

const ALIAS_INDEX: { alias: string; field: ImportField }[] = Object.entries(
  ALIASES,
).flatMap(([field, list]) =>
  list.map((alias) => ({
    alias: normalizeForMatch(alias),
    field: field as ImportField,
  })),
)

/**
 * Detecta o campo semântico de um cabeçalho.
 * - Tentativa 1: igualdade exata com um alias.
 * - Tentativa 2: o cabeçalho "contém" um alias (ou vice-versa), checando
 *   aliases do mais longo ao mais curto (ex.: "duracaominutos" vence "duracao").
 */
export function detectField(headerValue: unknown): ImportField | null {
  const header = normalizeForMatch(String(headerValue ?? ""))
  if (!header) return null

  const exact = ALIAS_INDEX.find((entry) => entry.alias === header)
  if (exact) return exact.field

  const sorted = [...ALIAS_INDEX].sort((a, b) => b.alias.length - a.alias.length)
  const contained = sorted.find((entry) => {
    if (entry.alias.length < 3) return false
    return header.includes(entry.alias) || entry.alias.includes(header)
  })
  if (contained) return contained.field

  return null
}

/**
 * Mapeia cabeçalhos para colunas, mantendo apenas a primeira coluna por campo
 * (colunas extras que repetem um campo ficam com duplicateOf preenchido).
 */
export function detectColumns(headers: unknown[]): {
  columns: { index: number; header: string; field: ImportField | null; automatic: boolean; duplicateOf: ImportField | null }[]
  usedFields: Set<ImportField>
} {
  const used = new Set<ImportField>()
  const columns = headers.map((header, index) => {
    const field = detectField(header)
    if (field && used.has(field)) {
      return { index, header: String(header ?? ""), field: null, automatic: false, duplicateOf: field }
    }
    if (field) used.add(field)
    return { index, header: String(header ?? ""), field, automatic: field !== null, duplicateOf: null }
  })
  return { columns, usedFields: used }
}
