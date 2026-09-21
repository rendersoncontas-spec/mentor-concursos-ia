import { getDayInSaoPaulo, daysAgoKeyInSaoPaulo } from "@/lib/sao-paulo"

/**
 * Fase 5 da auditoria de estabilização (timezone): localDateKey usava
 * accessors de Date no fuso LOCAL DO RUNTIME (UTC em produção) para
 * converter um timestamp em "dia de calendário", divergindo do fuso de
 * negócio (America/Sao_Paulo) por até ~3h na virada do dia — uma sessão
 * estudada às 22h em São Paulo (01h UTC do dia seguinte) era contada no dia
 * seguinte, tanto aqui (achievements, hub de inteligência do mentor-ai)
 * quanto nas classificações de morningSessions/afternoonSessions/
 * nightSessions em achievements.action.ts (que usam date.getHours() — ver
 * observação no relatório final; não alterado nesta fase por não ter uma
 * chave de fuso "correta" única, apenas o horário, e por não ter sido
 * possível reproduzir um caso de quebra visível ao usuário além do desvio
 * teórico). Corrigido aqui para delegar ao helper canônico de fuso de São
 * Paulo, já usado em study-analytics/evolution.ts, heatmap.ts e
 * dashboard.service.ts.
 */
export function localDateKey(d: Date): string {
  return getDayInSaoPaulo(d)
}

/**
 * Calcula a sequência (streak) de dias consecutivos com estudo, terminando
 * hoje ou ontem (fuso de São Paulo). `todayKey` é opcional (chave
 * "YYYY-MM-DD" já resolvida em SP) e permite testar de forma determinística
 * sem depender do relógio real do sistema.
 */
export function computeStreak(
  days: Set<string>,
  todayKey: string = daysAgoKeyInSaoPaulo(0),
): number {
  if (days.size === 0) return 0
  let streak = 0
  let cursorKey = todayKey
  if (!days.has(cursorKey)) {
    // A sequência pode ter terminado ontem
    cursorKey = daysAgoKeyInSaoPaulo(1, cursorKey)
  }
  while (days.has(cursorKey)) {
    streak += 1
    cursorKey = daysAgoKeyInSaoPaulo(1, cursorKey)
  }
  return streak
}
