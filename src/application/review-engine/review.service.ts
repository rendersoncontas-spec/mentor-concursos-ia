// ============================================================================
// Review Service — leitura/escrita do módulo de revisões (Sprint 14).
// Funções de serviço que recebem o client Supabase (actions cuidam de auth).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { FLASHCARD_TYPE_LABEL, FSRS_D0 } from "@/domain/reviews/models"
import type {
  ReviewCardFront,
  ReviewCardReveal,
  ReviewDashboardData,
  ReviewFilters,
  ReviewItem,
  ReviewProfile,
  ReviewReport,
  ReviewSettings,
  SrsState,
} from "@/domain/reviews/models"
import { isLeech, reviewItemToSnapshot, scheduleNextState } from "./fsrs-engine"
import { applyFilters, buildAnalysesAndRecommendations, buildCalendar, buildLoadForecast, riskScore } from "./queue-engine"

export type Supabase = SupabaseClient

// ─── Constantes / defaults ───────────────────────────────────────────────────

export const DEFAULT_REVIEW_SETTINGS: Omit<ReviewSettings, "user_id"> = {
  new_cards_per_day: 20,
  max_reviews_per_day: 200,
  desired_retention: 0.9,
  max_daily_minutes: null,
  review_profile: "EQUILIBRADO",
  exam_date: null,
  reta_final: false,
  auto_add_errors: true,
}

export const REVIEW_PROFILE_PRESETS: Record<ReviewProfile, Partial<ReviewSettings>> = {
  EQUILIBRADO: { desired_retention: 0.9, new_cards_per_day: 20, max_reviews_per_day: 200, review_profile: "EQUILIBRADO" },
  ALTA_RETENCAO: { desired_retention: 0.95, new_cards_per_day: 12, max_reviews_per_day: 250, review_profile: "ALTA_RETENCAO" },
  RETA_FINAL: { desired_retention: 0.93, new_cards_per_day: 30, max_reviews_per_day: 300, reta_final: true, review_profile: "RETA_FINAL" },
  LEVE: { desired_retention: 0.85, new_cards_per_day: 10, max_reviews_per_day: 100, review_profile: "LEVE" },
}

const DAY_MS = 1000 * 3600 * 24

