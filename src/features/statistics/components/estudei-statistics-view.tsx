"use client"

import { useState, useEffect } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Calendar,
  GraduationCap,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PerformanceChart } from "@/features/analytics/components/performance-chart"
import { HoursDistributionChart } from "@/features/analytics/components/hours-distribution-chart"
import { getUserStatisticsAction } from "@/application/study-analytics/study-analytics.actions"
import { toast } from "sonner"

export function EstudeiStatisticsView() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    async function loadStats() {
      setLoading(true)
      const { data, error } = await getUserStatisticsAction(365)
      if (error) {
        toast.error("Erro ao carregar estatísticas: " + error)
      } else {
        setStats(data)
      }
      setLoading(false)
    }
    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Se não houver dados, definimos fallbacks zerados
  const totalMinutes = stats?.totalMinutes || 0
  const totalCorrect = stats?.totalCorrect || 0
  const totalWrong = stats?.totalWrong || 0
  const totalQuestions = totalCorrect + totalWrong
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
  
  const formatHoursMinutes = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h${m < 10 ? "0" : ""}${m}min`
  }
  
  const formatTimeStr = formatHoursMinutes(totalMinutes)

  const disciplineRanking = stats?.disciplineRanking || []

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Estatísticas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Análise detalhada do seu progresso, horas de estudo e desempenho por matéria
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2">
            <GraduationCap className="h-4 w-4" />
            Cargo Alvo
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. Seção Topo: Card Donut DESEMPENHO + 5 Cards da Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card Donut DESEMPENHO */}
        <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-col justify-between items-center text-center">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block w-full text-left border-b pb-2">
            DESEMPENHO
          </span>

          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-rose-400"
                  strokeWidth="3.8"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#2563EB]"
                  strokeDasharray={`${accuracy}, 100`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-foreground font-mono">{accuracy}%</span>
              </div>
            </div>

            <span className="text-xs font-bold text-muted-foreground">
              {totalQuestions} questões resolvidas
            </span>
          </div>
        </div>

        {/* 5 Cards em Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* TEMPO DE ESTUDO */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-32">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              TEMPO DE ESTUDO
            </span>
            <div className="flex items-end justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground space-y-0.5">
                <span className="block font-medium">-- por dia estudado (média)</span>
                <span className="block">{stats?.totalSessions || 0} sessões de estudo</span>
              </div>
              <span className="text-2xl font-black text-foreground font-mono">{formatTimeStr}</span>
            </div>
          </div>

          {/* CONSTÂNCIA NOS ESTUDOS */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-32">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              CONSTÂNCIA NOS ESTUDOS
            </span>
            <div className="flex items-end justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground space-y-0.5">
                <span className="block">Em desenvolvimento...</span>
              </div>
              <span className="text-2xl font-black text-foreground font-mono">0%</span>
            </div>
          </div>

          {/* PÁGINAS LIDAS */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              PÁGINAS LIDAS
            </span>
            <div className="flex items-end justify-between">
              <span className="text-[11px] text-muted-foreground font-medium">0.0 páginas por hora</span>
              <span className="text-2xl font-black text-foreground font-mono">0</span>
            </div>
          </div>

          {/* VIDEOAULAS */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              VIDEOAULAS
            </span>
            <div className="text-right">
              <span className="text-2xl font-black text-foreground font-mono">0h00min</span>
            </div>
          </div>

          {/* PROGRESSO NO EDITAL */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28 sm:col-span-2">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              PROGRESSO NO EDITAL
            </span>
            <div className="flex items-end justify-between">
              <div className="text-[11px] font-bold space-y-0.5">
                <span className="text-emerald-600 block">0 tópicos concluídos</span>
                <span className="text-rose-500 block">0 tópicos pendentes</span>
              </div>
              <span className="text-2xl font-black text-foreground font-mono">0%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Seção Meio A: Gráficos Originais de Evolução e Distribuição */}
      <div className="space-y-6 pt-4 border-t">
        <h2 className="text-sm font-extrabold uppercase text-muted-foreground tracking-wider">
          EVOLUÇÃO E ANÁLISE TEMPORAL
        </h2>
        <PerformanceChart />
        <HoursDistributionChart />
      </div>

      {/* 4. Seção Meio B: 2 Gráficos Lado a Lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t">
        {/* Gráfico 1: DISCIPLINAS X HORAS DE ESTUDO */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block border-b pb-3">
            DISCIPLINAS X HORAS DE ESTUDO
          </span>

          <div className="space-y-3 pt-2 max-h-64 overflow-y-auto">
            {disciplineRanking.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                Você ainda não tem horas registradas em nenhuma disciplina.
              </div>
            ) : (
              disciplineRanking.map((disc: any) => {
                const maxVal = Math.max(...disciplineRanking.map((d: any) => d.totalMinutes))
                const pct = maxVal > 0 ? (disc.totalMinutes / maxVal) * 100 : 0
                return (
                  <div key={disc.disciplineId} className="flex items-center gap-3 text-xs">
                    <span className="w-36 font-semibold text-foreground text-[11px] truncate text-right">
                      {disc.name}
                    </span>

                    <div className="flex-1 h-7 bg-muted/20 rounded-xs border-l relative flex items-center overflow-hidden">
                      {pct > 0 && (
                        <div
                          className="h-full bg-[#2563EB] flex items-center justify-center transition-all shadow-2xs"
                          style={{ width: `${pct}%` }}
                        >
                          <span className="text-[10px] font-black text-white font-mono">{formatHoursMinutes(disc.totalMinutes)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Gráfico 2: CATEGORIAS X HORAS DE ESTUDO (Gráfico de Teia / Radar) */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              CATEGORIAS X HORAS DE ESTUDO
            </span>

            <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
              <button type="button" className="p-0.5 hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[#2563EB] font-extrabold">TOP 1 ~ 3</span>
              <button type="button" className="p-0.5 hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="py-6 flex flex-col items-center justify-center relative min-h-[220px]">
             {totalMinutes === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-10">
                  Sem dados suficientes.
                </div>
             ) : (
               <>
                  <div className="relative w-72 h-64 flex items-center justify-center">
                    <svg className="w-full h-full" viewBox="0 0 200 180">
                      <polygon points="100,20 180,150 20,150" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                      <polygon points="100,50 155,130 45,130" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                      <polygon points="100,80 130,110 70,110" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                      <line x1="100" y1="20" x2="100" y2="150" stroke="#e2e8f0" strokeWidth="1" />

                      <polygon points="100,30 170,140 30,140" fill="#2563EB" fillOpacity="0.25" stroke="#2563EB" strokeWidth="2" />
                    </svg>

                    <div className="absolute top-0 text-center">
                      <span className="text-[10px] font-bold text-muted-foreground block mb-0.5">Revisão</span>
                      <span className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black font-mono shadow-2xs">
                        0h00min
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-0 text-center">
                      <span className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black font-mono shadow-2xs block mb-0.5">
                        {formatTimeStr}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">Teoria</span>
                    </div>

                    <div className="absolute bottom-2 right-0 text-center">
                      <span className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black font-mono shadow-2xs block mb-0.5">
                        0h00min
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">Questões</span>
                    </div>
                  </div>
               </>
             )}
          </div>
        </div>
      </div>

      {/* 5. Seção Inferior: DISCIPLINAS X DESEMPENHO */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-6 pt-4 border-t">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block border-b pb-3">
          DISCIPLINAS X DESEMPENHO
        </span>

        <div className="pt-2 space-y-4">
          <div className="text-center text-xs text-muted-foreground py-10 border rounded">
             O gráfico de desempenho está sendo integrado à base de questões.
          </div>
        </div>
      </div>
    </div>
  )
}

