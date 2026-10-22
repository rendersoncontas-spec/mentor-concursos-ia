import type { Metadata } from "next"

import { ReviewsHarness } from "./reviews-harness"

// G2.24 — harness E2E das Revisões (ReviewsView, sessão de revisão e "Adicionar
// tópico" REAIS) com leituras e escritas SINTÉTICAS em memória (fronteira
// `ReviewActionsProvider`). Só existe com NOMEIA_E2E_HARNESS=1. Nenhuma sessão,
// banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · revisões", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const STATES = ["data", "empty", "error", "retry", "catalog-error", "session-error"] as const

export default async function ReviewsHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s = (STATES as readonly string[]).includes(state ?? "") ? (state as (typeof STATES)[number]) : "data"
  // Mesmo instante no servidor e no navegador (sem divergência de hidratação).
  return <ReviewsHarness state={s} nowIso={new Date().toISOString()} />
}