export function nowIso(): string {
  return new Date().toISOString()
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

export function mapReviewItem(row: Record<string, unknown>): ReviewItem {
  const tags = row["tags"]
  return {
    id: String(row["id"] ?? ""),
    user_id: String(row["user_id"] ?? ""),
    discipline_id: String(row["discipline_id"] ?? ""),
    topic_id: row["topic_id"] === null || row["topic_id"] === undefined ? null : String(row["topic_id"]),
    source_type: (row["source_type"] as ReviewItem["source_type"]) ?? "FLASHCARD",
    source_id: String(row["source_id"] ?? ""),
    review_stage: (row["review_stage"] as ReviewItem["review_stage"]) ?? "NEW",
    ease_factor: toPositiveNumber(row["ease_factor"], 2.5),
    stability_score: toPositiveNumber(row["stability_score"], 0),
    memory_strength: toPositiveNumber(row["memory_strength"], 0),
    forget_probability: toPositiveNumber(row["forget_probability"], 0),
    last_review_at: row["last_review_at"] === null || row["last_review_at"] === undefined ? null : String(row["last_review_at"]),
    next_review_at: row["next_review_at"] === null || row["next_review_at"] === undefined ? null : String(row["next_review_at"]),
    review_count: Math.round(toPositiveNumber(row["review_count"], 0)),
    lapses_count: Math.round(toPositiveNumber(row["lapses_count"], 0)),
    base_priority: toPositiveNumber(row["base_priority"], 1),
    card_type: (row["card_type"] as ReviewItem["card_type"]) ?? "QA",
    card_front: row["card_front"] === null || row["card_front"] === undefined ? null : String(row["card_front"]),
    card_back: row["card_back"] === null || row["card_back"] === undefined ? null : String(row["card_back"]),
    tags: Array.isArray(tags) ? tags.map((t) => String(t)) : [],
    difficulty: row["difficulty"] === null || row["difficulty"] === undefined ? FSRS_D0 : toPositiveNumber(row["difficulty"], FSRS_D0),
    last_interval_days: toPositiveNumber(row["last_interval_days"], 0),
    consecutive_correct: Math.round(toPositiveNumber(row["consecutive_correct"], 0)),
    consecutive_wrong: Math.round(toPositiveNumber(row["consecutive_wrong"], 0)),
    is_suspended: row["is_suspended"] === true,
    is_favorite: row["is_favorite"] === true,
    deleted_at: row["deleted_at"] === null || row["deleted_at"] === undefined ? null : String(row["deleted_at"]),
    created_at: String(row["created_at"] ?? nowIso()),
    updated_at: String(row["updated_at"] ?? nowIso()),
  }
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function mapSettings(row: Record<string, unknown> | null | undefined): ReviewSettings {
  return {
    user_id: row ? String(row["user_id"] ?? "") : "",
    new_cards_per_day: row ? Math.round(toPositiveNumber(row["new_cards_per_day"], DEFAULT_REVIEW_SETTINGS.new_cards_per_day)) : DEFAULT_REVIEW_SETTINGS.new_cards_per_day,
    max_reviews_per_day: row ? Math.round(toPositiveNumber(row["max_reviews_per_day"], DEFAULT_REVIEW_SETTINGS.max_reviews_per_day)) : DEFAULT_REVIEW_SETTINGS.max_reviews_per_day,
    desired_retention: row ? toPositiveNumber(row["desired_retention"], DEFAULT_REVIEW_SETTINGS.desired_retention) : DEFAULT_REVIEW_SETTINGS.desired_retention,
    max_daily_minutes: row && row["max_daily_minutes"] !== null && row["max_daily_minutes"] !== undefined ? toPositiveNumber(row["max_daily_minutes"], 0) : null,
    review_profile: (row?.["review_profile"] as ReviewProfile) ?? DEFAULT_REVIEW_SETTINGS.review_profile,
    exam_date: row && row["exam_date"] !== null && row["exam_date"] !== undefined ? String(row["exam_date"]) : null,
    reta_final: row?.["reta_final"] === true,
    auto_add_errors: row?.["auto_add_errors"] !== false,
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getOrCreateSettings(supabase: Supabase, userId: string): Promise<ReviewSettings> {
  const { data, error } = await supabase.from("review_settings").select("*").eq("user_id", userId).maybeSingle()
  if (error || !data) {
    await supabase.from("review_settings").insert({ user_id: userId, ...DEFAULT_REVIEW_SETTINGS })
    return { user_id: userId, ...DEFAULT_REVIEW_SETTINGS }
  }
  return { ...mapSettings(data), user_id: userId }
}

// ─── Leitura base ────────────────────────────────────────────────────────────

export interface ItemsBundle {
  items: ReviewItem[]
  discNames: Map<string, string>
  topicNames: Map<string, string>
}

export async function loadItemsBundle(supabase: Supabase, userId: string, limit = 20000): Promise<ItemsBundle> {
  const [itemsRes, discRes, topicRes] = await Promise.all([
    supabase.from("review_items").select("*").eq("user_id", userId).limit(limit),
    supabase.from("disciplines").select("id, name"),
    supabase.from("question_topics").select("id, discipline_id, name").limit(10000),
  ])
  const discNames = new Map<string, string>()
  ;(discRes.data ?? []).forEach((d) => discNames.set(String(d["id"]), String(d["name"] ?? "Disciplina")))
  const topicNames = new Map<string, string>()
  ;(topicRes.data ?? []).forEach((t) => topicNames.set(String(t["id"]), String(t["name"] ?? "Tópico")))

  return {
    items: (itemsRes.data ?? [])
      .filter((r) => !r["deleted_at"] && r["is_suspended"] !== true)
      .map((r) => mapReviewItem(r as Record<string, unknown>)),
    discNames,
    topicNames,
  }
}

export interface RetentionResult {
  retention: number | null
  reviewed: number
}

/** Retenção real a partir das notas do histórico (grade >= 2 = lembrado). */
export function retentionFromGrades(grades: number[]): RetentionResult {
  if (grades.length === 0) return { retention: null, reviewed: 0 }
  const remembered = grades.filter((g) => g >= 2).length
  return { retention: remembered / grades.length, reviewed: grades.length }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getReviewDashboardSummary(supabase: Supabase, userId: string): Promise<ReviewDashboardData> {
  const bundle = await loadItemsBundle(supabase, userId)
  const settings = await getOrCreateSettings(supabase, userId)
  const now = new Date()
  const { items, discNames, topicNames } = bundle

  const [historyRes, sessionsRes, allHistoryRes] = await Promise.all([
    supabase.from("review_history").select("grade, review_date").eq("user_id", userId).gte("review_date", new Date(now.getTime() - 365 * DAY_MS).toISOString()).order("review_date", { ascending: false }).limit(100000),
    supabase.from("review_sessions").select("id").eq("user_id", userId).eq("status", "ACTIVE").limit(1),
    supabase.from("review_history").select("grade, review_date").eq("user_id", userId).gte("review_date", new Date(now.getTime() - 365 * DAY_MS).toISOString()).order("review_date", { ascending: false }).limit(100000),
  ])
  const allHistory = allHistoryRes.data ?? historyRes.data ?? []

  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)
  const doneToday = allHistory.filter((h) => new Date(String(h["review_date"])).getTime() >= startOfToday.getTime()).length
  const graded = allHistory.map((h) => Number(h["grade"]))
  const { retention } = retentionFromGrades(graded)

  const funnel: Record<ReviewItem["review_stage"], number> = { NEW: 0, LEARNING: 0, REVIEW: 0, MASTERED: 0, LAPSED: 0 }
  items.forEach((i) => {
    funnel[i.review_stage] = (funnel[i.review_stage] ?? 0) + 1
  })

  let overdue = 0
  let dueToday = 0
  items.forEach((i) => {
    if (!i.next_review_at) return
    const due = new Date(i.next_review_at)
    if (due < now) overdue++
    else if (due.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) dueToday++
  })

  const newCount = items.filter((i) => i.review_count === 0).length
  const hardCount = items.filter((i) => i.review_count > 0 && i.difficulty >= 7).length
  const atRiskCount = items.filter((i) => i.review_count > 0 && i.next_review_at && new Date(i.next_review_at) <= now && riskScore(i, now) >= 0.45).length
  const errorCount = items.filter((i) => i.lapses_count > 0).length
  const leech = items
    .filter((i) => isLeech(i))
    .slice(0, 8)
    .map((i) => ({
      reviewItemId: i.id,
      cardType: i.card_type,
      front: i.card_front ?? FLASHCARD_TYPE_LABEL[i.card_type],
      disciplineName: discNames.get(i.discipline_id) ?? "Sem disciplina",
      topicName: i.topic_id ? topicNames.get(i.topic_id) ?? null : null,
      lapses: i.lapses_count,
      consecutiveWrong: i.consecutive_wrong,
      reviewCount: i.review_count,
    }))

  const forecast = buildLoadForecast(items, null, now)
  const calendar = buildCalendar(items, 30, now)

  const byDisciplineMap = new Map<string, { disciplineId: string; name: string; total: number; due: number }>()
  items.forEach((i) => {
    const entry = byDisciplineMap.get(i.discipline_id) ?? { disciplineId: i.discipline_id, name: discNames.get(i.discipline_id) ?? "Sem disciplina", total: 0, due: 0 }
    entry.total++
    if (i.next_review_at && new Date(i.next_review_at) <= now) entry.due++
    byDisciplineMap.set(i.discipline_id, entry)
  })
  const byDiscipline = [...byDisciplineMap.values()]
    .map((d) => ({ disciplineId: d.disciplineId, name: d.name, total: d.total, due: d.due, retention: null as number | null }))
    .sort((a, b) => b.due - a.due)

  const byTopicMap = new Map<string, { topicId: string | null; topicName: string; disciplineName: string; total: number; lastReviewAt: string | null; nextReviewAt: string | null }>()
  items.forEach((i) => {
    const key = i.topic_id ?? "null"
    const entry = byTopicMap.get(key) ?? {
      topicId: i.topic_id,
      topicName: i.topic_id ? topicNames.get(i.topic_id) ?? "Tópico" : "Sem tópico",
      disciplineName: discNames.get(i.discipline_id) ?? "Sem disciplina",
      total: 0,
      lastReviewAt: null as string | null,
      nextReviewAt: null as string | null,
    }
    entry.total++
    if (i.last_review_at && (!entry.lastReviewAt || i.last_review_at > entry.lastReviewAt)) entry.lastReviewAt = i.last_review_at
    if (i.next_review_at && (!entry.nextReviewAt || i.next_review_at < entry.nextReviewAt)) entry.nextReviewAt = i.next_review_at
    byTopicMap.set(key, entry)
  })
  const byTopic = [...byTopicMap.values()]
    .map((t) => ({ ...t, retention: null as number | null }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  const inWindow = (days: number) => {
    const cutoff = now.getTime() - days * DAY_MS
    const grades = allHistory.filter((h) => new Date(String(h["review_date"])).getTime() >= cutoff).map((h) => Number(h["grade"]))
    return retentionFromGrades(grades).retention
  }

  const weeks = new Map<string, number[]>()
  allHistory.forEach((h) => {
    const d = new Date(String(h["review_date"]))
    const weekStart = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10)
    const arr = weeks.get(weekStart) ?? []
    arr.push(Number(h["grade"]))
    weeks.set(weekStart, arr)
  })
  const evolution = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([start, grades]) => ({
      label: start.slice(5),
      retention: retentionFromGrades(grades).retention,
      reviewed: grades.length,
    }))

  const { analyses, recommendations } = buildAnalysesAndRecommendations({
    retention,
    overdue,
    dueToday,
    newCount,
    leech: leech.length,
    byDiscipline,
    byTopic: byTopic.map((t) => ({ ...t, name: t.disciplineName })),
    evolution: evolution as { retention: number | null }[],
    forecastToday: forecast.todayCount,
    mastered: funnel.MASTERED,
    settings,
    lapsed: funnel.LAPSED,
  })

  return {
    retention,
    doneToday,
    overdue,
    dueToday,
    newCount,
    hardCount,
    atRiskCount,
    errorCount,
    funnel,
    totalItems: items.length,
    calendar,
    forecast,
    byDiscipline,
    byTopic,
    leech,
    reteFinalActive: settings.reta_final,
    hasActiveSession: (sessionsRes.data ?? []).length > 0,
    retentionByPeriod: { d7: inWindow(7), d30: inWindow(30), d90: inWindow(90), d180: inWindow(180), d365: inWindow(365) },
    evolution,
    analyses,
    recommendations,
    recentReviews: [{ label: "Hoje", retention, reviewed: doneToday }],
  }
}

// ─── Sessões ─────────────────────────────────────────────────────────────────

export interface ActiveSessionPayload {
  sessionId: string
  mode: ReviewFilters["mode"]
  cardsTotal: number
  answered: number
  nextCard: ReviewCardFront | null
  nextCardId: string | null
  isFinished: boolean
}

export interface SessionResult {
  data: ActiveSessionPayload | null
  error: string | null
}

/** Monta a sessão: fila inteligente persistida (ids) + primeiro cartão (sem gabarito). */
export async function createReviewSession(supabase: Supabase, userId: string, filters: ReviewFilters): Promise<SessionResult> {
  try {
    const bundle = await loadItemsBundle(supabase, userId)
    const settings = await getOrCreateSettings(supabase, userId)
    const queue = applyFilters(bundle.items, { ...filters, maxReviews: settings.max_reviews_per_day })
    if (queue.length === 0) return { data: null, error: "Nenhum cartão disponível para esta revisão." }

    const queueIds = queue.map((i) => i.id)
    const firstId = queueIds[0]
    if (!firstId) return { data: null, error: "Erro ao carregar a fila." }

    const { data: sessionRow, error: insertError } = await supabase
      .from("review_sessions")
      .insert({
        user_id: userId,
        status: "ACTIVE",
        mode: filters.mode,
        filters: { ...filters, maxReviews: settings.max_reviews_per_day },
        queue_ids: queueIds,
        answered_ids: [],
        cards_total: queueIds.length,
        started_at: nowIso(),
      })
      .select("id")
      .single()

    if (insertError || !sessionRow) return { data: null, error: insertError?.message ?? "Erro ao iniciar sessão." }

    const first = bundle.items.find((i) => i.id === firstId)
    if (!first) return { data: null, error: "Erro ao carregar a fila." }

    return {
      data: {
        sessionId: String(sessionRow["id"]),
        mode: filters.mode,
        cardsTotal: queueIds.length,
        answered: 0,
        nextCard: buildFrontPayload(bundle, first),
        nextCardId: firstId,
        isFinished: false,
      },
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

/** Recupera a sessão ativa para retomar após reload. */
export async function getActiveReviewSession(supabase: Supabase, userId: string): Promise<SessionResult> {
  try {
    const { data: sessionRow } = await supabase
      .from("review_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!sessionRow) return { data: null, error: null }

    const queueIds: string[] = (sessionRow["queue_ids"] as string[] | null) ?? []
    const answeredIds: string[] = (sessionRow["answered_ids"] as string[] | null) ?? []
    const nextTargetId = queueIds[answeredIds.length]
    const sessionId = String(sessionRow["id"])
    const mode = (sessionRow["mode"] as ReviewFilters["mode"]) ?? "ALL"

    if (!nextTargetId) {
      return {
        data: { sessionId, mode, cardsTotal: queueIds.length, answered: answeredIds.length, nextCard: null, nextCardId: null, isFinished: true },
        error: null,
      }
    }

    const { data: items } = await supabase.from("review_items").select("*").in("id", queueIds)
    const byId = new Map<string, Record<string, unknown>>()
    ;(items ?? []).forEach((i) => byId.set(String(i["id"]), i as Record<string, unknown>))
    const nextRow = byId.get(nextTargetId)
    if (!nextRow) return { data: null, error: "Cartão seguinte não encontrado na fila." }

    const bundle = await loadItemsBundle(supabase, userId)
    return {
      data: {
        sessionId,
        mode,
        cardsTotal: queueIds.length,
        answered: answeredIds.length,
        nextCard: buildFrontPayload(bundle, mapReviewItem(nextRow)),
        nextCardId: nextTargetId,
        isFinished: false,
      },
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

function buildFrontPayload(bundle: ItemsBundle, item: ReviewItem): ReviewCardFront {
  let flag: ReviewCardFront["flag"] = null
  if (isLeech(item)) flag = "LEECH"
  else if (item.review_stage === "LAPSED") flag = "LAPSE_RISK"
  return {
    reviewItemId: item.id,
    cardType: item.card_type,
    front: item.card_front ?? FLASHCARD_TYPE_LABEL[item.card_type],
    disciplineName: bundle.discNames.get(item.discipline_id) ?? "Sem disciplina",
    topicName: item.topic_id ? bundle.topicNames.get(item.topic_id) ?? null : null,
    lapsesCount: item.lapses_count,
    isFavorite: item.is_favorite,
    reviewCount: item.review_count,
    flag,
  }
}

/** Revela o verso + intervalos previstos (determinísticos, calculados na hora). */
export async function buildRevealPayload(supabase: Supabase, userId: string, reviewItemId: string): Promise<{ data: ReviewCardReveal | null; error: string | null }> {
  try {
    const { data: row } = await supabase.from("review_items").select("*").eq("id", reviewItemId).eq("user_id", userId).maybeSingle()
    if (!row) return { data: null, error: "Cartão não encontrado." }
    const item = mapReviewItem(row as Record<string, unknown>)
    const snapshot = reviewItemToSnapshot(item)

    const intervals: ReviewCardReveal["intervals"] = ([1, 2, 3, 4] as const).map((grade) => {
      const s: SrsState = scheduleNextState(snapshot, { grade, now: new Date().toISOString() })
      let label = "Bom"
      if (grade === 1) label = "Novamente"
      else if (grade === 2) label = "Difícil"
      else if (grade === 4) label = "Fácil"
      return { grade, label, preview: formatPreview(s.interval_days) }
    })

    return {
      data: {
        reviewItemId: item.id,
        cardType: item.card_type,
        front: item.card_front ?? FLASHCARD_TYPE_LABEL[item.card_type],
        disciplineName: "",
        topicName: null,
        lapsesCount: item.lapses_count,
        isFavorite: item.is_favorite,
        reviewCount: item.review_count,
        flag: null,
        back: item.card_back ?? "",
        alternatives: [],
        intervals,
      },
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

function formatPreview(intervalDays: number): string {
  if (intervalDays < 1 / 24) return "< 1h"
  if (intervalDays < 1) return `${Math.max(1, Math.round(intervalDays * 24))} min`
  if (intervalDays < 30) return `${Math.max(1, Math.round(intervalDays))} dias`
  if (intervalDays < 365) return `${Math.round(intervalDays / 30)} meses`
  return `${Math.round(intervalDays / 365)} anos`
}

export interface AnswerResult {
  nextCard: ReviewCardFront | null
  nextCardId: string | null
  answered: number
  cardsTotal: number
  isFinished: boolean
}

/** Persiste a resposta (auto-save): FSRS → item → histórico → sessão. Retorna próximo cartão. */
export async function answerReviewCard(
  supabase: Supabase,
  userId: string,
  sessionId: string,
  reviewItemId: string,
  grade: 1 | 2 | 3 | 4,
  responseTimeSeconds: number
): Promise<{ data: AnswerResult | null; error: string | null }> {
  try {
    const [{ data: sessionRow }, { data: itemRow }] = await Promise.all([
      supabase.from("review_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle(),
      supabase.from("review_items").select("*").eq("id", reviewItemId).eq("user_id", userId).maybeSingle(),
    ])
    if (!sessionRow || sessionRow["status"] !== "ACTIVE") return { data: null, error: "Sessão não encontrada ou já finalizada." }
    if (!itemRow) return { data: null, error: "Cartão não encontrado." }

    const item = mapReviewItem(itemRow as Record<string, unknown>)
    const snapshot = reviewItemToSnapshot(item)
    const now = new Date()
    const next = scheduleNextState(snapshot, { grade, now: now.toISOString() })

    const previousIntervalDays = item.last_review_at ? Math.max(0, Math.round((now.getTime() - new Date(item.last_review_at).getTime()) / DAY_MS)) : 0

    const { error: updateError } = await supabase
      .from("review_items")
      .update({
        review_stage: next.review_stage,
        stability_score: next.stability,
        difficulty: next.difficulty,
        memory_strength: next.memory_strength,
        forget_probability: next.forget_probability,
        last_review_at: now.toISOString(),
        next_review_at: next.next_review_at,
        review_count: next.review_count,
        consecutive_correct: next.consecutive_correct,
        consecutive_wrong: next.consecutive_wrong,
        lapses_count: next.lapses_count,
        last_interval_days: previousIntervalDays,
        updated_at: now.toISOString(),
      })
      .eq("id", reviewItemId)
      .eq("user_id", userId)

    if (updateError) return { data: null, error: updateError.message ?? "Erro ao salvar resposta." }

    const { error: historyError } = await supabase.from("review_history").insert({
      user_id: userId,
      review_item_id: reviewItemId,
      session_id: sessionId,
      review_date: now.toISOString(),
      grade,
      duration_seconds: Math.max(1, Math.round(responseTimeSeconds)),
      previous_interval_days: previousIntervalDays || null,
      new_interval_days: next.interval_days,
      previous_ease: item.ease_factor,
      new_ease: next.difficulty,
    })
    if (historyError) console.error("[REVIEW] Erro no histórico:", historyError)

    const answeredIds = [...(sessionRow["answered_ids"] as string[] | null ?? []), reviewItemId]
    const { error: sessionError } = await supabase
      .from("review_sessions")
      .update({ answered_ids: answeredIds })
      .eq("id", sessionId)
      .eq("user_id", userId)
    if (sessionError) console.error("[REVIEW] Erro na sessão:", sessionError)

    const queueIds: string[] = (sessionRow["queue_ids"] as string[] | null) ?? []
    const isFinished = answeredIds.length >= queueIds.length

    if (isFinished) {
      await finalizeSession(supabase, userId, sessionId, answeredIds)
      return { data: { nextCard: null, nextCardId: null, answered: answeredIds.length, cardsTotal: queueIds.length, isFinished: true }, error: null }
    }

    const nextTargetId = queueIds[answeredIds.length]
    if (!nextTargetId) {
      await finalizeSession(supabase, userId, sessionId, answeredIds)
      return { data: { nextCard: null, nextCardId: null, answered: answeredIds.length, cardsTotal: queueIds.length, isFinished: true }, error: null }
    }

    const { data: items } = await supabase.from("review_items").select("*").in("id", queueIds)
    const byId = new Map<string, Record<string, unknown>>()
    ;(items ?? []).forEach((i) => byId.set(String(i["id"]), i as Record<string, unknown>))
    const nextRow = byId.get(nextTargetId)
    if (!nextRow) {
      await finalizeSession(supabase, userId, sessionId, answeredIds)
      return { data: { nextCard: null, nextCardId: null, answered: answeredIds.length, cardsTotal: queueIds.length, isFinished: true }, error: null }
    }

    const bundle = await loadItemsBundle(supabase, userId)
    return {
      data: {
        nextCard: buildFrontPayload(bundle, mapReviewItem(nextRow)),
        nextCardId: nextTargetId,
        answered: answeredIds.length,
        cardsTotal: queueIds.length,
        isFinished: false,
      },
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

/** Conclui a sessão: STATUS COMPLETED + study_history + cache review_statistics. */
export async function finalizeSession(supabase: Supabase, userId: string, sessionId: string, answeredIds: string[]) {
  const now = new Date()
  const { data: sessionRow } = await supabase.from("review_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle()
  if (!sessionRow || sessionRow["status"] !== "ACTIVE") return

  await supabase
    .from("review_sessions")
    .update({ status: "COMPLETED", finished_at: now.toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)

  if (answeredIds.length > 0) {
    const { data: items } = await supabase.from("review_items").select("discipline_id").in("id", answeredIds)
    const disciplineCount = new Map<string, number>()
    ;(items ?? []).forEach((i) => disciplineCount.set(String(i["discipline_id"]), (disciplineCount.get(String(i["discipline_id"])) ?? 0) + 1))
    const mainDiscipline = [...disciplineCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

    if (mainDiscipline) {
      const totalSeconds = Math.round((now.getTime() - new Date(String(sessionRow["started_at"])).getTime()) / 1000)
      const durationMinutes = Math.max(1, Math.round(totalSeconds / 60))
      await supabase.from("study_history").insert({
        user_id: userId,
        discipline_id: mainDiscipline,
        study_source: "REVIEW",
        study_type: "REVISAO",
        technique: null,
        active_minutes: durationMinutes,
        paused_minutes: 0,
        duration_minutes: durationMinutes,
        completed: true,
        interrupted: false,
        started_at: String(sessionRow["started_at"]),
        finished_at: now.toISOString(),
        notes: `Sessão de revisão (${String(sessionRow["mode"] ?? "ALL")}) — ${answeredIds.length} cartão(ões)`,
        metadata: {
          flashcards_reviewed: answeredIds.length,
          review_session_id: sessionId,
          review_mode: String(sessionRow["mode"] ?? "ALL"),
        },
      })
    }
  }

  await refreshStatisticsCache(supabase, userId)
}

/** Descarta a sessão ativa (não grava study_history). */
export async function discardReviewSession(supabase: Supabase, userId: string, sessionId: string) {
  await supabase
    .from("review_sessions")
    .update({ status: "DISCARDED", finished_at: nowIso() })
    .eq("id", sessionId)
    .eq("user_id", userId)
  await refreshStatisticsCache(supabase, userId)
}

/** Atualiza o cache review_statistics com números reais. */
export async function refreshStatisticsCache(supabase: Supabase, userId: string) {
  const [historyRes, itemsRes] = await Promise.all([
    supabase.from("review_history").select("grade").eq("user_id", userId),
    supabase.from("review_items").select("review_stage").eq("user_id", userId),
  ])
  const grades = (historyRes.data ?? []).map((h) => Number(h["grade"]))
  const { retention } = retentionFromGrades(grades)
  const mastered = (itemsRes.data ?? []).filter((i) => i["review_stage"] === "MASTERED").length

  const { data: existing } = await supabase.from("review_statistics").select("id").eq("user_id", userId).maybeSingle()
  const payload = {
    total_reviews: grades.length,
    retention_rate: retention === null ? 0 : Math.round(retention * 10000) / 100,
    mastered_items: mastered,
    last_calculated_at: nowIso(),
  }
  if (existing) {
    await supabase.from("review_statistics").update(payload).eq("id", String(existing["id"]))
  } else {
    await supabase.from("review_statistics").insert({ user_id: userId, ...payload })
  }
}

/** Relatório final da sessão (dados reais do histórico). */
export async function buildSessionReport(supabase: Supabase, userId: string, sessionId: string): Promise<ReviewReport | null> {
  const { data: sessionRow } = await supabase.from("review_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle()
  if (!sessionRow || sessionRow["status"] !== "COMPLETED") return null

  const { data: historyRows } = await supabase.from("review_history").select("grade, duration_seconds").eq("session_id", sessionId)
  const grades = (historyRows ?? []).map((h) => Number(h["grade"]))
  const durations = (historyRows ?? []).map((h) => Number(h["duration_seconds"] ?? 0))
  const total = grades.length
  const counts = { again: grades.filter((g) => g === 1).length, hard: grades.filter((g) => g === 2).length, good: grades.filter((g) => g === 3).length, easy: grades.filter((g) => g === 4).length }
  const remembered = counts.hard + counts.good + counts.easy
  const totalSeconds = durations.reduce((a, b) => a + b, 0)
  const wallSeconds = Math.max(0, Math.round((Date.now() - new Date(String(sessionRow["started_at"])).getTime()) / 1000))

  return {
    cardsReviewed: total,
    again: counts.again,
    hard: counts.hard,
    good: counts.good,
    easy: counts.easy,
    remembered,
    retention: total > 0 ? remembered / total : 0,
    totalSeconds: wallSeconds > 0 ? wallSeconds : totalSeconds,
    avgSecondsPerCard: total > 0 ? Math.round((wallSeconds > 0 ? wallSeconds : totalSeconds) / total) : 0,
    worstTopics: [],
  }
}

// ─── Flashcards ──────────────────────────────────────────────────────────────

export interface FlashcardInput {
  disciplineId: string
  topicId?: string | null
  cardType?: ReviewItem["card_type"]
  front: string
  back: string
  tags?: string[]
}

export async function createFlashcard(supabase: Supabase, userId: string, input: FlashcardInput): Promise<{ data: ReviewItem | null; error: string | null }> {
  if (!input.disciplineId) return { data: null, error: "Selecione uma disciplina." }
  if (!input.front?.trim() || !input.back?.trim()) return { data: null, error: "Pergunta e resposta são obrigatórias." }

  const { data, error } = await supabase
    .from("review_items")
    .insert({
      user_id: userId,
      discipline_id: input.disciplineId,
      topic_id: input.topicId ?? null,
      source_type: "FLASHCARD",
      source_id: crypto.randomUUID(),
      review_stage: "NEW",
      stability_score: 0,
      memory_strength: 0,
      forget_probability: 0,
      base_priority: 1.0,
      card_type: input.cardType ?? "QA",
      card_front: input.front.trim(),
      card_back: input.back.trim(),
      tags: input.tags ?? [],
      difficulty: FSRS_D0,
      consecutive_correct: 0,
      consecutive_wrong: 0,
      is_suspended: false,
      is_favorite: false,
    })
    .select("*")
    .single()
  if (error) return { data: null, error: error.message ?? "Erro ao criar cartão." }
  return { data: mapReviewItem(data as Record<string, unknown>), error: null }
}

export async function updateFlashcard(supabase: Supabase, userId: string, id: string, patch: Partial<FlashcardInput>): Promise<{ data: ReviewItem | null; error: string | null }> {
  const update: Record<string, unknown> = { updated_at: nowIso() }
  if (patch.front !== undefined) update["card_front"] = patch.front.trim()
  if (patch.back !== undefined) update["card_back"] = patch.back.trim()
  if (patch.cardType !== undefined) update["card_type"] = patch.cardType
  if (patch.disciplineId !== undefined) update["discipline_id"] = patch.disciplineId
  if (patch.topicId !== undefined) update["topic_id"] = patch.topicId || null
  if (patch.tags !== undefined) update["tags"] = patch.tags

  const { data, error } = await supabase.from("review_items").update(update).eq("id", id).eq("user_id", userId).select("*").single()
  if (error) return { data: null, error: error.message ?? "Erro ao atualizar cartão." }
  return { data: mapReviewItem(data as Record<string, unknown>), error: null }
}

export async function softDeleteFlashcard(supabase: Supabase, userId: string, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("review_items").update({ deleted_at: nowIso(), updated_at: nowIso() }).eq("id", id).eq("user_id", userId)
  return { error: error?.message ?? null }
}

export async function toggleFlashcardFlag(supabase: Supabase, userId: string, id: string, field: "is_favorite" | "is_suspended", value: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from("review_items").update({ [field]: value, updated_at: nowIso() }).eq("id", id).eq("user_id", userId)
  return { error: error?.message ?? null }
}

export async function duplicateFlashcard(supabase: Supabase, userId: string, id: string): Promise<{ data: ReviewItem | null; error: string | null }> {
  const { data: row } = await supabase.from("review_items").select("*").eq("id", id).eq("user_id", userId).maybeSingle()
  if (!row) return { data: null, error: "Cartão não encontrado." }
  return createFlashcard(supabase, userId, {
    disciplineId: String(row["discipline_id"]),
    topicId: row["topic_id"] === null || row["topic_id"] === undefined ? null : String(row["topic_id"]),
    cardType: (row["card_type"] as ReviewItem["card_type"]) ?? "QA",
    front: String(row["card_front"] ?? ""),
    back: String(row["card_back"] ?? ""),
    tags: Array.isArray(row["tags"]) ? row["tags"].map((t) => String(t)) : [],
  })
}

export interface FlashcardSearch {
  q?: string | null
  disciplineId?: string | null
  topicId?: string | null
  stage?: ReviewItem["review_stage"] | "SUSPENDED" | "ALL" | null
  tag?: string | null
  page?: number
  pageSize?: number
}

export async function searchFlashcards(supabase: Supabase, userId: string, search: FlashcardSearch): Promise<{ data: { cards: ReviewItem[]; total: number }; error: string | null }> {
  try {
    const q = search.q?.trim()
    const page = Math.max(1, search.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, search.pageSize ?? 20))

    let query = supabase.from("review_items").select("*", { count: "exact" }).eq("user_id", userId).eq("source_type", "FLASHCARD")
    if (search.disciplineId) query = query.eq("discipline_id", search.disciplineId)
    if (search.topicId) query = query.eq("topic_id", search.topicId)
    if (search.tag) query = query.contains("tags", [search.tag])

    if (search.stage === "ALL") query = query.is("deleted_at", null)
    else if (search.stage === "SUSPENDED") query = query.eq("is_suspended", true).is("deleted_at", null)
    else {
      query = query.eq("is_suspended", false).is("deleted_at", null)
      if (search.stage) query = query.eq("review_stage", search.stage)
    }

    if (q) query = query.or(`card_front.ilike.%${q}%,card_back.ilike.%${q}%,tags.cs.{${JSON.stringify(q).slice(1, -1)}}`)

    const { data, error, count } = await query.order("updated_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
    if (error) return { data: { cards: [], total: 0 }, error: error.message ?? "Erro na busca." }
    return { data: { cards: (data ?? []).map((r) => mapReviewItem(r as Record<string, unknown>)), total: count ?? 0 }, error: null }
  } catch (err: unknown) {
    return { data: { cards: [], total: 0 }, error: errorMessage(err) }
  }
}

// ─── IA heurística (sem provider LLM: usa o conteúdo real do usuário) ────────

export interface CardDraft {
  disciplineId: string
  topicId: string | null
  cardType: ReviewItem["card_type"]
  front: string
  back: string
  tags: string[]
  sourceQuestionId: string
}

export async function generateCardDrafts(supabase: Supabase, userId: string, disciplineId: string, topicId: string | null, count = 5): Promise<{ data: CardDraft[]; error: string | null }> {
  if (!disciplineId) return { data: [], error: "Selecione uma disciplina." }
  let query = supabase
    .from("questions")
    .select("id, discipline_id, topic_id, statement, correct_answer, alternatives, explanation, difficulty_level")
    .eq("question_status", "ACTIVE")
    .eq("discipline_id", disciplineId)
  if (topicId) query = query.eq("topic_id", topicId)

  const { data: rows, error } = await query.limit(Math.max(1, count * 3))
  void userId
  if (error) return { data: [], error: error.message ?? "Erro ao buscar questões." }

  const rowsData = (rows ?? []) as unknown as Array<Record<string, unknown>>
  const usable = rowsData.filter((r) => r["statement"] && r["correct_answer"])
  if (usable.length === 0) return { data: [], error: "Sem questões cadastradas com gabarito para gerar cartões." }

  const drafts: CardDraft[] = []
  for (const r of usable.slice(0, count)) {
    const alternatives: Array<Record<string, unknown>> = Array.isArray(r["alternatives"]) ? (r["alternatives"] as Array<Record<string, unknown>>) : []
    const correct = String(r["correct_answer"] ?? "").trim()
    const answerText = String(alternatives.find((a) => String(a["label"] ?? a["letter"] ?? "").trim().toUpperCase() === correct.toUpperCase())?.["text"] ?? correct)
    const explanation = r["explanation"] ? `\n\nExplicação: ${String(r["explanation"])}` : ""
    const draft = buildDraftFromQuestion(r, alternatives, correct, answerText, explanation, disciplineId, topicId)
    if (draft) drafts.push(draft)
  }

  return { data: drafts, error: null }
}

function buildDraftFromQuestion(
  r: Record<string, unknown>,
  alternatives: Array<Record<string, unknown>>,
  correct: string,
  answerText: string,
  explanation: string,
  disciplineId: string,
  topicId: string | null
): CardDraft | null {
  const statement = String(r["statement"] ?? "")
  if (!statement) return null
  let front: string
  let back: string
  let cardType: ReviewItem["card_type"]

  if (alternatives.length >= 2) {
    const shuffled = [...alternatives].sort(() => Math.random() - 0.5)
    const lines = shuffled.map((a, idx) => `${String.fromCharCode(65 + idx)}) ${String(a["text"] ?? "")}`).join("\n")
    front = `${statement}\n\n${lines}`
    back = `Gabarito: ${correct}\n\n${answerText}${explanation}`
    cardType = "MULTIPLE_CHOICE"
  } else if (correct.toUpperCase() === "CERTO" || correct.toUpperCase() === "ERRADO") {
    front = statement
    back = `Resposta: ${correct}${explanation}`
    cardType = "TRUE_FALSE"
  } else {
    front = statement
    back = `Gabarito: ${correct}${explanation}`
    cardType = "QUESTION"
  }

  return {
    disciplineId,
    topicId: r["topic_id"] ? String(r["topic_id"]) : topicId,
    cardType,
    front,
    back,
    tags: ["questao"],
    sourceQuestionId: String(r["id"] ?? ""),
  }
}

// ─── Import / Export ─────────────────────────────────────────────────────────

export interface ImportCardRow {
  front: string
  back: string
  disciplineName?: string | null
  tags?: string[]
  cardType?: ReviewItem["card_type"]
}

export async function importFlashcards(supabase: Supabase, userId: string, rows: ImportCardRow[]): Promise<{ data: { imported: number; skipped: number; total: number; message?: string }; error: string | null }> {
  if (rows.length === 0) return { data: { imported: 0, skipped: 0, total: 0 }, error: "Nenhuma linha para importar." }
  if (rows.length > 500) return { data: { imported: 0, skipped: 0, total: 0 }, error: "Máximo de 500 cartões por importação." }

  const { data: discRows } = await supabase.from("disciplines").select("id, name")
  const byName = new Map<string, string>()
  ;(discRows ?? []).forEach((d) => byName.set(String(d["name"]).toLowerCase(), String(d["id"])))

  let imported = 0
  let skipped = 0
  const notices: string[] = []
  for (const row of rows) {
    if (!row.front?.trim() || !row.back?.trim()) {
      skipped++
      notices.push("Linha sem pergunta ou resposta foi ignorada.")
      continue
    }
    const disciplineId = row.disciplineName ? byName.get(row.disciplineName.trim().toLowerCase()) : undefined
    if (row.disciplineName && !disciplineId) {
      skipped++
      notices.push(`Disciplina "${row.disciplineName}" não encontrada — linha ignorada.`)
      continue
    }
    const { error } = await createFlashcard(supabase, userId, {
      disciplineId: disciplineId ?? (discRows?.[0] ? String(discRows[0]["id"]) : ""),
      cardType: row.cardType ?? "QA",
      front: row.front,
      back: row.back,
      tags: row.tags ?? [],
    })
    if (error) {
      skipped++
      notices.push(error)
      continue
    }
    imported++
  }

  const result: { imported: number; skipped: number; total: number; message?: string } = { imported, skipped, total: rows.length }
  const firstNotice = notices[0]
  if (firstNotice !== undefined) result.message = firstNotice

  return { data: result, error: null }
}

export async function exportFlashcards(supabase: Supabase, userId: string): Promise<{ data: ImportCardRow[] | null; error: string | null }> {
  try {
    const [rowsRes, discRes] = await Promise.all([
      supabase.from("review_items").select("card_front, card_back, tags, card_type, discipline_id").eq("user_id", userId).eq("source_type", "FLASHCARD").is("deleted_at", null).limit(10000),
      supabase.from("disciplines").select("id, name"),
    ])
    const names = new Map<string, string>()
    ;(discRes.data ?? []).forEach((d) => names.set(String(d["id"]), String(d["name"])))
    return {
      data: (rowsRes.data ?? []).map((r) => ({
        front: String(r["card_front"] ?? ""),
        back: String(r["card_back"] ?? ""),
        disciplineName: names.get(String(r["discipline_id"])) ?? null,
        tags: Array.isArray(r["tags"]) ? r["tags"].map((t) => String(t)) : [],
        cardType: (r["card_type"] as ImportCardRow["cardType"]) ?? "QA",
      })),
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro inesperado."
}