import type { MentorAIResponse, MentorLLMInput } from "@/domain/mentor/mentor-ai"

/**
 * G2.18 — qualidade DETERMINÍSTICA da resposta (sem outro LLM).
 *
 * Duas saídas:
 * - `flags`: GENERIC_LOW_VALUE (a resposta não explica nada ligado aos fatos —
 *   o serviço a descarta), REPETITIVE (mesma frase em blocos diferentes) e
 *   LOW_ACTIONABILITY (sugestões sem verbo de ação) — essas duas só sinalizam;
 * - `scores` (0–1) para a avaliação do piloto: FAITHFULNESS, CLARITY,
 *   SPECIFICITY, ACTIONABILITY, UNCERTAINTY_HANDLING, NON_CAUSALITY,
 *   DATA_GROUNDING por heurística; USEFULNESS é sempre humano (null).
 * FAITHFULNESS/NON_CAUSALITY/DATA_GROUNDING valem 1 em toda resposta que
 * passou no validador (que já rejeita contradição, causa e referência
 * inválida) — ficam aqui para a planilha mostrar a dimensão explicitamente.
 */

export type MentorQualityFlag = "GENERIC_LOW_VALUE" | "REPETITIVE" | "LOW_ACTIONABILITY"
export type MentorQualityDimension =
  | "FAITHFULNESS"
  | "CLARITY"
  | "SPECIFICITY"
  | "USEFULNESS"
  | "ACTIONABILITY"
  | "UNCERTAINTY_HANDLING"
  | "NON_CAUSALITY"
  | "DATA_GROUNDING"

export interface MentorQualityAssessment {
  flags: MentorQualityFlag[]
  scores: Record<MentorQualityDimension, number | null>
  genericBlocks: string[]
  repeatedBlocks: string[]
}

const GENERIC =
  /\b(continue (?:estudando|assim|firme|nesse ritmo|nesse caminho|se dedicando)|(?:você )?está indo (?:muito )?bem|tenha foco|mantenha o foco|foque nos estudos|estude mais|não desista|siga em frente|bom trabalho|parabéns|persista|dedique-se|seja constante|acredite em você|você consegue)\b/iu
/** Vocabulário que liga o texto ao TIPO do fato/candidata (âncora de especificidade). */
const TYPE_TERMS: Record<string, RegExp> = {
  STUDY_LAST_7_DAYS: /\b(ritmo|estudo|semana|regularidade|constância|dias)\b/iu,
  STUDY_TREND_WEEK: /\b(ritmo|estudo|semana|tendência)\b/iu,
  NO_RECENT_STUDY: /\b(retom\w*|pausa|recente|ritmo|estudo)\b/iu,
  LAST_SIMULADO: /\bsimulad\w*/iu,
  SIMULADO_EVOLUTION: /\b(simulad\w*|evolu\w*|desempenho|recuo|estabilidade)\b/iu,
  DISCIPLINE_ATTENTION: /\b(simulad\w*|desempenho|atenção|acertos?|erros?)\b/iu,
  DECLINING_DISCIPLINE: /\b(recuo|queda|caiu|piora|atenção|erros?|simulad\w*)\b/iu,
  IMPROVING_DISCIPLINE: /\b(evolu\w*|melhor\w*|avanço|subiu|cresc\w*|simulad\w*)\b/iu,
  OVERDUE_REVIEWS: /\brevis\w*/iu,
  GOAL_PROGRESS: /\bmetas?\b/iu,
  CYCLE_POSITION: /\bciclo\b/iu,
  EDITAL_PROGRESS: /\b(edital|conteúdo|cobertura)\b/iu,
  INSUFFICIENT_DATA: /\b(registr\w*|dados|poucos|limitad\w*)\b/iu,
  LOW_STUDY_VOLUME: /\b(ritmo|estudo|blocos?|semana|tempo)\b/iu,
  HIGH_OVERDUE_REVIEWS: /\brevis\w*/iu,
  LOW_SIMULADO_PERFORMANCE: /\b(simulad\w*|erros?|questões|acertos?)\b/iu,
  HIGH_PROGRESS: /\b(avanço|evolu\w*|manter|preservar|revis\w*)\b/iu,
  STUDY_BELOW_GOAL: /\b(meta|ritmo|semana|distribuir)\b/iu,
}
const ACTION_VERBS =
  /\b(revis\w*|pratic\w*|resolv\w*|registr\w*|prioriz\w*|retom\w*|reserv\w*|compar\w*|acompanh\w*|faz\w*|refaz\w*|anot\w*|distribu\w*|organiz\w*|separ\w*|planej\w*|analis\w*|testar|cronometr\w*|intercal\w*)\b/iu
const HEDGE = /\b(limitad\w*|poucos?|ainda|cautel\w*|preliminar|inicial|cedo)\b/iu
const REF_IN_TEXT = /(?<![\p{L}\p{N}])D[1-9]\d{0,2}(?![\p{L}\p{N}])/u

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
}

