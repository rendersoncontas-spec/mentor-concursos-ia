"use client"

import { useEffect, useRef, useState } from "react"

import { Loader2 } from "lucide-react"

import {
  STUDY_PERFORMANCE_PERIODS,
  STUDY_PERFORMANCE_STATUS_LABEL,
  formatPpSigned,
  type StudyPerformancePeriodKey,
  type StudyPerformanceReport,
  type StudyPerformanceRow,
  type StudyPerformanceStatus,
} from "@/application/simulados/study-performance"
import { formatDurationRaw } from "@/application/study-analytics/engine/stats-engine"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useSimuladosActions, type SimuladosActions } from "@/features/simulados/simulados-actions"
import { cn } from "@/lib/utils"

/**
 * G2.11 — Estudo × desempenho por matéria. Lê o relatório já calculado no
 * servidor (getStudyPerformanceAction) e só apresenta: tabela no desktop,
 * cartões no celular, detalhe em Dialog. Recarrega quando o período muda e
 * quando a página avisa que um simulado foi salvo/excluído (`refreshKey`).
 */

const STATUS_TONE: Record<StudyPerformanceStatus, string> = {
  ALTA_EVOLUCAO: "text-emerald-700 dark:text-emerald-400",
  EVOLUCAO: "text-emerald-700 dark:text-emerald-400",
  ESTAVEL: "text-foreground",
  QUEDA: "text-rose-700 dark:text-rose-400",
  MUITO_ESTUDO_POUCA_EVOLUCAO: "text-amber-700 dark:text-amber-400",
  POUCO_ESTUDO: "text-muted-foreground",
  DADOS_INSUFICIENTES: "text-muted-foreground",
  SEM_SIMULADO: "text-muted-foreground",
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`)
const studyLabel = (m: number | null) => (m === null ? "—" : formatDurationRaw(m))
const evolutionLabel = (r: StudyPerformanceRow) => (r.evolutionPp === null ? "—" : formatPpSigned(r.evolutionPp))
const firstLastLabel = (r: StudyPerformanceRow) =>
  r.simuladosCount >= 2 ? `${pct(r.firstAccuracy)} → ${pct(r.lastAccuracy)}` : "—"

function formatDateBR(key: string): string {
  const [y, m, d] = key.split("-")
  return y && m && d ? `${d}/${m}/${y}` : key
}

function StatusText({ status }: { status: StudyPerformanceStatus }) {
  return <span className={cn("text-xs font-semibold", STATUS_TONE[status])}>{STUDY_PERFORMANCE_STATUS_LABEL[status]}</span>
}

export function StudyPerformanceSection({ refreshKey }: { refreshKey: number }) {
  // G2.21: a fronteira das actions fica numa ref — o efeito continua
  // recalculando só quando o período ou o refreshKey mudam.
  const actions = useSimuladosActions()
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  })
  const [period, setPeriod] = useState<StudyPerformancePeriodKey>("8w")
  const [report, setReport] = useState<StudyPerformanceReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StudyPerformanceRow | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      // G2.21: chamada rejeitada (rede/servidor) não deixa "Calculando…" para sempre.
      let res: Awaited<ReturnType<SimuladosActions["getStudyPerformance"]>>
      try {
        res = await actionsRef.current.getStudyPerformance(period)
      } catch {
        res = { data: null, error: "Não foi possível calcular estudo × desempenho agora. Tente novamente mais tarde." }
      }
      if (cancelled) return
      setReport(res.data)
      setError(res.error)
      setLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [period, refreshKey])

  const disciplinesWithStudy = report?.rows.filter((r) => (r.studyMinutes ?? 0) > 0).length ?? 0

  return (
    <section aria-labelledby="estudo-desempenho" className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="estudo-desempenho" className="text-[13px] font-semibold text-foreground">
            Estudo × desempenho por matéria
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Horas registradas no histórico de estudo e resultados dos simulados no mesmo período.
          </p>
        </div>
        <div role="group" aria-label="Período da análise" className="inline-flex items-center rounded-md bg-muted p-0.5">
          {STUDY_PERFORMANCE_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={cn(
                "whitespace-nowrap rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                period === p.key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Calculando…
        </div>
      )}
      {!loading && error && (
        <p className="p-4 text-[13px] text-destructive" role="alert">
          {error}
        </p>
      )}
      {report && !(error && !loading) && (
        <div className={cn("transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <div className="px-4 pt-3 pb-1 space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="text-foreground font-semibold">{report.periodLabel}</span>
              {report.startKey && ` (${formatDateBR(report.startKey)} a ${formatDateBR(report.endKey)})`}:{" "}
              {formatDurationRaw(report.totalStudyMinutes)} de estudo registrado
              {disciplinesWithStudy > 0 && ` em ${disciplinesWithStudy} matéria${disciplinesWithStudy !== 1 ? "s" : ""}`} ·{" "}
              {report.simuladosInPeriod} simulado{report.simuladosInPeriod !== 1 ? "s" : ""}.
            </p>
            {report.unassignedStudyMinutes > 0 && (
              <p>{formatDurationRaw(report.unassignedStudyMinutes)} de estudo sem matéria não foram atribuídos a nenhuma disciplina.</p>
            )}
            {report.invalidSessions > 0 && (
              <p>{report.invalidSessions} sessão(ões) com duração inválida ficaram fora da soma.</p>
            )}
          </div>

          {report.rows.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted-foreground">Nenhum estudo ou simulado registrado neste período.</p>
          ) : (
            <>
              {/* Desktop: tabela comparativa */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    Estudo e desempenho por matéria, {report.periodPhrase}
                  </caption>
                  <thead>
                    <tr className="type-label text-left border-b border-border">
                      <th scope="col" className="px-4 py-2 font-medium">Matéria</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right">Estudo</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right">Simulados</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right">Média</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right">Primeiro → último</th>
                      <th scope="col" className="px-2 py-2 font-medium text-right">Evolução</th>
                      <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.rows.map((r) => (
                      <tr key={r.disciplineId ?? r.disciplineName} className="hover:bg-muted/20">
                        <th scope="row" className="px-4 py-2 text-left font-semibold">
                          <button
                            type="button"
                            onClick={() => setSelected(r)}
                            className="text-left text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          >
                            {r.disciplineName}
                          </button>
                        </th>
                        <td className="px-2 py-2 text-right tabular-nums">{studyLabel(r.studyMinutes)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.simuladosCount}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{pct(r.averageAccuracy)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{firstLastLabel(r)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{evolutionLabel(r)}</td>
                        <td className="px-4 py-2">
                          <StatusText status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Celular: cartões compactos */}
              <ul className="md:hidden divide-y divide-border">
                {report.rows.map((r) => (
                  <li key={r.disciplineId ?? r.disciplineName}>
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="w-full min-h-11 px-4 py-3 text-left space-y-1 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-foreground truncate">{r.disciplineName}</span>
                        <StatusText status={r.status} />
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                        <span>Estudo {studyLabel(r.studyMinutes)}</span>
                        <span>Média {pct(r.averageAccuracy)}</span>
                        <span>Evolução {evolutionLabel(r)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="px-4 py-3 border-t border-border text-[11px] text-muted-foreground">
            Os números mostram estudo e resultados do mesmo período, lado a lado. Eles não indicam que um causou o outro.
          </p>
        </div>
      )}

      {selected && report && <SubjectDetailDialog row={selected} report={report} onClose={() => setSelected(null)} />}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground truncate">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function SubjectDetailDialog({
  row,
  report,
  onClose,
}: {
  row: StudyPerformanceRow
  report: StudyPerformanceReport
  onClose: () => void
}) {
  const weekly = row.weeklyMinutes
  const maxWeek = weekly ? Math.max(...weekly, 0) : 0
  const showWeekly = weekly !== null && (row.studyMinutes ?? 0) > 0 && report.startKey !== null

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <div className="p-5 border-b">
          <DialogTitle className="text-base font-semibold text-foreground pr-8">{row.disciplineName}</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
            {report.periodLabel}
            {report.startKey && ` · ${formatDateBR(report.startKey)} a ${formatDateBR(report.endKey)}`} ·{" "}
            {STUDY_PERFORMANCE_STATUS_LABEL[row.status]}
          </DialogDescription>
          {row.mergedNames.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Inclui também: {row.mergedNames.join(", ")} (mesma matéria no catálogo).
            </p>
          )}
        </div>

        <div className="p-5 space-y-5">
          <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-xs">
            <Stat label="Tempo estudado" value={studyLabel(row.studyMinutes)} />
            <Stat label="Sessões" value={row.studyMinutes === null ? "—" : String(row.studySessions)} />
            <Stat label="Simulados" value={String(row.simuladosCount)} />
            <Stat label="Média" value={pct(row.averageAccuracy)} />
            <Stat label="Primeiro" value={pct(row.firstAccuracy)} />
            <Stat label="Último" value={pct(row.lastAccuracy)} />
            <Stat label="Melhor" value={pct(row.bestAccuracy)} />
            <Stat label="Pior" value={pct(row.worstAccuracy)} />
            <Stat label="Evolução" value={evolutionLabel(row)} />
          </dl>

          <ul className="space-y-1.5 text-[13px] text-foreground">
            {row.insights.map((text) => (
              <li key={text} className="leading-relaxed">
                {text}
              </li>
            ))}
          </ul>

          {row.history.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[13px] font-semibold text-foreground">Simulados no período</h3>
              <ol className="space-y-1.5">
                {row.history.map((h) => (
                  <li key={h.simuladoId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                    <span className="truncate text-muted-foreground">
                      <span className="tabular-nums">{formatDateBR(h.date)}</span> · {h.name}
                    </span>
                    <span className="font-semibold tabular-nums">{pct(h.accuracy)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {showWeekly && weekly && (
            <div className="space-y-2">
              <h3 className="text-[13px] font-semibold text-foreground">Estudo por semana</h3>
              <ol className="space-y-1">
                {weekly.map((m, i) => (
                  <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">Semana {i + 1}</span>
                    <span className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                      <span
                        className="block h-full bg-primary"
                        style={{ width: maxWeek > 0 ? `${(m / maxWeek) * 100}%` : "0%" }}
                      />
                    </span>
                    <span className="text-right tabular-nums">{formatDurationRaw(m)}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">Semana 1 é a mais antiga do período.</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
