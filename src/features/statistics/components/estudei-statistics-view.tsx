"use client"

import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Calendar,
  GraduationCap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PerformanceChart } from "@/features/analytics/components/performance-chart"
import { HoursDistributionChart } from "@/features/analytics/components/hours-distribution-chart"

export function EstudeiStatisticsView() {
  const [topCategoryIndex, setTopCategoryIndex] = useState(1)

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header com Título e Botões do Topo (100% Estudei) */}
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
            Analista Tributário
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 2. Seção Topo: Card Donut DESEMPENHO + 5 Cards da Direita (Sua Foto 3 100% Estudei) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card Donut DESEMPENHO (Sua Foto 3) */}
        <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-col justify-between items-center text-center">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block w-full text-left border-b pb-2">
            DESEMPENHO
          </span>

          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            {/* Gráfico Donut de Desempenho */}
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
                  strokeDasharray="91, 100"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-foreground font-mono">91%</span>
              </div>
            </div>

            <span className="text-xs font-bold text-muted-foreground">
              11 questões resolvidas
            </span>
          </div>
        </div>

        {/* 5 Cards em Grid (Sua Foto 3) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* TEMPO DE ESTUDO */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-32">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              TEMPO DE ESTUDO
            </span>
            <div className="flex items-end justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground space-y-0.5">
                <span className="block font-medium">15h00min por dia estudado (média)</span>
                <span className="block">2 dias estudados</span>
                <span className="block">2 dias totais</span>
              </div>
              <span className="text-2xl font-black text-foreground font-mono">30h00min</span>
            </div>
          </div>

          {/* CONSTÂNCIA NOS ESTUDOS */}
          <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-32">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              CONSTÂNCIA NOS ESTUDOS
            </span>
            <div className="flex items-end justify-between">
              <div className="text-[11px] font-semibold text-muted-foreground space-y-0.5">
                <span className="block">2 dias estudados</span>
                <span className="block">0 dias falhados</span>
              </div>
              <span className="text-2xl font-black text-foreground font-mono">100%</span>
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
                <span className="text-emerald-600 block">2 tópicos concluídos</span>
                <span className="text-rose-500 block">273 tópicos pendentes</span>
              </div>
              <span className="text-2xl font-black text-foreground font-mono">1%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Seção Meio A: Gráficos Originais de Evolução e Distribuição (Preservados!) */}
      <div className="space-y-6 pt-4 border-t">
        <h2 className="text-sm font-extrabold uppercase text-muted-foreground tracking-wider">
          EVOLUÇÃO E ANÁLISE TEMPORAL
        </h2>
        <PerformanceChart />
        <HoursDistributionChart />
      </div>

      {/* 4. Seção Meio B: 2 Gráficos Lado a Lado (Sua Foto 1 100% Estudei) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t">
        {/* Gráfico 1: DISCIPLINAS X HORAS DE ESTUDO (Barras Horizontais - Sua Foto 1) */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block border-b pb-3">
            DISCIPLINAS X HORAS DE ESTUDO
          </span>

          <div className="space-y-3 pt-2">
            {/* Eixo X superior */}
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground px-36 border-b pb-1">
              <span>0h</span>
              <span>3h</span>
              <span>6h</span>
              <span>9h</span>
              <span>12h</span>
            </div>

            {/* Linhas das Disciplinas */}
            {[
              { name: "Administração Geral", hours: "10h00min", percent: 83 },
              { name: "Administração Pública", hours: "10h00min", percent: 83 },
              { name: "Contabilidade Geral", hours: "", percent: 0 },
              { name: "Direito Administrativo", hours: "", percent: 0 },
              { name: "Direito Constitucional", hours: "10h00min", percent: 83 },
              { name: "Direito Previdenciário", hours: "", percent: 0 },
              { name: "Direito Tributário", hours: "", percent: 0 },
              { name: "Estatística", hours: "", percent: 0 },
            ].map((disc) => (
              <div key={disc.name} className="flex items-center gap-3 text-xs">
                <span className="w-36 font-semibold text-foreground text-[11px] truncate text-right">
                  {disc.name}
                </span>

                <div className="flex-1 h-7 bg-muted/20 rounded-xs border-l relative flex items-center overflow-hidden">
                  {disc.percent > 0 && (
                    <div
                      className="h-full bg-[#2563EB] flex items-center justify-center transition-all shadow-2xs"
                      style={{ width: `${disc.percent}%` }}
                    >
                      <span className="text-[10px] font-black text-white font-mono">{disc.hours}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico 2: CATEGORIAS X HORAS DE ESTUDO (Gráfico de Teia / Radar - Sua Foto 1) */}
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

          {/* Gráfico de Radar / Teia Ilustrado com SVG (Sua Foto 1) */}
          <div className="py-6 flex flex-col items-center justify-center relative">
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
                  10h00min
                </span>
              </div>

              <div className="absolute bottom-2 left-0 text-center">
                <span className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black font-mono shadow-2xs block mb-0.5">
                  10h00min
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">Teoria</span>
              </div>

              <div className="absolute bottom-2 right-0 text-center">
                <span className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black font-mono shadow-2xs block mb-0.5">
                  10h00min
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">Questões</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Seção Inferior: DISCIPLINAS X DESEMPENHO (Sua Foto 2 100% Estudei) */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-6 pt-4 border-t">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block border-b pb-3">
          DISCIPLINAS X DESEMPENHO
        </span>

        <div className="pt-2 space-y-4">
          <div className="relative h-64 border-b flex items-end justify-between px-6 gap-2">
            {/* Eixo Y Esquerdo (Questões: 0 a 21) */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] font-mono text-muted-foreground -ml-4 py-1">
              <span>21</span>
              <span>19</span>
              <span>17</span>
              <span>15</span>
              <span>13</span>
              <span>11</span>
              <span>8</span>
              <span>6</span>
              <span>4</span>
              <span>2</span>
              <span>0</span>
            </div>

            {/* Eixo Y Direito (% Desempenho: 0% a 100%) */}
            <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between text-[10px] font-mono text-muted-foreground -mr-4 py-1">
              <span>100%</span>
              <span>90%</span>
              <span>80%</span>
              <span>70%</span>
              <span>60%</span>
              <span>50%</span>
              <span>40%</span>
              <span>30%</span>
              <span>20%</span>
              <span>10%</span>
              <span>0%</span>
            </div>

            {/* Barras e Indicadores por Disciplina */}
            {[
              { name: "Administração Geral", questions: 0, perf: 0 },
              { name: "Administração Pública", questions: 11, perf: 90 },
              { name: "Contabilidade Geral", questions: 0, perf: 0 },
              { name: "Direito Administrativo", questions: 0, perf: 0 },
              { name: "Direito Constitucional", questions: 0, perf: 0 },
              { name: "Direito Previdenciário", questions: 0, perf: 0 },
              { name: "Direito Tributário", questions: 0, perf: 0 },
              { name: "Estatística", questions: 0, perf: 0 },
              { name: "Fluência em Dados", questions: 0, perf: 0 },
              { name: "Legislação Aduaneira", questions: 0, perf: 0 },
              { name: "Legislação Tributária", questions: 0, perf: 0 },
              { name: "Língua Inglesa", questions: 0, perf: 0 },
              { name: "Língua Portuguesa", questions: 0, perf: 0 },
              { name: "Raciocínio Lógico", questions: 0, perf: 0 },
            ].map((d) => (
              <div key={d.name} className="flex-1 flex flex-col items-center justify-end h-full relative">
                {d.perf > 0 && (
                  <div className="absolute top-6 z-10">
                    <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white font-mono font-black text-[9px] shadow-2xs">
                      {d.perf}
                    </span>
                  </div>
                )}

                <div
                  className={`w-full max-w-[28px] rounded-t-sm transition-all ${
                    d.questions > 0 ? "bg-[#2563EB] h-1/2" : "h-0.5 bg-muted/20"
                  }`}
                />
              </div>
            ))}
          </div>

          {/* Rótulos Inclinados do Eixo X */}
          <div className="flex justify-between items-start px-6 gap-2 pt-2 text-[10px] font-semibold text-muted-foreground">
            {[
              "Administração Geral",
              "Administração Pública",
              "Contabilidade Geral",
              "Direito Administrativo",
              "Direito Constitucional",
              "Direito Previdenciário",
              "Direito Tributário",
              "Estatística",
              "Fluência em Dados",
              "Legislação Aduaneira",
              "Legislação Tributária",
              "Língua Inglesa",
              "Língua Portuguesa",
              "Raciocínio Lógico",
            ].map((label) => (
              <div key={label} className="flex-1 text-center truncate transform -rotate-45 origin-top-left -ml-2">
                {label}
              </div>
            ))}
          </div>

          {/* Legenda Inferior (Sua Foto 2) */}
          <div className="flex items-center justify-center gap-6 pt-10 text-xs font-bold text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#2563EB]" />
              <span>Questões</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-600" />
              <span>Desempenho</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

