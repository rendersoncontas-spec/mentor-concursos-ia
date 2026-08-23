"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import { ArrowRight, Clock, Play, RefreshCcw } from "lucide-react"

import { getActiveCycleAction } from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { StudyCycleWithItems } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m}min`
}

export function StudyCycleWidget({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const [cycle, setCycle] = useState<StudyCycleWithItems | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getActiveCycleAction()
      .then(setCycle)
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center h-20">
        <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cycle) return null

  const currentIndex = Math.min(cycle.current_item_index, cycle.items.length - 1)
  const currentItem = cycle.items[currentIndex]
  const nextItem = cycle.items[currentIndex + 1]

  const totalPlanned = cycle.items.reduce((s, i) => s + i.planned_minutes, 0)
  const totalCompleted = cycle.items.reduce((s, i) => s + i.completed_minutes, 0)
  const progress = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0

  const currentRemaining = currentItem
    ? Math.max(0, currentItem.planned_minutes - currentItem.completed_minutes)
    : 0

  const content = (
    <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Ciclo de Estudo
              </p>
              <p className="text-xs font-semibold text-foreground">{cycle.name}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{progress}%</span>
        </div>

        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        {currentItem && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Matéria Atual
                </p>
                <p className="text-sm font-bold text-foreground">
                  {currentItem.discipline?.name || "Matéria"}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatMinutes(currentRemaining)} restantes</span>
                </div>
              </div>
            </div>

            {nextItem && (
              <div className="text-xs text-muted-foreground">
                Próxima: <span className="font-medium text-foreground">{nextItem.discipline?.name || "Matéria"}</span>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={() => router.push("/ciclos")}
          className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-8"
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          Continuar ciclo
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
  )

  if (embedded) return content

  return (
    <Card className="overflow-hidden">
      {content}
    </Card>
  )
}
