"use client"

import { useState } from "react"

import { HistoryActionsProvider } from "@/features/history/history-actions"
import { HistoryView } from "@/features/history/components/history-view"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import { createFakeHistoryActions, type HistoryHarnessState } from "@/lib/testing/history-planning-fixtures"

export function HistoryHarness({ state }: { state: HistoryHarnessState }) {
  const [actions] = useState(() => createFakeHistoryActions(state, getDayInSaoPaulo(new Date())))
  return (
    <HistoryActionsProvider actions={actions}>
      <div className="page-container py-5">
        <h1 className="sr-only">Histórico (harness E2E)</h1>
        <HistoryView />
      </div>
    </HistoryActionsProvider>
  )
}
