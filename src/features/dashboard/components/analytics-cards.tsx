import { 
  Flame, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  BarChart3, 
  Activity,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Brain,
  Zap,
  Target
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { DashboardAnalytics } from "@/domain/dashboard/dashboard.types"

function getTrendColor(direction: string) {
  if (direction === "UP") return "text-green-500"
  if (direction === "DOWN") return "text-red-500"
  return "text-muted-foreground"
}

// --- Heatmap Card ---
export function HeatmapCard({ heatmap }: { heatmap: DashboardAnalytics["heatmap"] }) {
  // O heatmap vem reverso (hoje no final ou início). 
  // Pelo evolution.ts, preenchemos do mais antigo (limit-1) ao mais novo (0).
  // Renderizaremos como uma grade de 7 colunas (semanas).
  
  // Como é visual simples tipo Github:
  function getIntensityColor(intensity: number) {
    if (intensity === 0) return "bg-muted"
    if (intensity < 25) return "bg-green-200 dark:bg-green-900/40"
    if (intensity < 50) return "bg-green-400 dark:bg-green-700/60"
    if (intensity < 75) return "bg-green-500 dark:bg-green-600/80"
    return "bg-green-600 dark:bg-green-500"
  }

  return (
    <Card className="col-span-full md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Frequência de Estudos (Últimos 30 dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {heatmap.map((day, i) => (
            <div 
              key={i} 
              title={`${day.date}: ${day.minutes}m em ${day.sessions} sessões`}
              className={`w-4 h-4 rounded-sm ${getIntensityColor(day.intensity)} transition-colors hover:ring-2 ring-primary/50 cursor-help`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground justify-end">
          <span>Menos</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/40" />
            <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700/60" />
            <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" />
          </div>
          <span>Mais</span>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Rankings Card ---
export function RankingsCard({ rankings }: { rankings: DashboardAnalytics["rankings"]["disciplines"] }) {
  const topDisciplines = rankings.slice(0, 5)

  return (
    <Card className="col-span-full md:col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Top Disciplinas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {topDisciplines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum estudo registrado no período.</p>
        ) : (
          topDisciplines.map((item, idx) => (
            <div key={item.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="font-bold text-muted-foreground w-4">{idx + 1}.</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(item.value / 60)}h estudadas</p>
                </div>
              </div>
              {item.trend && (
                <div className={`flex items-center gap-1 text-xs font-medium ${getTrendColor(item.trend.direction)}`}>
                  {item.trend.direction === 'UP' && <TrendingUp className="h-3 w-3" />}
                  {item.trend.direction === 'DOWN' && <TrendingDown className="h-3 w-3" />}
                  {item.trend.direction === 'STABLE' && <Minus className="h-3 w-3" />}
                  {item.trend.percentage > 0 && `${item.trend.percentage}%`}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

// --- AI Insights Card ---
export function AiInsightsCard({ insights }: { insights: DashboardAnalytics["insights"] }) {
  const topInsight = insights[0] // O de maior gravidade/score

  if (!topInsight) return null

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <AlertTriangle className="h-5 w-5 text-red-500" />
      case 'HIGH': return <AlertTriangle className="h-5 w-5 text-amber-500" />
      case 'POSITIVE': return <CheckCircle className="h-5 w-5 text-green-500" />
      default: return <Lightbulb className="h-5 w-5 text-blue-500" />
    }
  }

  const getBgColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return "bg-red-500/10 border-red-500/20"
      case 'HIGH': return "bg-amber-500/10 border-amber-500/20"
      case 'POSITIVE': return "bg-green-500/10 border-green-500/20"
      default: return "bg-blue-500/10 border-blue-500/20"
    }
  }

  return (
    <Card className={`relative overflow-hidden border ${getBgColor(topInsight.severity)} col-span-full`}>
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Brain className="h-32 w-32" />
      </div>
      <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
        {getSeverityIcon(topInsight.severity)}
        <div>
          <CardTitle className="text-base font-semibold">{topInsight.title}</CardTitle>
          <CardDescription className="text-xs">Mentor IA Insight</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-foreground/90 mt-2">
          {topInsight.description}
        </p>
      </CardContent>
    </Card>
  )
}

// --- Quick Stats Row ---
export function QuickStatsRow({ stats }: { stats: DashboardAnalytics["stats"] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 col-span-full">
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="bg-orange-500/20 p-3 rounded-full text-orange-500">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Ofensiva</p>
            <p className="text-2xl font-bold">{stats.consecutiveStreak} <span className="text-sm font-normal">dias</span></p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="bg-blue-500/20 p-3 rounded-full text-blue-500">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Foco Médio</p>
            <p className="text-2xl font-bold">{stats.averageFocus || "-"} <span className="text-sm font-normal">/ 5</span></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="bg-yellow-500/20 p-3 rounded-full text-yellow-500">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Energia Média</p>
            <p className="text-2xl font-bold">{stats.averageEnergy || "-"} <span className="text-sm font-normal">/ 5</span></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="bg-purple-500/20 p-3 rounded-full text-purple-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Maior Sessão</p>
            <p className="text-2xl font-bold">{stats.longestSession} <span className="text-sm font-normal">min</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
