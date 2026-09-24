"use client"

import { useEffect, useMemo, useState } from "react"

import {
  AlertTriangle,
  Check,
  ClipboardList,
  Eye,
  ListCheck,
  Loader2,
  Plus,
  Timer,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteSimuladoRecordAction,
  getSimuladoRecordsAction,
} from "@/application/simulados/simulado-records.actions"
import {
  buildEvolutionPoints,
  buildSubjectAnalysis,
  computePanelStats,
  findDecliningSubjects,
  findWeakSubjects,
  formatDuration,
  performanceBandOf,
  sourceLabel,
} from "@/application/simulados/simulado-stats.service"
import { PERFORMANCE_BANDS, type SimuladoRecord } from "@/domain/simulados/types"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { SimuladoRecordModal } from "./simulado-record-modal"

const PERIOD_OPTIONS: { label: string; days: number | null }[] = [
  { label: "Todo período", days: null },
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "6 meses", days: 182 },
  { label: "1 ano", days: 365 },
]

function accuracyColor(accuracy: number | null): string {
  if (accuracy === null) return "text-muted-foreground"
  if (accuracy >= 85) return "text-emerald-600"
  if (accuracy >= 75) return "text-primary"
  if (accuracy >= 60) return "text-amber-700 dark:text-amber-400"
  return "text-rose-600"
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-")
  if (y && m && d) return `${d}/${m}/${y}`
  return dateStr
}

