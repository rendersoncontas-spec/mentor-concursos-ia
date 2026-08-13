const EXCEL_EPOCH_OFFSET_MS = (new Date(Date.UTC(1899, 11, 30)).getTime())

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed === "") return null
    const parsed = Number(trimmed.replace(",", "."))
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function parseExcelSerial(serial: number): Date | null {
  const date = new Date(EXCEL_EPOCH_OFFSET_MS + Math.round(serial * 86400000))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseDmy(input: string): Date | null {
  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(input.trim())
  if (!match) return null

  let day = Number(match[1])
  let month = Number(match[2])
  const yearRaw = match[3] ?? ""
  const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)

  if (month > 12 && day <= 12) {
    const temp = day
    day = month
    month = temp
  }
  if (day > 31 || month > 12 || day < 1 || month < 1) return null

  const hour = match[4] ? Number(match[4]) : 0
  const minute = match[5] ? Number(match[5]) : 0
  const second = match[6] ? Number(match[6]) : 0
  const date = new Date(year, month - 1, day, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseIso(input: string): Date | null {
  const trimmed = input.trim().replace(/^[«"'']+|[»"'']+$/g, "")
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T")
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Aceita: serial Excel, string ISO, "DD/MM/YYYY HH:mm", "DD-MM-YYYY",
 * "D/M/YYYY", datas decimais em texto. Retorna Date ou null.
 * Datas ambíguas (dia e mês <= 12) são interpretadas como dia/mês (padrão BR).
 */
export function parseStartAt(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === "number") {
    if (value > 20000 && value < 80000) return parseExcelSerial(value)
    return null
  }

  const text = String(value).trim()
  if (text === "") return null

  if (/^\d+([.,]\d+)?$/.test(text)) {
    const numeric = Number(text.replace(",", "."))
    if (numeric > 20000 && numeric < 80000) return parseExcelSerial(numeric)
    return null
  }

  const dmy = parseDmy(text)
  if (dmy) return dmy

  const iso = parseIso(text)
  if (iso) return iso

  return null
}

/**
 * Duração em segundos. Aceita:
 * - "4m 37s", "1h 25m 30s", "1h", "40m", "25m 9s", "1h25min30s"
 * - "01:25:32" (h:mm:ss), "04:37" (mm:ss)
 * - "1 hora e 25 minutos"
 * - número decimal de minutos (texto ou número) — ex.: 4.61785 -> 277s
 */
export function parseDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null
    const seconds = Math.round(value * 60)
    return seconds > 0 ? seconds : null
  }

  const text = String(value).trim().toLowerCase()
  if (text === "") return null

  const clock = /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/.exec(text)
  if (clock) {
    if (clock[3] !== undefined) {
      // 3 partes: h:mm:ss
      const hours = Number(clock[1])
      const minutes = Number(clock[2])
      const seconds = Number(clock[3])
      const total = hours * 3600 + minutes * 60 + seconds
      return total > 0 ? total : null
    }
    // 2 partes: mm:ss
    const minutes = Number(clock[1])
    const seconds = Number(clock[2])
    const total = minutes * 60 + seconds
    return total > 0 ? total : null
  }

  if (/^\d+([.,]\d+)?$/.test(text)) {
    const minutes = Number(text.replace(",", "."))
    if (minutes < 0 || !Number.isFinite(minutes)) return null
    return minutes === 0 ? null : Math.round(minutes * 60)
  }

  const tokens = /(?:(\d+(?:[.,]\d+)?)\s*(?:horas|hora|h|hs))?\s*(?:e\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:minutos|minuto|min|m|mins))?\s*(?:e\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:segundos|segundo|s|seg))?/.exec(text)
  if (tokens && (tokens[1] || tokens[2] || tokens[3])) {
    const hours = tokens[1] ? Number(tokens[1].replace(",", ".")) : 0
    const minutes = tokens[2] ? Number(tokens[2].replace(",", ".")) : 0
    const seconds = tokens[3] ? Number(tokens[3].replace(",", ".")) : 0
    const total = Math.round(hours * 3600 + minutes * 60 + seconds)
    return total > 0 ? total : null
  }

  const horaE = /^(\d+)[.,](\d+)\s*(?:h|horas?|hora)?\s*(?:e)?\s*(\d+)?\s*(?:min)?/.exec(text)
  if (horaE) {
    const total = Number(horaE[1]) * 3600 + Number(horaE[2]) * 600 + (horaE[3] ? Number(horaE[3]) * 60 : 0)
    return total > 0 ? total : null
  }

  return null
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

/** Contagem (questões/acertos): número ou primeiro número de uma string. */
export function parseCount(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const numeric = toNumber(value)
  if (numeric !== null) return Math.max(0, Math.round(numeric))

  const text = String(value).trim()
  if (text === "") return null
  const match = /\d+/.exec(text)
  return match ? Number(match[0]) : null
}

export function parseText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === "" ? null : text
}
