/**
 * G1.1 (G-29) — progresso de tópicos do edital por usuário (server-side).
 *
 * Antes: `mentor_edital_checked_topics[_targetId]` no localStorage como FONTE
 * (sem RLS, sem sync entre devices, isolamento frágil por usuário).
 * Agora: tabela `edital_topic_progress` (user_id + target_id + topic_key) é a
 * fonte de verdade; localStorage serve SOMENTE para a migração única
 * (lazy migration) de dados pré-existentes.
 *
 * Funções puras de cliente Supabase (injetável) para testes comportamentais.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export const EDITAL_TOPIC_KEY_MAX_LENGTH = 320
export const EDITAL_TOPIC_PROGRESS_IMPORT_LIMIT = 2000

export type TopicProgressStorage = "ok" | "invalid-target" | "storage-unavailable"

export interface TopicProgressRead {
  status: TopicProgressStorage
  checked: Record<string, boolean>
}

export function normalizeTopicKey(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > EDITAL_TOPIC_KEY_MAX_LENGTH) return null
  return trimmed
}

export function isStorageMissingError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? error ?? "")
  return (
    message.includes("edital_topic_progress") ||
    message.includes("42P01") ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message)
  )
}

async function assertTargetOwnedBy(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
): Promise<boolean> {
  if (!targetId) return false
  const { data, error } = await supabase
    .from("user_targets")
    .select("id")
    .eq("id", targetId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) return false
  return true
}

export async function fetchTopicProgress(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
): Promise<TopicProgressRead> {
  if (!userId || !targetId) return { status: "invalid-target", checked: {} }
  const owned = await assertTargetOwnedBy(supabase, userId, targetId)
  if (!owned) return { status: "invalid-target", checked: {} }

  let rows: { topic_key: string; checked: boolean }[] | null = null
  try {
    const { data, error } = await supabase
      .from("edital_topic_progress")
      .select("topic_key, checked")
      .eq("user_id", userId)
      .eq("target_id", targetId)
    if (error) {
      if (isStorageMissingError(error)) return { status: "storage-unavailable", checked: {} }
      throw error
    }
    rows = (data ?? []) as { topic_key: string; checked: boolean }[]
  } catch (err) {
    if (isStorageMissingError(err)) return { status: "storage-unavailable", checked: {} }
    throw err
  }

  const checked: Record<string, boolean> = {}
  for (const row of rows) {
    const key = normalizeTopicKey(row.topic_key)
    if (key) checked[key] = row.checked === true
  }
  return { status: "ok", checked }
}

export async function saveTopicChecked(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
  topicKey: string,
  checked: boolean,
): Promise<{ status: Exclude<TopicProgressStorage, "ok"> | "saved" }> {
  const key = normalizeTopicKey(topicKey)
  if (!userId || !targetId || !key) return { status: "invalid-target" }
  const owned = await assertTargetOwnedBy(supabase, userId, targetId)
  if (!owned) return { status: "invalid-target" }

  try {
    const { error } = await supabase.from("edital_topic_progress").upsert(
      {
        user_id: userId,
        target_id: targetId,
        topic_key: key,
        checked,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,target_id,topic_key" },
    )
    if (error) {
      if (isStorageMissingError(error)) return { status: "storage-unavailable" }
      throw error
    }
  } catch (err) {
    if (isStorageMissingError(err)) return { status: "storage-unavailable" }
    throw err
  }
  return { status: "saved" }
}

/**
 * G1.14 — remove o progresso de um tópico excluído do edital.
 * Sem isso, `completedTopics` contava chaves de tópicos deletados e o
 * "x de y" / % ficava permanentemente inflado.
 */
export async function deleteTopicProgress(
  supabase: SupabaseClient,
  userId: string,
  targetId: string,
  topicKey: string,
): Promise<{ status: "deleted" | "invalid-target" | "storage-unavailable" }> {
  const key = normalizeTopicKey(topicKey)
  if (!userId || !targetId || !key) return { status: "invalid-target" }
  const owned = await assertTargetOwnedBy(supabase, userId, targetId)
  if (!owned) return { status: "invalid-target" }

  try {
    const { error } = await supabase
      .from("edital_topic_progress")
      .delete()
      .eq("user_id", userId)
      .eq("target_id", targetId)
      .eq("topic_key", key)
    if (error) {
      if (isStorageMissingError(error)) return { status: "storage-unavailable" }
      throw error
    }
  } catch (err) {
    if (isStorageMissingError(err)) return { status: "storage-unavailable" }
    throw err
  }
  return { status: "deleted" }
}

export async function importTopicProgress(  supabase: SupabaseClient,
  userId: string,
  targetId: string,
  legacy: Record<string, boolean>,
): Promise<{ status: "imported"; imported: number } | { status: Exclude<TopicProgressStorage, "ok"> }> {
  if (!userId || !targetId) return { status: "invalid-target" }
  const owned = await assertTargetOwnedBy(supabase, userId, targetId)
  if (!owned) return { status: "invalid-target" }

  const keys = Object.keys(legacy ?? {})
    .map((k) => normalizeTopicKey(k))
    .filter((k): k is string => k !== null && legacy[k] === true)
    .slice(0, EDITAL_TOPIC_PROGRESS_IMPORT_LIMIT)
  if (keys.length === 0) return { status: "imported", imported: 0 }

  try {
    const { error } = await supabase.from("edital_topic_progress").upsert(
      keys.map((topic_key) => ({
        user_id: userId,
        target_id: targetId,
        topic_key,
        checked: true,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,target_id,topic_key", ignoreDuplicates: true },
    )
    if (error) {
      if (isStorageMissingError(error)) return { status: "storage-unavailable" }
      throw error
    }
  } catch (err) {
    if (isStorageMissingError(err)) return { status: "storage-unavailable" }
    throw err
  }
  return { status: "imported", imported: keys.length }
}
