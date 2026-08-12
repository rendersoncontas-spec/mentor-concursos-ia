"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Check,
  X,
  Timer,
  Save,
  CheckCheck,
  AlertTriangle,
  Play,
  Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { PlayerQuestion, SimuladoResultPayload } from "@/domain/simulados/types"
import {
  finishSimuladoAction,
  saveSimuladoAnswersAction,
  type AnswerSaveBatchItem,
} from "@/application/simulados/simulados.actions"

export interface PlayerAnswers {
  [questionId: string]: { selected: string | null; marked: boolean; responseTimeSeconds: number | null }
}

interface Props {
  simuladoId: string
  questions: PlayerQuestion[]
  initialAnswers: Record<string, { selected: string | null; marked: boolean }>
  startedAt: string
  durationLimitSeconds: number | null
  name: string
  onFinish: (payload: SimuladoResultPayload) => void
  onExit: () => void
}

const AUTOSAVE_DEBOUNCE_MS = 800

export function SimuladoPlayer({
  simuladoId,
  questions,
  initialAnswers,
  startedAt,
  durationLimitSeconds,
  name,
  onFinish,
  onExit,
}: Props) {
  const [answers, setAnswers] = useState<PlayerAnswers>(() => {
    const base: PlayerAnswers = {}
    questions.forEach((q) => {
      const saved = initialAnswers[q.id]
      base[q.id] = { selected: saved?.selected ?? null, marked: saved?.marked ?? false, responseTimeSeconds: null }
    })
    return base
  })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [started, setStarted] = useState(false)
  const [questionEnteredAt, setQuestionEnteredAt] = useState(0)

  const startRef = useRef<number>(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSave = useRef<AnswerSaveBatchItem[]>([])
  const autoFinishedRef = useRef(false)

  useEffect(() => {
    const startMs = new Date(startedAt).getTime()
    startRef.current = isNaN(startMs) ? Date.now() : startMs
    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - startRef.current) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const flushSave = async () => {
    if (pendingSave.current.length === 0) return
    const batch = pendingSave.current
    pendingSave.current = []
    setSaveState("saving")
    const res = await saveSimuladoAnswersAction(simuladoId, batch)
    if (res.ok) setSaveState("saved")
    else {
      setSaveState("idle")
      pendingSave.current = [...batch, ...pendingSave.current]
      toast.error(`Não foi possível salvar: ${res.error}`)
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pendingSave.current.length > 0) {
        saveSimuladoAnswersAction(simuladoId, pendingSave.current).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleSave = (batch: AnswerSaveBatchItem[]) => {
    pendingSave.current = [...pendingSave.current, ...batch]
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      flushSave()
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  const handleSelect = (questionId: string, selected: string | null) => {
    const marked = answers[questionId]?.marked ?? false
    setAnswers((prev) => {
      const nowSeconds = Math.max(1, Math.round((Date.now() - questionEnteredAt) / 1000))
      const next = { ...prev, [questionId]: { selected, marked, responseTimeSeconds: nowSeconds } }
      const q = questions.find((item) => item.id === questionId)
      if (!q) return next
      scheduleSave([{ orderIndex: q.orderIndex, questionId, selected, marked, responseTimeSeconds: nowSeconds }])
      return next
    })
  }

  const handleToggleMark = (questionId: string) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? { selected: null, marked: false, responseTimeSeconds: null }
      const marked = !current.marked
      const next = { ...prev, [questionId]: { ...current, marked } }
      const q = questions.find((item) => item.id === questionId)
      if (!q) return next
      scheduleSave([{ orderIndex: q.orderIndex, questionId, selected: current.selected, marked, responseTimeSeconds: current.responseTimeSeconds }])
      return next
    })
  }

  const goTo = (index: number) => {
    if (index < 0 || index >= questions.length) return
    setCurrentIndex(index)
    setQuestionEnteredAt(Date.now())
  }

  const doFinish = async (autoTimeout = false) => {
    setFinishing(true)
    await flushSave()
    const res = await finishSimuladoAction(simuladoId, { autoTimeout })
    setFinishing(false)
    setConfirmOpen(false)
    if (res.error || !res.data) {
      toast.error(res.error ?? "Erro ao finalizar simulado.")
      return
    }
    toast.success("Prova corrigida! Resultado liberado.")
    onFinish(res.data)
  }

  const current = questions[currentIndex]
  const answeredCount = Object.values(answers).filter((a) => a.selected !== null).length
  const markedCount = Object.values(answers).filter((a) => a.marked).length
  const remainingSeconds = durationLimitSeconds ? Math.max(0, durationLimitSeconds - elapsedSeconds) : null

  useEffect(() => {
    if (!started || !durationLimitSeconds || elapsedSeconds < durationLimitSeconds) return
    if (autoFinishedRef.current) return
    autoFinishedRef.current = true
    toast.warning("Tempo esgotado — finalizando automaticamente.")
    const id = setTimeout(() => {
      doFinish(true)
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, durationLimitSeconds, started])

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-3" />
        <p className="text-sm font-semibold">Nenhuma questão encontrada.</p>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="rounded-2xl border bg-card p-8 text-center space-y-4 shadow-sm">
          <Timer className="h-10 w-10 mx-auto text-primary" />
          <h2 className="text-xl font-black tracking-tight">{name}</h2>
          <p className="text-sm text-muted-foreground font-medium">
            {questions.length} questões · {durationLimitSeconds ? `${Math.round(durationLimitSeconds / 60)} min de limite` : "sem limite de tempo"}
          </p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Suas respostas são salvas automaticamente.</p>
            <p>• Você pode marcar questões para revisar depois.</p>
          </div>
          <Button onClick={() => { setStarted(true); setQuestionEnteredAt(Date.now()) }} className="rounded-xl font-bold px-8 h-10 bg-[#2563EB] hover:bg-[#1D4ED8]">
            <Play className="h-4 w-4" /> Começar Prova
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={onExit} className="shrink-0" title="Sair (progresso salvo)">
            <X className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-extrabold truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">
              {answeredCount}/{questions.length} respondidas{markedCount > 0 ? ` · ${markedCount} marcadas` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {remainingSeconds !== null && (
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-xs",
                remainingSeconds <= 60 ? "text-destructive border-destructive/40 animate-pulse" : "text-foreground"
              )}
            >
              <Timer className="h-3 w-3 mr-1" />
              {formatTimer(remainingSeconds)}
            </Badge>
          )}
          {saveState === "saving" && (
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
              <Save className="h-3 w-3 mr-1 animate-pulse" /> salvando…
            </Badge>
          )}
          {saveState === "saved" && (
            <Badge variant="outline" className="text-[10px] font-mono text-emerald-600">
              <CheckCheck className="h-3 w-3 mr-1" /> salvo
            </Badge>
          )}
          <Button size="sm" className="rounded-lg font-bold bg-[#2563EB] hover:bg-[#1D4ED8]" onClick={() => setConfirmOpen(true)}>
            <Square className="h-3.5 w-3.5" /> Finalizar
          </Button>
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-2xl border bg-card p-5 md:p-6 shadow-sm space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Badge variant="secondary" className="text-[10px] font-bold">
              Questão {current.orderIndex + 1} de {questions.length}
            </Badge>
            <div className="flex flex-wrap gap-1.5">
              {current.disciplineName && (
                <Badge variant="outline" className="text-[10px] font-semibold">{current.disciplineName}</Badge>
              )}
              {current.topicName && (
                <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">{current.topicName}</Badge>
              )}
              {current.difficultyLabel && (
                <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">{current.difficultyLabel}</Badge>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleMark(current.id)}
            title="Marcar para revisar"
            className={cn(
              "shrink-0 rounded-lg border p-2 transition-colors",
              answers[current.id]?.marked
                ? "bg-amber-500/10 border-amber-500/50 text-amber-500"
                : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            <Flag className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{current.statement}</p>

        {current.isCertoErrado ? (
          <div className="grid grid-cols-2 gap-3">
            {["CERTO", "ERRADO"].map((opt) => {
              const selected = answers[current.id]?.selected
              const active = selected === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(current.id, selected === opt ? null : opt)}
                  className={cn(
                    "rounded-xl border-2 p-4 flex items-center justify-center gap-2 font-extrabold text-sm transition-all",
                    certoErradoStyle(opt, active)
                  )}
                >
                  {active && opt === "CERTO" && <Check className="h-4 w-4" />}
                  {active && opt === "ERRADO" && <X className="h-4 w-4" />}
                  {opt === "CERTO" ? "Certo" : "Errado"}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {(current.alternatives ?? []).map((alt, i) => {
              const selected = answers[current.id]?.selected
              const active = selected === alt.label
              return (
                <button
                  key={alt.label}
                  type="button"
                  onClick={() => handleSelect(current.id, selected === alt.label ? null : alt.label)}
                  className={cn(
                    "w-full rounded-xl border-2 p-3.5 flex items-start gap-3 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-primary/30 hover:bg-muted/20"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-xs font-black border",
                      active ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground"
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm font-medium leading-relaxed">{alt.text}</span>
                  {active && <Check className="h-4 w-4 text-primary ml-auto shrink-0 mt-0.5" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Navigator */}
      <div className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="rounded-lg font-bold text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Anterior
          </Button>
          <div className="flex flex-wrap justify-center gap-1.5">
            {questions.map((q, i) => {
              const a = answers[q.id]
              const isAnswered = a?.selected !== null
              const isMarked = a?.marked
              const isCurrent = i === currentIndex
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => goTo(i)}
                  className={cn(
                    "h-7 w-7 flex items-center justify-center rounded-md text-[11px] font-black border transition-all",
                    isCurrent && "ring-2 ring-primary ring-offset-1",
                    isAnswered ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-600" : "border-input text-muted-foreground",
                    isMarked && !isAnswered && "bg-amber-500/15 border-amber-500/50 text-amber-600",
                    !isAnswered && !isMarked && "hover:border-primary/40"
                  )}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === questions.length - 1}
            className="rounded-lg font-bold text-xs"
          >
            Próxima <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Finish confirm */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Finalizar prova?</DialogTitle>
            <DialogDescription>
              <span className="block mb-2">
                Você respondeu <b>{answeredCount}</b> de <b>{questions.length}</b> questões
                {markedCount > 0 ? ` e marcou ${markedCount} para revisão` : ""}.
              </span>
              <span className="block">Depois de finalizar, o gabarito e a correção serão liberados.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="font-bold text-xs px-5 h-9 rounded-xl">
              Continuar prova
            </Button>
            <Button
              onClick={() => doFinish(false)}
              disabled={finishing}
              className="font-bold text-xs px-5 h-9 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8]"
            >
              {finishing ? "Corrigindo…" : "Finalizar e ver resultado"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(sec).padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function certoErradoStyle(opt: string, active: boolean): string {
  if (!active) return "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground"
  if (opt === "CERTO") return "border-emerald-500 bg-emerald-500/10 text-emerald-600"
  return "border-rose-500 bg-rose-500/10 text-rose-600"
}