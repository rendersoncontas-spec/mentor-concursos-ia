import { Folder } from "lucide-react"

import { PlanosView } from "@/features/planos/components/planos-view"

export const metadata = {
  title: "Planos de Estudo",
  description: "Gerencie seu plano de concurso e matérias no NomeIA.",
}

export default function PlanosPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <Folder className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Planos de Estudo</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Catálogo e gerenciamento dos planos de concursos
          </p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <PlanosView />
      </div>
    </div>
  )
}
