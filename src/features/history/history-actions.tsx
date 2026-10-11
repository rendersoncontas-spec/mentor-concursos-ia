"use client"

import { createContext, useContext } from "react"
import type { ReactNode } from "react"

import {
  deleteStudySessionAction,
  getHistoryListAction,
  getHistorySessionForEditAction,
  getMonthlyHistoryAction,
} from "@/application/study-history/study-history.actions"

/**
 * G2.23 — fronteira das Server Actions usadas pela tela de Histórico (mesmo
 * padrão de `features/simulados/simulados-actions.tsx`).
 *
 * Em produção NADA muda: o valor padrão do contexto são as próprias Server
 * Actions. O provider existe só para o harness E2E (`/e2e-harness/history`,
 * que só vira rota com NOMEIA_E2E_HARNESS=1) fornecer dados sintéticos — sem
 * sessão falsa e sem desligar a autenticação de nenhuma rota real.
 */
export interface HistoryActions {
  getList: typeof getHistoryListAction
  getMonthly: typeof getMonthlyHistoryAction
  getSessionForEdit: typeof getHistorySessionForEditAction
  deleteSession: typeof deleteStudySessionAction
}

export const SERVER_HISTORY_ACTIONS: HistoryActions = {
  getList: getHistoryListAction,
  getMonthly: getMonthlyHistoryAction,
  getSessionForEdit: getHistorySessionForEditAction,
  deleteSession: deleteStudySessionAction,
}

const HistoryActionsContext = createContext<HistoryActions>(SERVER_HISTORY_ACTIONS)

export function HistoryActionsProvider({ actions, children }: { actions: HistoryActions; children: ReactNode }) {
  return <HistoryActionsContext.Provider value={actions}>{children}</HistoryActionsContext.Provider>
}

export function useHistoryActions(): HistoryActions {
  return useContext(HistoryActionsContext)
}
