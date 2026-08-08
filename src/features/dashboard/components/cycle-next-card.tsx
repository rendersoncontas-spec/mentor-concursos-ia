import Link from "next/link"
import { CalendarDays, Play, ArrowRight, Sparkles, Clock, Layers } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"
import { cn } from "@/lib/utils"

export interface CycleNextCardProps {
  item?: StudyPlanItemWithDetails | null
  activeSessionId?: string | null
  onStartSession?: (item: StudyPlanItemWithDetails) => void
  className?: string
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function CycleNextCard({
  item,
  activeSessionId,
  onStartSession,
  className,
}: CycleNextCardProps) {
  const hasItem = Boolean(item && item.discipline)

  // Prioridade da matéria formatada
  const priorityScore = item?.priority_score ?? 1.0
  const isHighPriority = priorityScore > 1.5

  return (
    <Card
      className={cn(
        "relative flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border-primary/20 bg-gradient-to-br from-card via-card to-primary/5",
        className,
      )}
      aria-label="Próxima Matéria do Ciclo de Estudos"
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>Próxima Matéria do Ciclo</span>
        </CardTitle>

        {hasItem && (
          <Badge
            variant={isHighPriority ? "default" : "secondary"}
            className={cn(
              "text-[10px] font-semibold gap-1",
              isHighPriority && "bg-primary text-primary-foreground",
            )}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {isHighPriority ? "Alta Prioridade" : "Ciclo Ativo"}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-4 pb-4 flex-1">
        {!hasItem ? (
          <div className="py-6 text-center text-muted-foreground flex flex-col items-center justify-center">
            <Layers className="h-8 w-8 mb-2 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Nenhum ciclo gerado</p>
            <p className="text-xs mt-1 max-w-[240px]">
              Gere seu planejamento de estudos para receber a sequência recomendada.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                {item?.discipline.area || "Geral"}
              </span>
              <h3 className="text-2xl font-extrabold tracking-tight text-foreground truncate mt-0.5">
                {item?.discipline.name}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>Recomendado: </span>
                <strong className="text-foreground">{formatMinutes(item?.duration_minutes || 60)}</strong>
              </div>

              <div className="text-right text-muted-foreground">
                Sessões: <strong className="text-foreground">{item?.recommended_sessions || 1}x</strong>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        {!hasItem ? (
          <Button asChild size="sm" className="w-full text-xs font-semibold gap-1.5">
            <Link href="/planejamento" aria-label="Gerar planejamento de estudos agora">
              <span>Gerar Planejamento</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => item && onStartSession?.(item)}
            variant={activeSessionId ? "secondary" : "default"}
            className="w-full text-xs font-semibold gap-1.5"
            aria-label={activeSessionId ? "Continuar sessão de estudo ativa" : "Iniciar sessão de estudo para esta matéria"}
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <span>{activeSessionId ? "Continuar Sessão" : "Iniciar Sessão"}</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export function CycleNextCardSkeleton() {
  return (
    <Card className="flex flex-col justify-between p-5 animate-pulse">
      <div className="flex justify-between items-center mb-4 pb-2 border-b">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded-full" />
      </div>
      <div className="h-7 w-48 bg-muted rounded mb-3" />
      <div className="h-3 w-full bg-muted rounded mb-4" />
      <div className="h-9 w-full bg-muted rounded" />
    </Card>
  )
}
