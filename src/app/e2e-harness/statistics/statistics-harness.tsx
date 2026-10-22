"use client"

import { useState } from "react"

import { StatisticsCenterView } from "@/features/statistics/components/statistics-center-view"
import { StatisticsActionsProvider } from "@/features/statistics/statistics-actions"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import {
  buildStatisticsFixture,
  createFakeStatisticsActions,
  type StatisticsHarnessState,
} from "@/lib/testing/statistics-fixtures"

export function StatisticsHarness({ state, nowIso }: { state: StatisticsHarnessState; nowIso: string }) {
  const [todayKey] = useState(() => getDayInSaoPaulo(new Date(nowIso)))
  const [actions] = useState(() => createFakeStatisticsActions(state, todayKey))
  // Como a página real: dados do "servidor" quando existem; sem eles a tela
  // carrega sozinha pela ação (erro / nova tentativa).
  const [initialData] = useState(() =>
    state === "error" || state === "retry"
      ? null
      : { payload: buildStatisticsFixture(state, todayKey), loadedAt: nowIso },
  )
  return (
    <StatisticsActionsProvider actions={actions}>
      <div className="page-container py-5">
        <h1 className="sr-only">Estatísticas (harness E2E)</h1>
        <StatisticsCenterView initialData={initialData} />
      </div>
    </StatisticsActionsProvider>
  )
}
