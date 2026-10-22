import type { Metadata } from "next"

import { StatisticsHarness } from "./statistics-harness"

// G2.24 — harness E2E da Central de Estatísticas (StatisticsCenterView REAL) com
// o payload SINTÉTICO no lugar de getStatisticsCenterAction (fronteira
// `StatisticsActionsProvider`). Só existe com NOMEIA_E2E_HARNESS=1. Nenhuma
// sessão, banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · estatísticas", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const STATES = ["data", "empty", "partial", "error", "retry"] as const

export default async function StatisticsHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s = (STATES as readonly string[]).includes(state ?? "") ? (state as (typeof STATES)[number]) : "data"
  // Instante fixado no servidor e repassado ao navegador: o "atualizado às HH:MM"
  // não pode divergir entre SSR e hidratação quando o minuto vira.
  return <StatisticsHarness state={s} nowIso={new Date().toISOString()} />
}
