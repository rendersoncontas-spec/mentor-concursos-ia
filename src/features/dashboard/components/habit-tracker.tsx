import { Flame, CheckCircle2, XCircle, Minus } from "lucide-react"
import { type DashboardAnalytics } from "@/domain/dashboard/dashboard.types"

interface HabitTrackerProps {
  heatmap: DashboardAnalytics["heatmap"]
  streak: number
}

function getDayStatus(minutes: number): "studied" | "missed" | "today" | "future" {
  if (minutes > 0) return "studied"
  return "missed"
}

export function HabitTracker({ heatmap, streak }: HabitTrackerProps) {
  // Show last 30 days in a 5-row x 6-col grid (or similar)
  const last30 = heatmap.slice(-30)

  const totalDaysStudied = last30.filter((d) => d.minutes > 0).length
  const consistency = last30.length > 0 ? Math.round((totalDaysStudied / last30.length) * 100) : 0

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm">Constância nos Estudos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Últimos 30 dias</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Streak badge */}
          <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-full">
            <Flame className="h-4 w-4" />
            <span className="text-sm font-bold">{streak}</span>
            <span className="text-xs font-medium">dias seguidos</span>
          </div>
          {/* Consistency */}
          <div className="text-right hidden sm:block">
            <p className="text-lg font-bold">{consistency}%</p>
            <p className="text-xs text-muted-foreground">consistência</p>
          </div>
        </div>
      </div>

      {/* Day grid */}
      <div className="flex flex-wrap gap-1.5">
        {last30.map((day, i) => {
          const status = getDayStatus(day.minutes)
          const isToday = i === last30.length - 1

          return (
            <div
              key={day.date}
              title={`${day.date}: ${day.minutes > 0 ? `${day.minutes}min estudados` : "Sem estudo"}`}
              className="relative group cursor-help"
            >
              {status === "studied" ? (
                <div className="w-7 h-7 rounded-md bg-green-500/15 border border-green-500/30 flex items-center justify-center hover:bg-green-500/25 transition-colors">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                </div>
              ) : isToday ? (
                <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center animate-pulse">
                  <Minus className="h-3.5 w-3.5 text-primary" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-md bg-muted border border-border flex items-center justify-center hover:bg-muted/70 transition-colors">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground/30" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span>Estudou ({totalDaysStudied} dias)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="h-3 w-3 text-muted-foreground/40" />
          <span>Sem estudo ({30 - totalDaysStudied} dias)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Minus className="h-3 w-3 text-primary" />
          <span>Hoje</span>
        </div>
      </div>
    </div>
  )
}
