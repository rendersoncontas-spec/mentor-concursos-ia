import type { Metadata } from "next"

import { SimuladosHarness } from "./simulados-harness"
import { SIMULADOS_HARNESS_STATES, type SimuladosHarnessState } from "./states"

// G2.21 — harness E2E de /simulados: a TELA REAL (SimuladosView, modal de
// registro, Estudo × desempenho) com o BANCO trocado por um duplo em memória.
// Só existe com NOMEIA_E2E_HARNESS=1. Nenhuma sessão, banco real ou dado pessoal.
export const metadata: Metadata = { title: "E2E · simulados", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function SimuladosHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const s: SimuladosHarnessState = (SIMULADOS_HARNESS_STATES as readonly string[]).includes(state ?? "")
    ? (state as SimuladosHarnessState)
    : "data"
  return <SimuladosHarness state={s} />
}
