import { redirect } from "next/navigation"

import { BarChart3, CalendarDays } from "lucide-react"

import {
  getActiveStudyPlan,
  getStudyPlanDisciplineSummary,
} from "@/application/study-plan/study-plan.service"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GeneratePlanButton } from "@/features/study-plan/components/generate-plan-button"
import {
  StudyPlanDisciplineSummaryView,
  StudyPlanEmptyState,
  StudyPlanWeekView,
} from "@/features/study-plan/components/study-plan-week"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Cronograma de Estudos",
  description: "Seu cronograma de estudos personalizado no Nomeia.",
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export default async function StudyPlanPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [planWeek, disciplineSummary] = await Promise.all([
    getActiveStudyPlan(supabase, user.id),
    getStudyPlanDisciplineSummary(supabase, user.id),
  ])

  const hasPlan = planWeek !== null

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl space-y-8">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cronograma de Estudos</h1>
          <p className="text-muted-foreground mt-1">
            {hasPlan
              ? `Versão ${planWeek.plan.version} · Gerado em ${new Date(planWeek.plan.generated_at).toLocaleDateString("pt-BR")} · ${formatMinutes(planWeek.totalWeeklyMinutes)}/semana`
              : "Gere seu cronograma personalizado baseado no seu concurso e disponibilidade."}
          </p>
        </div>
        <GeneratePlanButton hasPlan={hasPlan} />
      </div>

      {hasPlan ? (
        <>
          {/* Grade Semanal */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Grade Semanal</h2>
              <Badge variant="secondary" className="text-xs">
                {planWeek.days.length} dias ativos
              </Badge>
            </div>
            <StudyPlanWeekView week={planWeek} />
          </section>

          {/* Resumo por Disciplina */}
          {disciplineSummary.length > 0 && (
            <section>
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Resumo Semanal por Disciplina</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <StudyPlanDisciplineSummaryView
                    summaries={disciplineSummary}
                    totalWeeklyMinutes={planWeek.totalWeeklyMinutes}
                  />
                </CardContent>
              </Card>
            </section>
          )}
        </>
      ) : (
        <StudyPlanEmptyState />
      )}
    </div>
  )
}
