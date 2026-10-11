import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { createClient } from "@/infrastructure/supabase/server"

import { getMentorAIAccess, isMentorAIEnabled } from "./mentor-llm.runtime"

/**
 * G2.17 — a página /mentor pergunta só "este aluno pode pedir análise por
 * IA?". Módulo de servidor comum (NÃO é Server Action: não fica exposto ao
 * navegador). O aluno é o da sessão (getEffectiveSessionUser, memorizado por
 * renderização — sem consulta extra). Com a flag desligada nem consulta a
 * sessão. A resposta é um booleano: nada de modelo, endpoint ou motivo
 * técnico chega à tela.
 */
export async function isMentorAIAvailableForSessionUser(): Promise<boolean> {
  if (!isMentorAIEnabled()) return false
  try {
    const supabase = await createClient()
    const user = await getEffectiveSessionUser(supabase)
    return getMentorAIAccess(user ? { id: user.id, isSupportMode: user.isSupportMode } : null).allowed
  } catch {
    return false
  }
}
