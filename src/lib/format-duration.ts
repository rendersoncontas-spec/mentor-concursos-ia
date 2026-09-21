/**
 * Formatação central de durações para toda a UI do NomeIA.
 *
 * Regra: a unidade interna de uma duração é sempre SEGUNDOS. Nunca converter
 * segundos em minutos fracionários e interpolar o número float direto em
 * texto (ex.: "54.866666666666674min") — sempre decompor em horas/minutos/
 * segundos inteiros via divisão e resto antes de formatar.
 *
 * Esta é a ÚNICA fonte de formatação de duração do projeto: qualquer
 * componente que precise exibir uma duração (ciclos, dashboard, histórico,
 * calendário, etc.) deve importar formatDuration/formatDurationMinutes
 * daqui, em vez de reimplementar a própria lógica de horas/minutos/segundos.
 */

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`
}

/**
 * Formata uma duração em SEGUNDOS como texto compacto, sem casas decimais.
 *
 * Exemplos: 0 → "0min"; 45 → "45s"; 60 → "1m"; 90 → "1m30s"; 600 → "10m";
 * 3600 → "1h"; 3660 → "1h01m"; 5400 → "1h30m"; 21293 → "5h54m53s".
 */
export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))

  if (total === 0) return "0min"
  if (total < 60) return `${total}s`

  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  if (hours === 0) {
    return seconds > 0 ? `${minutes}m${pad2(seconds)}s` : `${minutes}m`
  }

  if (minutes === 0 && seconds === 0) return `${hours}h`

  const hoursAndMinutes = `${hours}h${pad2(minutes)}m`
  return seconds > 0 ? `${hoursAndMinutes}${pad2(seconds)}s` : hoursAndMinutes
}

/**
 * Variante para valores em MINUTOS (podem vir fracionários, ex.:
 * 234.8666666666667 min derivado de segundos/60). Arredonda para o minuto
 * mais próximo antes de formatar — por isso nunca mostra segundos. Usada em
 * resumos onde precisão de segundos não agrega (Tempo/volta, Restam,
 * cumpridos, extra, Faltam, metas em minutos).
 *
 * Quando a precisão de segundos importa (histórico, sessões, extra por
 * matéria), converta para segundos no chamador e use formatDuration
 * diretamente, em vez desta função.
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const roundedMinutes = Math.max(0, Math.round(totalMinutes))
  return formatDuration(roundedMinutes * 60)
}

/**
 * Formata uma duração em SEGUNDOS como relógio digital: "mm:ss", ou
 * "hh:mm:ss" quando há pelo menos 1 hora completa. Usada no timer ao vivo
 * da sessão de estudo (StudyDock, StudyHeaderControl) — extraída de duas
 * implementações locais idênticas para eliminar a duplicação (Fase 4 da
 * auditoria de estabilização). Comportamento preservado byte a byte em
 * relação às implementações originais (nenhum clamp/round adicional).
 *
 * Exemplos: 5 → "00:05"; 90 → "01:30"; 3600 → "01:00:00"; 3661 → "01:01:01".
 */
export function formatTimerClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * Formata uma duração em MINUTOS como "Xh Ymin" / "Xh" / "Ymin" — extraída
 * de duas implementações locais idênticas, uma em study-plan/page.tsx e
 * outra em study-plan-week.tsx (Fase 4 da auditoria de estabilização).
 * Comportamento preservado byte a byte em relação às implementações
 * originais. NÃO é a mesma convenção de formatDurationMinutes acima (essa
 * usa espaço antes de "min" e não faz padding do minuto) — mantida como
 * função separada de propósito para não alterar a apresentação visual
 * dessas duas telas.
 *
 * Exemplos: 0 → "0min"; 45 → "45min"; 60 → "1h"; 90 → "1h 30min".
 */
export function formatPlanMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
