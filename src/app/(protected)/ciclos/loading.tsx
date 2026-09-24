import { CircleDot } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"

// Fase F (performance): ao navegar para /ciclos, a estrutura da página aparece
// na hora (cabeçalho, painel do ciclo e a tabela da sequência) enquanto o
// servidor carrega os dados.
export default function CiclosLoading() {
  return (
    <div className="flex flex-col min-h-full" role="status" aria-label="Carregando ciclos de estudo">
      <PageHeader
        icon={CircleDot}
        title="Ciclos de estudo"
        description="Suas matérias em uma sequência contínua, sem dias fixos"
      />
      <div className="flex-1 page-container py-5 space-y-5">
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="overflow-hidden rounded-lg border border-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-none border-b border-border last:border-b-0" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
