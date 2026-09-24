import type { Metadata } from "next"

import { History } from "lucide-react"

import { HistoryView } from "@/features/history/components/history-view"
import { PageHeader } from "@/components/ui/page-header"

export const metadata: Metadata = {
  title: "Histórico de Estudos",
  description: "Visualize todo o seu histórico de sessões de estudo no NomeIA.",
}

export default function HistoryPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={History}
        title="Histórico de Estudos"
        description="Sessões registradas, filtros e métricas"
      />

      <div className="flex-1 page-container py-5">
        <HistoryView />
      </div>
    </div>
  )
}
