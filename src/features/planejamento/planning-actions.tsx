"use client"

import { createContext, useContext, useRef } from "react"
import type { ReactNode, RefObject } from "react"

import { getPeriodGoalAction, getReplanInfoAction } from "@/application/study-plan/replan/adaptive-replan.actions"
import { syncPlanningPreferencesFromServer } from "@/features/planejamento/lib/planning-prefs-sync"

/**
 * G2.24 — fronteira das LEITURAS do Planejamento (Dia, Semana, Mês, Metas).
 * Mesmo padrão de `features/history/history-actions.tsx` e
 * `features/simulados/simulados-actions.tsx`.
 *
 * Em produção NADA muda: o valor padrão do contexto são as próprias Server
 * Actions / o sync real. O provider existe só para o harness E2E
 * (`/e2e-harness/planning`, que só vira rota com NOMEIA_E2E_HARNESS=1) fornecer
 * dados sintéticos e determinísticos — sem sessão falsa e sem desligar a
 * autenticação de nenhuma rota real. As ações de ESCRITA (replanejar, fechar
 * bloco, remover plano…) continuam sendo as reais e não passam por aqui.
 */
export interface PlanningActions {
  getReplanInfoAction: typeof getReplanInfoAction
  getPeriodGoalAction: typeof getPeriodGoalAction
  syncPlanningPreferencesFromServer: typeof syncPlanningPreferencesFromServer
}

export const SERVER_PLANNING_ACTIONS: PlanningActions = {
  getReplanInfoAction,
  getPeriodGoalAction,
  syncPlanningPreferencesFromServer,
}

const PlanningActionsContext = createContext<PlanningActions>(SERVER_PLANNING_ACTIONS)

export function PlanningActionsProvider({ actions, children }: { actions: PlanningActions; children: ReactNode }) {
  return <PlanningActionsContext.Provider value={actions}>{children}</PlanningActionsContext.Provider>
}

/**
 * Referência ESTÁVEL às ações (capturada na montagem). Os efeitos das visões
 * leem `ref.current`, então as listas de dependências não mudam.
 */
export function usePlanningActionsRef(): RefObject<PlanningActions> {
  const actions = useContext(PlanningActionsContext)
  return useRef(actions)
}
