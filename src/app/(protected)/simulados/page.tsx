import { ListCheck } from "lucide-react"
import { EstudeiSimuladosView } from "@/features/simulados/components/estudei-simulados-view"

export const metadata = {
  title: "Simulados - Mentor Concursos IA",
  description: "Acompanhe e registre seu desempenho em simulados.",
}

export default function SimuladosPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <ListCheck className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Simulados</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão de provas e simulados preparatórios</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <EstudeiSimuladosView />
      </div>
    </div>
  )
}
