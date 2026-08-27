import { getDayInSaoPaulo, todayKeyInSaoPaulo } from "@/lib/sao-paulo"

export interface RawStudySessionLike {
  started_at?: string | null
  duration_minutes?: number | null
  [key: string]: unknown
}

export interface CalculatedStudyTimeSummary {
  dailyMinutes: number
  weeklyMinutes: number
  monthlyMinutes: number
  totalMinutes: number
  longestSession: number
  dailyTotals: Map<string, number>
  uniqueDaysStudied: Set<string>
}

export interface WeekRangeInfo {
  mondayKey: string
  sundayKey: string
  todayKey: string
  weekDays: string[]
}

/**
 * Retorna os limites da semana (definida pelo aluno via weekStartDay: 0 = Domingo, 1 = Segunda)
 * e chaves dos dias no fuso de São Paulo.
 * Ex.: para 27/08/2026 (Quinta):
 * - Se weekStartDay === 0 (Domingo): startKey: "2026-08-23", endKey: "2026-08-29"
 * - Se weekStartDay === 1 (Segunda): startKey: "2026-08-24", endKey: "2026-08-30"
 */
export function getSaoPauloWeekRange(
  referenceDate: string | Date = new Date(),
  weekStartDay: number = 0
): WeekRangeInfo {
  const todayKey =
    typeof referenceDate === "string" && referenceDate.length === 10
      ? referenceDate
      : getDayInSaoPaulo(referenceDate) || todayKeyInSaoPaulo()

  const [yStr, mStr, dStr] = todayKey.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const d = Number(dStr)

  // Meio-dia UTC evita saltos de horário de verão e timezone local
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const dayOfWeek = utcDate.getUTCDay() // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  const diffToStart = (dayOfWeek - weekStartDay + 7) % 7

  const startUtc = new Date(Date.UTC(y, m - 1, d - diffToStart, 12, 0, 0))
  const startKey = startUtc.toISOString().slice(0, 10)

  const endUtc = new Date(Date.UTC(y, m - 1, d - diffToStart + 6, 12, 0, 0))
  const endKey = endUtc.toISOString().slice(0, 10)

  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(Date.UTC(y, m - 1, d - diffToStart + i, 12, 0, 0))
    weekDays.push(dayUtc.toISOString().slice(0, 10))
  }

  return {
    mondayKey: startKey,
    sundayKey: endKey,
    todayKey,
    weekDays,
  }
}

/**
 * Função ÚNICA E CENTRALIZADA para cálculo do tempo de estudo real (Hoje, Semana, Mês, Total, Diário).
 * Garante que o card de Tempo de Estudo e o Calendário usem rigorosamente a mesma regra e fuso:
 * - Tempo planejado NUNCA entra no cálculo (apenas sessões reais com duration_minutes válido > 0).
 * - Fuso horário oficial: America/Sao_Paulo.
 * - Semana: Definida conforme a preferência de primeiro dia da semana do usuário (weekStartDay).
 */
export function computeStudyTimeFromHistory(
  history: RawStudySessionLike[],
  referenceDate: string | Date = new Date(),
  weekStartDay: number = 0
): CalculatedStudyTimeSummary {
  const { mondayKey: startKey, sundayKey: endKey, todayKey } = getSaoPauloWeekRange(
    referenceDate,
    weekStartDay
  )
  const currentMonthPrefix = todayKey.slice(0, 7) + "-"

  let dailyMinutes = 0
  let weeklyMinutes = 0
  let monthlyMinutes = 0
  let totalMinutes = 0
  let longestSession = 0

  const dailyTotals = new Map<string, number>()
  const uniqueDaysStudied = new Set<string>()

  for (const session of history) {
    if (!session || !session.started_at) continue
    const mins = Number(session.duration_minutes) || 0
    if (mins <= 0) continue

    const dateKey = getDayInSaoPaulo(session.started_at)
    if (!dateKey) continue

    totalMinutes += mins
    if (mins > longestSession) longestSession = mins

    // Total acumulado por dia (mesma estrutura usada pelo calendário)
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + mins)
    uniqueDaysStudied.add(dateKey)

    // Hoje
    if (dateKey === todayKey) {
      dailyMinutes += mins
    }

    // Semana atual (conforme weekStartDay configurado pelo usuário)
    if (dateKey >= startKey && dateKey <= endKey) {
      weeklyMinutes += mins
    }

    // Mês atual
    if (dateKey.startsWith(currentMonthPrefix)) {
      monthlyMinutes += mins
    }
  }

  return {
    dailyMinutes,
    weeklyMinutes,
    monthlyMinutes,
    totalMinutes,
    longestSession,
    dailyTotals,
    uniqueDaysStudied,
  }
}
