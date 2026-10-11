"use client"

import { SimuladoResultView } from "@/features/simulados/components/simulado-result"
import { buildSimuladoResultFixture, type SimuladoResultFixtureKind } from "@/lib/testing/simulado-result-fixture"

export function SimuladoResultHarness({ kind }: { kind: SimuladoResultFixtureKind }) {
  return (
    <div className="page-container py-6">
      <h1 className="sr-only">Resultado do simulado (harness E2E)</h1>
      <SimuladoResultView payload={buildSimuladoResultFixture(kind)} onNewSimulado={() => undefined} onSeeHistory={() => undefined} />
    </div>
  )
}
