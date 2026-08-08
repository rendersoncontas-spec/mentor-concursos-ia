"use client"

import { useState } from "react"
import { Calendar, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { UserExamModal } from "@/features/dashboard/components/user-exam-modal"

export interface DisciplinePerformanceRow {
  id: string
  name: string
  timeFormatted: string
  correctCount: number
  wrongCount: number
  questionsCount: number
  accuracyPercentage: number
}

interface EstudeiPainelCardProps {
  disciplines?: DisciplinePerformanceRow[]
  examName?: string | null
  examDaysRemaining?: number | null
  weeklyHoursTarget?: number
  weeklyHoursCurrent?: number
  weeklyQuestionsTarget?: number
  weeklyQuestionsCurrent?: number
}

const DEFAULT_DISCIPLINES_PAINEL: DisciplinePerformanceRow[] = [
  { id: "d1", name: "Língua Portuguesa", timeFormatted: "4h30min", correctCount: 38, wrongCount: 7, questionsCount: 45, accuracyPercentage: 84 },
  { id: "d2", name: "Direito Constitucional", timeFormatted: "6h15min", correctCount: 52, wrongCount: 8, questionsCount: 60, accuracyPercentage: 86 },
  { id: "d3", name: "Direito Administrativo", timeFormatted: "5h00min", correctCount: 41, wrongCount: 9, questionsCount: 50, accuracyPercentage: 82 },
  { id: "d4", name: "Informática", timeFormatted: "3h45min", correctCount: 28, wrongCount: 7, questionsCount: 35, accuracyPercentage: 80 },
  { id: "d5", name: "Raciocínio Lógico", timeFormatted: "2h30min", correctCount: 20, wrongCount: 5, questionsCount: 25, accuracyPercentage: 80 },
  { id: "d6", name: "Estatística", timeFormatted: "1h30min", correctCount: 12, wrongCount: 4, questionsCount: 16, accuracyPercentage: 75 },
]

export function EstudeiPainelCard({
  disciplines = DEFAULT_DISCIPLINES_PAINEL,
  examName = "Concurso Alvo",
  examDaysRemaining = null,
  weeklyHoursTarget = 25,
  weeklyHoursCurrent = 14,
  weeklyQuestionsTarget = 175,
  weeklyQuestionsCurrent = 115,
}: EstudeiPainelCardProps) {
  const [chartMode, setChartMode] = useState<"time" | "questions">("time")
  const [isExamModalOpen, setIsExamModalOpen] = useState(false)

  const rows = disciplines.length > 0 ? disciplines : DEFAULT_DISCIPLINES_PAINEL

  const hoursPercentage = Math.min(100, Math.round((weeklyHoursCurrent / (weeklyHoursTarget || 1)) * 100))
  const questionsPercentage = Math.min(100, Math.round((weeklyQuestionsCurrent / (weeklyQuestionsTarget || 1)) * 100))

  return (
    <div className="space-y-4">
      <UserExamModal open={isExamModalOpen} onOpenChange={setIsExamModalOpen} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Esquerda: Tabela PAINEL por Disciplina */}
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            {/* Table Header */}
            <div className="p-4 border-b bg-card flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                PAINEL DE DESEMPENHO POR DISCIPLINA
              </h3>
              <Badge variant="outline" className="text-[10px] font-semibold">
                {rows.length} disciplinas
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground font-semibold">
                    <th className="px-4 py-3 text-foreground font-bold">Disciplinas</th>
                    <th className="px-3 py-3 text-center">Tempo</th>
                    <th className="px-2 py-3 text-center text-emerald-600 font-bold" title="Acertos">✔</th>
                    <th className="px-2 py-3 text-center text-rose-500 font-bold" title="Erros">✖</th>
                    <th className="px-2 py-3 text-center text-blue-600 font-bold" title="Total de Questões">📝</th>
                    <th className="px-3 py-3 text-center font-bold text-foreground">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-primary truncate max-w-[200px]">
                        {row.name}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                        {row.timeFormatted || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono font-bold text-emerald-600">
                        {row.correctCount}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono font-bold text-rose-500">
                        {row.wrongCount}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-blue-600 font-bold">
                        {row.questionsCount}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-extrabold text-foreground">
                        {row.accuracyPercentage > 0 ? `${row.accuracyPercentage}%` : "0%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Direita: Data da Prova + Metas Semanais + Estudo Semanal */}
        <div className="space-y-4">
          {/* Card 1: Data da Prova */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
              <span>DATA DA PROVA</span>
              <button
                type="button"
                onClick={() => setIsExamModalOpen(true)}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              >
                <Calendar className="h-3.5 w-3.5 text-primary" />
              </button>
            </div>
            {examDaysRemaining !== null && examDaysRemaining !== undefined ? (
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-2xl font-black text-foreground">{examDaysRemaining} dias</span>
                <span className="text-xs text-muted-foreground font-medium">{examName}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">
                Acompanhe aqui quantos dias faltam para a sua prova!{" "}
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(true)}
                  className="text-primary font-bold hover:underline"
                >
                  Criar Prova
                </button>
              </p>
            )}
          </div>

          {/* Card 2: Metas de Estudo Semanal */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
              <span>METAS DE ESTUDO SEMANAL</span>
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>

            {/* Horas */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">{weeklyHoursCurrent}h00min / {weeklyHoursTarget}h00min</span>
                <span className="font-bold text-foreground">Horas de Estudo</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${hoursPercentage}%` }}
                />
              </div>
            </div>

            {/* Questões */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">{weeklyQuestionsCurrent} / {weeklyQuestionsTarget}</span>
                <span className="font-bold text-foreground">Questões</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${questionsPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Estudo Semanal Gráfico */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                ESTUDO SEMANAL
              </span>

              {/* Selector de modo */}
              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  onClick={() => setChartMode("time")}
                  className={`px-2 py-0.5 rounded transition-all ${
                    chartMode === "time" ? "bg-primary text-white shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  TEMPO
                </button>
                <button
                  onClick={() => setChartMode("questions")}
                  className={`px-2 py-0.5 rounded transition-all ${
                    chartMode === "questions" ? "bg-primary text-white shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  QUESTÕES
                </button>
              </div>
            </div>

            {/* Barras do Gráfico */}
            <div className="flex items-end justify-between h-20 pt-2 px-2 border-b">
              {[
                { day: "Seg", val: 80 },
                { day: "Ter", val: 100 },
                { day: "Qua", val: 60 },
                { day: "Qui", val: 90 },
                { day: "Sex", val: 70 },
                { day: "Sáb", val: 40 },
                { day: "Dom", val: 30 },
              ].map((bar) => (
                <div key={bar.day} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className="w-3 rounded-t bg-primary/80 hover:bg-primary transition-all"
                    style={{ height: `${bar.val}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground font-semibold">{bar.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
