/**
 * Fase H — regras de exibição dos widgets do Dashboard, extraídas para serem
 * testáveis. Todas partem só dos dados reais do snapshot; quando não há base
 * para um número, devolvem "—" em vez de um valor inventado (ex.: "0%").
 */

import type { HeatmapDay, TimeSeriesDataPoint } from "@/application/study-analytics/types"

const WEEKDAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"] as const

/** "12%" ou "—" quando não existe base para o percentual. */
export function percentOrDash(value: number | null | undefined, hasBase = true): string {
  if (!hasBase || value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value}%`
}

/**
 * Dia da semana (DOM…SÁB) de uma chave YYYY-MM-DD. Meio-dia UTC evita que o
 * fuso do navegador/servidor mude o dia.
 */
export function weekdayShortOf(dateKey: string): string {
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return ""
  return WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()] ?? ""
}

/**
 * Barras de "Distribuição diária": uma por ponto da série (os últimos 7 dias
 * corridos, do mais antigo para hoje), com o rótulo do dia REAL de cada ponto.
 * Antes os rótulos eram fixos DOM→SÁB e só batiam quando hoje era sábado.
 */
export function dailyBars(
  evolution: TimeSeriesDataPoint[] | null | undefined,
  scaleFloorMinutes = 120,
): Array<{ key: string; label: string; minutes: number; heightPct: number }> {
  const points = (evolution ?? []).slice(-7)
  const max = Math.max(scaleFloorMinutes, ...points.map((p) => p.value || 0))
  return points.map((p) => {
    const minutes = p.value || 0
    return {
      key: p.date,
      label: weekdayShortOf(p.date),
      minutes,
      heightPct: Math.min(100, Math.round((minutes / max) * 100)),
    }
  })
}

/**
 * "Registro diário" (Constância): um ponto por dia dos últimos 7, verde só se
 * houve estudo NAQUELE dia. Antes, `idx < streak` pintava de verde os dias mais
 * antigos da fileira conforme o tamanho da sequência.
 */
export function lastSevenDaysActivity(
  heatmap: HeatmapDay[] | null | undefined,
): Array<{ date: string; minutes: number; studied: boolean }> {
  const days = (heatmap ?? []).slice(-7)
  const padded = [
    ...Array.from({ length: Math.max(0, 7 - days.length) }, () => ({ date: "", minutes: 0 })),
    ...days.map((d) => ({ date: d.date, minutes: d.minutes || 0 })),
  ]
  return padded.map((d) => ({ ...d, studied: d.minutes > 0 }))
}

/** Marcos do widget "Conquistas & marcos", sobre o histórico inteiro. */
export function dashboardMilestones(input: {
  totalMinutes: number
  currentStreak: number
  totalQuestions: number
}): Array<{ title: string; desc: string; unlocked: boolean }> {
  return [
    { title: "Primeiro Estudo", desc: "Registrou o primeiro estudo", unlocked: input.totalMinutes > 0 },
    { title: "Consistência", desc: "Sequência atual de 3+ dias", unlocked: input.currentStreak >= 3 },
    { title: "Maratona", desc: "10+ horas estudadas no total", unlocked: input.totalMinutes >= 600 },
    { title: "Mestre", desc: "Respondeu 50+ questões", unlocked: input.totalQuestions >= 50 },
  ]
}
