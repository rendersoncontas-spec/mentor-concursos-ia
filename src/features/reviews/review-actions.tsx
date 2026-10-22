"use client"

import { createContext, useContext, useRef } from "react"
import type { ReactNode, RefObject } from "react"

import {
  addTopicToReviewAction,
  answerReviewCardAction,
  finalizeReviewSessionAction,
  getActiveReviewSessionAction,
  getReviewCatalogAction,
  getReviewsOverviewAction,
  setReviewItemFlagAction,
  startReviewSessionAction,
} from "@/application/review-engine/review.actions"

/**
 * G2.24 — fronteira das Server Actions usadas pela tela de Revisões (lista,
 * sessão de revisão e "Adicionar tópico"). Mesmo padrão de
 * `features/history/history-actions.tsx`.
 *
 * Em produção NADA muda: o padrão do contexto são as próprias Server Actions. O
 * provider existe só para o harness E2E (`/e2e-harness/reviews`, que só vira
 * rota com NOMEIA_E2E_HARNESS=1) fornecer dados sintéticos — sem sessão falsa e
 * sem desligar a autenticação de nenhuma rota real.
 */
export interface ReviewActions {
  getReviewsOverviewAction: typeof getReviewsOverviewAction
  setReviewItemFlagAction: typeof setReviewItemFlagAction
  startReviewSessionAction: typeof startReviewSessionAction
  getActiveReviewSessionAction: typeof getActiveReviewSessionAction
  answerReviewCardAction: typeof answerReviewCardAction
  finalizeReviewSessionAction: typeof finalizeReviewSessionAction
  getReviewCatalogAction: typeof getReviewCatalogAction
  addTopicToReviewAction: typeof addTopicToReviewAction
}

export const SERVER_REVIEW_ACTIONS: ReviewActions = {
  getReviewsOverviewAction,
  setReviewItemFlagAction,
  startReviewSessionAction,
  getActiveReviewSessionAction,
  answerReviewCardAction,
  finalizeReviewSessionAction,
  getReviewCatalogAction,
  addTopicToReviewAction,
}

const ReviewActionsContext = createContext<ReviewActions>(SERVER_REVIEW_ACTIONS)

export function ReviewActionsProvider({ actions, children }: { actions: ReviewActions; children: ReactNode }) {
  return <ReviewActionsContext.Provider value={actions}>{children}</ReviewActionsContext.Provider>
}

/** Referência estável (capturada na montagem): os callbacks mantêm suas listas de dependências. */
export function useReviewActionsRef(): RefObject<ReviewActions> {
  const actions = useContext(ReviewActionsContext)
  return useRef(actions)
}
