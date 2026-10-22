import type { Metadata } from "next"

import { PlanningHarness } from "./planning-harness"

// G2.23/G2.24 — harness E2E do Planejamento: o MESMO componente de
// app/(protected)/planejamento/page.tsx, com plano e leituras SINTÉTICOS
// (fronteira `PlanningActionsProvider`; dados determinísticos). Só existe com
// NOMEIA_E2E_HARNESS=1. Nenhuma sessão, banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · planejamento", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const STATES = ["data", "empty", "error", "retry"] as const

export default async function PlanningHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s = (STATES as readonly string[]).includes(state ?? "") ? (state as (typeof STATES)[number]) : "data"
  return <PlanningHarness state={s} />
}
