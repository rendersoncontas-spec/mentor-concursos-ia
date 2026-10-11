"use client"

import { createContext, useContext } from "react"
import type { ReactNode } from "react"

import {
  deleteSimuladoRecordAction,
  getSimuladoFormDisciplinesAction,
  getSimuladoRecordsAction,
  saveSimuladoRecordAction,
} from "@/application/simulados/simulado-records.actions"
import { getStudyPerformanceAction } from "@/application/simulados/study-performance.action"

/**
 * G2.21 — fronteira das Server Actions usadas pela tela de Simulados.
 *
 * Em produção NADA muda: o valor padrão do contexto são as próprias Server
 * Actions (mesmas funções, mesmas assinaturas, mesma autenticação no
 * servidor). O provider existe só para o harness E2E (`/e2e-harness/simulados`,
 * que só vira rota com NOMEIA_E2E_HARNESS=1) trocar o BANCO por um duplo em
 * memória e simular falhas — sem sessão falsa e sem desligar a autenticação de
 * nenhuma rota real.
 */
export interface SimuladosActions {
  getRecords: typeof getSimuladoRecordsAction
  deleteRecord: typeof deleteSimuladoRecordAction
  getFormDisciplines: typeof getSimuladoFormDisciplinesAction
  saveRecord: typeof saveSimuladoRecordAction
  getStudyPerformance: typeof getStudyPerformanceAction
}

export const SERVER_SIMULADOS_ACTIONS: SimuladosActions = {
  getRecords: getSimuladoRecordsAction,
  deleteRecord: deleteSimuladoRecordAction,
  getFormDisciplines: getSimuladoFormDisciplinesAction,
  saveRecord: saveSimuladoRecordAction,
  getStudyPerformance: getStudyPerformanceAction,
}

const SimuladosActionsContext = createContext<SimuladosActions>(SERVER_SIMULADOS_ACTIONS)

export function SimuladosActionsProvider({ actions, children }: { actions: SimuladosActions; children: ReactNode }) {
  return <SimuladosActionsContext.Provider value={actions}>{children}</SimuladosActionsContext.Provider>
}

export function useSimuladosActions(): SimuladosActions {
  return useContext(SimuladosActionsContext)
}
