import { CalendarDays } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function PlanejamentoLoading() {
  return (
    <div className="flex flex-col min-h-full" role="status" aria-label="Carregando planejamento">
      {/* Mesmo cabeçalho da página real; só o conteúdo fica em esqueleto. */}
      <PageHeader
        icon={CalendarDays}
        title="Planejamento"
        description="Distribuição dos estudos por dia, capacidade e metas"
      />

      <div className="flex-1 page-container py-5 space-y-5">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
