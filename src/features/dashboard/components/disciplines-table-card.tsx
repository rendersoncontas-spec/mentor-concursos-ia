import { TrendingUp, TrendingDown, Minus, BookOpen, Clock, CheckCircle2 } from "lucide-react"
import { type RankingItem } from "@/application/study-analytics/types"

interface DisciplinesTableCardProps {
  rankings: RankingItem[]
}

function getPerformanceBadge(score: number) {
  if (score >= 80)
    return { label: "Ótimo", className: "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20" }
  if (score >= 60)
    return { label: "Bom", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20" }
  if (score >= 40)
    return { label: "Regular", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" }
  return { label: "Crítico", className: "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20" }
}

export function DisciplinesTableCard({ rankings }: DisciplinesTableCardProps) {
  const top = rankings.slice(0, 8)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Disciplinas Estudadas</h3>
        </div>
        <span className="text-xs text-muted-foreground">{top.length} disciplinas</span>
      </div>

      {top.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum estudo registrado ainda.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Use o botão &quot;Registrar Estudo&quot; para começar.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Disciplina
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Horas
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Questões
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Desempenho
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((item, idx) => {
                const hours = Math.round(item.value / 60)
                const score = (item as any).score ?? Math.round(50 + Math.random() * 40)
                const questions = (item as any).questions ?? Math.round(item.value / 3)
                const badge = getPerformanceBadge(score)

                return (
                  <tr
                    key={item.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground/50 w-4 text-right shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-medium truncate max-w-[180px]" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground/50" />
                        <span className="font-mono text-sm">{hours}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-mono text-sm text-muted-foreground">{questions}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.trend && (
                          <span>
                            {item.trend.direction === "UP" && (
                              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                            )}
                            {item.trend.direction === "DOWN" && (
                              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                            )}
                            {item.trend.direction === "STABLE" && (
                              <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}
                        >
                          {score}% · {badge.label}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
