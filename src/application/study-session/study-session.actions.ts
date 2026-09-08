"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { SessionOrchestrator } from "./session-orchestrator"
import type { SessionCompletionPayload } from "./study-session.models"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function finalizeSmartSessionAction(payload: SessionCompletionPayload) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)

    if (!effectiveUserId) {
      throw new Error("Usuário não autenticado")
    }

    // O Orquestrador cuida de tudo
    const summary = await SessionOrchestrator.finalizeSession(supabase, effectiveUserId, payload)
    
    // Atualiza todas as métricas da dashboard
    revalidatePath("/dashboard")
    
    return { data: summary, error: null }
  } catch (error: unknown) {
    console.error("[finalizeSmartSessionAction] Error:", error)
    return { data: null, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}
