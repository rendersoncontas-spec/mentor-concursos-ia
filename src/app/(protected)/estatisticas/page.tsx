import { BarChart3 } from "lucide-react"
import { EstudeiStatisticsView } from "@/features/statistics/components/estudei-statistics-view"

export const metadata = {
  title: "Estatísticas - Mentor Concursos IA",
  description: "Análise gráfica detalhada do seu progresso, horas de estudo e desempenho.",
}

export default function EstatisticasPage() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <EstudeiStatisticsView />
      </div>
    </div>
  )
}
