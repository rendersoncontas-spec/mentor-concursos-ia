import { RotateCcw } from "lucide-react"

export default function PlanejamentoLoading() {
  return (
    <div className="flex flex-col min-h-full space-y-6 animate-pulse">
      {/* Esqueleto com o mesmo layout de cabeçalho da página real, sem dados */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-56 bg-muted rounded" />
            <div className="h-3 w-72 bg-muted rounded" />
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-5 md:p-6 w-full max-w-full pb-12 space-y-5">
        <div className="h-40 bg-muted rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-56 bg-muted rounded-xl" />
          <div className="h-56 bg-muted rounded-xl" />
        </div>
      </div>
    </div>
  )
}