/** Similaridade de Jaccard entre conjuntos de palavras (0–1). */
export function textSimilarity(a: string, b: string): number {
  const A = new Set(words(a))
  const B = new Set(words(b))
  if (A.size === 0 && B.size === 0) return 1
  let inter = 0
  for (const w of A) if (B.has(w)) inter += 1
  return inter / (A.size + B.size - inter)
}

function isGeneric(text: string, types: (string | undefined)[]): boolean {
  if (words(text).length < 4) return true
  if (!GENERIC.test(text)) return false
  if (REF_IN_TEXT.test(text)) return false
  return !types.some((t) => t && TYPE_TERMS[t]?.test(text.replace(GENERIC, " ")))
}

export function assessMentorResponse(response: MentorAIResponse, input: MentorLLMInput): MentorQualityAssessment {
  const insightType = new Map(input.insights.map((i) => [i.ref, i.type]))
  const candidateType = new Map(input.candidates.map((c) => [c.ref, c.type]))
  const typeOf = (ref: string) => insightType.get(ref) ?? candidateType.get(ref)

  const blocks: { field: string; text: string; types: (string | undefined)[] }[] = [
    { field: "summary", text: response.summary, types: response.summaryRefs.map(typeOf) },
    ...response.highlights.map((h, i) => ({ field: `highlights.${i}`, text: h.text, types: [typeOf(h.insightRef)] })),
    ...response.attentionPoints.map((a, i) => ({ field: `attentionPoints.${i}`, text: a.text, types: [typeOf(a.insightRef)] })),
    ...response.recommendations.map((r, i) => ({
      field: `recommendations.${i}`,
      text: `${r.title}. ${r.explanation}`,
      types: [typeOf(r.candidateId), ...r.evidenceIds.map(typeOf)],
    })),
  ]
  const genericBlocks = blocks.filter((b) => isGeneric(b.text, b.types)).map((b) => b.field)
  const recFields = response.recommendations.map((_, i) => `recommendations.${i}`)
  const others = blocks.filter((b) => b.field !== "summary")

  const repeatedBlocks: string[] = []
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i]
      const b = blocks[j]
      if (a && b && textSimilarity(a.text, b.text) >= 0.8) repeatedBlocks.push(`${a.field}~${b.field}`)
    }
  }

  const flags: MentorQualityFlag[] = []
  const summaryGeneric = genericBlocks.includes("summary")
  const othersGeneric = others.filter((b) => genericBlocks.includes(b.field)).length
  const allRecsGeneric = recFields.length > 0 && recFields.every((f) => genericBlocks.includes(f))
  const nothingConcrete = others.length === 0 && (input.contextQuality.level === "MEDIUM" || input.contextQuality.level === "HIGH")
  if ((summaryGeneric && othersGeneric * 2 >= others.length) || allRecsGeneric || nothingConcrete) flags.push("GENERIC_LOW_VALUE")
  if (repeatedBlocks.length > 0) flags.push("REPETITIVE")
  const actionable = response.recommendations.filter((r) => ACTION_VERBS.test(`${r.title} ${r.explanation}`)).length
  if (response.recommendations.length > 0 && actionable === 0) flags.push("LOW_ACTIONABILITY")

  const sentences = blocks.flatMap((b) => b.text.split(/(?<=[.!?])\s+/u)).filter((s) => s.trim() !== "")
  const longSentences = sentences.filter((s) => words(s).length > 30).length
  const lowQuality = input.contextQuality.level === "LOW" || input.contextQuality.level === "EMPTY"
  const round = (n: number) => Math.round(n * 100) / 100

  return {
    flags,
    genericBlocks,
    repeatedBlocks,
    scores: {
      FAITHFULNESS: 1,
      NON_CAUSALITY: 1,
      DATA_GROUNDING: 1,
      SPECIFICITY: blocks.length > 0 ? round(1 - genericBlocks.length / blocks.length) : 0,
      ACTIONABILITY: response.recommendations.length > 0 ? round(actionable / response.recommendations.length) : null,
      CLARITY: sentences.length > 0 ? round(1 - longSentences / sentences.length) : 0,
      UNCERTAINTY_HANDLING: !lowQuality || (response.confidence === "low" && HEDGE.test(response.summary)) ? 1 : 0,
      USEFULNESS: null,
    },
  }
}

/** Repetição ENTRE contextos (piloto): pares de resumos quase iguais para contextos diferentes. */
export function crossContextRepetition(items: { id: string; summary: string }[], threshold = 0.8): { a: string; b: string; similarity: number }[] {
  const out: { a: string; b: string; similarity: number }[] = []
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]
      const b = items[j]
      if (!a || !b) continue
      const similarity = textSimilarity(a.summary, b.summary)
      if (similarity >= threshold) out.push({ a: a.id, b: b.id, similarity: Math.round(similarity * 100) / 100 })
    }
  }
  return out
}
