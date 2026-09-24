import { Library } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"

// Fase F (performance): a lista agora vem do servidor; este esqueleto aparece
// na hora do clique enquanto ela chega.
export default function BibliotecaLoading() {
  return (
    <div className="flex flex-col min-h-full" role="status" aria-label="Carregando biblioteca">
      <PageHeader icon={Library} title="Biblioteca" description="Central de materiais de apoio e resumos" />
      <div className="flex-1 page-container py-5 space-y-4">
        <Skeleton className="h-9 w-full max-w-md" />
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
