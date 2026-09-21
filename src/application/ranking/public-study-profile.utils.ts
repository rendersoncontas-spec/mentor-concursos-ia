import { getDayInSaoPaulo, daysAgoKeyInSaoPaulo } from "@/lib/sao-paulo"

export function formatMinutesToHours(minutes: number): string {
  if (minutes <= 0) return "0min"
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

export function computeInitials(name: string): string {
  if (!name) return "ES"
  const clean = name.replace(/\s*\(você\)\s*$/i, "").trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase()
  }
  if (clean.length >= 2) {
    return clean.slice(0, 2).toUpperCase()
  }
  return clean.toUpperCase() || "ES"
}

export function computeBgColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % 6
  const colors = [
    "bg-blue-600",
    "bg-emerald-600",
    "bg-purple-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-indigo-600",
  ]
  return colors[idx] || "bg-blue-600"
}

// Fase 5 da auditoria (timezone): getRelativeDateLabel e computeStreaksFromDates
// abaixo comparavam dia/mês/ano com accessors de Date no fuso LOCAL DO
// RUNTIME (UTC em produção), não no fuso de negócio (America/Sao_Paulo) —
// o mesmo desvio de ~3h na virada do dia já corrigido em
// study-analytics/evolution.ts, heatmap.ts, dashboard.service.ts,
// aggregations.ts (streak) e utils/study-streak.ts (achievements). Como
// este é o perfil PÚBLICO de estudo (visível a outros usuários no ranking),
// o rótulo "Hoje"/"Ontem" e o streak exibidos podiam ficar incorretos por
// até ~3h por dia. Corrigido para usar os mesmos helpers de fuso de São
// Paulo já usados no resto do projeto. Os parâmetros `todayKey` são
// opcionais (chave "YYYY-MM-DD" já resolvida em SP) e permitem testar de
// forma determinística sem depender do relógio real do sistema.
export function getRelativeDateLabel(
  dateString: string,
  todayKey: string = daysAgoKeyInSaoPaulo(0),
): string {
  try {
    const dayKey = getDayInSaoPaulo(dateString)
    if (!dayKey) return "Recente"

    if (dayKey === todayKey) return "Hoje"

    const yesterdayKey = daysAgoKeyInSaoPaulo(1, todayKey)
    if (dayKey === yesterdayKey) return "Ontem"

    const [, m, d] = dayKey.split("-")
    return `${d}/${m}`
  } catch {
    return "Recente"
  }
}

export function computeStreaksFromDates(
  dateStrings: string[],
  todayKey: string = daysAgoKeyInSaoPaulo(0),
): {
  currentStreak: number
  longestStreak: number
} {
  if (dateStrings.length === 0) return { currentStreak: 0, longestStreak: 0 }

  // Extrai dias únicos (chave "YYYY-MM-DD" no fuso de São Paulo) em ordem
  // decrescente (mais recente primeiro).
  const uniqueDays = Array.from(
    new Set(dateStrings.map((ds) => getDayInSaoPaulo(ds)).filter((key) => key.length > 0)),
  )
    .sort()
    .reverse()

  if (uniqueDays.length === 0) return { currentStreak: 0, longestStreak: 0 }

  const todayStr = todayKey
  const yesterdayStr = daysAgoKeyInSaoPaulo(1, todayStr)

  // Calcula Sequência Atual
  let currentStreak = 0
  const firstDay = uniqueDays[0]
  if (firstDay === todayStr || firstDay === yesterdayStr) {
    let expectedKey = firstDay
    for (const dayStr of uniqueDays) {
      if (dayStr === expectedKey) {
        currentStreak++
        expectedKey = daysAgoKeyInSaoPaulo(1, expectedKey)
      } else if (dayStr < expectedKey) {
        // Já passamos do dia esperado sem encontrar correspondência: lacuna.
        break
      }
    }
  }

  // Calcula Maior Sequência (a direção da varredura não importa para o
  // comprimento máximo de uma sequência de dias consecutivos).
  let longestStreak = 0
  let tempStreak = 0
  let prevKey: string | null = null

  for (const dayStr of uniqueDays) {
    if (!prevKey) {
      tempStreak = 1
    } else {
      const expectedPrev = daysAgoKeyInSaoPaulo(1, prevKey)
      if (dayStr === expectedPrev) {
        tempStreak++
      } else {
        tempStreak = 1
      }
    }
    prevKey = dayStr
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
  }
}
