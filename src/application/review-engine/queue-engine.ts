// ============================================================================
// Review Queue Engine — fila inteligente, prioridade de concurso, previsão de
// carga e análise baseada em dados reais.
//
// Ordem da fila inteligente:
//   1. Atrasadas (maior atraso primeiro)
//   2. Vencidas hoje
//   3. Maior risco de esquecimento (menor retrievability)
//   4. Maior dificuldade (D do FSRS / falhas recorrentes)
//   5. Lapsos (itens que já falharam)
//   6. Novas (no início do dia, respeitando o limite de novos/dia)
// ============================================================================

import type { ReviewCalendarDay, ReviewFilters, ReviewItem, ReviewLoadForecast, ReviewSettings } from "@/domain/reviews/models"
import { currentRetrievability, isLeech, reviewItemToSnapshot } from "./fsrs-engine"

export interface QueueCard {
  item: ReviewItem
  retrievability: number
  overdueDays: number
  dueToday: boolean
  isNew: boolean
  riskScore: number
  isLeech: boolean
}

const DAY_MS = 1000 * 3600 * 24

export function elapsedDays(dateIso: string | null, now = new Date()): number {
  if (!dateIso) return 0
  return (now.getTime() - new Date(dateIso).getTime()) / DAY_MS
}

/** Pontuação de risco (maior = revê antes): risco de esquecimento + falhas + dificuldade. */
export function riskScore(item: ReviewItem, now = new Date()): number {
  const R = currentRetrievability(reviewItemToSnapshot(item), now)
  const forgetRisk = 1 - R
  const failures = Math.min(item.lapses_count, 10) / 10
  const difficulty = Math.min((item.difficulty || 4.93) / 10, 1)
  const recency = Math.min(item.consecutive_wrong, 5) / 5
  return forgetRisk * 0.45 + failures * 0.25 + difficulty * 0.2 + recency * 0.1
}

export function buildQueueCards(items: ReviewItem[], now = new Date()): QueueCard[] {
  return items.map((item) => {
    const due = item.next_review_at ? new Date(item.next_review_at).getTime() : now.getTime()
    const overdueDays = Math.max(0, (now.getTime() - due) / DAY_MS)
    return {
      item,
      retrievability: currentRetrievability(reviewItemToSnapshot(item), now),
      overdueDays,
      dueToday: now.getTime() >= due,
      isNew: item.review_count === 0,
      riskScore: riskScore(item, now),
      isLeech: isLeech(item),
    }
  })
}

/**
 * Ordena a fila inteligente respeitando a prioridade de concurso
 * (1. atrasados 2. hoje 3. risco 4. dificuldade 5. lapsos 6. novos).
 */
export function smartQueueOrder(items: ReviewItem[], now = new Date()): ReviewItem[] {
  return buildQueueCards(items, now)
    .sort((a, b) => {
      const bucket = (c: QueueCard): number => {
        if (c.overdueDays > 0) return 0
        if (c.dueToday) return 1
        if (c.item.review_stage === "LAPSED" || c.isLeech) return 2
        if (c.item.review_count > 0) return 3
        return 4 // novas
      }
      const ba = bucket(a)
      const bb = bucket(b)
      if (ba !== bb) return ba - bb
      if (ba === 0) return b.overdueDays - a.overdueDays
      if (ba === 2) return b.riskScore - a.riskScore
      if (ba === 3) return b.riskScore - a.riskScore
      // novas: primeiro por prioridade de base, depois curiosidade determinística
      return (b.item.base_priority || 1) - (a.item.base_priority || 1)
    })
    .map((c) => c.item)
}

