import type { SupabaseClient } from "@supabase/supabase-js"

import type { createClient } from "@/infrastructure/supabase/server"

/**
 * A1.1 — helper INTERNO de auditoria (NÃO é server action: este módulo não
 * tem a diretiva de servidor, então nada aqui vira endpoint público). Movido
 * de admin.actions.ts, onde o `export` o expunha como action chamável.
 */
export async function auditSupportAction(
  supabase: SupabaseClient | Awaited<ReturnType<typeof createClient>>,
  params: {
    supportSessionId: string
    moderatorId: string
    targetUserId: string
    action: string
    resource: string
    result: "success" | "failure"
  },
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      actor_user_id: params.moderatorId,
      target_user_id: params.targetUserId,
      action: `SUPPORT_${params.action}`,
      metadata: {
        supportSessionId: params.supportSessionId,
        resource: params.resource,
        result: params.result,
      },
    })
  } catch {
    // Auditoria nunca deve quebrar a ação principal
  }
}
