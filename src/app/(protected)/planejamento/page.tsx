import { CalendarDays } from "lucide-react"

import { getCycleOverviewData } from "@/application/study-plan/study-plan.service"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import { PlanejamentoClient } from "@/features/planejamento/components/planejamento-client"
import { createClient } from "@/infrastructure/supabase/server"
import { PageHeader } from "@/components/ui/page-header"
import { logPagePerf, startPagePerf, timed } from "@/lib/perf/server-perf"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Planejamento de Estudos",
  description: "Gerencie seu ciclo de estudos rotativo e contínuo no NomeIA.",
}

export default async function PlanejamentoPage() {
  let cycleData: CycleOverviewData | null = null

  try {
    startPagePerf()
    const supabase = await createClient()
    const effectiveUser = await timed("auth.usuario", () => getEffectiveSessionUser(supabase))

    if (effectiveUser) {
      cycleData = await timed("planejamento.visao_do_plano", () => getCycleOverviewData(supabase, effectiveUser.id))
    }
    logPagePerf("/planejamento")
  } catch (error) {
    console.error("Erro ao carregar dados do Planejamento:", error)
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={CalendarDays}
        title="Planejamento"
        description="Distribuição dos estudos por dia, capacidade e metas"
      />

      <div className="flex-1 page-container py-5 pb-12">
        <PlanejamentoClient initialData={cycleData} />
      </div>
    </div>
  )
}
