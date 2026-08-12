import type { SupabaseClient } from "@supabase/supabase-js"
import type { MentorResponse } from "@/domain/mentor-ai/mentor-ai.types"

export interface LogHistoryParams {
  userId: string
  provider: string
  model?: string
  prompt?: string
  response: MentorResponse
  contextHash: string
  snapshotId: string
  tokensInput?: number
  tokensOutput?: number
  durationMs: number
  version: string
}

export class MentorHistoryService {
  static async logSession(supabase: SupabaseClient, params: LogHistoryParams) {
    const { error } = await supabase
      .from("mentor_history")
      .insert({
        user_id: params.userId,
        provider: params.provider,
        model: params.model,
        prompt: params.prompt,
        response: params.response,
        context_hash: params.contextHash,
        snapshot_id: params.snapshotId,
        tokens_input: params.tokensInput,
        tokens_output: params.tokensOutput,
        duration_ms: params.durationMs,
        version: params.version
      })

    if (error) {
      console.error("Failed to log mentor session:", error)
    }
  }
}
