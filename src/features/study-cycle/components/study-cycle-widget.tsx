"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import { ArrowRight, Layers, Play, RefreshCcw } from "lucide-react"

import { getActiveCycleAction } from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"

export function StudyCycleWidget({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const [overview, setOverview] = useState<CycleOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getActiveCycleAction()
      .then(setOverview)
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center h-20">
        <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!overview) return null

  const { cycle, currentItem, nextItem, currentRound, roundProgressPercentage } =
    overview

  const content = (
    <div className="p-4 space-y-3.5">
      {/* CABEÇALHO DO WIDGET */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Ciclo {cycle.name}
            </p>
            <p className="text-xs font-black text-foreground">
              {currentRound}ª volta • {roundProgressPercentage}%
            </p>
          </div>
        </div>
        <span className="text-xs font-black text-primary">{roundProgressPercentage}%</span>
      </div>

      {/* BARRA DE PROGRESSO DA VOLTA */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${Math.min(roundProgressPercentage, 100)}%` }}
        />
      </div>

      {/* MATÉRIA ATUAL (AGORA) & PRÓXIMA (DEPOIS) */}
      {currentItem && (
        <div className="space-y-1.5 bg-muted/40 p-3 rounded-xl border border-border/40 text-xs">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <span className="font-bold text-muted-foreground">Agora: </span>
              <span className="font-black text-foreground">{currentItem.disciplineName}</span>
            </div>
            <span className="text-[11px] font-bold text-primary shrink-0 ml-1">
              {currentItem.studiedMinutesInRound}/{currentItem.plannedMinutes} min
            </span>
          </div>

          {nextItem && (
            <p className="text-[11px] text-muted-foreground truncate pt-0.5 border-t border-border/30">
              <span className="font-medium">Depois: </span>
              <span className="font-bold text-foreground">{nextItem.disciplineName}</span>
              <span> ({nextItem.plannedMinutes} min)</span>
            </p>
          )}
        </div>
      )}

      {/* BOTÃO CONTINUAR CICLO */}
      <Button
        onClick={() => router.push("/ciclos")}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs h-9 shadow-xs"
      >
        <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
        Continuar ciclo
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </div>
  )

  if (embedded) return content

  return <Card className="overflow-hidden border shadow-xs">{content}</Card>
}
