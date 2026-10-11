import type { ReactNode } from "react"

import Link from "next/link"

import { Compass } from "lucide-react"

import { formatDurationRaw } from "@/application/study-analytics/engine/stats-engine"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Metric, MetricStrip } from "@/components/ui/metric"
import { SectionHeader } from "@/components/ui/section-header"
import type {
  ContextQualityLevel,
  MentorInsight,
  MentorPriority,
  MentorRecommendationCandidate,
  StudentMentorContext,
} from "@/domain/mentor/student-mentor-context"

/**
 * G2.15 — "Visão do Mentor": o contexto determinístico do aluno, como ele
 * será entregue a uma IA no futuro. Não é chat e não decide nada: só mostra
 * números já calculados, com "—" onde não há dado (nunca 0 inventado).
 */

const QUALITY_LABEL: Record<ContextQualityLevel, string> = {
  EMPTY: "Sem dados",
  LOW: "Dados iniciais",
  MEDIUM: "Dados parciais",
  HIGH: "Dados consistentes",
}

const PRIORITY_LABEL: Record<MentorPriority, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
}

const PRIORITY_VARIANT: Record<MentorPriority, "destructive" | "warning" | "secondary"> = {
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
}

function pctText(v: number | null): string {
  if (v === null) return "—"
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}%`
}

function ppText(v: number | null): string {
  if (v === null) return "—"
  const abs = Number.isInteger(Math.abs(v)) ? String(Math.abs(v)) : Math.abs(v).toFixed(1).replace(".", ",")
  if (v > 0) return `+${abs} p.p.`
  if (v < 0) return `−${abs} p.p.`
  return "0 p.p."
}

function minutesText(v: number | null): string {
  return v === null ? "—" : formatDurationRaw(v)
}

export function MentorOverview({ context, analysisSlot }: { context: StudentMentorContext; analysisSlot?: ReactNode }) {
  const { study, goals, simulations, reviews, contextQuality } = context

  if (contextQuality.level === "EMPTY") {
    return (
      <section className="rounded-lg border bg-card">
        <EmptyState
          icon={Compass}
          title="Dados insuficientes para avaliar sua evolução."
          description="Registre seus estudos, um simulado ou uma meta semanal para o Mentor ter o que analisar."
          action={
            <Link href="/dashboard/study-session" className="text-sm font-medium text-primary hover:underline">
              Registrar um estudo
            </Link>
          }
        />
      </section>
    )
  }

  const goal = goals.weeklyStudy
  const attention = simulations.bottleneck
  const goalHint = goal
    ? `${minutesText(goal.realized)} de ${minutesText(goal.target)} nesta semana`
    : "Sem meta semanal de horas definida"
  let reviewsValue = "—"
  let reviewsHint = "Nenhuma revisão cadastrada"
  if (reviews.status === "OK") {
    reviewsValue = String(reviews.overdue ?? 0)
    reviewsHint = `${reviews.dueToday ?? 0} para hoje · ${reviews.upcoming ?? 0} próximas`
  } else if (reviews.status === "UNAVAILABLE") {
    reviewsHint = "Não foi possível ler as revisões"
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <div>
            <p className="type-caption uppercase tracking-wide">Fatos do sistema</p>
            <h2 className="type-h3 text-foreground">Seu momento atual</h2>
          </div>
          <Badge variant="outline" title={contextQuality.reasons.join(" ")}>
            {QUALITY_LABEL[contextQuality.level]}
          </Badge>
        </div>
        <MetricStrip className="mt-3">
          <Metric
            label="Horas estudadas (7 dias)"
            value={minutesText(study.last7?.minutes ?? null)}
            hint={study.last7 ? `${study.last7.sessions} sessões em ${study.last7.studiedDays} dias` : "Sem estudos registrados"}
          />
          <Metric
            label="Meta semanal"
            value={goal ? minutesText(goal.target) : "—"}
            hint={goalHint}
          />
          <Metric
            label="Simulados"
            value={pctText(simulations.averageAccuracy)}
            hint={simulations.count ? `média de ${simulations.count} · último ${pctText(simulations.lastAccuracy)}` : "Nenhum simulado registrado"}
          />
          <Metric label="Revisões vencidas" value={reviewsValue} hint={reviewsHint} />
        </MetricStrip>
        <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <dt className="type-label">Matéria que merece atenção</dt>
            <dd className="mt-1 text-sm text-foreground">
              {attention && attention.accuracy !== null ? (
                <>
                  <span className="font-semibold">{attention.name}</span> — {pctText(attention.accuracy)}
                  {attention.lowData && <span className="text-muted-foreground"> (um único simulado)</span>}
                </>
              ) : (
                <span className="text-muted-foreground">Sem simulados suficientes para apontar.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="type-label">Evolução nos simulados</dt>
            <dd className="mt-1 text-sm text-foreground">
              {simulations.count !== null && simulations.count >= 2 ? (
                <>
                  <span className="font-semibold">{ppText(simulations.firstToLastPp)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    do primeiro ({pctText(simulations.firstAccuracy)}) ao último ({pctText(simulations.lastAccuracy)})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Dados insuficientes para avaliar sua evolução.</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {analysisSlot}

      <InsightList insights={context.insights} />
      <RecommendationList items={context.recommendations} />

      <p className="type-caption">
        Visão determinística: todos os números vêm do seu histórico registrado no NomeIA (estudos, simulados,
        revisões, ciclo e metas).{analysisSlot ? " Só o bloco “Análise do Mentor”, quando pedido, é texto interpretativo gerado por IA." : ""}
      </p>
    </div>
  )
}

function InsightList({ insights }: { insights: MentorInsight[] }) {
  if (insights.length === 0) return null
  return (
    <section>
      <SectionHeader title="Pontos para acompanhar" description="Fatos calculados pelo sistema, sem interpretação." />
      <ul className="mt-3 divide-y rounded-lg border bg-card">
        {insights.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <p className="text-sm text-foreground">{i.message}</p>
            {i.priority !== "LOW" && (
              <Badge variant={PRIORITY_VARIANT[i.priority]} className="shrink-0">
                {PRIORITY_LABEL[i.priority]}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecommendationList({ items }: { items: MentorRecommendationCandidate[] }) {
  if (items.length === 0) return null
  return (
    <section>
      <SectionHeader
        title="Próximos passos"
        description="Calculados pelo sistema a partir dos seus dados (sem IA). Nada é alterado automaticamente."
      />
      <ul className="mt-3 divide-y rounded-lg border bg-card">
        {items.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <p className="text-sm text-foreground">{r.reason}</p>
            <Badge variant={PRIORITY_VARIANT[r.priority]} className="shrink-0">
              {PRIORITY_LABEL[r.priority]}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
