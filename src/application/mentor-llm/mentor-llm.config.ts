/**
 * G2.16/G2.17 — configuração do Mentor com LLM. SOMENTE SERVIDOR: este
 * arquivo só é importado por Server Actions / serviços (teste de wiring
 * garante que nenhum componente "use client" o importe). Nenhuma variável
 * pública. Lido a cada pedido (process.env no servidor), não no build.
 *
 * Variáveis (convenção do projeto: process.env["NOME"]):
 *   MENTOR_AI_ENABLED                  "true" liga; qualquer outra coisa = desligado (padrão). KILL SWITCH.
 *   MENTOR_AI_PROVIDER                 "openai-compatible" (único adapter)
 *   MENTOR_AI_BASE_URL                 padrão https://api.openai.com/v1 (precisa ser https)
 *   MENTOR_AI_API_KEY                  segredo (obrigatório para ligar)
 *   MENTOR_AI_MODEL                    obrigatório para ligar (sem modelo padrão)
 *   MENTOR_AI_API_STYLE                "classic" (padrão: max_tokens + temperature) |
 *                                      "reasoning" (max_completion_tokens, sem temperature)
 *   MENTOR_AI_TIMEOUT_MS               padrão 15000 (2000–30000)
 *   MENTOR_AI_MAX_OUTPUT_TOKENS        padrão 900 (200–4000)
 *   MENTOR_AI_PILOT_USER_IDS           G2.17: allowlist OBRIGATÓRIA (uuids separados por vírgula).
 *                                      Vazia = ninguém usa. Não existe modo "todos" nesta fase.
 *   MENTOR_AI_MAX_CALLS_PER_HOUR       padrão 4 por aluno (1–30)
 *   MENTOR_AI_MAX_CALLS_PER_DAY        padrão 12 por aluno (1–100)
 *   MENTOR_AI_MAX_CALLS_PER_DAY_GLOBAL padrão 60 no total, por instância (1–2000)
 *   MENTOR_AI_PRICE_INPUT_PER_MTOK     opcional: preço (USD) por 1 milhão de tokens de entrada,
 *   MENTOR_AI_PRICE_OUTPUT_PER_MTOK    copiado da tabela do fornecedor. Sem os dois → custo null.
 */

export type MentorLLMProviderName = "openai-compatible"
export type MentorLLMApiStyle = "classic" | "reasoning"

export type MentorLLMDisabledReason = "FLAG_OFF" | "MISSING_API_KEY" | "MISSING_MODEL" | "UNKNOWN_PROVIDER" | "INVALID_BASE_URL"

export type MentorLLMConfig =
  | {
      enabled: true
      provider: MentorLLMProviderName
      baseUrl: string
      apiKey: string
      model: string
      apiStyle: MentorLLMApiStyle
      timeoutMs: number
      maxOutputTokens: number
      maxCallsPerHour: number
      maxCallsPerDay: number
      maxCallsPerDayGlobal: number
      pilotUserIds: ReadonlySet<string>
      pricing: { inputPerMTok: number; outputPerMTok: number } | null
    }
  | { enabled: false; reason: MentorLLMDisabledReason }

type Env = Record<string, string | undefined>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || raw === undefined || raw.trim() === "") return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function positivePrice(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Allowlist do piloto: só uuids válidos (minúsculos); o resto é ignorado. */
export function parsePilotUserIds(raw: string | undefined): ReadonlySet<string> {
  const ids = (raw ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID.test(s))
  return new Set(ids)
}

export function resolveMentorLLMConfig(env: Env = process.env): MentorLLMConfig {
  if ((env["MENTOR_AI_ENABLED"] ?? "").trim().toLowerCase() !== "true") return { enabled: false, reason: "FLAG_OFF" }
  const provider = (env["MENTOR_AI_PROVIDER"] ?? "openai-compatible").trim()
  if (provider !== "openai-compatible") return { enabled: false, reason: "UNKNOWN_PROVIDER" }
  const apiKey = (env["MENTOR_AI_API_KEY"] ?? "").trim()
  if (!apiKey) return { enabled: false, reason: "MISSING_API_KEY" }
  const model = (env["MENTOR_AI_MODEL"] ?? "").trim()
  if (!model) return { enabled: false, reason: "MISSING_MODEL" }
  const baseUrl = (env["MENTOR_AI_BASE_URL"] ?? "https://api.openai.com/v1").trim().replace(/\/+$/, "")
  if (!/^https:\/\//.test(baseUrl)) return { enabled: false, reason: "INVALID_BASE_URL" }
  const inputPrice = positivePrice(env["MENTOR_AI_PRICE_INPUT_PER_MTOK"])
  const outputPrice = positivePrice(env["MENTOR_AI_PRICE_OUTPUT_PER_MTOK"])
  return {
    enabled: true,
    provider,
    baseUrl,
    apiKey,
    model,
    apiStyle: (env["MENTOR_AI_API_STYLE"] ?? "").trim().toLowerCase() === "reasoning" ? "reasoning" : "classic",
    timeoutMs: clampInt(env["MENTOR_AI_TIMEOUT_MS"], 15_000, 2_000, 30_000),
    maxOutputTokens: clampInt(env["MENTOR_AI_MAX_OUTPUT_TOKENS"], 900, 200, 4_000),
    maxCallsPerHour: clampInt(env["MENTOR_AI_MAX_CALLS_PER_HOUR"], 4, 1, 30),
    maxCallsPerDay: clampInt(env["MENTOR_AI_MAX_CALLS_PER_DAY"], 12, 1, 100),
    maxCallsPerDayGlobal: clampInt(env["MENTOR_AI_MAX_CALLS_PER_DAY_GLOBAL"], 60, 1, 2_000),
    pilotUserIds: parsePilotUserIds(env["MENTOR_AI_PILOT_USER_IDS"]),
    pricing: inputPrice !== null && outputPrice !== null ? { inputPerMTok: inputPrice, outputPerMTok: outputPrice } : null,
  }
}

export type MentorAIAccess =
  | { allowed: true }
  | { allowed: false; reason: MentorLLMDisabledReason | "NOT_AUTHENTICATED" | "NOT_IN_PILOT" | "SUPPORT_MODE" }

/**
 * G2.17 — quem pode usar a análise por IA. O aluno vem SEMPRE da sessão
 * resolvida no servidor (nunca de um parâmetro do navegador). Modo suporte:
 * bloqueado (o operador não envia dados do aluno a terceiros).
 */
export function resolveMentorAIAccess(
  config: MentorLLMConfig,
  user: { id: string; isSupportMode: boolean } | null,
): MentorAIAccess {
  if (!config.enabled) return { allowed: false, reason: config.reason }
  if (!user) return { allowed: false, reason: "NOT_AUTHENTICATED" }
  if (user.isSupportMode) return { allowed: false, reason: "SUPPORT_MODE" }
  if (!config.pilotUserIds.has(user.id.toLowerCase())) return { allowed: false, reason: "NOT_IN_PILOT" }
  return { allowed: true }
}
