import Link from "next/link"
import { RefreshCcw, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type PendingReviewsSummary } from "@/domain/dashboard/dashboard.types"
import { cn } from "@/lib/utils"

export interface PendingReviewsWidgetProps {
  data: PendingReviewsSummary
  className?: string
}

export function PendingReviewsWidget({ data, className }: PendingReviewsWidgetProps) {
  const { count, overdue, today, highPriority, nextReview } = data

  // Determina o estado visual de UX baseado nos dados de revisão
  const isZero = count === 0
  const isCritical = overdue > 0 || count > 20
  const isWarning = count > 5 && !isCritical
  const isNormal = count > 0 && count <= 5

  // Formatação de data/hora da próxima revisão se houver
  const formattedNextReview = nextReview
    ? new Date(nextReview).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null

  let priorityContent = <div className="text-muted-foreground text-right">Fila em dia</div>
  if (formattedNextReview) {
    priorityContent = <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3 w-3" aria-hidden="true" /><span>Próx: {formattedNextReview}</span></div>
  }
  if (highPriority > 0) {
    priorityContent = <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium"><span>⚡ {highPriority} alta prioridade</span></div>
  }

  let actionVariant: "outline" | "destructive" | "default" = "default"
  if (isZero) {
    actionVariant = "outline"
  } else if (isCritical) {
    actionVariant = "destructive"
  }

  return (
    <Card
      className={cn(
        "relative flex flex-col justify-between overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md",
        isZero && "border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10",
        isNormal && "border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/10",
        isWarning && "border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/10",
        isCritical && "border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/10",
        className,
      )}
      aria-label="Widget de Revisões Pendentes"
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>Revisões Pendentes</span>
        </CardTitle>

        {isZero && (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Em dia
          </Badge>
        )}
        {isNormal && (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
            Tranquilo
          </Badge>
        )}
        {isWarning && (
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Atenção
          </Badge>
        )}
        {isCritical && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Urgente
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-2 pb-4">
        {isZero ? (
          <div className="py-2 text-center sm:text-left">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
              🎉 0 revisões
            </div>
            <p className="text-xs text-muted-foreground">
              Você está com todas as revisões em dia. Bom trabalho!
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-4xl font-extrabold tracking-tight">{count}</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {count === 1 ? "revisão pendente" : "revisões pendentes"}
              </span>
            </div>

            {/* Sub-indicadores preparados para layout de estatísticas expandidas */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
              {overdue > 0 ? (
                <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>{overdue} atrasada{overdue > 1 ? "s" : ""}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{today} para hoje</span>
                </div>
              )}

              {priorityContent}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          asChild
          variant={actionVariant}
          className="w-full text-xs font-semibold gap-1.5"
          size="sm"
        >
          <Link href="/dashboard/reviews" aria-label="Fazer revisões agora">
            <span>{isZero ? "Ver Histórico de Revisões" : "Fazer Revisões"}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function PendingReviewsWidgetSkeleton() {
  return (
    <Card className="flex flex-col justify-between p-5 animate-pulse">
      <div className="flex justify-between items-center mb-4">
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded-full" />
      </div>
      <div className="h-8 w-20 bg-muted rounded mb-3" />
      <div className="h-3 w-full bg-muted rounded mb-4" />
      <div className="h-9 w-full bg-muted rounded" />
    </Card>
  )
}
