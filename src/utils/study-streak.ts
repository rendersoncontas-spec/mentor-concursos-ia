export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function computeStreak(days: Set<string>): number {
  if (days.size === 0) return 0
  let streak = 0
  const cursor = new Date()
  if (!days.has(localDateKey(cursor))) {
    // A sequência pode ter terminado ontem
    cursor.setDate(cursor.getDate() - 1)
  }
  while (days.has(localDateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}