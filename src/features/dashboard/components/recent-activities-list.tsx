import Link from "next/link"
import { History, BookOpen, FileText, CheckCircle2, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type RecentActivityItem } from "@/domain/dashboard/dashboard.types"
import { cn } from "@/lib/utils"

export interface RecentActivitiesListProps {
  items: RecentActivityItem[]
  className?: string
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

  if (diffMinutes < 60) {
    return `há ${Math.max(1, diffMinutes)}m`
  }
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `há ${diffHours}h`
  }
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "ontem"
  if (diffDays < 7) return `há ${diffDays}d`

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

export function RecentActivityCard({ item }: { item: RecentActivityItem }) {
  const sourceLabelMap: Record<string, string> = {
    PLAN: "Plano",
    FREE: "Livre",
    REVIEW: "Revisão",
    SIMULADO: "Simulado",
    QUESTOES: "Questões",
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/60 hover:bg-card transition-colors text-xs gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">
            {item.discipline_name}
          </div>
          {item.subject_name ? (
            <p className="text-[11px] text-muted-foreground truncate">{item.subject_name}</p>
          ) : (
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                {sourceLabelMap[item.study_source] || item.study_source}
              </Badge>
              <span>•</span>
              <span>{formatTimeAgo(item.started_at)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <span className="font-bold text-foreground block">{formatMinutes(item.duration_minutes)}</span>
          <span className="text-[10px] text-muted-foreground">{formatTimeAgo(item.started_at)}</span>
        </div>
        {item.completed && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

export function RecentActivitiesList({ items, className }: RecentActivitiesListProps) {
  const hasItems = items && items.length > 0

  return (
    <Card className={cn("flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow", className)} aria-label="Lista de Atividades Recentes">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>Atividades Recentes</span>
        </CardTitle>
        {hasItems && (
          <Badge variant="secondary" className="text-[10px] font-medium">
            {items.length} {items.length === 1 ? "registro" : "registros"}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-3 pb-3 flex-1">
        {!hasItems ? (
          <div className="py-6 text-center text-muted-foreground flex flex-col items-center justify-center">
            <BookOpen className="h-8 w-8 mb-2 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Nenhuma atividade recente</p>
            <p className="text-xs mt-1">Comece sua primeira sessão para registrar seu progresso.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <RecentActivityCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 border-t flex flex-col sm:flex-row gap-2">
        <Button asChild variant="outline" size="sm" className="w-full sm:flex-1 text-xs gap-1.5">
          <Link href="/dashboard/analytics" aria-label="Ver histórico completo de estudos">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ver Histórico</span>
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm" className="w-full sm:flex-1 text-xs gap-1.5">
          <Link href="/edital" aria-label="Ver edital verticalizado">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ver Edital</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function RecentActivitiesListSkeleton() {
  return (
    <Card className="flex flex-col justify-between p-5 animate-pulse">
      <div className="flex justify-between items-center mb-4 pb-2 border-b">
        <div className="h-4 w-36 bg-muted rounded" />
        <div className="h-4 w-12 bg-muted rounded-full" />
      </div>
      <div className="space-y-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 w-full bg-muted rounded-lg" />
        ))}
      </div>
      <div className="flex gap-2 border-t pt-3">
        <div className="h-8 flex-1 bg-muted rounded" />
        <div className="h-8 flex-1 bg-muted rounded" />
      </div>
    </Card>
  )
}
