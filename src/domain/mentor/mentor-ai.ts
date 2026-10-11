/**
 * G2.16 — contrato do Mentor com um modelo de linguagem (sem HTTP, sem
 * fornecedor). O domínio só conhece: o que vai (MentorLLMInput), o que volta
 * (MentorAIResponse) e a porta do provedor (MentorLLMProvider).
 *
 * Princípio: o LLM NÃO escreve números nem ids. Ele cita REFERÊNCIAS curtas
 * ("I1", "R2", "D3") que o servidor gerou para este pedido; o servidor valida
 * cada referência e a tela renderiza os fatos (horas, %, datas, nomes) a
 * partir do contexto determinístico.
 */

/**
 * G2.18: "mentor-v2" promovida (justificativa em docs/mentor-v2-evaluation.md:
 * alinhamento prompt ↔ validador comprovado por teste). A "mentor-v1" segue
 * disponível só para comparação no script de piloto. Voltar = trocar esta linha.
 */
export const MENTOR_PROMPT_VERSION: MentorPromptVersion = "mentor-v2"

/** Versões de prompt conhecidas. A ATIVA é sempre MENTOR_PROMPT_VERSION. */
export type MentorPromptVersion = "mentor-v1" | "mentor-v2"

// ─── Entrada mínima enviada ao modelo ─────────────────────────────────────────

export interface MentorLLMInsightRef {
  ref: string // "I1"…
  type: string
  priority: "HIGH" | "MEDIUM" | "LOW"
  disciplineRef: string | null
  fact: string // frase factual determinística (com os números do sistema)
  evidence: Record<string, number | string | boolean | null | string[]>
}

export interface MentorLLMCandidateRef {
  ref: string // "R1"…
  type: string
  priority: "HIGH" | "MEDIUM" | "LOW"
  disciplineRef: string | null
  reason: string
  evidence: Record<string, number | string | boolean | null | string[]>
}

export interface MentorLLMDisciplineRef {
  ref: string // "D1"…
  name: string
  studyMinutesLast28: number | null
  simuladosCount: number
  simuladoAverage: number | null
  simuladoEvolutionPp: number | null
}

export interface MentorLLMInput {
  promptVersion: MentorPromptVersion
  contextVersion: string
  today: string
  contextQuality: { level: "EMPTY" | "LOW" | "MEDIUM" | "HIGH"; reasons: string[] }
  sections: Record<string, "OK" | "NO_DATA" | "UNAVAILABLE">
  daysToExam: number | null
  disciplines: MentorLLMDisciplineRef[]
  insights: MentorLLMInsightRef[]
  candidates: MentorLLMCandidateRef[]
}

// ─── Saída estruturada do modelo (validada no servidor) ───────────────────────

export type MentorAIConfidence = "high" | "medium" | "low"

export interface MentorAIHighlight {
  /** Referência a um insight do pedido ("I…"). */
  insightRef: string
  kind: "INTERPRETATION"
  text: string
}

export interface MentorAIAttentionPoint {
  insightRef: string
  disciplineRef: string | null
  text: string
}

export interface MentorAIRecommendation {
  id: string
  /** Referência a uma recomendação candidata do pedido ("R…"). */
  candidateId: string
  title: string
  explanation: string
  /** Referências a insights/candidatas que sustentam a sugestão. */
  evidenceIds: string[]
}

export interface MentorAIResponse {
  summary: string
  /** G2.18 (v2): fatos/candidatas ("I…"/"R…") que sustentam o resumo. v1: sempre []. */
  summaryRefs: string[]
  highlights: MentorAIHighlight[]
  attentionPoints: MentorAIAttentionPoint[]
  recommendations: MentorAIRecommendation[]
  confidence: MentorAIConfidence
  insufficientData: boolean
}

// ─── Porta do provedor ────────────────────────────────────────────────────────

export interface MentorLLMRequest {
  system: string
  user: string
  maxOutputTokens: number
  timeoutMs: number
}

export type MentorLLMErrorKind = "TIMEOUT" | "RATE_LIMITED" | "HTTP_4XX" | "HTTP_5XX" | "NETWORK" | "EMPTY_RESPONSE"

export class MentorLLMError extends Error {
  constructor(
    readonly kind: MentorLLMErrorKind,
    readonly status: number | null = null,
    /** Código curto do fornecedor (ex.: "invalid_request_error"), já saneado; nunca texto livre. */
    readonly detail: string | null = null,
  ) {
    super(`mentor-llm:${kind}${status ? `:${status}` : ""}`)
    this.name = "MentorLLMError"
  }
}

/** Transitórios: podem ser tentados de novo (com limite). */
export function isTransientLLMError(e: unknown): boolean {
  return e instanceof MentorLLMError && (e.kind === "HTTP_5XX" || e.kind === "NETWORK")
}

export interface MentorLLMProvider {
  readonly name: string
  readonly model: string
  /** Devolve o TEXTO bruto da resposta (deve ser JSON). Lança MentorLLMError. */
  generate(request: MentorLLMRequest): Promise<MentorLLMGeneration>
}

/**
 * G2.17 — o que o provedor devolve. `usage`/`finishReason` só quando o
 * fornecedor informa (senão null): nunca estimados.
 */
export interface MentorLLMGeneration {
  text: string
  usage?: { inputTokens: number | null; outputTokens: number | null } | null
  /** "stop", "length" (cortada pelo teto de saída)… — null quando não informado. */
  finishReason?: string | null
}

// ─── Resultado entregue à tela (já resolvido para o contexto) ─────────────────

/**
 * G2.18 — texto da IA já resolvido pelo SISTEMA: as referências "D…" viram a
 * denominação oficial da disciplina; "I…"/"R…" viram um marcador com o fato.
 * A IA nunca escreve o nome nem o número — a tela mostra o que o sistema tem.
 */
export type MentorRichText = (
  | { kind: "text"; value: string }
  | { kind: "discipline"; name: string }
  | { kind: "fact"; text: string }
)[]

export interface MentorAnalysisView {
  summary: MentorRichText
  /** Fatos do sistema que sustentam o resumo (v2). */
  summaryFacts: string[]
  confidence: MentorAIConfidence
  insufficientData: boolean
  highlights: { fact: string; interpretation: MentorRichText; priority: "HIGH" | "MEDIUM" | "LOW" }[]
  attentionPoints: { fact: string; disciplineName: string | null; text: MentorRichText }[]
  recommendations: { title: MentorRichText; basis: string; suggestion: MentorRichText; disciplineName: string | null; evidence: string[] }[]
}

export type MentorAnalysisResult =
  | { status: "OK"; analysis: MentorAnalysisView; generatedAt: string; cached: boolean; promptVersion: string }
  | { status: "DISABLED" }
  | { status: "INSUFFICIENT_DATA" }
  | { status: "RATE_LIMITED"; retryAfterSeconds: number; scope: "HOUR" | "DAY" | "GLOBAL" }
  | { status: "UNAVAILABLE"; reason: string }
  | { status: "FAILED"; reason: "PROVIDER_ERROR" | "TIMEOUT" | "INVALID_RESPONSE" }
