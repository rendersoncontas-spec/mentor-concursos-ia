import { Metadata } from "next"

import { History } from "lucide-react"

import { HistoryView } from "@/features/history/components/history-view"

export const metadata: Metadata = {
  title: "Histórico de Estudos",
  description: "Visualize todo o seu histórico de sessões de estudo no Nomeia.",
}

export default function HistoryPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <History className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Histórico de Estudos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sessões registradas, filtros e métricas
          </p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <HistoryView />
      </div>
    </div>
  )
}
