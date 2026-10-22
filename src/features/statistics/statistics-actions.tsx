"use client"

import { createContext, useContext, useRef } from "react"
import type { ReactNode, RefObject } from "react"

import { getStatisticsCenterAction } from "@/application/study-analytics/statistics-center.action"

/**
 * G2.24 — fronteira da leitura da Central de Estatísticas (atualizar / tentar
 * novamente). Mesmo padrão de `features/history/history-actions.tsx`.
 *
 * Em produção NADA muda: o padrão do contexto é a própria Server Action. O
 * provider existe só para o harness E2E (`/e2e-harness/statistics`, que só vira
 * rota com NOMEIA_E2E_HARNESS=1) fornecer dados sintéticos — sem sessão falsa e
 * sem desligar a autenticação de nenhuma rota real.
 */
export interface StatisticsActions {
  getStatisticsCenterAction: typeof getStatisticsCenterAction
}

export const SERVER_STATISTICS_ACTIONS: StatisticsActions = { getStatisticsCenterAction }

const StatisticsActionsContext = createContext<StatisticsActions>(SERVER_STATISTICS_ACTIONS)

export function StatisticsActionsProvider({ actions, children }: { actions: StatisticsActions; children: ReactNode }) {
  return <StatisticsActionsContext.Provider value={actions}>{children}</StatisticsActionsContext.Provider>
}

/** Referência estável (capturada na montagem): `load` mantém a lista de dependências. */
export function useStatisticsActionsRef(): RefObject<StatisticsActions> {
  const actions = useContext(StatisticsActionsContext)
  return useRef(actions)
}
