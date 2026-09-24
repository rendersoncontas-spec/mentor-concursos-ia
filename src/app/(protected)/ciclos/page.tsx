import type { Metadata } from "next"

import { pickActiveCycleOverview } from "@/application/study-cycle/pick-active-cycle"
import { getCyclesAction } from "@/application/study-cycle/study-cycle.actions"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"
import { StudyCyclesView } from "@/features/study-cycle/components/study-cycles-view"
import { logPagePerf, startPagePerf, timed } from "@/lib/perf/server-perf"

export const metadata: Metadata = {
  title: "Ciclos de Estudo",
  description: "Organize suas matérias em uma sequência contínua de estudos no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function CiclosPage() {
  // Fase F (performance): as três leituras são independentes e rodam em
  // paralelo no servidor, na mesma renderização (a autenticação é feita uma
  // vez só — ver getEffectiveSessionUser). São exatamente as mesmas funções de
  // leitura que a tela usava no navegador; nenhuma delas grava ou recalcula o
  // ciclo. Enquanto isso, loading.tsx mostra a estrutura da página.
  //
  // Fase F.1: o ciclo ativo sai da própria lista (mesmo critério de
  // getActiveCycleAction: status ACTIVE, updated_at mais recente; mesmo
  // buildCycleOverview) — antes as sessões do ciclo ativo eram lidas 2×.
  startPagePerf()
  const [cyclesResult, disciplinesResult] = await Promise.all([
    timed("ciclos.lista", () => getCyclesAction(), (r) => r.data.length),
    timed("ciclos.disciplinas", () => getDisciplinesForAutocomplete(), (r) => r?.allDisciplines?.length),
  ])
  const activeCycle = pickActiveCycleOverview(cyclesResult.data)
  logPagePerf("/ciclos")

  return (
    <div className="flex flex-col min-h-full">
      <StudyCyclesView
        initialData={{
          cycles: cyclesResult.data,
          activeCycle,
          disciplines: disciplinesResult?.allDisciplines || [],
          reconcileErrors: cyclesResult.reconcileErrors,
        }}
      />
    </div>
  )
}
