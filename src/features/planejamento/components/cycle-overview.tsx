"use client"

import { RotateCcw, Clock, CheckCircle2, SlidersHorizontal, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"

interface CycleOverviewProps {
  data: CycleOverviewData
  onNewCycle?: () => void
  onEditWeights?: () => void
  onResetRound?: () => void
}

export function CycleOverview({
  data,
  onNewCycle,
  onEditWeights,
  onResetRound,
}: CycleOverviewProps) {
  const totalHours = Math.round(data.totalCycleMinutes / 60)
  const completedHours = Math.round((data.completedMinutes || 0) / 60)

  return (
    <div className="rounded-xl border bg-card p-5 md:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Ciclo Rotativo de Estudos</h2>
              <p className="text-xs text-muted-foreground">
                Rodada v{data.version} • Sequência contínua independente da agenda semanal
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {onEditWeights && (
            <Button variant="outline" size="sm" onClick={onEditWeights} className="gap-1.5 text-xs font-medium">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Editar Pesos</span>
            </Button>
          )}

          {onResetRound && (
            <Button variant="outline" size="sm" onClick={onResetRound} className="gap-1.5 text-xs font-medium">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Reiniciar Rodada</span>
            </Button>
          )}

          {onNewCycle && (
            <Button size="sm" onClick={onNewCycle} className="gap-1.5 text-xs font-semibold">
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Ciclo</span>
            </Button>
          )}
        </div>
      </div>

      {/* Progress & Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* Progress Bar Card */}
        <div className="md:col-span-2 rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Progresso da Rodada
            </span>
            <span className="font-bold text-primary text-base">
              {data.progressPercentage}%
            </span>
          </div>

          {/* Visual Progress Bar */}
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, data.progressPercentage))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              {data.completedBlocksCount} de {data.totalBlocksCount} blocos concluídos
            </span>
            <span>
              {completedHours}h de {totalHours}h estudadas
            </span>
          </div>
        </div>

        {/* Quick Info Card */}
        <div className="rounded-lg border bg-muted/20 p-4 flex flex-col justify-center gap-2">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Clock className="h-4 w-4 text-primary" />
            Carga Total do Ciclo
          </div>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">
            {totalHours} horas
          </p>
          <p className="text-xs text-muted-foreground">
            Divididas em {data.totalBlocksCount} blocos sequenciais
          </p>
        </div>
      </div>
    </div>
  )
}
