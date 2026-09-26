// ============================================================================
// Regras puras da fila de revisões — sem I/O, determinísticas e testáveis.
//
// Ordem da fila (Fase I.1): 1) atrasadas  2) vencidas hoje  3) novas.
// Dentro do mesmo grupo: vencimento mais antigo primeiro e, em empate, o id
// (ordem estável, sem peso ou prioridade inventada).
// ============================================================================

import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import type { ReviewBucket, ReviewItemView, ReviewRetention } from "@/domain/reviews/models"

/**
 * Onde o item cai, comparando DIAS no fuso de São Paulo (um item que vence
 * hoje às 23h já conta como "de hoje", como em qualquer sistema de repetição
 * espaçada, que trabalha em dias).
 */
export function reviewBucketOf(dueAt: string, reps: number, todayKey: string): ReviewBucket {
  const dueKey = getDayInSaoPaulo(dueAt)
  if (!dueKey) return "UPCOMING"
  if (dueKey < todayKey) return "OVERDUE"
  if (dueKey > todayKey) return "UPCOMING"
  return reps > 0 ? "TODAY" : "NEW"
}

const BUCKET_ORDER: Record<ReviewBucket, number> = { OVERDUE: 0, TODAY: 1, NEW: 2, UPCOMING: 3 }

/** Ordena a fila: grupo → vencimento mais antigo → id. Não muda a lista original. */
export function orderReviewQueue<T extends { id: string; dueAt: string; reps: number }>(
  items: T[],
  todayKey: string,
): T[] {
  return [...items].sort((a, b) => {
    const bucketDiff =
      BUCKET_ORDER[reviewBucketOf(a.dueAt, a.reps, todayKey)] -
      BUCKET_ORDER[reviewBucketOf(b.dueAt, b.reps, todayKey)]
    if (bucketDiff !== 0) return bucketDiff
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
}

/** Itens que o aluno pode revisar agora (vencem hoje ou antes). */
export function isDueNow(item: { dueAt: string; reps: number }, todayKey: string): boolean {
  return reviewBucketOf(item.dueAt, item.reps, todayKey) !== "UPCOMING"
}

/**
 * Texto do intervalo previsto, a partir da distância real entre agora e o
 * vencimento calculado pelo agendador (nunca de uma escada fixa).
 */
export function formatDueDistance(dueAt: string, nowIso: string): string {
  const minutes = Math.round((new Date(dueAt).getTime() - new Date(nowIso).getTime()) / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60)
    return `${hours} h`
  }
  const days = Math.round(minutes / (60 * 24))
  if (days < 30) return `${days} ${days === 1 ? "dia" : "dias"}`
  if (days < 365) {
    const months = Math.round(days / 30)
    return `${months} ${months === 1 ? "mês" : "meses"}`
  }
  const years = Math.round(days / 365)
  return `${years} ${years === 1 ? "ano" : "anos"}`
}

/** Retenção medida: notas ≥ 2 ("lembrei") ÷ respostas. `null` sem respostas. */
export function retentionFromGrades(grades: number[]): ReviewRetention {
  if (grades.length === 0) return { rate: null, answered: 0 }
  const remembered = grades.filter((g) => g >= 2).length
  return { rate: Math.round((remembered / grades.length) * 100) / 100, answered: grades.length }
}

/** Rótulo do item numa lista: subtópico mostra o tópico pai. */
export function reviewItemLabel(item: Pick<ReviewItemView, "title" | "parentTitle">): string {
  return item.parentTitle ? `${item.parentTitle} › ${item.title}` : item.title
}
