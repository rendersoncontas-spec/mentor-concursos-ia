// ============================================================================
// Review Analytics Service — leituras leves para páginas do módulo de revisões.
// Funções de serviço que recebem o client Supabase (actions cuidam de auth).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ReviewStage } from "@/domain/reviews/models"
import { loadItemsBundle, retentionFromGrades } from "./review.service"

export type Supabase = SupabaseClient

const DAY_MS = 1000 * 3600 * 24

export interface MemoryStages {
  new: number
  learning: number
  review: number
  mastered: number
  lapsed: number
}

export interface AverageRetention {
  retentionRate: number
  reviewed: number
}

export interface CriticalTopic {
  topicId: string | null
  topicName: string
  disciplineName: string
  total: number
  due: number
  retention: number | null
  reviewed: number
}

const STAGE_KEYS: ReviewStage[] = ["NEW", "LEARNING", "REVIEW", "MASTERED", "LAPSED"]

/** Fila de hoje: cartões novos + cartões já vencidos ou com revisão prevista para hoje. */
export async function getReviewBacklog(supabase: Supabase, userId: string): Promise<number> {
  const { items } = await loadItemsBundle(supabase, userId)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  return items.filter((i) => {
    if (i.review_count === 0) return true
    if (!i.next_review_at) return true
    const due = new Date(i.next_review_at)
    return due.getTime() <= todayStart.getTime() + DAY_MS - 1
  }).length
}

/** Contagem de cartões por estágio de memória (funil de spaced repetition). */
export async function getMemoryStages(supabase: Supabase, userId: string): Promise<MemoryStages> {
  const { items } = await loadItemsBundle(supabase, userId)
  const stages: MemoryStages = { new: 0, learning: 0, review: 0, mastered: 0, lapsed: 0 }
  items.forEach((i) => {
    const key = STAGE_KEYS.find((s) => s === i.review_stage)
    if (!key) return
    if (key === "NEW") stages.new++
    else if (key === "LEARNING") stages.learning++
    else if (key === "REVIEW") stages.review++
    else if (key === "MASTERED") stages.mastered++
    else stages.lapsed++
  })
  return stages
}

/** Taxa de retenção real (últimos 365 dias) em percentual inteiro 0–100. */
export async function getAverageRetention(supabase: Supabase, userId: string): Promise<AverageRetention> {
  const now = new Date()
  const { data } = await supabase
    .from("review_history")
    .select("grade")
    .eq("user_id", userId)
    .gte("review_date", new Date(now.getTime() - 365 * DAY_MS).toISOString())
    .limit(100000)

  const grades = (data ?? []).map((h) => Number(h["grade"]))
  const { retention, reviewed } = retentionFromGrades(grades)
  return { retentionRate: retention === null ? 0 : Math.round(retention * 100), reviewed }
}

/** Tópicos mais críticos: alto volume de cartões vencidos / baixa retenção. */
export async function getCriticalTopics(supabase: Supabase, userId: string): Promise<CriticalTopic[]> {
  const bundle = await loadItemsBundle(supabase, userId)
  const { items, discNames, topicNames } = bundle
  const now = new Date()

  const [historyRes] = await Promise.all([
    supabase.from("review_history").select("grade, review_item_id").eq("user_id", userId).limit(100000),
  ])

  const byTopicMap = new Map<string, CriticalTopic>()
  items.forEach((i) => {
    const key = i.topic_id ?? "null"
    const entry = byTopicMap.get(key) ?? {
      topicId: i.topic_id,
      topicName: i.topic_id ? topicNames.get(i.topic_id) ?? "Tópico" : "Sem tópico",
      disciplineName: discNames.get(i.discipline_id) ?? "Sem disciplina",
      total: 0,
      due: 0,
      retention: null,
      reviewed: 0,
    }
    entry.total++
    if (i.next_review_at && new Date(i.next_review_at) <= now) entry.due++
    byTopicMap.set(key, entry)
  })

  const byCard = new Map<string, number[]>()
  ;(historyRes.data ?? []).forEach((h) => {
    const item = items.find((i) => i.id === String(h["review_item_id"] ?? ""))
    if (!item) return
    const key = item.topic_id ?? "null"
    const arr = byCard.get(key) ?? []
    arr.push(Number(h["grade"]))
    byCard.set(key, arr)
  })

  return [...byTopicMap.values()]
    .map((t) => {
      const grades = byCard.get(t.topicId ?? "null") ?? []
      const { retention, reviewed } = retentionFromGrades(grades)
      return { ...t, retention, reviewed }
    })
    .sort((a, b) => b.due - a.due || b.total - a.total)
    .slice(0, 8)
}