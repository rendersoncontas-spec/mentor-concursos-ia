"use client"

import Link from "next/link"
import {
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { type CycleBlock } from "@/domain/study-plan/study-plan.types"

interface CycleVisualizerProps {
  blocks: CycleBlock[]
  onCompleteBlock?: (blockId: string) => void
}

function getBlockClass(isCurrent: boolean, isCompleted: boolean): string {
  if (isCurrent) return "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
  if (isCompleted) return "border-emerald-500/30 bg-emerald-500/5 opacity-80"
  return "border-border bg-card hover:border-primary/40 hover:shadow-sm"
}

function getNumberClass(isCurrent: boolean, isCompleted: boolean): string {
  if (isCurrent) return "bg-primary text-white"
  if (isCompleted) return "bg-emerald-500 text-white"
  return "bg-muted text-muted-foreground"
}

function renderStatusBadge(isCurrent: boolean, isCompleted: boolean) {
  if (isCompleted) return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold gap-1"><CheckCircle2 className="h-3 w-3" /> Concluído</Badge>
  if (isCurrent) return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold gap-1 animate-pulse"><Sparkles className="h-3 w-3" /> Atual</Badge>
  return <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">Pendente</Badge>
}

function renderInactiveAction(block: CycleBlock, isCompleted: boolean) {
  if (isCompleted) return <div className="w-full flex items-center justify-between text-xs text-emerald-600 font-medium py-1"><span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Bloco finalizado</span><Button asChild variant="ghost" size="sm" className="h-7 text-[11px] hover:text-emerald-700 p-0"><Link href={`/sessao-estudo?discipline=${block.disciplineId}`}>Revisar</Link></Button></div>
  return <Button asChild variant="secondary" size="sm" className="w-full gap-1.5 text-xs font-medium"><Link href={`/sessao-estudo?discipline=${block.disciplineId}`}><span>Iniciar Bloco</span><ChevronRight className="h-3.5 w-3.5" /></Link></Button>
}

export function CycleVisualizer({ blocks, onCompleteBlock }: CycleVisualizerProps) {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-12 border rounded-xl bg-card text-muted-foreground">
        Nenhum bloco encontrado no ciclo atual.
      </div>
    )
  }

  const currentBlockIndex = blocks.findIndex((b) => b.status === "EM_ANDAMENTO")
  const activeIndex = currentBlockIndex >= 0 ? currentBlockIndex : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Sequência de Blocos</h3>
          <p className="text-xs text-muted-foreground">
            Siga a ordem dos blocos abaixo. Ao concluir um bloco, o ciclo avança automaticamente.
          </p>
        </div>

        <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1">
          {blocks.length} blocos na rodada
        </Badge>
      </div>

      {/* Grid of Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {blocks.map((block, index) => {
          const isCurrent = index === activeIndex && block.status !== "CONCLUIDO"
          const isCompleted = block.status === "CONCLUIDO"

          const hours = Math.floor(block.durationMinutes / 60)
          const mins = block.durationMinutes % 60
          const timeFormatted = `${hours > 0 ? `${hours}h` : ""}${mins > 0 ? `${mins}min` : ""}`

          return (
            <div
              key={block.id}
              className={cn(
                "group relative rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between space-y-4",
                getBlockClass(isCurrent, isCompleted)
              )}
            >
              {/* Top Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                        getNumberClass(isCurrent, isCompleted)
                      )}
                    >
                      #{block.executionOrder}
                    </span>

                    {block.disciplineArea && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {block.disciplineArea}
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  {renderStatusBadge(isCurrent, isCompleted)}
                </div>

                {/* Discipline Name & Duration */}
                <div className="flex items-start gap-2 pt-1">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: block.color || "#3b82f6" }}
                  />
                  <div>
                    <h4 className="font-bold text-base leading-snug text-foreground group-hover:text-primary transition-colors">
                      {block.disciplineName}
                    </h4>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{timeFormatted} recomendados</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 border-t flex items-center justify-between gap-2">
                {isCurrent ? (
                  <>
                    <Button asChild size="sm" className="w-full gap-2 font-semibold">
                      <Link href={`/sessao-estudo?discipline=${block.disciplineId}`}>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Estudar Agora</span>
                      </Link>
                    </Button>

                    {onCompleteBlock && (
                      <Button
                        size="icon"
                        variant="outline"
                        title="Marcar como Concluído"
                        onClick={() => onCompleteBlock(block.id)}
                        className="shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                ) : renderInactiveAction(block, isCompleted)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
