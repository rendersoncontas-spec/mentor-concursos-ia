import { RotateCcw } from "lucide-react"

import { getCycleOverviewData } from "@/application/study-plan/study-plan.service"
import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import { PlanejamentoClient } from "@/features/planejamento/components/planejamento-client"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Planejamento de Estudos",
  description: "Gerencie seu ciclo de estudos rotativo e contínuo no NomeIA.",
}

export default async function PlanejamentoPage() {
  let cycleData: CycleOverviewData | null = null

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      cycleData = await getCycleOverviewData(supabase, user.id)
    }
  } catch (error) {
    console.error("Erro ao carregar dados do Planejamento:", error)
  }

  return (
    <div className="flex flex-col min-h-full space-y-6">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Ciclo de Estudos Rotativo</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Organização flexível e contínua baseada em peso e dificuldade
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 max-w-7xl mx-auto w-full pb-10">
        <PlanejamentoClient initialData={cycleData} />
      </div>
    </div>
  )
}
