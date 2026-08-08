export function getDaysAgoDate(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getStartOfWeek(date: Date = new Date(), weekStartDay: number = 1): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diffToStart = (day - weekStartDay + 7) % 7
  const diff = d.getDate() - diffToStart
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getStartOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
