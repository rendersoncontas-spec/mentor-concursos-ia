"use client"

import { createContext, useContext, useRef } from "react"
import type { ReactNode, RefObject } from "react"

import {
  addCustomDisciplineAction,
  removeCustomTopicAction,
  removeDisciplineAction,
  saveCustomTopicsAction,
  searchDisciplinesAction,
} from "@/application/edital/edital.action"
import {
  deleteEditalTopicProgressAction,
  getEditalTopicProgressAction,
  importEditalTopicProgressAction,
  setEditalTopicProgressAction,
} from "@/application/edital/edital-topic-progress.actions"
import { createCustomTopicAction } from "@/application/topic-catalog/topic-catalog.actions"

/**
 * G2.24 — fronteira das Server Actions usadas pelo Edital verticalizado
 * (progresso por tópico, disciplinas e tópicos personalizados). Mesmo padrão de
 * `features/history/history-actions.tsx`.
 *
 * Em produção NADA muda: o padrão do contexto são as próprias Server Actions. O
 * provider existe só para o harness E2E (`/e2e-harness/edital`, que só vira rota
 * com NOMEIA_E2E_HARNESS=1) fornecer dados sintéticos — sem sessão falsa e sem
 * desligar a autenticação de nenhuma rota real.
 */
export interface EditalActions {
  addCustomDisciplineAction: typeof addCustomDisciplineAction
  removeCustomTopicAction: typeof removeCustomTopicAction
  removeDisciplineAction: typeof removeDisciplineAction
  saveCustomTopicsAction: typeof saveCustomTopicsAction
  searchDisciplinesAction: typeof searchDisciplinesAction
  deleteEditalTopicProgressAction: typeof deleteEditalTopicProgressAction
  getEditalTopicProgressAction: typeof getEditalTopicProgressAction
  importEditalTopicProgressAction: typeof importEditalTopicProgressAction
  setEditalTopicProgressAction: typeof setEditalTopicProgressAction
  createCustomTopicAction: typeof createCustomTopicAction
}

export const SERVER_EDITAL_ACTIONS: EditalActions = {
  addCustomDisciplineAction,
  removeCustomTopicAction,
  removeDisciplineAction,
  saveCustomTopicsAction,
  searchDisciplinesAction,
  deleteEditalTopicProgressAction,
  getEditalTopicProgressAction,
  importEditalTopicProgressAction,
  setEditalTopicProgressAction,
  createCustomTopicAction,
}

const EditalActionsContext = createContext<EditalActions>(SERVER_EDITAL_ACTIONS)

export function EditalActionsProvider({ actions, children }: { actions: EditalActions; children: ReactNode }) {
  return <EditalActionsContext.Provider value={actions}>{children}</EditalActionsContext.Provider>
}

/** Referência estável (capturada na montagem): os efeitos mantêm suas listas de dependências. */
export function useEditalActionsRef(): RefObject<EditalActions> {
  const actions = useContext(EditalActionsContext)
  return useRef(actions)
}
