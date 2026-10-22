import type { Metadata } from "next"

import { HistoryHarness } from "./history-harness"

// G2.23 — harness E2E do Histórico (HistoryView REAL) com as Server Actions
// trocadas por dados sintéticos pela fronteira `HistoryActionsProvider`. Só
// existe com NOMEIA_E2E_HARNESS=1. Nenhuma sessão, banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · histórico", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const STATES = ["data", "empty", "error", "calendar-error", "calendar-retry", "calendar-month-error"] as const

export default async function HistoryHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s = (STATES as readonly string[]).includes(state ?? "") ? (state as (typeof STATES)[number]) : "data"
  return <HistoryHarness state={s} />
}
