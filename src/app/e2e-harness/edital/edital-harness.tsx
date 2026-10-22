"use client"

import { useState } from "react"

import { EditalAccordion } from "@/features/edital/components/edital-accordion"
import { EditalActionsProvider } from "@/features/edital/edital-actions"
import {
  buildEditalFixture,
  createFakeEditalActions,
  EDITAL_HARNESS_TARGET_ID,
  EDITAL_HARNESS_TARGET_NAME,
  type EditalHarnessState,
} from "@/lib/testing/edital-fixtures"

export function EditalHarness({ state }: { state: EditalHarnessState }) {
  const [actions] = useState(() => createFakeEditalActions(state))
  const [disciplines] = useState(() => buildEditalFixture())
  return (
    <EditalActionsProvider actions={actions}>
      <div className="page-container py-5">
        <h1 className="sr-only">Edital verticalizado (harness E2E)</h1>
        <EditalAccordion
          initialDisciplines={disciplines}
          activeTargetName={EDITAL_HARNESS_TARGET_NAME}
          activeTargetId={EDITAL_HARNESS_TARGET_ID}
        />
      </div>
    </EditalActionsProvider>
  )
}
