/**
 * G2.24 — estado de carregamento do calendário mensal do Histórico.
 *
 * Antes (G2.23) uma falha de leitura só gerava um toast e o calendário ficava
 * igual a "mês sem estudos". Aqui o erro é um ESTADO próprio:
 *
 *  - `loading`  → buscando o mês escolhido;
 *  - `ready`    → o servidor respondeu (a lista pode estar vazia: mês sem estudo);
 *  - `error`    → a leitura FALHOU (não é "sem registros"); o mês escolhido é
 *                 preservado e há "Tentar novamente".
 *
 * Respostas atrasadas (o aluno trocou de mês enquanto a anterior ainda voltava)
 * são descartadas pelo `RequestTracker`: só a última chamada pode alterar a tela.
 */

export type MonthlyLoadStatus = "idle" | "loading" | "ready" | "error"

export interface MonthlyLoadState {
  status: MonthlyLoadStatus
  /** Mês a que o estado se refere (o que o aluno escolheu, mesmo em erro). */
  year: number
  month: number
}

export type MonthlyLoadAction =
  | { type: "start"; year: number; month: number }
  | { type: "success"; year: number; month: number }
  | { type: "failure"; year: number; month: number }

export function initialMonthlyLoad(year: number, month: number): MonthlyLoadState {
  return { status: "idle", year, month }
}

export function monthlyLoadReducer(state: MonthlyLoadState, action: MonthlyLoadAction): MonthlyLoadState {
  switch (action.type) {
    case "start":
      return { status: "loading", year: action.year, month: action.month }
    case "success":
      return { status: "ready", year: action.year, month: action.month }
    case "failure":
      return { status: "error", year: action.year, month: action.month }
    default:
      return state
  }
}

/** Há erro vigente para ESTE mês? (um erro de outro mês não vale para o atual) */
export function hasMonthlyError(state: MonthlyLoadState, year: number, month: number): boolean {
  return state.status === "error" && state.year === year && state.month === month
}

/** Numera as chamadas; só a mais recente pode aplicar resultado. */
export interface RequestTracker {
  begin(): number
  isLatest(id: number): boolean
}

export function createRequestTracker(): RequestTracker {
  let current = 0
  return {
    begin() {
      current += 1
      return current
    },
    isLatest(id: number) {
      return id === current
    },
  }
}
