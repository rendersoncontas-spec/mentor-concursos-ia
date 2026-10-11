import type { Metadata } from "next"

import { SimuladoResultHarness } from "./simulado-result-harness"

// G2.22 — harness E2E de SimuladoResultView (resultado do simulado interno)
// com payload SINTÉTICO, para contraste/estados nos dois temas. Só existe com
// NOMEIA_E2E_HARNESS=1. Observação: nenhuma página real importa este
// componente hoje (ver comentário em simulados.actions.ts, Fase I.2).
export const metadata: Metadata = { title: "E2E · resultado de simulado", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function SimuladoResultHarnessPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  return <SimuladoResultHarness kind={state === "low" ? "low" : "high"} />
}
