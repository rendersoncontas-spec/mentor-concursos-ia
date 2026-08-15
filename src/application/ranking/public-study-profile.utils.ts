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

export function getRelativeDateLabel(dateString: string): string {
  try {
    const d = new Date(dateString)
    const now = new Date()

    // Compara dia/mês/ano local
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()

    if (isToday) return "Hoje"

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()

    if (isYesterday) return "Ontem"

    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  } catch {
    return "Recente"
  }
}

export function computeStreaksFromDates(dateStrings: string[]): {
  currentStreak: number
  longestStreak: number
} {
  if (dateStrings.length === 0) return { currentStreak: 0, longestStreak: 0 }

  // Extrai datas únicas formatadas YYYY-MM-DD em ordem decrescente
  const uniqueDays = Array.from(
    new Set(
      dateStrings.map((ds) => {
        const d = new Date(ds)
        const pad = (n: number) => String(n).padStart(2, "0")
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      }),
    ),
  )
    .sort()
    .reverse()

  if (uniqueDays.length === 0) return { currentStreak: 0, longestStreak: 0 }

  const todayStr = (() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })()

  const yesterdayStr = (() => {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`
  })()

  // Calcula Sequência Atual
  let currentStreak = 0
  const firstDay = uniqueDays[0]
  if (firstDay === todayStr || firstDay === yesterdayStr) {
    const expectedDate = new Date(firstDay === todayStr ? todayStr : yesterdayStr)
    for (const dayStr of uniqueDays) {
      const dayDate = new Date(dayStr)
      const diffDays = Math.round(
        (expectedDate.getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24),
      )
      if (diffDays === 0) {
        currentStreak++
        expectedDate.setDate(expectedDate.getDate() - 1)
      } else if (diffDays > 0) {
        break
      }
    }
  }

  // Calcula Maior Sequência
  let longestStreak = 0
  let tempStreak = 0
  let prevDate: Date | null = null

  // Processa do mais antigo para o mais recente
  const chronological = [...uniqueDays].reverse()
  for (const dayStr of chronological) {
    const dayDate = new Date(dayStr)
    if (!prevDate) {
      tempStreak = 1
    } else {
      const diffDays = Math.round((dayDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays === 1) {
        tempStreak++
      } else if (diffDays > 1) {
        tempStreak = 1
      }
    }
    prevDate = dayDate
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
  }
}
