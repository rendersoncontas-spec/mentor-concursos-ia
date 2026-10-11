import type { MentorLLMProvider } from "@/domain/mentor/mentor-ai"

import { MentorAnalysisMemoryStore, type MentorLLMRuntimeConfig } from "./mentor-analysis.service"
import { resolveMentorAIAccess, resolveMentorLLMConfig, type MentorAIAccess } from "./mentor-llm.config"
import { OpenAICompatibleMentorProvider } from "./openai-compatible.provider"

/**
 * G2.16/G2.17 — montagem do provedor a partir da configuração (SOMENTE
 * SERVIDOR). Um único provedor ativo por vez; desligado por padrão; a
 * configuração é relida a cada pedido (kill switch sem rebuild do cliente).
 */

const store = new MentorAnalysisMemoryStore()

export function getMentorAnalysisStore(): MentorAnalysisMemoryStore {
  return store
}

export interface MentorLLMRuntime {
  provider: MentorLLMProvider
  config: MentorLLMRuntimeConfig
}

export function getMentorLLMRuntime(env: Record<string, string | undefined> = process.env): MentorLLMRuntime | null {
  const config = resolveMentorLLMConfig(env)
  if (!config.enabled) return null
  return {
    provider: new OpenAICompatibleMentorProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      apiStyle: config.apiStyle,
    }),
    config: {
      timeoutMs: config.timeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      maxCallsPerHour: config.maxCallsPerHour,
      maxCallsPerDay: config.maxCallsPerDay,
      maxCallsPerDayGlobal: config.maxCallsPerDayGlobal,
      pricing: config.pricing,
    },
  }
}

/** A flag global (sem olhar o aluno). Só diz SE existe configuração válida. */
export function isMentorAIEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return resolveMentorLLMConfig(env).enabled
}

/** G2.17 — acesso de um aluno JÁ resolvido no servidor (allowlist + suporte). */
export function getMentorAIAccess(
  user: { id: string; isSupportMode: boolean } | null,
  env: Record<string, string | undefined> = process.env,
): MentorAIAccess {
  return resolveMentorAIAccess(resolveMentorLLMConfig(env), user)
}
