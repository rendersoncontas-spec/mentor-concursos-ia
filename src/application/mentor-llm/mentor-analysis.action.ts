"use server"

import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { getStudentMentorContextAction } from "@/application/mentor/student-context.action"
import type { MentorAnalysisResult } from "@/domain/mentor/mentor-ai"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

import { generateMentorAnalysis, type MentorLLMLogEvent } from "./mentor-analysis.service"
import { getMentorAIAccess, getMentorAnalysisStore, getMentorLLMRuntime } from "./mentor-llm.runtime"

function logMentorLLM(event: MentorLLMLogEvent) {
  // Metadados apenas (provedor, modelo, versões, duração, desfecho, tamanhos,
  // tokens). Nunca prompt, resposta, chave, e-mail ou id do aluno.
  // eslint-disable-next-line no-console -- métrica operacional sem conteúdo, intencional
  console.info(`[mentor-llm] ${JSON.stringify(event)}`)
}

/**
 * G2.16/G2.17 — análise do Mentor por LLM, sob pedido EXPLÍCITO do aluno.
 *
 * Nenhum parâmetro do cliente: o aluno é o da sessão no servidor; o contexto
 * é o mesmo da tela (getStudentMentorContextAction). Piloto (G2.17): só
 * alunos da allowlist MENTOR_AI_PILOT_USER_IDS; os demais recebem DISABLED
 * (a tela nem mostra o bloco). Modo suporte bloqueado. Nada é gravado no banco.
 */
export async function requestMentorAnalysisAction(): Promise<MentorAnalysisResult> {
  if (isMaintenanceMode()) return { status: "UNAVAILABLE", reason: "Sistema temporariamente indisponível." }
  // Kill switch: relido a cada pedido.
  const runtime = getMentorLLMRuntime()
  if (!runtime) return { status: "DISABLED" }
  try {
    const supabase = await createClient()
    const user = await getEffectiveSessionUser(supabase)
    const access = getMentorAIAccess(user ? { id: user.id, isSupportMode: user.isSupportMode } : null)
    if (!access.allowed) {
      if (access.reason === "SUPPORT_MODE") return { status: "UNAVAILABLE", reason: "A análise por IA não roda no modo suporte." }
      if (access.reason === "NOT_AUTHENTICATED") return { status: "UNAVAILABLE", reason: "Usuário não autenticado." }
      return { status: "DISABLED" }
    }
    if (!user) return { status: "UNAVAILABLE", reason: "Usuário não autenticado." }

    const contextStarted = Date.now()
    const ctx = await getStudentMentorContextAction()
    const contextMs = Date.now() - contextStarted
    if (!ctx.data) return { status: "UNAVAILABLE", reason: ctx.error ?? "Contexto indisponível." }

    return await generateMentorAnalysis(user.id, ctx.data, {
      provider: runtime.provider,
      config: runtime.config,
      store: getMentorAnalysisStore(),
      log: logMentorLLM,
      contextMs,
    })
  } catch {
    return { status: "FAILED", reason: "PROVIDER_ERROR" }
  }
}
