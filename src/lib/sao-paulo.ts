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
 * Desloca uma chave "YYYY-MM-DD" por N dias (aceita negativo), sem depender
 * do fuso horário do runtime: usa meio-dia UTC como truque seguro de
 * aritmética de calendário (mesmo padrão usado em getSaoPauloWeekRange, em
 * src/lib/study-time-calculator.ts). Meio-dia evita qualquer ambiguidade de
 * borda de dia ao somar/subtrair.
 */
function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [yStr, mStr, dStr] = dateKey.split("-")
  const y = Number(yStr)
  const m = Number(mStr) || 1
  const d = Number(dStr) || 1
  const utcNoon = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0))
  return utcNoon.toISOString().slice(0, 10)
}

/**
 * Retorna a chave "YYYY-MM-DD" de N dias atrás (ou à frente, se negativo) a
 * partir de uma data de referência já resolvida no fuso de São Paulo (por
 * padrão, hoje em SP). Fase 5 da auditoria: substitui o antigo padrão
 * `getDaysAgoDate` + `formatDateToYYYYMMDD` de study-analytics/utils.ts, que
 * operava no fuso local do runtime (UTC em produção) e não no fuso de
 * São Paulo, causando um desvio de até ~3h na virada do dia.
 */
export function daysAgoKeyInSaoPaulo(
  daysAgo: number,
  referenceDateKey: string = todayKeyInSaoPaulo(),
): string {
  return shiftDateKey(referenceDateKey, -daysAgo)
}

/**
 * Retorna o timestamp (ms) do início do dia (00:00 em São Paulo) para uma
 * chave "YYYY-MM-DD". Por padrão, início do dia de hoje em SP.
 */
export function startOfDayInSaoPauloMs(dateKey: string = todayKeyInSaoPaulo()): number {
  return new Date(buildIsoFromSaoPauloDateTime(dateKey, "00:00")).getTime()
}

/**
 * Fase 5 da auditoria (timezone — ranking): fim do dia de calendário em São
 * Paulo (23:59:59.999 local), em milissegundos UTC. Útil para filtros
 * `lte`/`<` por instante que precisam do limite superior inclusive de um
 * dia (ex.: "última segunda-feira até domingo" no ranking).
 */
export function endOfDayInSaoPauloMs(dateKey: string = todayKeyInSaoPaulo()): number {
  const nextDayKey = daysAgoKeyInSaoPaulo(-1, dateKey)
  return startOfDayInSaoPauloMs(nextDayKey) - 1
}

/**
 * Fase 5 da auditoria (timezone — contagem regressiva de prova): diferença
 * em dias de calendário entre duas chaves "YYYY-MM-DD" (contagem de "dias
 * restantes para a prova" etc.), sem depender de nenhum fuso horário local.
 * Usa meio-dia UTC para cada data (mesmo truque de `shiftDateKey` acima),
 * o que evita qualquer ambiguidade de DST/fuso — o resultado é sempre um
 * inteiro exato de dias entre as duas datas de calendário.
 */
export function daysBetweenSaoPauloDateKeys(fromKey: string, toKey: string): number {
  const parse = (key: string): number => {
    const [yStr, mStr, dStr] = key.split("-")
    const y = Number(yStr)
    const m = Number(mStr) || 1
    const d = Number(dStr) || 1
    return Date.UTC(y, m - 1, d, 12, 0, 0)
  }
  return Math.round((parse(toKey) - parse(fromKey)) / 86400000)
}

/**
 * Retorna o dia da semana (0 = domingo … 6 = sábado) de uma chave
 * "YYYY-MM-DD", sem depender do fuso horário do runtime (mesmo truque de
 * meio-dia UTC usado internamente em shiftDateKey / getSaoPauloWeekRange,
 * em src/lib/study-time-calculator.ts).
 */
export function dayOfWeekForDateKey(dateKey: string): number {
  const [yStr, mStr, dStr] = dateKey.split("-")
  const y = Number(yStr)
  const m = Number(mStr) || 1
  const d = Number(dStr) || 1
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
}

/** Retorna a hora (0-23) de um timestamp no fuso de São Paulo. */
export function getHourInSaoPaulo(value: string | Date | null | undefined): number {
  const time = getTimeInSaoPaulo(value)
  if (!time) return NaN
  return Number(time.split(":")[0])
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
  let timeWithSec: string
  if (t.length === 8) {
    timeWithSec = t
  } else {
    timeWithSec = `${t}:00`
  }
  const dateObj = new Date(`${d}T${timeWithSec}-03:00`)
  if (isNaN(dateObj.getTime())) {
    return new Date().toISOString()
  }
  return dateObj.toISOString()
}
