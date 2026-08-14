"use client"

import { useState } from "react"

import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import {
  type DisciplineWeightConfig,
  DisciplineWeightEditor,
} from "@/features/planejamento/components/discipline-weight-editor"
import { PlanningView } from "@/features/planejamento/components/estudei-planning-view"
import { PlanningWizard } from "@/features/planejamento/components/planning-wizard"

interface PlanejamentoClientProps {
  initialData: CycleOverviewData | null
}

export function PlanejamentoClient({ initialData }: PlanejamentoClientProps) {
  const [viewMode, setViewMode] = useState<"overview" | "editor" | "wizard">("overview")

  const editorDisciplines: DisciplineWeightConfig[] = Array.from(
    new Map(
      (initialData?.blocks || []).map((b) => [
        b.disciplineId,
        {
          id: b.disciplineId,
          name: b.disciplineName,
          area: b.disciplineArea,
          weight: Math.min(5, Math.max(1, Math.round(b.priorityScore || 2))),
          difficulty: 2,
        },
      ]),
    ).values(),
  )

  const renderContent = () => {
    if (viewMode === "wizard") {
      return (
        <div className="rounded-xl border bg-card p-6 shadow-sm max-w-3xl mx-auto">
          <PlanningWizard
            initialDisciplines={editorDisciplines}
            onCompletePlan={() => setViewMode("overview")}
          />
        </div>
      )
    }

    if (viewMode === "editor") {
      return (
        <DisciplineWeightEditor
          disciplines={editorDisciplines}
          totalCycleHours={Math.round((initialData?.totalCycleMinutes || 1200) / 60)}
          onSave={() => setViewMode("overview")}
          onCancel={() => setViewMode("overview")}
        />
      )
    }

    return <PlanningView initialData={initialData} />
  }

  return <div className="space-y-8">{renderContent()}</div>
}