/** Aplica os filtros de modo à lista de itens do usuário. */
export function applyFilters(items: ReviewItem[], filters: ReviewFilters, now = new Date()): ReviewItem[] {
  const todayStr = now.toISOString().slice(0, 10)

  let list = items.filter((i) => !i.is_suspended && !i.deleted_at)
  if (filters.disciplineId) list = list.filter((i) => i.discipline_id === filters.disciplineId)
  if (filters.topicId) list = list.filter((i) => i.topic_id === filters.topicId)

  switch (filters.mode) {
    case "ALL":
      // vencidas + de hoje + (lapsos/risco) + novas dentro do limite
      break
    case "OVERDUE":
      list = list.filter((i) => i.next_review_at && new Date(i.next_review_at) < now)
      break
    case "TODAY":
      list = list.filter((i) => i.next_review_at && new Date(i.next_review_at).toISOString().slice(0, 10) === todayStr)
      break
    case "NEW":
      list = list.filter((i) => i.review_count === 0)
      break
    case "HARD":
    case "AT_RISK":
      list = list.filter((i) => i.review_count > 0 && riskScore(i, now) >= 0.45)
      break
    case "ERRORS":
      list = list.filter((i) => i.lapses_count > 0)
      break
    case "MASTERED":
      list = list.filter((i) => i.review_stage === "MASTERED")
      break
    case "LAPSED":
      list = list.filter((i) => i.review_stage === "LAPSED")
      break
    case "RAPIDA":
    case "DISCIPLINE":
    case "TOPIC":
      break
  }

  list = smartQueueOrder(list, now)

  // Modo ALL: limita novos pelo new_cards_per_day e respeita max_reviews_per_day.
  if (filters.mode === "ALL") {
    const limit = filters.count ?? Math.max(1, Math.round((filters.maxReviews ?? 200) * 1)) // limite máximo do dia
    list = list.slice(0, limit)
  }

  if (filters.count && filters.count > 0 && filters.mode !== "ALL") {
    list = list.slice(0, filters.count)
  } else if (filters.count && filters.count > 0) {
    // Revisão rápida: seleciona os itens mais importantes (vencidas, risco, lapsos) primeiro.
    list = list.slice(0, filters.count)
  }

  return list
}

// ─── Previsão de carga ─────────────────────────────────────────────────────────────────

export function buildLoadForecast(
  items: ReviewItem[],
  avgSecondsPerCard: number | null,
  now = new Date()
): ReviewLoadForecast {
  const byDay = new Map<string, number>()
  const t = (d: Date) => d.toISOString().slice(0, 10)

  items.forEach((i) => {
    if (!i.next_review_at) return
    const d = new Date(i.next_review_at)
    if (d < now) return
    const key = t(d)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  })

  const sec = avgSecondsPerCard ?? 60
  const countAt = (offset: number) => {
    const d = new Date(now.getTime() + offset * DAY_MS)
    return byDay.get(t(d)) ?? 0
  }

  const sumRange = (startOffset: number, endOffset: number) => {
    let sum = 0
    for (let i = startOffset; i <= endOffset; i++) sum += countAt(i)
    return sum
  }

  const minutes = (c: number) => Math.round((c * sec) / 60)

  const today = countAt(0)
  const tomorrow = countAt(1)
  const week7 = sumRange(0, 7)
  const week30 = sumRange(0, 30)

  let loadWarning: string | null = null
  if (today > 100) loadWarning = `Carga excessiva hoje (${today} cartões). Considere limitar novos cartões.`
  else if (week7 > 400) loadWarning = `Previsão alta para os próximos 7 dias (${week7} cartões).`

  return {
    todayCount: today,
    todayMinutes: minutes(today),
    tomorrowCount: tomorrow,
    tomorrowMinutes: minutes(tomorrow),
    week7Count: week7,
    week7Minutes: minutes(week7),
    week30Count: week30,
    week30Minutes: minutes(week30),
    loadWarning,
  }
}

export function buildCalendar(items: ReviewItem[], days = 30, now = new Date()): ReviewCalendarDay[] {
  const byDay = new Map<string, number>()
  const t = (d: Date) => d.toISOString().slice(0, 10)
  items.forEach((i) => {
    if (!i.next_review_at) return
    const d = new Date(i.next_review_at)
    if (d < now) return
    const offset = Math.round((d.getTime() - now.getTime()) / DAY_MS)
    if (offset <= days) {
      const key = t(d)
      byDay.set(key, (byDay.get(key) ?? 0) + 1)
    }
  })
  const out: ReviewCalendarDay[] = []
  for (let offset = 0; offset <= days; offset++) {
    const d = new Date(now.getTime() + offset * DAY_MS)
    const key = t(d)
    out.push({ date: key, count: byDay.get(key) ?? 0 })
  }
  return out
}

// ─── Mensagens com base em dados reais ─────────────────────────────────────────────────

