import { createHash } from "node:crypto"

import {
  isTransientLLMError,
  MENTOR_PROMPT_VERSION,
  MentorLLMError,
  type MentorAIResponse,
  type MentorAnalysisResult,
  type MentorAnalysisView,
  type MentorLLMGeneration,
  type MentorLLMProvider,
  type MentorPromptVersion,
  type MentorRichText,
} from "@/domain/mentor/mentor-ai"
import type { StudentMentorContext } from "@/domain/mentor/student-mentor-context"

import { buildMentorUserMessage, MENTOR_SYSTEM_PROMPTS } from "./mentor-ai.prompt"
import { assessMentorResponse, type MentorQualityFlag } from "./mentor-ai-quality"
import {
  buildAllowedRefs,
  parseMentorAIText,
  validateMentorAIResponse,
  type MentorRejection,
  type MentorRejectionCode,
} from "./mentor-ai-response.validator"
import { buildMentorLLMInput, type MentorRefMap } from "./mentor-llm-input"

/**
 * G2.16 — serviço do Mentor com LLM (agnóstico de fornecedor).
 *
 * Ordem: desligado? → contexto vazio? → cache → chamada em andamento? →
 * limites (aluno/hora, aluno/dia, total/dia) → provedor (timeout + 1 nova
 * tentativa só para erro transitório) → saída cortada? → JSON → validação
 * estrita → resposta resolvida para a tela. Qualquer falha devolve um
 * status — a tela segue com o Mentor determinístico.
 *
 * Estado (cache, chamadas em andamento, limites, métricas) é da MEMÓRIA DO
 * PROCESSO: vale por instância (limitação documentada em G2.16/G2.17).
 */

export const MENTOR_ANALYSIS_CACHE_TTL_MS = 30 * 60 * 1000
export const MENTOR_ANALYSIS_CACHE_MAX = 500
export const MENTOR_LLM_MAX_ATTEMPTS = 2
export const MENTOR_LLM_RETRY_BACKOFF_MS = 800
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export interface MentorLLMRuntimeConfig {
  timeoutMs: number
  maxOutputTokens: number
  maxCallsPerHour: number
  /** G2.17: teto por aluno em 24 h (janela deslizante). */
  maxCallsPerDay: number
  /** G2.17: teto total em 24 h, todos os alunos (por instância) — trava de custo. */
  maxCallsPerDayGlobal: number
  /** Preço por 1 milhão de tokens, configurado pelo operador. null → custo null. */
  pricing: { inputPerMTok: number; outputPerMTok: number } | null
}

export type MentorCallPermit = { ok: true } | { ok: false; retryAfterSeconds: number; scope: "HOUR" | "DAY" | "GLOBAL" }

/** Estado em memória do processo: cache, chamadas em andamento e limites. */
export class MentorAnalysisMemoryStore {
  readonly cache = new Map<string, { at: number; result: Extract<MentorAnalysisResult, { status: "OK" }> }>()
  readonly inflight = new Map<string, Promise<MentorAnalysisResult>>()
  readonly calls = new Map<string, number[]>()
  globalCalls: number[] = []

  getFresh(key: string, now: number) {
    const hit = this.cache.get(key)
    if (!hit) return null
    if (now - hit.at > MENTOR_ANALYSIS_CACHE_TTL_MS) {
      this.cache.delete(key)
      return null
    }
    return hit.result
  }

  put(key: string, now: number, result: Extract<MentorAnalysisResult, { status: "OK" }>) {
    if (this.cache.size >= MENTOR_ANALYSIS_CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, { at: now, result })
  }

