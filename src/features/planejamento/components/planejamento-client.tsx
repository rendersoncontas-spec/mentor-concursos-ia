"use client"

import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import { PlanningView } from "@/features/planejamento/components/estudei-planning-view"

interface PlanejamentoClientProps {
  initialData: CycleOverviewData | null
}

export function PlanejamentoClient({ initialData }: PlanejamentoClientProps) {
  return <PlanningView initialData={initialData} />
}
