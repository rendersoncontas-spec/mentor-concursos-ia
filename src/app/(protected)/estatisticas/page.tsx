import type { Metadata } from "next"

import { BarChart3 } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { logPagePerf, startPagePerf, timed } from "@/lib/perf/server-perf"
import { getStatisticsCenterAction } from "@/application/study-analytics/statistics-center.action"
import {
  StatisticsCenterView,
  type StatisticsCenterInitialData,
} from "@/features/statistics/components/statistics-center-view"

export const metadata: Metadata = {
  title: "Estatísticas",
  description: "Análise completa de desempenho e métricas no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function EstatisticasPage() {
  // Fase F (performance): os dados saem junto com a navegação (em paralelo
  // com o download do JavaScript da tela), em vez de só depois da hidratação.
  // Em erro, a tela carrega sozinha no navegador como antes (e mostra o erro).
  startPagePerf()
  const result = await timed("estatisticas.payload", () => getStatisticsCenterAction(), (r) => r.data?.sessions.length)
  logPagePerf("/estatisticas")
  const initialData: StatisticsCenterInitialData | null = result.data
    ? { payload: result.data, loadedAt: new Date().toISOString() }
    : null

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={BarChart3}
        title="Estatísticas"
        description="Tempo, desempenho, consistência e prioridades dos seus estudos"
        className="print:static"
      />
      <div className="flex-1 page-container py-5">
        <StatisticsCenterView initialData={initialData} />
      </div>
    </div>
  )
}
