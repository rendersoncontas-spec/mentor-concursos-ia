import { Skeleton } from "@/components/ui/skeleton"

// Fase F.3 (performance) — esqueleto usado SÓ pela área de widgets do
// Dashboard (hero "Foco de hoje" + grade), dentro do <Suspense> que envolve
// os 4 loaders mais lentos (ciclo ativo, estudos de 14 dias, totais do mês e
// estatísticas do mês). O cabeçalho (saudação, data, botão "Adicionar
// estudo") não depende mais desses 4 loaders e aparece antes deste esqueleto.
// Mesma composição visual do bloco equivalente em `loading.tsx` (que continua
// cobrindo a navegação inicial para a rota, antes do cabeçalho existir).
export function DashboardWidgetsSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Carregando widgets do painel">
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
