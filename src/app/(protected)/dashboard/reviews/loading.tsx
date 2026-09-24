import { RefreshCcw } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardReviewsLoading() {
  return (
    <div className="flex flex-col min-h-full" role="status" aria-label="Carregando revisões">
      {/* Mesmo cabeçalho da página real; só o conteúdo fica em esqueleto. */}
      <PageHeader
        icon={RefreshCcw}
        title="Revisões"
        description="Repetição espaçada: 24h · 7d · 15d · 30d · 60d"
      />

      <div className="flex-1 page-container py-5 space-y-5">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
