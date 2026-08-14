import type { SupabaseClient } from "@supabase/supabase-js"

import type { MentorResponse } from "@/domain/mentor-ai/mentor-ai.types"
import { isMaintenanceMode } from "@/lib/maintenance"

import { BurnoutCapability } from "./capabilities/burnout.capability"
import { IntelligenceConfig } from "./config/intelligence.config"
import { CapabilityRegistry } from "./engine/capability-registry"
import { PromptBuilder } from "./engine/prompt-builder"
import { type LogHistoryParams, MentorHistoryService } from "./history/mentor-history.service"
import { IntelligenceHub } from "./hub/intelligence.hub"
import { HeuristicProvider } from "./providers/heuristic.provider"

// Registra as capabilities disponíveis
CapabilityRegistry.register(
  new BurnoutCapability(),
  // new PerformanceCapability(), etc...
)

export class MentorAIService {
  private static memoryCache = new Map<string, { data: MentorResponse; timestamp: number }>()

  static async generateMentorSession(
    supabase: SupabaseClient,
    userId: string,
    options: { logSession?: boolean; useCache?: boolean } = {},
  ) {
    if (isMaintenanceMode()) {
      throw new Error("Sistema em manutenção. O serviço está temporariamente indisponível.")
    }

    const { logSession = true, useCache = false } = options

    if (useCache) {
      const cached = this.memoryCache.get(userId)
      if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        return cached.data
      }
    }

    // 1. Constrói Contexto
    const context = await IntelligenceHub.buildContext(supabase, userId)

    // 2. Prepara o prompt (log/human)
    const promptLLM = PromptBuilder.buildLLM(context)

    let response
    const startMs = Date.now()

    // 3. Executa a inteligência
    if (IntelligenceConfig.provider === "heuristic") {
      const provider = new HeuristicProvider()
      response = await provider.analyze(context)
    } else {
      throw new Error("LLM provider not yet implemented")
    }

    const durationMs = Date.now() - startMs

    // 4. Salva Histórico
    if (logSession && IntelligenceConfig.saveHistory) {
      const params: LogHistoryParams = {
        userId,
        provider: IntelligenceConfig.provider.toUpperCase(),
        response,
        contextHash: context.snapshotId,
        snapshotId: context.snapshotId,
        durationMs,
        version: "v1.0",
      }
      if (IntelligenceConfig.savePrompt) {
        params.prompt = promptLLM
      }

      await MentorHistoryService.logSession(supabase, params)
    }

    if (useCache) {
      this.memoryCache.set(userId, { data: response, timestamp: Date.now() })
    }

    return response
  }
}