  /**
   * Janelas deslizantes (1 h e 24 h por aluno; 24 h no total). Só registra a
   * chamada quando TODAS as janelas permitem — negar não consome cota.
   */
  takeCall(
    userId: string,
    now: number,
    limits: { maxCallsPerHour: number; maxCallsPerDay: number; maxCallsPerDayGlobal: number },
  ): MentorCallPermit {
    const day = (this.calls.get(userId) ?? []).filter((t) => now - t < DAY_MS)
    this.calls.set(userId, day)
    this.globalCalls = this.globalCalls.filter((t) => now - t < DAY_MS)
    const wait = (oldest: number | undefined, windowMs: number) =>
      Math.max(1, Math.ceil((windowMs - (now - (oldest ?? now))) / 1000))

    const hour = day.filter((t) => now - t < HOUR_MS)
    if (hour.length >= limits.maxCallsPerHour) return { ok: false, retryAfterSeconds: wait(hour[0], HOUR_MS), scope: "HOUR" }
    if (day.length >= limits.maxCallsPerDay) return { ok: false, retryAfterSeconds: wait(day[0], DAY_MS), scope: "DAY" }
    if (this.globalCalls.length >= limits.maxCallsPerDayGlobal) {
      return { ok: false, retryAfterSeconds: wait(this.globalCalls[0], DAY_MS), scope: "GLOBAL" }
    }
    day.push(now)
    this.globalCalls.push(now)
    return { ok: true }
  }

  /** Remove análises do aluno (hook opcional; a chave já muda quando os dados mudam). */
  invalidateUser(userId: string) {
    const prefix = `${userId}:`
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key)
  }
}

/** Contadores do processo. Tokens/custo só somam o que o fornecedor INFORMOU. */
export interface MentorLLMMetrics {
  calls: number
  success: number
  failures: number
  timeouts: number
  rateLimitedByProvider: number
  providerErrors: number
  rejected: number
  invalidJson: number
  truncated: number
  /** G2.18: passou no validador mas foi descartada como genérica (GENERIC_LOW_VALUE). */
  lowValue: number
  cacheHits: number
  cacheMisses: number
  localRateLimited: number
  totalDurationMs: number
  totalContextMs: number
  contextSamples: number
  /** G2.19: tempo de parse + validação + qualidade (separado do provedor). */
  totalValidationMs: number
  validationSamples: number
  inputTokens: number
  outputTokens: number
  usageReported: number
  usageMissing: number
  estimatedCostUsd: number
  costSamples: number
}

const ZERO: MentorLLMMetrics = {
  calls: 0, success: 0, failures: 0, timeouts: 0, rateLimitedByProvider: 0, providerErrors: 0, rejected: 0, invalidJson: 0,
  truncated: 0, lowValue: 0, cacheHits: 0, cacheMisses: 0, localRateLimited: 0, totalDurationMs: 0, totalContextMs: 0, contextSamples: 0, totalValidationMs: 0, validationSamples: 0,
  inputTokens: 0, outputTokens: 0, usageReported: 0, usageMissing: 0, estimatedCostUsd: 0, costSamples: 0,
}
const metrics: MentorLLMMetrics = { ...ZERO }

export function getMentorLLMMetrics(): Omit<MentorLLMMetrics, "estimatedCostUsd"> & {
  averageDurationMs: number | null
  averageContextMs: number | null
  averageValidationMs: number | null
  rejectionRate: number | null
  /** null quando nenhuma chamada teve tokens + preço configurado. */
  estimatedCostUsd: number | null
} {
  const answered = metrics.success + metrics.rejected
  return {
    ...metrics,
    averageDurationMs: metrics.calls > 0 ? Math.round(metrics.totalDurationMs / metrics.calls) : null,
    averageContextMs: metrics.contextSamples > 0 ? Math.round(metrics.totalContextMs / metrics.contextSamples) : null,
    averageValidationMs: metrics.validationSamples > 0 ? Math.round((metrics.totalValidationMs / metrics.validationSamples) * 100) / 100 : null,
    rejectionRate: answered > 0 ? Math.round((metrics.rejected / answered) * 1000) / 1000 : null,
    estimatedCostUsd: metrics.costSamples > 0 ? Math.round(metrics.estimatedCostUsd * 1e6) / 1e6 : null,
  }
}

