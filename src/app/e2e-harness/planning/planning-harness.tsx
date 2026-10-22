"use client"

import { useState } from "react"

import { PlanejamentoClient } from "@/features/planejamento/components/planejamento-client"
import { PlanningActionsProvider } from "@/features/planejamento/planning-actions"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import {
  buildPlanningFixture,
  createFakePlanningActions,
  type PlanningHarnessState,
} from "@/lib/testing/history-planning-fixtures"

export function PlanningHarness({ state }: { state: PlanningHarnessState }) {
  const [actions] = useState(() => createFakePlanningActions(state))
  const [initialData] = useState(() => (state === "empty" ? null : buildPlanningFixture(getDayInSaoPaulo(new Date()))))
  return (
    <PlanningActionsProvider actions={actions}>
      <div className="page-container py-5">
        <h1 className="sr-only">Planejamento (harness E2E)</h1>
        <PlanejamentoClient initialData={initialData} />
      </div>
    </PlanningActionsProvider>
  )
}