export function SimuladosView() {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<SimuladoRecord[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SimuladoRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [daysFilter, setDaysFilter] = useState<number | null>(null)
  const [examFilter, setExamFilter] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [detail, setDetail] = useState<SimuladoRecord | null>(null)

  const loadData = async () => {
    setLoading(true)
    const res = await getSimuladoRecordsAction()
    if (res.data) setRecords(res.data)
    if (res.error) toast.error(res.error)
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Registros filtrados
  const filteredRecords = useMemo(() => {
    let list = records
    if (daysFilter) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - daysFilter)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      list = list.filter((r) => r.simuladoDate >= cutoffStr)
    }
    if (examFilter) list = list.filter((r) => (r.examName || "") === examFilter)
    if (roleFilter) list = list.filter((r) => (r.roleName || "") === roleFilter)
    if (sourceFilter) list = list.filter((r) => r.source === sourceFilter)
    return list
  }, [records, daysFilter, examFilter, roleFilter, sourceFilter])

  const chronoFiltered = useMemo(
    () => [...filteredRecords].sort((a, b) => a.simuladoDate.localeCompare(b.simuladoDate)),
    [filteredRecords]
  )

  const stats = useMemo(() => computePanelStats(chronoFiltered), [chronoFiltered])
  const evolution = useMemo(() => buildEvolutionPoints(chronoFiltered), [chronoFiltered])
  const subjectAnalysis = useMemo(() => buildSubjectAnalysis(chronoFiltered), [chronoFiltered])
  const weakSubjects = useMemo(
    () => findWeakSubjects(subjectAnalysis).filter((s) => s.totalQuestions >= 5),
    [subjectAnalysis]
  )
  const decliningSubjects = useMemo(
    () => findDecliningSubjects(subjectAnalysis, 3),
    [subjectAnalysis]
  )

  // Opções únicas para filtros (derivadas dos dados reais)
  const examOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.examName).filter((e): e is string => !!e))),
    [records]
  )
  const roleOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.roleName).filter((r): r is string => !!r))),
    [records]
  )
  const sourceOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.source))),
    [records]
  )

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir este simulado permanentemente?")) return
    setDeletingId(id)
    const res = await deleteSimuladoRecordAction(id)
    setDeletingId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success("Simulado excluído.")
    setDetail(null)
    await loadData()
  }

  if (loading) {
    return (
      <>
        <PageHeader icon={ListCheck} title="Simulados" description="Desempenho, evolução e pontos fortes e fracos" />
        <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-2">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
          <p className="text-[13px]">Carregando seus simulados…</p>
        </div>
      </>
    )
  }

  const trendIcon =
    stats.trend === "UP" ? TrendingUp : stats.trend === "DOWN" ? TrendingDown : TrendingUp

  return (
    <>
      <PageHeader
        icon={ListCheck}
        title="Simulados"
        description="Desempenho, evolução e pontos fortes e fracos"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
          >
            <Plus aria-hidden className="h-4 w-4" /> Registrar simulado
          </Button>
        }
      />
      <div className="flex-1 page-container py-5 space-y-6">
        {/* MÉTRICAS DO DASHBOARD: uma única superfície com hierarquia (não 5 cards
            idênticos, cada um repetindo ícone + título + número) */}
        <div className="rounded-xl border bg-card grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-border">
          <MetricStat label="Simulados realizados" value={String(stats.totalSimulados)} />
          <MetricStat
            label="Questões respondidas"
            value={stats.totalQuestions.toLocaleString("pt-BR")}
          />
          <MetricStat
            label="Média de acertos"
            value={stats.averageAccuracy !== null ? `${Math.round(stats.averageAccuracy)}%` : "—"}
            valueClass={accuracyColor(stats.averageAccuracy)}
          />
          <MetricStat
            label="Melhor desempenho"
            value={stats.bestAccuracy !== null ? `${Math.round(stats.bestAccuracy)}%` : "—"}
          />
          <MetricStat
            label="Último simulado"
            value={stats.lastAccuracy !== null ? `${Math.round(stats.lastAccuracy)}%` : "—"}
            valueClass={accuracyColor(stats.lastAccuracy)}
          />
        </div>

        {/* EVOLUÇÃO + TENDÊNCIA */}
        {evolution.length >= 2 && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Evolução de acertos
              </h3>
              {stats.trendMessage && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold gap-1",
                    stats.trend === "UP" && "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
                    stats.trend === "DOWN" && "text-rose-600 border-rose-500/40 bg-rose-500/10",
                    stats.trend === "STABLE" && "text-muted-foreground"
                  )}
                >
                  {(() => {
                    const Icon = trendIcon
                    return <Icon className="h-3 w-3" />
                  })()}
                  {stats.trendMessage}
                  {stats.evolutionPp !== null && (
                    <span className="tabular-nums">
                      ({stats.evolutionPp > 0 ? "+" : ""}
                      {stats.evolutionPp} p.p.)
                    </span>
                  )}
                </Badge>
              )}
            </div>
            {/* Gráfico de barras simples (SVG) */}
            <EvolutionChart points={evolution} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-semibold text-muted-foreground">
              <span>
                Média geral:{" "}
                <strong className="text-foreground">
                  {stats.averageAccuracy !== null ? `${Math.round(stats.averageAccuracy)}%` : "—"}
                </strong>
              </span>
              <span>
                Últimos 5:{" "}
                <strong className="text-foreground">
                  {stats.last5AverageAccuracy !== null ? `${Math.round(stats.last5AverageAccuracy)}%` : "—"}
                </strong>
              </span>
              <span>
                Melhor:{" "}
                <strong className="text-amber-600">
                  {stats.bestAccuracy !== null ? `${Math.round(stats.bestAccuracy)}%` : "—"}
                </strong>
              </span>
              <span>
                Pior:{" "}
                <strong className="text-foreground">
                  {stats.worstAccuracy !== null ? `${Math.round(stats.worstAccuracy)}%` : "—"}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* FILTROS — Fase E: período em segmented control e demais filtros na
            mesma linha (antes: botões com borda + uma segunda linha de filtros). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="Período" className="inline-flex max-w-full items-center overflow-x-auto no-scrollbar rounded-md bg-muted p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setDaysFilter(opt.days)}
                aria-pressed={daysFilter === opt.days}
                className={cn(
                  "whitespace-nowrap rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  daysFilter === opt.days
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(examOptions.length > 0 || roleOptions.length > 0 || sourceOptions.length > 0) && (
            <>
            {examOptions.length > 0 && (
              <SelectPill
                label="Concurso"
                options={examOptions.map((e) => ({ value: e, label: e }))}
                value={examFilter}
                onChange={setExamFilter}
              />
            )}
            {roleOptions.length > 0 && (
              <SelectPill
                label="Cargo"
                options={roleOptions.map((r) => ({ value: r, label: r }))}
                value={roleFilter}
                onChange={setRoleFilter}
              />
            )}
            {sourceOptions.length > 0 && (
              <SelectPill
                label="Fonte"
                options={sourceOptions.map((s) => ({ value: s, label: sourceLabel(s) }))}
                value={sourceFilter}
                onChange={setSourceFilter}
              />
            )}
            </>
          )}
        </div>

        {/* PONTOS FRACOS */}
        {(weakSubjects.length > 0 || decliningSubjects.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {weakSubjects.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle aria-hidden className="h-4 w-4 text-destructive" /> Pontos que merecem atenção
                </h3>
                {weakSubjects.slice(0, 6).map((s) => (
                  <div key={s.disciplineName} className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-foreground truncate">{s.disciplineName}</span>
                    <span className="text-rose-600 tabular-nums shrink-0">
                      {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {decliningSubjects.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" /> Queda de desempenho
                </h3>
                {decliningSubjects.map((s) => (
                  <p key={s.disciplineName} className="text-xs font-semibold text-foreground">
                    Você apresenta queda de desempenho em <strong>{s.disciplineName}</strong> nos últimos simulados.
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fase E: em telas largas a lista e a análise por matéria ficam lado a
            lado (antes empilhadas, com linhas de 1.600px quase vazias). */}
        <div className="grid items-start gap-4 min-[1440px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* LISTA DE SIMULADOS */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b bg-card flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <TrendingUp aria-hidden className="h-4 w-4 text-muted-foreground" /> Simulados recentes
              </h3>
              <Badge variant="outline" className="text-[10px] font-semibold">
                {filteredRecords.length} registro{filteredRecords.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="p-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-14 w-14 rounded-xl bg-muted/40 border flex items-center justify-center">
                  <ClipboardList className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-semibold text-foreground">Nenhum simulado registrado</h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    Fez um simulado fora do NomeIA? Registre o resultado e acompanhe sua evolução.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setEditing(null)
                    setModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" /> Registrar primeiro simulado
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredRecords.map((r) => {
                  const band = performanceBandOf(r.accuracy)
                  const bandMeta = PERFORMANCE_BANDS[band]
                  return (
                    <div
                      key={r.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <h4 className="font-semibold text-sm text-foreground truncate">{r.name}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-semibold flex-wrap">
                          <span>{formatDateBR(r.simuladoDate)}</span>
                          <span>• {sourceLabel(r.source, r.sourceCustom)}</span>
                          {r.examName && <span>• {r.examName}</span>}
                          {r.roleName && <span>• {r.roleName}</span>}
                        </div>
                        {r.timeSpentSeconds !== null && (
                          <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                            <Timer className="h-3 w-3" /> {formatDuration(r.timeSpentSeconds)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                        <div className="text-right text-xs tabular-nums">
                          <div className="flex gap-2 justify-end font-semibold text-[11px]">
                            <span className="text-emerald-600 inline-flex items-center gap-0.5">{r.totalCorrect}<Check className="h-3 w-3" /></span>
                            <span className="text-muted-foreground">{r.totalBlank}—</span>
                            <span className="text-rose-500 inline-flex items-center gap-0.5">{r.totalWrong}<X className="h-3 w-3" /></span>
                          </div>
                          <span className={cn("block font-semibold text-sm", accuracyColor(r.accuracy))}>
                            {r.accuracy !== null ? `${Math.round(r.accuracy)}%` : "—"}
                          </span>
                          <span className={cn("text-[10px] font-semibold", bandMeta.color)}>{bandMeta.label}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-[11px] font-semibold"
                            onClick={() => setDetail(r)}
                          >
                            <Eye className="h-3.5 w-3.5" /> Análise
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditing(r)
                              setModalOpen(true)
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-rose-500"
                            disabled={deletingId === r.id}
                            onClick={() => handleDelete(r.id)}
                            title="Excluir"
                          >
                            {deletingId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ANÁLISE POR MATÉRIA (AGREGADA) */}
          {subjectAnalysis.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="p-4 border-b bg-card">
                <h3 className="text-[13px] font-semibold text-foreground">
                  Desempenho por matéria
                </h3>
              </div>
              <div className="divide-y divide-border">
                {subjectAnalysis.map((s) => {
                  const bandMeta = PERFORMANCE_BANDS[s.band]
                  return (
                    <div key={s.disciplineName} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{s.disciplineName}</p>
                        <p className="text-[10px] text-muted-foreground font-semibold">
                          {s.totalCorrect}/{s.totalQuestions} questões
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {s.evolutionPp !== null && (
                          <span
                            className={cn(
                              "text-[10px] font-semibold tabular-nums",
                              s.evolutionPp > 0 ? "text-emerald-600" : s.evolutionPp < 0 ? "text-rose-600" : "text-muted-foreground"
                            )}
                          >
                            {s.evolutionPp > 0 ? "+" : ""}
                            {s.evolutionPp} p.p.
                          </span>
                        )}
                        <span className={cn("text-sm font-semibold tabular-nums", accuracyColor(s.accuracy))}>
                          {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                            bandMeta.color,
                            bandMeta.bg,
                            bandMeta.border
                          )}
                        >
                          {bandMeta.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* MODAIS */}
        <SimuladoRecordModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          editing={editing}
          onSaved={loadData}
        />

        {detail && <SimuladoDetailModal record={detail} onClose={() => setDetail(null)} />}
      </div>
    </>
  )
}

function MetricStat({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="p-4 min-w-0">
      <span className="type-label truncate block">
        {label}
      </span>
      <span className={cn("mt-1 text-2xl font-semibold tabular-nums truncate block", valueClass)}>
        {value}
      </span>
    </div>
  )
}

function SelectPill({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 max-w-[200px] truncate rounded-md border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function EvolutionChart({ points }: { points: { simuladoId: string; name: string; date: string; accuracy: number | null }[] }) {
  const W = 600
  const H = 160
  const PAD = 24
  const values = points.map((p) => p.accuracy ?? 0)
  const min = Math.max(0, Math.min(...values) - 10)
  const max = Math.min(100, Math.max(...values) + 10)
  const range = Math.max(1, max - min)
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const polyline = points
    .map((p, i) => `${PAD + i * step},${y(p.accuracy ?? 0)}`)
    .join(" ")

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Linhas de grade */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              className="text-muted-foreground/20"
              strokeWidth={1}
              strokeDasharray={v === 0 ? "0" : "3 4"}
            />
            <text x={4} y={y(v) + 3} className="fill-muted-foreground text-[10px] tabular-nums">
              {v}
            </text>
          </g>
        ))}
        {/* Linha de evolução */}
        <polyline points={polyline} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2.5} />
        {/* Pontos */}
        {points.map((p, i) => (
          <circle
            key={p.simuladoId}
            cx={PAD + i * step}
            cy={y(p.accuracy ?? 0)}
            r={5}
            className="fill-primary"
          >
            <title>{`${p.name}: ${p.accuracy}% (${p.date})`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-semibold text-muted-foreground px-2 mt-1">
        {points.map((p, i) => (
          <span key={p.simuladoId} className="truncate max-w-[80px] text-center">
            S{i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}

function SimuladoDetailModal({ record, onClose }: { record: SimuladoRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* CABEÇALHO */}
        <div className="p-5 border-b bg-muted/20 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div>
            <h3 className="text-base font-semibold text-foreground">{record.name}</h3>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
              {formatDateBR(record.simuladoDate)} • {sourceLabel(record.source, record.sourceCustom)}
              {record.examName && ` • ${record.examName}`}
              {record.roleName && ` • ${record.roleName}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* RESULTADO GERAL */}
        <div className="p-5 space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-6">
              <div>
                <span className="type-label block">Questões</span>
                <span className="text-xl font-semibold tabular-nums">{record.totalQuestions}</span>
              </div>
              <div>
                <span className="type-label block text-success">Acertos</span>
                <span className="text-xl font-semibold tabular-nums text-emerald-600">{record.totalCorrect}</span>
              </div>
              <div>
                <span className="type-label block text-destructive">Erros</span>
                <span className="text-xl font-semibold tabular-nums text-rose-600">{record.totalWrong}</span>
              </div>
              <div>
                <span className="type-label block">Brancos</span>
                <span className="text-xl font-semibold tabular-nums text-muted-foreground">{record.totalBlank}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="type-label block">Aproveitamento</span>
              <span className={cn("text-3xl font-semibold tabular-nums", accuracyColor(record.accuracy))}>
                {record.accuracy !== null ? `${Math.round(record.accuracy)}%` : "—"}
              </span>
            </div>
          </div>

          {record.timeSpentSeconds !== null && (
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Timer className="h-3.5 w-3.5" /> Tempo gasto: {formatDuration(record.timeSpentSeconds)}
            </div>
          )}

          {/* ANÁLISE POR MATÉRIA */}
          {record.subjects.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[13px] font-semibold text-foreground">
                Resultado por matéria
              </h4>
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[400px]">
                  <thead>
                    <tr className="type-label bg-muted/50">
                      <th className="text-left px-3 py-2">Matéria</th>
                      <th className="text-center px-2 py-2">Questões</th>
                      <th className="text-center px-2 py-2">Acertos</th>
                      <th className="text-center px-2 py-2">Erros</th>
                      <th className="text-right px-3 py-2">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {record.subjects.map((s) => {
                      const band = performanceBandOf(s.accuracy)
                      const bandMeta = PERFORMANCE_BANDS[band]
                      return (
                        <tr key={s.disciplineName} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-semibold">
                            {s.disciplineName}
                            <span className={cn("ml-2 text-[11px] font-semibold", bandMeta.color)}>
                              {bandMeta.label}
                            </span>
                          </td>
                          <td className="text-center px-2 py-2 tabular-nums">{s.questionsCount}</td>
                          <td className="text-center px-2 py-2 tabular-nums text-emerald-600">{s.correctCount}</td>
                          <td className="text-center px-2 py-2 tabular-nums text-rose-600">{s.wrongCount}</td>
                          <td className={cn("text-right px-3 py-2 tabular-nums font-semibold", accuracyColor(s.accuracy))}>
                            {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {record.notes && (
            <div className="space-y-1">
              <h4 className="text-[13px] font-semibold text-foreground">Observações</h4>
              <p className="text-xs text-foreground bg-muted/30 border rounded-lg p-3 leading-relaxed">
                {record.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