/** Só metadados: nunca prompt, resposta, chave, e-mail ou id do aluno. */
export interface MentorLLMLogEvent {
  provider: string
  model: string
  promptVersion: string
  contextVersion: string
  outcome:
    | "success"
    | "cache_hit"
    | "timeout"
    | "provider_rate_limited"
    | "provider_error"
    | "invalid_json"
    | "truncated"
    | "rejected"
    | "low_value"
    | "local_rate_limited"
  /** Tempo do provedor (todas as tentativas). */
  durationMs: number
  /** Tempo para montar o contexto (quando a action mede). */
  contextMs: number | null
  /** G2.19: parse + validação + qualidade (ms, relógio real). Não inclui o provedor. */
  validationMs?: number | null
  attempts: number
  inputChars: number
  outputChars: number
  httpStatus?: number | null
  errorKind?: string | null
  providerErrorCode?: string | null
  finishReason?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  estimatedCostUsd?: number | null
  rejectionCount?: number
  /** G2.18: categorias da rejeição (códigos fixos, sem texto da resposta). */
  rejectionCodes?: MentorRejectionCode[]
  /** G2.18: sinais de qualidade (códigos fixos). */
  qualityFlags?: MentorQualityFlag[]
  limitScope?: "HOUR" | "DAY" | "GLOBAL"
}

export interface MentorAnalysisDeps {
  provider: MentorLLMProvider | null
  config: MentorLLMRuntimeConfig | null
  store: MentorAnalysisMemoryStore
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  log?: (event: MentorLLMLogEvent) => void
  /** Medido pela action (montagem do contexto), só para observabilidade. */
  contextMs?: number | null
  /** Só o script de piloto usa (comparar a candidata). Produção: a versão ativa. */
  promptVersion?: MentorPromptVersion
  /**
   * Só o script de piloto usa: recebe os MOTIVOS da rejeição (códigos do
   * validador, sem o texto da resposta) para a avaliação humana. A action de
   * produção não passa — os motivos não vão para o log.
   */
  onRejected?: (reasons: string[], rejections?: MentorRejection[]) => void
}

export function mentorAnalysisCacheKey(userId: string, model: string, inputJson: string, promptVersion: string = MENTOR_PROMPT_VERSION): string {
  const digest = createHash("sha256").update(`${promptVersion}|${model}|${inputJson}`).digest("hex")
  return `${userId}:${digest}`
}

export function estimateCostUsd(
  usage: MentorLLMGeneration["usage"],
  pricing: MentorLLMRuntimeConfig["pricing"],
): number | null {
  if (!usage || !pricing || usage.inputTokens === null || usage.outputTokens === null) return null
  return Math.round(((usage.inputTokens * pricing.inputPerMTok + usage.outputTokens * pricing.outputPerMTok) / 1e6) * 1e6) / 1e6
}

const TEXT_REF = /(?<![\p{L}\p{N}])([DIR][1-9]\d{0,2})(?![\p{L}\p{N}])/gu

/**
 * Texto da IA → partes que a tela renderiza. "D…" vira a denominação OFICIAL
 * (do sistema); "I…"/"R…" viram um marcador com o fato do sistema. Só roda
 * depois da validação (toda referência já existe).
 */
function refFact(token: string, refs: MentorRefMap): string | undefined {
  if (token.startsWith("I")) return refs.insights.get(token)?.message
  if (token.startsWith("R")) return refs.candidates.get(token)?.reason
  return undefined
}

export function resolveRichText(value: string, refs: MentorRefMap): MentorRichText {
  const out: MentorRichText = []
  let last = 0
  for (const m of value.matchAll(TEXT_REF)) {
    const token = m[1] ?? ""
    const at = m.index ?? 0
    if (at > last) out.push({ kind: "text", value: value.slice(last, at) })
    last = at + token.length
    const discipline = token.startsWith("D") ? refs.disciplines.get(token) : undefined
    const fact = refFact(token, refs)
    if (discipline) out.push({ kind: "discipline", name: discipline.name })
    else if (fact) out.push({ kind: "fact", text: fact })
  }
  if (last < value.length) out.push({ kind: "text", value: value.slice(last) })
  return out
}

