/**
 * Fase F (performance) — renderização progressiva do Histórico.
 *
 * O Histórico carregava e desenhava TODAS as sessões de uma vez (≈2.800 linhas
 * no DOM, cada uma com ícones e botões). Os totais do topo continuam sendo
 * calculados sobre todas as sessões filtradas; só a LISTA passa a mostrar um
 * pedaço por vez, sempre com dias INTEIROS (o total de um dia nunca aparece
 * parcial) e na mesma ordem (dia mais recente primeiro).
 */

export const HISTORY_INITIAL_VISIBLE_SESSIONS = 150
export const HISTORY_VISIBLE_SESSIONS_STEP = 300

export interface DayGroupLike {
  activityCount: number
}

export interface VisibleDayGroups<G> {
  visible: G[]
  visibleSessionCount: number
  hiddenSessionCount: number
  hiddenDayCount: number
}

/**
 * Pega dias inteiros, em ordem, até atingir `sessionBudget` sessões. O dia que
 * cruza o limite entra inteiro. Sempre mostra ao menos o primeiro dia.
 */
export function selectVisibleDayGroups<G extends DayGroupLike>(
  groups: readonly G[],
  sessionBudget: number,
): VisibleDayGroups<G> {
  const visible: G[] = []
  let visibleSessionCount = 0
  for (const group of groups) {
    if (visible.length > 0 && visibleSessionCount >= sessionBudget) break
    visible.push(group)
    visibleSessionCount += group.activityCount
  }
  let totalSessions = 0
  for (const group of groups) totalSessions += group.activityCount
  return {
    visible,
    visibleSessionCount,
    hiddenSessionCount: totalSessions - visibleSessionCount,
    hiddenDayCount: groups.length - visible.length,
  }
}
