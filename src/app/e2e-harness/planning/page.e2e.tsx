import type { Metadata } from "next"

import { PlanejamentoClient } from "@/features/planejamento/components/planejamento-client"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import { buildPlanningFixture } from "@/lib/testing/history-planning-fixtures"

// G2.23 — harness E2E do Planejamento: o MESMO componente de
// app/(protected)/planejamento/page.tsx, com o plano SINTÉTICO no lugar de
// getCycleOverviewData. As visões que buscam dados por conta própria recebem o
// erro real da Server Action (sem sessão) — estado de erro recuperável. Só
// existe com NOMEIA_E2E_HARNESS=1.
export const metadata: Metadata = { title: "E2E · planejamento", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function PlanningHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const initialData = state === "empty" ? null : buildPlanningFixture(getDayInSaoPaulo(new Date()))
  return (
    <div className="page-container py-5">
      <h1 className="sr-only">Planejamento (harness E2E)</h1>
      <PlanejamentoClient initialData={initialData} />
    </div>
  )
}
