/**
 * Transições puras de Play/Pause do cronômetro.
 *
 * Um clique precisa ter efeito uma única vez e ser idempotente: clicar em
 * Pausar quando já está pausado não muda nada (e não pode "despausar"),
 * clicar em Continuar quando já está rodando também não. Manter isso como
 * função pura (fora do React) garante que play/pause não dependa de o
 * componente ter re-renderizado com o estado mais novo — o updater do
 * `setSession` recebe sempre o estado corrente.
 */

import type { SessionTiming } from "./session-timing"

export type TimerPhase = "IDLE" | "STUDYING" | "PAUSED" | "SHORT_BREAK" | "LONG_BREAK"

export interface PausableSession extends SessionTiming {
  phase: TimerPhase
}

/** Pausar: só transiciona de STUDYING. Caso contrário devolve a MESMA referência. */
export function pauseAt<T extends PausableSession>(session: T, now: number): T {
  if (session.phase !== "STUDYING") return session
  return { ...session, phase: "PAUSED", lastPauseStartTime: now }
}

/**
 * Continuar: só transiciona de PAUSED e soma a duração da pausa ao total
 * (o período pausado nunca conta como estudo). Idempotente fora de PAUSED.
 */
export function resumeAt<T extends PausableSession>(session: T, now: number): T {
  if (session.phase !== "PAUSED") return session
  const pauseDuration =
    session.lastPauseStartTime !== null ? Math.max(0, now - session.lastPauseStartTime) : 0
  return {
    ...session,
    phase: "STUDYING",
    totalPausedMs: session.totalPausedMs + pauseDuration,
    lastPauseStartTime: null,
  }
}
