import { RefreshCcw } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardReviewsLoading() {
  return (
    <div className="flex flex-col min-h-full" role="status" aria-label="Carregando revisões">
      {/*
        Mesmo cabeçalho da página real; só o conteúdo fica em esqueleto.

        Fase I.5 (achado A1 da auditoria): este esqueleto anunciava uma escada
        fixa de intervalos que NÃO existe — quem calcula o intervalo de cada
        tópico é o FSRS, a partir das respostas do aluno. A descrição abaixo é
        exatamente a da página real, e o teste fase-h-dados-reais compara os dois
        arquivos para que não voltem a divergir.
      */}
      <PageHeader
        icon={RefreshCcw}
        title="Revisões"
        description="Repetição espaçada: o intervalo de cada tópico é calculado pelas suas respostas"
      />

      <div className="flex-1 page-container py-5 space-y-5">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}
