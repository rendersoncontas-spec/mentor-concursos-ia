"use client"

import { useEffect, useState } from "react"
import {
  ListCheck,
  Plus,
  Trophy,
  TrendingUp,
  Timer,
  Play,
  Eye,
  Trash2,
  Ban,
  Loader2,
  ClipboardList,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type {
  PlayerQuestion,
  SimuladoConfigData,
  SimuladoHeader,
  SimuladoResultPayload,
  SimuladoStatus,
  ScoreBand,
} from "@/domain/simulados/types"
import {
  cancelSimuladoAction,
  deleteSimuladoAction,
  getInProgressSimuladoAction,
  getSimuladoResultAction,
  getSimuladorConfigAction,
  getSimuladosHistoryAction,
} from "@/application/simulados/simulados.actions"
import { formatTimer } from "@/application/simulados/simulado-engine"
import { SimuladoConfigDialog } from "./simulado-config-dialog"
import { SimuladoPlayer } from "./simulado-player"
import { SimuladoResultView } from "./simulado-result"

type Screen = "home" | "player" | "result"

const STATUS_META: Record<SimuladoStatus, { label: string; className: string }> = {
  IN_PROGRESS: { label: "Em andamento", className: "bg-sky-500/10 border-sky-500/40 text-sky-600" },
  FINISHED: { label: "Finalizado", className: "bg-emerald-500/10 border-emerald-500/40 text-emerald-600" },
  CANCELED: { label: "Descartado", className: "bg-muted border-border text-muted-foreground" },
  CONFIG: { label: "Config", className: "bg-muted border-border text-muted-foreground" },
}

export function SimuladosView() {
  const [screen, setScreen] = useState<Screen>("home")
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<SimuladoConfigData | null>(null)
  const [history, setHistory] = useState<SimuladoHeader[]>([])
  const [personalBest, setPersonalBest] = useState<SimuladoHeader | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [playerData, setPlayerData] = useState<{
    simuladoId: string
    questions: PlayerQuestion[]
    answers: Record<string, { selected: string | null; marked: boolean }>
    startedAt: string
    durationLimitSeconds: number | null
    name: string
  } | null>(null)
  const [resultPayload, setResultPayload] = useState<SimuladoResultPayload | null>(null)
  const [daysFilter, setDaysFilter] = useState<number | null>(null)
  const [scoreFilter, setScoreFilter] = useState<string>("TODOS")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadingResultId, setLoadingResultId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const inProgress = await getInProgressSimuladoAction()
      if (cancelled) return
      if (inProgress.data) {
        setPlayerData(inProgress.data)
        setScreen("player")
        setLoading(false)
        return
      }
      const [cfgRes, histRes] = await Promise.all([getSimuladorConfigAction(), getSimuladosHistoryAction()])
      if (cancelled) return
      setConfig(cfgRes.data)
      if (histRes.data) {
        setHistory(histRes.data.simulados)
        setPersonalBest(histRes.data.personalBests ? findBest(cfgRes ? histRes.data.simulados : []) : null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshHistory = async () => {
    const res = await getSimuladosHistoryAction({
      days: daysFilter,
      score: scoreFilter === "TODOS" ? null : (scoreFilter as ScoreBand),
    })
    if (res.data) setHistory(res.data.simulados)
  }

  const handleCreateCustom = (data: { simuladoId: string; questions: PlayerQuestion[] }) => {
    setPlayerData({
      simuladoId: data.simuladoId,
      questions: data.questions,
      answers: {},
      startedAt: new Date().toISOString(),
      durationLimitSeconds: null,
      name: "Simulado",
    })
    setScreen("player")
    setResultPayload(null)
  }

  const handleFinish = (payload: SimuladoResultPayload) => {
    setResultPayload(payload)
    setPlayerData(null)
    setScreen("result")
  }

  const openResult = async (simuladoId: string) => {
    setLoadingResultId(simuladoId)
    const res = await getSimuladoResultAction(simuladoId)
    setLoadingResultId(null)
    if (res.error || !res.data) {
      toast.error(res.error ?? "Erro ao carregar resultado.")
      return
    }
    setResultPayload(res.data)
    setPlayerData(null)
    setScreen("result")
  }

  const backHome = async () => {
    setResultPayload(null)
    setPlayerData(null)
    setScreen("home")
    await refreshHistory()
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const res = await deleteSimuladoAction(id)
    setDeletingId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success("Simulado excluído.")
    await refreshHistory()
  }

  const handleCancel = async (id: string) => {
    setDeletingId(id)
    const res = await cancelSimuladoAction(id)
    setDeletingId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success("Simulado descartado.")
    await refreshHistory()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm font-semibold">Carregando simulados…</p>
      </div>
    )
  }

  if (screen === "player" && playerData) {
    return (
      <SimuladoPlayer
        key={playerData.simuladoId}
        simuladoId={playerData.simuladoId}
        questions={playerData.questions}
        initialAnswers={playerData.answers}
        startedAt={playerData.startedAt}
        durationLimitSeconds={playerData.durationLimitSeconds}
        name={playerData.name}
        onFinish={handleFinish}
        onExit={backHome}
      />
    )
  }

  if (screen === "result" && resultPayload) {
    return (
      <SimuladoResultView
        payload={resultPayload}
        onNewSimulado={() => {
          setResultPayload(null)
          setScreen("home")
          setConfigOpen(true)
        }}
        onSeeHistory={backHome}
      />
    )
  }

  const finished = history.filter((h) => h.status === "FINISHED")
  const inProgress = history.filter((h) => h.status === "IN_PROGRESS")
  const totalCorrect = finished.reduce((acc, h) => acc + h.totalCorrect, 0)
  const bestAccuracy = personalBest?.accuracy ?? null

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-foreground tracking-tight">Simulados</h1>
          <p className="text-xs text-muted-foreground font-semibold">Provas completas com correção inteligente e histórico de desempenho.</p>
        </div>
        <Button
          onClick={() => setConfigOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 h-9 rounded-xl shadow-xs"
        >
          <Plus className="h-4 w-4" /> Novo Simulado
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">SIMULADOS REALIZADOS</span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-black font-mono">{finished.length + inProgress.length}</span>
            <ClipboardList className="h-5 w-5 text-muted-foreground/40" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">MELHOR RESULTADO</span>
          <div className="mt-2 flex items-end justify-between">
            <span className={cn("text-3xl font-black font-mono", bestAccuracy === null ? "text-muted-foreground" : "text-amber-500")}>
              {bestAccuracy === null ? "—" : `${Math.round(bestAccuracy)}%`}
            </span>
            <Trophy className="h-5 w-5 text-amber-500/60" />
          </div>
          {personalBest && <p className="text-[10px] text-muted-foreground font-semibold mt-1 truncate">{personalBest.name}</p>}
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">TOTAL DE ACERTOS</span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-black font-mono text-emerald-600">{totalCorrect}</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-500/60" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">EM ANDAMENTO</span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-black font-mono text-sky-600">{inProgress.length}</span>
            <Timer className="h-5 w-5 text-sky-500/60" />
          </div>
        </div>
      </div>

      {/* In progress banner */}
      {inProgress.length > 0 && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
            <div>
              <p className="text-sm font-extrabold">Você tem uma prova em andamento</p>
              <p className="text-xs text-muted-foreground font-semibold">{inProgress[0]?.name}</p>
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-lg font-bold bg-sky-600 hover:bg-sky-700"
            onClick={async () => {
              const res = await getInProgressSimuladoAction()
              if (res.data) {
                setPlayerData(res.data)
                setScreen("player")
              } else {
                toast.error("Não foi possível retomar o simulado.")
              }
            }}
          >
            <Play className="h-3.5 w-3.5" /> Continuar
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Período:</span>
        {[
          { label: "Todos", days: null },
          { label: "7 dias", days: 7 },
          { label: "30 dias", days: 30 },
          { label: "90 dias", days: 90 },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => {
              setDaysFilter(opt.days)
            }}
            className={cn(
              "text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors",
              daysFilter === opt.days ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground ml-2">Desempenho:</span>
        {[
          { label: "Todos", value: "TODOS" },
          { label: "Excelente", value: "EXCELENTE" },
          { label: "Bom", value: "BOM" },
          { label: "Regular", value: "REGULAR" },
          { label: "Baixo", value: "BAIXO" },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setScoreFilter(opt.value)
            }}
            className={cn(
              "text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors",
              scoreFilter === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* History */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="p-4 border-b bg-card flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> HISTÓRICO DE SIMULADOS
          </h3>
          <Badge variant="outline" className="text-[10px] font-semibold">{history.length} simulados</Badge>
        </div>

        {history.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-muted/40 border flex items-center justify-center">
              <ListCheck className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-extrabold text-foreground">Nenhum simulado ainda</h3>
              <p className="text-xs text-muted-foreground font-medium">Crie sua primeira prova e comece a acompanhar sua evolução.</p>
            </div>
            <Button
              onClick={() => setConfigOpen(true)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 rounded-xl shadow-xs"
            >
              Novo Simulado
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {history.map((s) => {
              const meta = STATUS_META[s.status] ?? STATUS_META["CONFIG"]
              return (
                <div key={s.id} className="p-4 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <h4 className="font-extrabold text-sm truncate">{s.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold flex-wrap">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", meta.className)}>{meta.label}</span>
                      <span>{s.simuladoDate ?? ""}</span>
                      {s.examName && <span>· {s.examName}</span>}
                      {s.mode && <span>· {modeLabel(s.mode)}</span>}
                    </div>
                    {s.timeSpentSeconds !== null && s.status === "FINISHED" && (
                      <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                        <Timer className="h-3 w-3" /> {formatTimer(s.timeSpentSeconds)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right text-xs font-mono">
                      {s.status === "FINISHED" && s.totalQuestions > 0 ? (
                        <>
                          <div className="flex gap-2 justify-end font-bold">
                            <span className="text-emerald-600">{s.totalCorrect}✔</span>
                            <span className="text-sky-500">{s.totalBlank}—</span>
                            <span className="text-rose-500">{s.totalWrong}✖</span>
                          </div>
                          <span className={cn("block font-black text-sm", accuracyClass(s.accuracy))}>
                            {s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground font-bold text-sm">{s.totalQuestions || 0} questões</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {s.status === "FINISHED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg text-[11px] font-bold"
                          disabled={loadingResultId === s.id}
                          onClick={() => openResult(s.id)}
                        >
                          {loadingResultId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                          Resultado
                        </Button>
                      )}
                      {s.status === "IN_PROGRESS" && (
                        <Button
                          size="sm"
                          className="rounded-lg text-[11px] font-bold bg-sky-600 hover:bg-sky-700"
                          onClick={async () => {
                            const res = await getInProgressSimuladoAction()
                            if (res.data) {
                              setPlayerData(res.data)
                              setScreen("player")
                            }
                          }}
                        >
                          <Play className="h-3.5 w-3.5" /> Continuar
                        </Button>
                      )}
                      {s.status === "IN_PROGRESS" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg text-[11px] font-bold text-muted-foreground"
                          disabled={deletingId === s.id}
                          onClick={() => {
                            if (window.confirm("Descartar este simulado em andamento?")) handleCancel(s.id)
                          }}
                          title="Descartar"
                        >
                          {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-[11px] font-bold text-muted-foreground hover:text-rose-500"
                        disabled={deletingId === s.id}
                        onClick={() => {
                          if (window.confirm("Excluir este simulado permanentemente?")) handleDelete(s.id)
                        }}
                        title="Excluir"
                      >
                        {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {configOpen && config && (
        <SimuladoConfigDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          config={config}
          onCreate={handleCreateCustom}
        />
      )}

      {configOpen && !config && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-2xl bg-card p-8 text-center space-y-3 max-w-sm">
            <p className="text-sm font-bold">Não foi possível carregar os dados de configuração.</p>
            <Button variant="outline" onClick={() => setConfigOpen(false)} className="font-bold text-xs rounded-xl">
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function findBest(headers: SimuladoHeader[]): SimuladoHeader | null {
  let best: SimuladoHeader | null = null
  headers.forEach((h) => {
    if (h.status !== "FINISHED" || h.accuracy === null) return
    if (!best || (h.accuracy ?? 0) > (best.accuracy ?? 0)) best = h
  })
  return best
}

function accuracyClass(accuracy: number | null): string {
  if (accuracy === null) return "text-muted-foreground"
  if (accuracy >= 70) return "text-emerald-600"
  if (accuracy >= 50) return "text-amber-600"
  return "text-rose-600"
}

function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    COMPLETO: "Completo",
    DISCIPLINA: "Por Disciplina",
    MATERIA: "Por Matéria",
    TOPICO: "Por Tópico",
    REVISAO: "Revisão",
    ERROS: "Meus Erros",
    PERSONALIZADO: "Personalizado",
    RAPIDO: "Rápido",
    DESAFIO: "Desafio",
    ADAPTATIVO: "Adaptativo",
  }
  return labels[mode] ?? mode
}