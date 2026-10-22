"use client"

import { useEffect, useMemo, useState } from "react"

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
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

import { canonicalizeSimuladoRecords } from "@/application/simulados/simulado-identity"
import {
  EMPTY_DISCIPLINE_IDENTITY,
  subjectIdentityKey,
  type DisciplineIdentitySnapshot,
} from "@/domain/disciplines/discipline-identity"
import {
  buildEvolutionPoints,
  buildSubjectAnalysis,
  computePanelStats,
  describeBottleneck,
  findBottlenecks,
  formatDuration,
  performanceBandOf,
  sortRecordsRecentFirst,
  sourceLabel,
} from "@/application/simulados/simulado-stats.service"
import {
  PERFORMANCE_BANDS,
  type SimuladoBottleneckReason,
  type SimuladoRecord,
  type SimuladoSubjectAnalysis,
} from "@/domain/simulados/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { useSimuladosActions } from "../simulados-actions"
import { SimuladoRecordModal } from "./simulado-record-modal"
import { StudyPerformanceSection } from "./study-performance-section"

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
  if (accuracy >= 85) return "text-emerald-700 dark:text-emerald-400"
  if (accuracy >= 75) return "text-primary"
  if (accuracy >= 60) return "text-amber-700 dark:text-amber-400"
  return "text-rose-600 dark:text-rose-400"
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-")
  if (y && m && d) return `${d}/${m}/${y}`
  return dateStr
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`
}

/** Variação em p.p. com sinal; null → "—". */
function formatPp(value: number | null): string {
  if (value === null) return "—"
  const v = String(Math.abs(value)).replace(".", ",")
  let sign = ""
  if (value > 0) sign = "+"
  else if (value < 0) sign = "−"
  return `${sign}${v} p.p.`
}

const BOTTLENECK_REASON_LABEL: Record<SimuladoBottleneckReason, string> = {
  BELOW_AVERAGE: "abaixo da média geral",
  LOW_PERFORMANCE: "aproveitamento abaixo de 60%",
  RECENT_DROP: "queda no último simulado",
}

const BAND_FILTER_OPTIONS = (Object.keys(PERFORMANCE_BANDS) as (keyof typeof PERFORMANCE_BANDS)[]).map((b) => ({
  value: b,
  label: PERFORMANCE_BANDS[b].label,
}))

export function SimuladosView() {
  const actions = useSimuladosActions()
  const [loading, setLoading] = useState(true)
  // G2.21: falha na leitura ≠ "nenhum simulado". Sem isso, um erro de rede
  // mostrava o estado vazio ("Nenhum simulado registrado") como se fosse real.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [records, setRecords] = useState<SimuladoRecord[]>([])
  // G2.12: identidade canônica das matérias (aliases do catálogo + nome
  // pessoal). Só as análises usam; lista e edição mostram o que foi gravado.
  const [identity, setIdentity] = useState<DisciplineIdentitySnapshot>(EMPTY_DISCIPLINE_IDENTITY)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SimuladoRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [daysFilter, setDaysFilter] = useState<number | null>(null)
  const [examFilter, setExamFilter] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [disciplineFilter, setDisciplineFilter] = useState<string | null>(null)
  const [bandFilter, setBandFilter] = useState<string | null>(null)
  const [detail, setDetail] = useState<SimuladoRecord | null>(null)
  // G2.11: avisa a seção Estudo × desempenho para recalcular depois de
  // registrar, editar ou excluir um simulado.
  const [analysisVersion, setAnalysisVersion] = useState(0)

  const loadData = async () => {
    setLoading(true)
    // G2.21: a chamada pode REJEITAR (rede caiu, servidor fora do ar). Antes,
    // nesse caso o spinner "Carregando seus simulados…" ficava para sempre.
    try {
      const res = await actions.getRecords()
      if (res.data) {
        setRecords(res.data)
        setIdentity(res.identity ?? EMPTY_DISCIPLINE_IDENTITY)
        setLoadError(null)
      }
      if (res.error) {
        setLoadError(res.error)
        toast.error(res.error)
      }
    } catch {
      const message = "Não foi possível carregar seus simulados. Verifique sua conexão e tente novamente."
      setLoadError(message)
      toast.error(message)
    } finally {
      setAnalysisVersion((v) => v + 1)
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Cópia "analítica" dos registros: matérias na identidade canônica (G2.12).
  const analysisRecords = useMemo(() => canonicalizeSimuladoRecords(records, identity), [records, identity])

  // Registros filtrados — mais recente primeiro, com desempate determinístico
  // (data → momento do registro → id). Os cálculos ordenam por conta própria.
  // O filtro de matéria compara IDENTIDADES (alias e canônica juntas).
  const filteredAnalysisRecords = useMemo(() => {
    let list = analysisRecords
    if (daysFilter) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - daysFilter)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      list = list.filter((r) => r.simuladoDate >= cutoffStr)
    }
    if (examFilter) list = list.filter((r) => (r.examName || "") === examFilter)
    if (roleFilter) list = list.filter((r) => (r.roleName || "") === roleFilter)
    if (sourceFilter) list = list.filter((r) => r.source === sourceFilter)
    if (disciplineFilter) {
      list = list.filter((r) => r.subjects.some((s) => subjectIdentityKey(s) === disciplineFilter))
    }
    if (bandFilter) list = list.filter((r) => performanceBandOf(r.accuracy) === bandFilter)
    return sortRecordsRecentFirst(list)
  }, [analysisRecords, daysFilter, examFilter, roleFilter, sourceFilter, disciplineFilter, bandFilter])

  // Os mesmos registros, como foram gravados (lista, detalhe e edição).
  const filteredRecords = useMemo(() => {
    const byId = new Map(records.map((r) => [r.id, r]))
    return filteredAnalysisRecords.map((r) => byId.get(r.id)).filter((r): r is SimuladoRecord => !!r)
  }, [records, filteredAnalysisRecords])

  const stats = useMemo(() => computePanelStats(filteredRecords), [filteredRecords])
  const evolution = useMemo(() => buildEvolutionPoints(filteredRecords), [filteredRecords])
  const subjectAnalysis = useMemo(() => buildSubjectAnalysis(filteredAnalysisRecords), [filteredAnalysisRecords])
  const bottlenecks = useMemo(
    () => findBottlenecks(subjectAnalysis, stats.averageAccuracy),
    [subjectAnalysis, stats.averageAccuracy],
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
  const disciplineOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of analysisRecords) {
      for (const s of r.subjects) map.set(subjectIdentityKey(s), s.disciplineName)
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  }, [analysisRecords])

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir este simulado permanentemente?")) return
    setDeletingId(id)
    let res: { error: string | null }
    try {
      res = await actions.deleteRecord(id)
    } catch {
      res = { error: "Não foi possível excluir o simulado. Verifique sua conexão e tente novamente." }
    } finally {
      setDeletingId(null)
    }
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success("Simulado excluído.")
    setDetail(null)
    await loadData()
  }

  // G2.11: o spinner de página inteira só aparece no primeiro carregamento. Ao
  // recarregar depois de salvar/excluir, a tela continua montada (sem piscar e
  // sem perder o período escolhido na seção Estudo × desempenho).
  if (loading && records.length === 0) {
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

  // G2.21: primeira leitura falhou e não há nada para mostrar — erro com
  // "Tentar novamente", nunca o estado vazio.
  if (loadError && records.length === 0) {
    return (
      <>
        <PageHeader icon={ListCheck} title="Simulados" description="Desempenho, evolução e pontos fortes e fracos" />
        <div className="flex-1 page-container py-5">
          <div role="alert" className="rounded-xl border bg-card p-6 flex flex-col items-center text-center gap-3">
            <AlertTriangle aria-hidden className="h-6 w-6 text-amber-600" />
            <div className="space-y-1 max-w-sm">
              <h2 className="text-base font-semibold text-foreground">Não foi possível carregar seus simulados</h2>
              <p className="text-xs text-muted-foreground">{loadError}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadData()} disabled={loading}>
              {loading && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Tentar novamente
            </Button>
          </div>
        </div>
      </>
    )
  }

  const trendIcon =
    stats.trend === "UP" ? TrendingUp : stats.trend === "DOWN" ? TrendingDown : ArrowRight

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
          />
          <MetricStat
            label="Melhor desempenho"
            value={stats.bestAccuracy !== null ? `${Math.round(stats.bestAccuracy)}%` : "—"}
          />
          <MetricStat
            label="Último simulado"
            value={stats.lastAccuracy !== null ? `${Math.round(stats.lastAccuracy)}%` : "—"}
          />
        </div>

        {/* EVOLUÇÃO + TENDÊNCIA */}
        {evolution.length >= 2 && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">
                Evolução de acertos
              </h3>
              {stats.trendMessage && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent bg-transparent px-0 text-[10px] font-medium gap-1",
                    stats.trend === "UP" && "text-primary",
                    stats.trend === "DOWN" && "text-rose-700 dark:text-rose-400",
                    stats.trend === "STABLE" && "text-muted-foreground"
                  )}
                >
                  {(() => {
                    const Icon = trendIcon
                    return <Icon className="h-3 w-3" />
                  })()}
                  {stats.trendMessage}
                </Badge>
              )}
            </div>
            {/* Gráfico de barras simples (SVG) */}
            <EvolutionChart points={evolution} />
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2 text-xs">
              <EvolutionStat label="Média" value={pct(stats.averageAccuracy)} />
              <EvolutionStat label="Melhor" value={pct(stats.bestAccuracy)} />
              <EvolutionStat label="Pior" value={pct(stats.worstAccuracy)} />
              <EvolutionStat label="Último" value={pct(stats.lastAccuracy)} />
              <EvolutionStat label="Primeiro → último" value={formatPp(stats.firstToLastPp)} />
              <EvolutionStat label="Últimos 5" value={pct(stats.last5AverageAccuracy)} />
            </dl>
            {stats.trend === null && evolution.length === 2 && (
              <p className="text-[11px] text-muted-foreground">
                Com 2 simulados já dá para ver a variação, mas a tendência só aparece a partir do 3º.
              </p>
            )}
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
            {disciplineOptions.length > 0 && (
              <SelectPill
                label="Matéria"
                options={disciplineOptions}
                value={disciplineFilter}
                onChange={setDisciplineFilter}
              />
            )}
            <SelectPill label="Desempenho" options={BAND_FILTER_OPTIONS} value={bandFilter} onChange={setBandFilter} />
            </>
          )}
        </div>

        {/* GARGALOS — G2.10: calculados pelo sistema (findBottlenecks), sem IA.
            Uma frase principal com números reais e, abaixo, as demais matérias
            apontadas com o motivo. */}
        {bottlenecks.primary && (
          <section aria-labelledby="gargalos" className="rounded-xl border bg-card p-4 space-y-3">
            <h3 id="gargalos" className="text-[13px] font-semibold text-foreground">
              Onde você está perdendo pontos
            </h3>
            <p className="text-sm text-foreground">
              <span className="font-semibold">Gargalo atual: </span>
              {describeBottleneck(bottlenecks.primary, bottlenecks.overallAccuracy)}.
            </p>
            {bottlenecks.items.length > 1 && (
              <ul className="divide-y divide-border border-t border-border">
                {bottlenecks.items.slice(1, 6).map((b) => (
                  <li key={b.disciplineId ?? b.disciplineName} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-xs">
                    <span className="font-semibold text-foreground">{b.disciplineName}</span>
                    <span className="text-muted-foreground">
                      {pct(b.accuracy)} · {b.reasons.map((r) => BOTTLENECK_REASON_LABEL[r]).join(", ")}
                      {b.lowData && " · 1 simulado"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* G2.11 — estudo × desempenho por matéria (período próprio: 4/8 semanas ou tudo). */}
        <StudyPerformanceSection refreshKey={analysisVersion} />

        {/* Fase E: em telas largas a lista e a análise por matéria ficam lado a
            lado (antes empilhadas, com linhas de 1.600px quase vazias). */}
        <div className="grid items-start gap-4 min-[1440px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* LISTA DE SIMULADOS */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b bg-card flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">
                Simulados recentes
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
                            <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-0.5">{r.totalCorrect}<Check aria-hidden className="h-3 w-3" /><span className="sr-only"> acertos,</span></span>
                            <span className="text-muted-foreground">{r.totalBlank}<span aria-hidden>—</span><span className="sr-only"> em branco,</span></span>
                            <span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5">{r.totalWrong}<X aria-hidden className="h-3 w-3" /><span className="sr-only"> erros</span></span>
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
                            aria-label={`Análise de ${r.name}`}
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
                            aria-label={`Editar ${r.name}`}
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
                            aria-label={`Excluir ${r.name}`}
                            aria-busy={deletingId === r.id}
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

          {/* EVOLUÇÃO POR MATÉRIA — G2.10: cada matéria abre o próprio histórico
              (só os simulados em que ela aparece) com média, primeiro, último,
              melhor, pior e tendência quando há dados suficientes. */}
          {subjectAnalysis.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="p-4 border-b bg-card">
                <h3 className="text-[13px] font-semibold text-foreground">Desempenho por matéria</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Da pior para a melhor média. Toque para ver a evolução.</p>
              </div>
              <ul className="divide-y divide-border">
                {subjectAnalysis.map((s) => (
                  <SubjectEvolutionRow key={s.disciplineId ?? s.disciplineName} subject={s} />
                ))}
              </ul>
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
}: {
  label: string
  value: string
}) {
  return (
    <div className="p-4 min-w-0">
      <span className="type-label truncate block">
        {label}
      </span>
      {/* V2.5: o valor não muda mais de cor conforme a nota (laranja/verde nas
          métricas de topo) — a faixa de acerto já aparece, com texto, abaixo. */}
      <span className="mt-1 metric-value text-2xl truncate block text-foreground">
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
        aria-label={label}
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
  // G2.10: eixo fixo de 0 a 100%. Antes o eixo se ajustava aos dados (mín −10
  // a máx +10), o que exagerava variações pequenas e desenhava as linhas de
  // grade (0, 25, 50, 75, 100) fora da área do gráfico.
  const min = 0
  const max = 100
  const range = max - min
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
          <span key={p.simuladoId} className="truncate max-w-[80px] text-center" title={`${p.name} — ${formatDateBR(p.date)}`}>
            S{i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}

function EvolutionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground truncate">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function TrendMark({ trend }: { trend: SimuladoSubjectAnalysis["trend"] }) {
  if (trend === null) return null
  const TREND_META = {
    UP: { Icon: ArrowUp, label: "em alta", cls: "text-emerald-700 dark:text-emerald-400" },
    DOWN: { Icon: ArrowDown, label: "em queda", cls: "text-rose-600" },
    STABLE: { Icon: ArrowRight, label: "estável", cls: "text-muted-foreground" },
  } as const
  const meta = TREND_META[trend]
  return (
    <span className={cn("inline-flex items-center", meta.cls)} title={`Tendência: ${meta.label}`}>
      <meta.Icon aria-hidden className="h-3.5 w-3.5" />
      <span className="sr-only">Tendência: {meta.label}</span>
    </span>
  )
}

function SubjectEvolutionRow({ subject: s }: { subject: SimuladoSubjectAnalysis }) {
  const [open, setOpen] = useState(false)
  const bandMeta = PERFORMANCE_BANDS[s.band]
  const panelId = `materia-${(s.disciplineId ?? s.disciplineName).replace(/[^a-zA-Z0-9-]/g, "-")}`
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-foreground truncate">{s.disciplineName}</span>
          <span className="block text-[11px] text-muted-foreground">
            {s.totalCorrect}/{s.totalQuestions} questões · {s.simuladosCount} simulado{s.simuladosCount !== 1 ? "s" : ""}
          </span>
        </span>
        <span className="flex items-center gap-2.5 shrink-0">
          <TrendMark trend={s.trend} />
          <span className={cn("text-sm font-semibold tabular-nums", accuracyColor(s.accuracy))}>{pct(s.accuracy)}</span>
          <span className={cn("hidden sm:inline text-[11px] font-semibold", bandMeta.color)}>{bandMeta.label}</span>
          <ChevronDown aria-hidden className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4 space-y-3">
          <dl className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2 text-xs">
            <EvolutionStat label="Média" value={pct(s.accuracy)} />
            <EvolutionStat label="Primeiro" value={pct(s.firstAccuracy)} />
            <EvolutionStat label="Último" value={pct(s.lastAccuracy)} />
            <EvolutionStat label="Melhor" value={pct(s.bestAccuracy)} />
            <EvolutionStat label="Pior" value={pct(s.worstAccuracy)} />
            <EvolutionStat label="Evolução" value={formatPp(s.evolutionPp)} />
          </dl>
          <ol className="space-y-1.5">
            {s.history.map((h) => (
              <li key={h.simuladoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">
                  <span className="tabular-nums">{formatDateBR(h.date)}</span> · {h.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="hidden sm:block h-1.5 w-24 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <span className="block h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, h.accuracy ?? 0))}%` }} />
                  </span>
                  <span className={cn("w-10 text-right font-semibold tabular-nums", accuracyColor(h.accuracy))}>{pct(h.accuracy)}</span>
                </span>
              </li>
            ))}
          </ol>
          {s.trend === null && (
            <p className="text-[11px] text-muted-foreground">
              A tendência aparece quando a matéria estiver em pelo menos 3 simulados.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function SimuladoDetailModal({ record, onClose }: { record: SimuladoRecord; onClose: () => void }) {
  // G2.10: Dialog do design system (Esc fecha, foco preso no modal, leitor de
  // tela anuncia o título) no lugar da div fixa sem esses comportamentos.
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <div className="p-5 border-b">
          <DialogTitle className="text-base font-semibold text-foreground pr-8">{record.name}</DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
            {formatDateBR(record.simuladoDate)} • {sourceLabel(record.source, record.sourceCustom)}
            {record.exam_board && ` • ${record.exam_board}`}
            {record.examName && ` • ${record.examName}`}
            {record.roleName && ` • ${record.roleName}`}
          </DialogDescription>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="type-label block">Resultado</span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {record.totalCorrect} / {record.totalQuestions}
              </span>
            </div>
            <div className="text-right">
              <span className="type-label block">Aproveitamento</span>
              <span className={cn("text-3xl font-semibold tabular-nums", accuracyColor(record.accuracy))}>{pct(record.accuracy)}</span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-xs border-y border-border py-3">
            <EvolutionStat label="Acertos" value={String(record.totalCorrect)} />
            <EvolutionStat label="Erros" value={String(record.totalWrong)} />
            <EvolutionStat label="Em branco" value={String(record.totalBlank)} />
          </dl>

          {record.timeSpentSeconds !== null && (
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Timer aria-hidden className="h-3.5 w-3.5" /> Tempo gasto: {formatDuration(record.timeSpentSeconds)}
            </div>
          )}

          {record.subjects.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-[13px] font-semibold text-foreground">Desempenho por matéria</h4>
              <ul className="divide-y divide-border rounded-lg border">
                {[...record.subjects]
                  .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || a.disciplineName.localeCompare(b.disciplineName, "pt-BR"))
                  .map((s) => (
                    <li key={s.disciplineId ?? s.disciplineName} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 text-xs">
                      <span className="font-semibold text-foreground truncate">{s.disciplineName}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.correctCount}/{s.questionsCount}
                      </span>
                      <span className={cn("w-10 text-right font-semibold tabular-nums", accuracyColor(s.accuracy))}>{pct(s.accuracy)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Resultado registrado sem detalhamento por matéria.</p>
          )}

          {record.notes && (
            <div className="space-y-1">
              <h4 className="text-[13px] font-semibold text-foreground">Observações</h4>
              <p className="text-xs text-foreground bg-muted/30 border rounded-lg p-3 leading-relaxed whitespace-pre-line">{record.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
