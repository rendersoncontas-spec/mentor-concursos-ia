import type { Metadata } from "next"

import { EditalHarness } from "./edital-harness"

// G2.24 — harness E2E do Edital verticalizado (EditalAccordion REAL) com
// disciplinas, tópicos e progresso SINTÉTICOS em memória (fronteira
// `EditalActionsProvider`). Só existe com NOMEIA_E2E_HARNESS=1. Nenhuma sessão,
// banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · edital", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

const STATES = ["data", "progress-error", "save-error"] as const

export default async function EditalHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s = (STATES as readonly string[]).includes(state ?? "") ? (state as (typeof STATES)[number]) : "data"
  return <EditalHarness state={s} />
}
