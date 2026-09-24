import { BarChart3 } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"

// Fase F (performance): a página agora carrega os dados no servidor; este
// esqueleto aparece na hora do clique enquanto eles chegam.
export default function EstatisticasLoading() {
  return (
    <div className="flex flex-col min-h-full" role="status" aria-label="Carregando estatísticas">
      <PageHeader
        icon={BarChart3}
        title="Estatísticas"
        description="Tempo, desempenho, consistência e prioridades dos seus estudos"
      />
      <div className="flex-1 page-container py-5 space-y-5">
        <Skeleton className="h-9 w-full max-w-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
