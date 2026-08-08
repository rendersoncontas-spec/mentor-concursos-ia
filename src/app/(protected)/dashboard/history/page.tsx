import { History } from "lucide-react"
import { EstudeiHistoryView } from "@/features/history/components/estudei-history-view"

export const metadata = {
  title: "Histórico de Estudos - Mentor Concursos IA",
  description: "Consulte todas as suas sessões e registros de estudo salvos.",
}

export default function HistoryPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <History className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Histórico de Estudos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Registro detalhado de sessões realizadas</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <EstudeiHistoryView />
      </div>
    </div>
  )
}