function resolveView(response: MentorAIResponse, refs: MentorRefMap): MentorAnalysisView {
  const fact = (ref: string) => refs.insights.get(ref)?.message ?? refs.candidates.get(ref)?.reason ?? ""
  const rich = (v: string) => resolveRichText(v, refs)
  return {
    summary: rich(response.summary),
    summaryFacts: response.summaryRefs.map(fact).filter((f) => f !== ""),
    confidence: response.confidence,
    insufficientData: response.insufficientData,
    highlights: response.highlights.map((h) => {
      const insight = refs.insights.get(h.insightRef)
      return { fact: insight?.message ?? "", interpretation: rich(h.text), priority: insight?.priority ?? "LOW" }
    }),
    attentionPoints: response.attentionPoints.map((a) => {
      const insight = refs.insights.get(a.insightRef)
      const discipline = a.disciplineRef ? refs.disciplines.get(a.disciplineRef) : undefined
      return { fact: insight?.message ?? "", disciplineName: discipline?.name ?? insight?.disciplineName ?? null, text: rich(a.text) }
    }),
    recommendations: response.recommendations.map((r) => {
      const candidate = refs.candidates.get(r.candidateId)
      return {
        title: rich(r.title),
        basis: candidate?.reason ?? "",
        suggestion: rich(r.explanation),
        disciplineName: candidate?.disciplineName ?? null,
        evidence: r.evidenceIds.map(fact).filter((f) => f !== ""),
      }
    }),
  }
}

