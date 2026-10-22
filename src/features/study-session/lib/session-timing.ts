/**
 * Cálculos de tempo do cronômetro de estudo — fonte ÚNICA (sem React/DOM).
 *
 * Extraído do StudyProvider para permitir teste comportamental direto
 * (o provider importa a Server Action real e não pode ser importado pela
 * suíte node:test). Nenhum contador paralelo: o tempo continua sendo
 * derivado dos timestamps reais da sessão (startTime/pausas).
 */

/** Campos de tempo comuns à sessão em memória e ao snapshot do IndexedDB. */
export interface SessionTiming {
  startTime: number | null
  totalPausedMs: number
  lastPauseStartTime: number | null
}

/**
 * Total de milissegundos em pausa até `now`, incluindo a pausa em andamento
 * (se houver).
 */
export function totalPausedMsAt(state: SessionTiming, now: number): number {
  let pausedMs = state.totalPausedMs
  if (state.lastPauseStartTime !== null) {
    pausedMs += Math.max(0, now - state.lastPauseStartTime)
  }
  return pausedMs
}

/**
 * Tempo ativo/pausado (em segundos) derivado dos timestamps reais.
 * `now` é injetável para testes; em produção o default é o relógio atual.
 */
export function calculateTimes(
  state: SessionTiming,
  now: number = Date.now(),
): { activeSeconds: number; pausedSeconds: number } {
  if (!state.startTime) return { activeSeconds: 0, pausedSeconds: 0 }
  const pausedMs = totalPausedMsAt(state, now)
  const activeMs = Math.max(0, now - state.startTime - pausedMs)
  return {
    activeSeconds: Math.floor(activeMs / 1000),
    pausedSeconds: Math.floor(pausedMs / 1000),
  }
}

/**
 * FONTE ÚNICA DE VERDADE do tempo ativo da sessão (em segundos).
 * Usado pelo cronômetro visual, widget flutuante, título da guia e salvamento.
 * Calculado sempre a partir de timestamps reais (Date.now()):
 *   elapsed = now - startTime - totalPaused - pausaAtual
 * Nunca incrementa por +1.
 */
export function getActiveElapsedSeconds(
  state: SessionTiming,
  now: number = Date.now(),
): number {
  if (!state.startTime) return 0
  return Math.max(0, Math.floor((now - state.startTime - totalPausedMsAt(state, now)) / 1000))
}
