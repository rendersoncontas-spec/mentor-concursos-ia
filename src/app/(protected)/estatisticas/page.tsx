import type { Metadata } from "next"

import { StatisticsCenterView } from "@/features/statistics/components/statistics-center-view"

export const metadata: Metadata = {
  title: "Estatísticas",
  description: "Análise completa de desempenho e métricas no NomeIA.",
}

export default function EstatisticasPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 sm:p-5 md:p-6 w-full max-w-full">
        <StatisticsCenterView />
      </div>
    </div>
  )
}