export function buildAnalysesAndRecommendations(input: {
  retention: number | null
  overdue: number
  dueToday: number
  newCount: number
  leech: number
  lapsed: number
  byDiscipline: { name: string; retention: number | null; due: number; total: number }[]
  byTopic: { topicName: string; disciplineName: string; retention: number | null; total: number }[]
  evolution: { retention: number | null }[]
  forecastToday: number
  mastered: number
  settings: ReviewSettings
}): { analyses: string[]; recommendations: string[] } {
  const analyses: string[] = []
  const recommendations: string[] = []

  if (input.retention !== null && input.dueToday + input.overdue > 0) {
    const good = input.retention >= 0.85
    analyses.push(
      good
        ? `Retenção geral de ${Math.round(input.retention * 100)}% — sua memória está saudável.`
        : `Retenção geral de ${Math.round(input.retention * 100)}% — abaixo da desejada (${Math.round(input.settings.desired_retention * 100)}%).`
    )
  }

  const weakDisciplines = input.byDiscipline.filter((d) => d.retention !== null && d.retention < 0.75)
  if (weakDisciplines.length > 0) {
    analyses.push(
      `Você está esquecendo com mais frequência: ${weakDisciplines.map((d) => d.name).slice(0, 3).join(", ")}.`
    )
  }

  const weakTopics = input.byTopic.filter((t) => t.retention !== null && t.retention < 0.7 && t.total >= 3)
  if (weakTopics.length > 0) {
    analyses.push(
      `Tópicos com pior retenção: ${weakTopics.map((t) => `${t.topicName} (${t.disciplineName})`).slice(0, 3).join(", ")}.`
    )
  }

  const recent = input.evolution
  if (recent.length >= 2) {
    const last = recent[recent.length - 1]?.retention ?? null
    const prev = recent[recent.length - 2]?.retention ?? null
    if (last !== null && prev !== null) {
      const delta = last - prev
      if (delta <= -0.05) analyses.push(`Sua retenção caiu ${Math.round(Math.abs(delta) * 100)} pontos percentuais na última semana.`)
      else if (delta >= 0.05) analyses.push(`Sua retenção subiu ${Math.round(delta * 100)} pontos percentuais na última semana.`)
    }
  }

  if (input.leech > 0) {
    analyses.push(`Você possui ${input.leech} cartão(ões) que erra repetidamente — considere reformulá-lo(s).`)
  }
  if (input.lapsed > 0) {
    analyses.push(`Há ${input.lapsed} item(ns) em estado de lapso aguardando revisão.`)
  }

  // Recomendações
  if (input.overdue > 0) {
    recommendations.push(`Você possui ${input.overdue} revisão(ões) atrasada(s). Comece por elas.`)
  } else if (input.dueToday > 0) {
    recommendations.push(`Faça ${input.dueToday} revisão(ões) de hoje para manter sua retenção.`)
  }

  const mostDue = [...input.byDiscipline].sort((a, b) => b.due - a.due)[0]
  if (mostDue && mostDue.due > 0) {
    recommendations.push(`Priorize ${mostDue.due} revisões de ${mostDue.name}.`)
  }

  const firstWeakTopic = weakTopics[0]
  if (firstWeakTopic && input.settings.reta_final) {
    recommendations.push(`Modo Reta Final ativo: foque em ${firstWeakTopic.topicName} (retenção ${Math.round((firstWeakTopic.retention ?? 0) * 100)}%).`)
  }

  if (input.forecastToday > Math.max(40, input.settings.max_reviews_per_day / 2)) {
    recommendations.push(`Carga alta hoje (${input.forecastToday} cartões). Evite adicionar muitos cartões novos.`)
  }

  if (input.newCount >= input.settings.new_cards_per_day) {
    recommendations.push(`Você atingiu o limite diário de novos cartões (${input.settings.new_cards_per_day}).`)
  }

  if (input.mastered > 0 && input.settings.desired_retention >= 0.92) {
    recommendations.push(`Retenção desejada alta (${Math.round(input.settings.desired_retention * 100)}%) aumenta a carga — considere 90%.`)
  }

  if (input.byDiscipline.length === 0 && input.dueToday === 0) {
    recommendations.push("Crie seu primeiro flashcard ou use 'Enviar para revisão' nos simulados para começar.")
  }

  return { analyses, recommendations }
}

export function retentionRate(results: { grade: number }[]): number | null {
  if (results.length === 0) return null
  const remembered = results.filter((r) => r.grade >= 2).length
  return remembered / results.length
}