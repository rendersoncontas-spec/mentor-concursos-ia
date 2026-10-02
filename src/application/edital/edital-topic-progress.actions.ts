"use server"

/**
 * G1.1 (G-29) — actions finas sobre o serviço de progresso de tópicos.
 * O progresso pertence ao usuário EFETIVO (alvo em modo suporte); a RLS
 * (`auth.uid() = user_id`) barra escrita de operador sobre terceiros
 * (fail-closed com erro honesto).
 */
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

import {
  deleteTopicProgress,
  fetchTopicProgress,
  importTopicProgress,
  saveTopicChecked,
} from "./edital-topic-progress.service"

export async function getEditalTopicProgressAction(
  targetId: string,
): Promise<{
  success: boolean
  checked: Record<string, boolean>
  storageUnavailable: boolean
  error?: string
}> {
  if (isMaintenanceMode())
    return { success: false, checked: {}, storageUnavailable: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId)
      return { success: false, checked: {}, storageUnavailable: false, error: "Não autenticado." }

    const result = await fetchTopicProgress(supabase, effectiveUserId, targetId)
    if (result.status === "storage-unavailable") {
      return { success: false, checked: {}, storageUnavailable: true }
    }
    if (result.status === "invalid-target") {
      return { success: false, checked: {}, storageUnavailable: false, error: "Concurso não encontrado." }
    }
    return { success: true, checked: result.checked, storageUnavailable: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido."
    return { success: false, checked: {}, storageUnavailable: false, error: message }
  }
}

export async function setEditalTopicProgressAction(
  targetId: string,
  topicKey: string,
  checked: boolean,
): Promise<{ success: boolean; storageUnavailable: boolean; error?: string }> {
  if (isMaintenanceMode())
    return { success: false, storageUnavailable: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "SET_EDITAL_TOPIC_PROGRESS", resource: `${targetId}:${topicKey}` })
    if (!effectiveUserId) return { success: false, storageUnavailable: false, error: "Não autenticado." }

    const result = await saveTopicChecked(supabase, effectiveUserId, targetId, topicKey, checked)
    if (result.status === "storage-unavailable") {
      return { success: false, storageUnavailable: true }
    }
    if (result.status === "invalid-target") {
      return { success: false, storageUnavailable: false, error: "Concurso ou tópico inválido." }
    }
    return { success: true, storageUnavailable: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido."
    return { success: false, storageUnavailable: false, error: message }
  }
}

/**
 * G1.14 — limpeza do progresso ao excluir tópico/matéria do edital.
 * Best-effort do lado do servidor; o cliente remove a chave do estado
 * local imediatamente (verdade local corrigida independente do resultado).
 */
export async function deleteEditalTopicProgressAction(
  targetId: string,
  topicKey: string,
): Promise<{ success: boolean; storageUnavailable: boolean; error?: string }> {
  if (isMaintenanceMode())
    return { success: false, storageUnavailable: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "DELETE_EDITAL_TOPIC_PROGRESS", resource: `${targetId}:${topicKey}` })
    if (!effectiveUserId) return { success: false, storageUnavailable: false, error: "Não autenticado." }

    const result = await deleteTopicProgress(supabase, effectiveUserId, targetId, topicKey)
    if (result.status === "storage-unavailable") {
      return { success: false, storageUnavailable: true }
    }
    if (result.status === "invalid-target") {
      return { success: false, storageUnavailable: false, error: "Concurso ou tópico inválido." }
    }
    return { success: true, storageUnavailable: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido."
    return { success: false, storageUnavailable: false, error: message }
  }
}

export async function importEditalTopicProgressAction(  targetId: string,
  legacy: Record<string, boolean>,
): Promise<{ success: boolean; imported: number; storageUnavailable: boolean; error?: string }> {
  if (isMaintenanceMode())
    return { success: false, imported: 0, storageUnavailable: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "IMPORT_EDITAL_TOPIC_PROGRESS", resource: targetId })
    if (!effectiveUserId)
      return { success: false, imported: 0, storageUnavailable: false, error: "Não autenticado." }
    if (!legacy || typeof legacy !== "object") {
      return { success: false, imported: 0, storageUnavailable: false, error: "Dados inválidos." }
    }

    const result = await importTopicProgress(supabase, effectiveUserId, targetId, legacy)
    if (result.status === "imported") {
      return { success: true, imported: result.imported, storageUnavailable: false }
    }
    if (result.status === "storage-unavailable") {
      return { success: false, imported: 0, storageUnavailable: true }
    }
    return { success: false, imported: 0, storageUnavailable: false, error: "Concurso inválido." }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido."
    return { success: false, imported: 0, storageUnavailable: false, error: message }
  }
}