export async function generateMentorAnalysis(
  userId: string,
  context: StudentMentorContext,
  deps: MentorAnalysisDeps,
): Promise<MentorAnalysisResult> {
  if (!deps.provider || !deps.config) return { status: "DISABLED" }
  // Sem dados, nada a interpretar: não gasta chamada nem arrisca invenção.
  if (context.contextQuality.level === "EMPTY") return { status: "INSUFFICIENT_DATA" }

  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const log = deps.log ?? (() => undefined)
  const provider = deps.provider
  const config = deps.config
  const promptVersion = deps.promptVersion ?? MENTOR_PROMPT_VERSION
  const contextMs = deps.contextMs ?? null
  if (contextMs !== null) {
    metrics.totalContextMs += contextMs
    metrics.contextSamples += 1
  }

  const { input, refs } = buildMentorLLMInput(context, promptVersion)
  const inputJson = JSON.stringify(input)
  const key = mentorAnalysisCacheKey(userId, provider.model, inputJson, promptVersion)
  const base = {
    provider: provider.name,
    model: provider.model,
    promptVersion,
    contextVersion: context.version,
    contextMs,
    inputChars: inputJson.length,
  }

  const cached = deps.store.getFresh(key, now())
  if (cached) {
    metrics.cacheHits += 1
    log({ ...base, outcome: "cache_hit", durationMs: 0, attempts: 0, outputChars: 0 })
    return { ...cached, cached: true }
  }
  const running = deps.store.inflight.get(key)
  if (running) return running
  metrics.cacheMisses += 1

  const permit = deps.store.takeCall(userId, now(), config)
  if (!permit.ok) {
    metrics.localRateLimited += 1
    log({ ...base, outcome: "local_rate_limited", durationMs: 0, attempts: 0, outputChars: 0, limitScope: permit.scope })
    return { status: "RATE_LIMITED", retryAfterSeconds: permit.retryAfterSeconds, scope: permit.scope }
  }

  const task = (async (): Promise<MentorAnalysisResult> => {
    const started = now()
    let attempts = 0
    let generation: MentorLLMGeneration = { text: "" }
    metrics.calls += 1
    try {
      for (;;) {
        attempts += 1
        try {
          generation = await provider.generate({
            system: MENTOR_SYSTEM_PROMPTS[promptVersion],
            user: buildMentorUserMessage(input),
            maxOutputTokens: config.maxOutputTokens,
            timeoutMs: config.timeoutMs,
          })
          break
        } catch (e) {
          if (isTransientLLMError(e) && attempts < MENTOR_LLM_MAX_ATTEMPTS) {
            await sleep(MENTOR_LLM_RETRY_BACKOFF_MS * attempts)
            continue
          }
          throw e
        }
      }
    } catch (e) {
      metrics.failures += 1
      const durationMs = now() - started
      metrics.totalDurationMs += durationMs
      const err = e instanceof MentorLLMError ? e : null
      const kind = err?.kind ?? "NETWORK"
      const errMeta = { httpStatus: err?.status ?? null, errorKind: kind, providerErrorCode: err?.detail ?? null }
      if (kind === "TIMEOUT") {
        metrics.timeouts += 1
        log({ ...base, ...errMeta, outcome: "timeout", durationMs, attempts, outputChars: 0 })
        return { status: "FAILED", reason: "TIMEOUT" }
      }
      if (kind === "RATE_LIMITED") metrics.rateLimitedByProvider += 1
      else metrics.providerErrors += 1
      log({ ...base, ...errMeta, outcome: kind === "RATE_LIMITED" ? "provider_rate_limited" : "provider_error", durationMs, attempts, outputChars: 0 })
      return { status: "FAILED", reason: "PROVIDER_ERROR" }
    }

    const durationMs = now() - started
    metrics.totalDurationMs += durationMs
    const text = generation.text
    const usage = generation.usage ?? null
    if (usage && usage.inputTokens !== null && usage.outputTokens !== null) {
      metrics.usageReported += 1
      metrics.inputTokens += usage.inputTokens
      metrics.outputTokens += usage.outputTokens
    } else {
      metrics.usageMissing += 1
    }
    const costUsd = estimateCostUsd(usage, config.pricing)
    if (costUsd !== null) {
      metrics.estimatedCostUsd += costUsd
      metrics.costSamples += 1
    }
    const done = {
      ...base,
      durationMs,
      attempts,
      outputChars: text.length,
      finishReason: generation.finishReason ?? null,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      estimatedCostUsd: costUsd,
    }

    const validationStarted = performance.now()
    const elapsed = () => {
      const ms = Math.round((performance.now() - validationStarted) * 100) / 100
      metrics.totalValidationMs += ms
      metrics.validationSamples += 1
      return ms
    }

    // Saída cortada pelo teto de tokens: incompleta não é confiável — descarta.
    if (generation.finishReason === "length") {
      metrics.rejected += 1
      metrics.truncated += 1
      log({ ...done, outcome: "truncated", validationMs: elapsed() })
      return { status: "FAILED", reason: "INVALID_RESPONSE" }
    }
    let raw: unknown
    try {
      raw = parseMentorAIText(text)
    } catch {
      metrics.rejected += 1
      metrics.invalidJson += 1
      log({ ...done, outcome: "invalid_json", validationMs: elapsed() })
      return { status: "FAILED", reason: "INVALID_RESPONSE" }
    }
    const validation = validateMentorAIResponse(raw, buildAllowedRefs(input))
    if (!validation.ok) {
      metrics.rejected += 1
      log({
        ...done,
        outcome: "rejected",
        validationMs: elapsed(),
        rejectionCount: validation.reasons.length,
        rejectionCodes: [...new Set(validation.rejections.map((x) => x.code))],
      })
      deps.onRejected?.(validation.reasons, validation.rejections)
      return { status: "FAILED", reason: "INVALID_RESPONSE" }
    }
    // G2.18: válida mas sem valor (genérica, sem ligação com os fatos) → descartada.
    const quality = assessMentorResponse(validation.value, input)
    if (quality.flags.includes("GENERIC_LOW_VALUE")) {
      metrics.rejected += 1
      metrics.lowValue += 1
      log({ ...done, outcome: "low_value", validationMs: elapsed(), qualityFlags: quality.flags })
      deps.onRejected?.([`qualidade: GENERIC_LOW_VALUE (${quality.genericBlocks.join(", ")})`])
      return { status: "FAILED", reason: "INVALID_RESPONSE" }
    }

    metrics.success += 1
    log({ ...done, outcome: "success", validationMs: elapsed(), ...(quality.flags.length > 0 ? { qualityFlags: quality.flags } : {}) })
    const result = {
      status: "OK" as const,
      analysis: resolveView(validation.value, refs),
      generatedAt: new Date(now()).toISOString(),
      cached: false,
      promptVersion,
    }
    deps.store.put(key, now(), result)
    return result
  })()

  deps.store.inflight.set(key, task)
  try {
    return await task
  } finally {
    deps.store.inflight.delete(key)
  }
}
