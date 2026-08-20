/**
 * Helpers de data/hora no fuso oficial do sistema: America/Sao_Paulo.
 * Evita que 23:30 UTC vire o dia seguinte (ou dia anterior) no agrupamento.
 */

const SAO_PAULO_TZ = "America/Sao_Paulo"

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function toDateInSaoPaulo(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  return date
}

/** Retorna "YYYY-MM-DD" no fuso de São Paulo. */
export function getDayInSaoPaulo(value: string | Date | null | undefined): string {
  const date = toDateInSaoPaulo(value)
  if (!date) return ""
  return dayFormatter.format(date)
}

/** Retorna a data de hoje ("YYYY-MM-DD") no fuso de São Paulo. */
export function todayKeyInSaoPaulo(): string {
  return dayFormatter.format(new Date())
}

/** Retorna "HH:mm" no fuso de São Paulo. */
export function getTimeInSaoPaulo(value: string | Date | null | undefined): string {
  const date = toDateInSaoPaulo(value)
  if (!date) return ""
  return timeFormatter.format(date).replace("24:", "00:")
}

/** Retorna o horário atual "HH:mm" no fuso de São Paulo. */
export function currentTimeInSaoPaulo(): string {
  return timeFormatter.format(new Date()).replace("24:", "00:")
}

/** Formata "YYYY-MM-DD" como "DD/MM/YYYY". */
export function formatDayLabel(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-")
  if (!y || !m || !d) return yyyyMmDd
  return `${d}/${m}/${y}`
}

/** Formata um timestamp ISO direto como "DD/MM/YYYY" no fuso de São Paulo. */
export function formatStudyDateInSaoPaulo(value: string | Date | null | undefined): string {
  const day = getDayInSaoPaulo(value)
  return day ? formatDayLabel(day) : ""
}

/**
 * Converte data "YYYY-MM-DD" e hora "HH:mm" no fuso de São Paulo (UTC-3) para ISO string UTC.
 * Se a hora não for informada, usa o horário atual de São Paulo.
 */
export function buildIsoFromSaoPauloDateTime(
  dateStr?: string | null,
  timeStr?: string | null,
): string {
  const d = dateStr?.trim() || todayKeyInSaoPaulo()
  let t = timeStr?.trim()
  if (!t) {
    t = currentTimeInSaoPaulo()
  }
  const timeWithSec = t.length === 5 ? `${t}:00` : t.length === 8 ? t : `${t}:00`
  const dateObj = new Date(`${d}T${timeWithSec}-03:00`)
  if (isNaN(dateObj.getTime())) {
    return new Date().toISOString()
  }
  return dateObj.toISOString()
}
