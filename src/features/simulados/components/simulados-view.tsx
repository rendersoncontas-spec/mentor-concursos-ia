"use client"

import { useEffect, useMemo, useState } from "react"

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Eye,
  Loader2,
  Plus,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Trash2,
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
  if (accuracy >= 75) return "text-sky-600"
  if (accuracy >= 60) return "text-amber-600"
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

  // Registros ordenados ASC por data para estatísticas
  const chronoRecords = useMemo(
    () => [...records].sort((a, b) => a.simuladoDate.localeCompare(b.simuladoDate)),
    [records]
  )

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
      <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm font-semibold">Carregando seus simulados…</p>
      </div>
    )
  }

  const trendIcon =
    stats.trend === "UP" ? TrendingUp : stats.trend === "DOWN" ? TrendingDown : TrendingUp

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-foreground tracking-tight">Simulados</h1>
          <p className="text-xs text-muted-foreground font-semibold">
            Acompanhe seu desempenho, evolução e pontos fortes e fracos.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 h-9 rounded-xl shadow-xs gap-1.5"
        >
          <Plus className="h-4 w-4" /> Registrar simulado
        </Button>
      </div>

      {/* MÉTRICAS DO DASHBOARD */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Simulados realizados"
          value={String(stats.totalSimulados)}
          icon={ClipboardList}
        />
        <MetricCard
          label="Questões respondidas"
          value={stats.totalQuestions.toLocaleString("pt-BR")}
          icon={ClipboardList}
        />
        <MetricCard
          label="Média de acertos"
          value={stats.averageAccuracy !== null ? `${Math.round(stats.averageAccuracy)}%` : "—"}
          icon={CheckCircle2}
          valueClass={accuracyColor(stats.averageAccuracy)}
        />
        <MetricCard
          label="Melhor desempenho"
          value={stats.bestAccuracy !== null ? `${Math.round(stats.bestAccuracy)}%` : "—"}
          icon={Trophy}
          valueClass="text-amber-500"
        />
        <MetricCard
          label="Último simulado"
          value={stats.lastAccuracy !== null ? `${Math.round(stats.lastAccuracy)}%` : "—"}
          icon={TrendingUp}
          valueClass={accuracyColor(stats.lastAccuracy)}
        />
      </div>

      {/* EVOLUÇÃO + TENDÊNCIA */}
      {evolution.length >= 2 && (
        <div className="rounded-xl border bg-card shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
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
                  <span className="font-mono">
                    ({stats.evolutionPp > 0 ? "+" : ""}
                    {stats.evolutionPp} p.p.)
                  </span>
                )}
              </Badge>
            )}
          </div>
          {/* Gráfico de barras simples (SVG) */}
          <EvolutionChart points={evolution} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold text-muted-foreground">
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

      {/* FILTROS */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Período:</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setDaysFilter(opt.days)}
            className={cn(
              "text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors",
              daysFilter === opt.days
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {(examOptions.length > 0 || roleOptions.length > 0 || sourceOptions.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      )}

      {/* PONTOS FRACOS */}
      {(weakSubjects.length > 0 || decliningSubjects.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {weakSubjects.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Pontos que merecem atenção
              </h3>
              {weakSubjects.slice(0, 6).map((s) => (
                <div key={s.disciplineName} className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground truncate">{s.disciplineName}</span>
                  <span className="text-rose-600 font-mono shrink-0">
                    {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {decliningSubjects.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-2">
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

      {/* LISTA DE SIMULADOS */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="p-4 border-b bg-card flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> SIMULADOS RECENTES
          </h3>
          <Badge variant="outline" className="text-[10px] font-semibold">
            {filteredRecords.length} registro{filteredRecords.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-muted/40 border flex items-center justify-center">
              <ClipboardList className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-extrabold text-foreground">Nenhum simulado registrado</h3>
              <p className="text-xs text-muted-foreground font-medium">
                Fez um simulado fora do NomeIA? Registre o resultado e acompanhe sua evolução.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditing(null)
                setModalOpen(true)
              }}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 rounded-xl"
            >
              <Plus className="h-4 w-4" /> Registrar primeiro simulado
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {filteredRecords.map((r) => {
              const band = performanceBandOf(r.accuracy)
              const bandMeta = PERFORMANCE_BANDS[band]
              return (
                <div
                  key={r.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <h4 className="font-extrabold text-sm text-foreground truncate">{r.name}</h4>
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
                    <div className="text-right text-xs font-mono">
                      <div className="flex gap-2 justify-end font-bold text-[11px]">
                        <span className="text-emerald-600">{r.totalCorrect}✔</span>
                        <span className="text-sky-500">{r.totalBlank}—</span>
                        <span className="text-rose-500">{r.totalWrong}✖</span>
                      </div>
                      <span className={cn("block font-black text-sm", accuracyColor(r.accuracy))}>
                        {r.accuracy !== null ? `${Math.round(r.accuracy)}%` : "—"}
                      </span>
                      <span className={cn("text-[9px] font-bold", bandMeta.color)}>{bandMeta.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-[11px] font-bold"
                        onClick={() => setDetail(r)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Análise
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-[11px] font-bold text-muted-foreground hover:text-foreground"
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
                        className="rounded-lg text-[11px] font-bold text-muted-foreground hover:text-rose-500"
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
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
          <div className="p-4 border-b bg-card">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              DESEMPENHO POR MATÉRIA
            </h3>
          </div>
          <div className="divide-y">
            {subjectAnalysis.map((s) => {
              const bandMeta = PERFORMANCE_BANDS[s.band]
              return (
                <div key={s.disciplineName} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{s.disciplineName}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold">
                      {s.totalCorrect}/{s.totalQuestions} questões
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {s.evolutionPp !== null && (
                      <span
                        className={cn(
                          "text-[10px] font-black font-mono",
                          s.evolutionPp > 0 ? "text-emerald-600" : s.evolutionPp < 0 ? "text-rose-600" : "text-muted-foreground"
                        )}
                      >
                        {s.evolutionPp > 0 ? "+" : ""}
                        {s.evolutionPp} p.p.
                      </span>
                    )}
                    <span className={cn("text-sm font-black font-mono", accuracyColor(s.accuracy))}>
                      {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                    </span>
                    <span
                      className={cn(
                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
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

      {/* MODAIS */}
      <SimuladoRecordModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSaved={loadData}
      />

      {detail && <SimuladoDetailModal record={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string
  value: string
  icon: React.ElementType
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between min-h-[86px]">
      <span className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider truncate">
        {label}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className={cn("text-2xl font-black font-mono truncate", valueClass)}>{value}</span>
        <Icon className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </div>
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
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
        {label}:
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-[11px] font-bold px-2 py-1 rounded-md border border-input bg-background text-foreground max-w-[180px] truncate"
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
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
            <text x={4} y={y(v) + 3} className="fill-muted-foreground text-[9px] font-mono">
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
      <div className="flex justify-between text-[9px] font-bold text-muted-foreground px-2 mt-1">
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* CABEÇALHO */}
        <div className="p-5 border-b bg-muted/20 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div>
            <h3 className="text-base font-black text-foreground">{record.name}</h3>
            <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">
              {formatDateBR(record.simuladoDate)} • {sourceLabel(record.source, record.sourceCustom)}
              {record.examName && ` • ${record.examName}`}
              {record.roleName && ` • ${record.roleName}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            ✕
          </Button>
        </div>

        {/* RESULTADO GERAL */}
        <div className="p-5 space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-6">
              <div>
                <span className="text-[9px] font-extrabold uppercase text-muted-foreground block">Questões</span>
                <span className="text-xl font-black font-mono">{record.totalQuestions}</span>
              </div>
              <div>
                <span className="text-[9px] font-extrabold uppercase text-emerald-600 block">Acertos</span>
                <span className="text-xl font-black font-mono text-emerald-600">{record.totalCorrect}</span>
              </div>
              <div>
                <span className="text-[9px] font-extrabold uppercase text-rose-600 block">Erros</span>
                <span className="text-xl font-black font-mono text-rose-600">{record.totalWrong}</span>
              </div>
              <div>
                <span className="text-[9px] font-extrabold uppercase text-sky-600 block">Brancos</span>
                <span className="text-xl font-black font-mono text-sky-600">{record.totalBlank}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-extrabold uppercase text-muted-foreground block">Aproveitamento</span>
              <span className={cn("text-3xl font-black font-mono", accuracyColor(record.accuracy))}>
                {record.accuracy !== null ? `${Math.round(record.accuracy)}%` : "—"}
              </span>
            </div>
          </div>

          {record.timeSpentSeconds !== null && (
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <Timer className="h-3.5 w-3.5" /> Tempo gasto: {formatDuration(record.timeSpentSeconds)}
            </div>
          )}

          {/* ANÁLISE POR MATÉRIA */}
          {record.subjects.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Resultado por matéria
              </h4>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-[9px] font-extrabold uppercase text-muted-foreground">
                      <th className="text-left px-3 py-2">Matéria</th>
                      <th className="text-center px-2 py-2">Questões</th>
                      <th className="text-center px-2 py-2">Acertos</th>
                      <th className="text-center px-2 py-2">Erros</th>
                      <th className="text-right px-3 py-2">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {record.subjects.map((s) => {
                      const band = performanceBandOf(s.accuracy)
                      const bandMeta = PERFORMANCE_BANDS[band]
                      return (
                        <tr key={s.disciplineName} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-bold">
                            {s.disciplineName}
                            <span className={cn("ml-2 text-[9px] font-black uppercase", bandMeta.color)}>
                              {bandMeta.label}
                            </span>
                          </td>
                          <td className="text-center px-2 py-2 font-mono">{s.questionsCount}</td>
                          <td className="text-center px-2 py-2 font-mono text-emerald-600">{s.correctCount}</td>
                          <td className="text-center px-2 py-2 font-mono text-rose-600">{s.wrongCount}</td>
                          <td className={cn("text-right px-3 py-2 font-mono font-black", accuracyColor(s.accuracy))}>
                            {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {record.notes && (
            <div className="space-y-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Observações</h4>
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
