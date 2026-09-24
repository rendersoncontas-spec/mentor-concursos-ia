import { Skeleton } from "@/components/ui/skeleton"

// Fase E — o esqueleto segue a composição real do Dashboard (cabeçalho,
// "Foco de hoje" e a grade de três colunas) no mesmo container das páginas.
export default function DashboardLoading() {
  return (
    <div className="flex-1 page-container pt-5 pb-8 space-y-5" role="status" aria-label="Carregando o painel">
      <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-60" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      <div className="space-y-2.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>

      <div className="space-y-2.5">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-52 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
