// ATENÇÃO (Fase 5 da auditoria de estabilização — timezone):
// getDaysAgoDate, getStartOfWeek e getStartOfMonth abaixo usam accessors de
// Date no fuso LOCAL DO RUNTIME (process.env.TZ / padrão do host, que em
// produção é UTC), não no fuso de negócio (America/Sao_Paulo). Usá-los para
// bucketing de "dia de calendário" ou limites de hoje/semana/mês causa um
// desvio de ~3h na virada do dia (ver src/lib/sao-paulo.ts:
// daysAgoKeyInSaoPaulo, startOfDayInSaoPauloMs, e
// src/lib/study-time-calculator.ts: getSaoPauloWeekRange, que são as
// substituições corretas e já usadas em evolution.ts, heatmap.ts,
// dashboard.service.ts e aggregations.ts). Mantidas aqui apenas porque não
// há mais nenhum chamador ativo em src/ nesta sessão (removido o único uso
// de cada uma) — não usar em código novo.
export function getDaysAgoDate(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

// formatDateToYYYYMMDD continua em uso ativo em aggregations.ts, mas apenas
// em um padrão "round-trip" auto-consistente (constrói e lê um Date com os
// MESMOS accessors locais, só para aritmética de calendário sobre uma chave
// YYYY-MM-DD já correta) — isso é seguro em qualquer fuso do runtime. Não
// usar para converter um timestamp real (ex.: session.started_at) em chave
// de dia: para isso, usar getDayInSaoPaulo de src/lib/sao-paulo.ts.
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
