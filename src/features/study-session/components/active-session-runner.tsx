"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useRouter } from "next/navigation"

import * as Sentry from "@sentry/nextjs"
import {
  ArrowLeft,
  CheckCircle,
  Minimize2,
  Pause,
  Play,
  RefreshCcw,
  RefreshCw,
  Square,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { disciplineColorHex } from "@/domain/disciplines/discipline-colors"
import type { StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"
import {
  type SavedStudySession,
  dispatchStudySessionSaved,
} from "@/features/study-session/lib/study-session-events"

import { useGlobalStudy } from "./study-provider"

type SessionPhase = "IDLE" | "ACTIVE" | "EVALUATION" | "SUMMARY"

interface ActiveSessionRunnerProps {
  planItem?: StudyPlanItemWithDetails
}

interface FinalStats {
  disciplineName: string
  durationSeconds: number
  focusPercent: number | null
  questions: number
  correct: number
  reviews: number
  energy: number
  interrupted: boolean
}

/** "59m19s", "1h02m", "42s" */
function formatDurationShort(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`
  return `${s}s`
}

export function ActiveSessionRunner({ planItem }: ActiveSessionRunnerProps) {
  const router = useRouter()
  const {
    session,
    startSession,
    minimizeSession,
    unminimizeSession,
    pauseSession,
    resumeSession,
    formatTime,
    finalizeAndSaveSession,
    resetSession,
  } = useGlobalStudy()

  const [phase, setPhase] = useState<SessionPhase>("IDLE")
  const [isReady, setIsReady] = useState(false)
  const startedRef = useRef(false)
  const sessionRef = useRef(session)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Avaliação
  const [questions, setQuestions] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [reviews, setReviews] = useState(0)
  const [energyFin, setEnergyFin] = useState(3)

  // Salvamento
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [finalStats, setFinalStats] = useState<FinalStats | null>(null)

  const plannedTime = planItem?.duration_minutes || 60
  const plannedSeconds = plannedTime * 60
  const disciplineId = planItem?.discipline_id ?? null
  const disciplineName = planItem?.discipline?.name || "Estudo Livre"
  const hasPlanContext = !!planItem
  const isPlanLinked = !!planItem?.id
  const colorHex = planItem?.discipline?.color_hex ?? null
  const planColor = disciplineColorHex(disciplineId, colorHex)

  const startNewSession = useCallback(() => {
    if (!hasPlanContext) return
    startSession({
      disciplineName,
      disciplineId,
      topicName: "",
      studyType: "TEORIA",
      technique: "LIVRE",
      plannedSeconds,
      planItemId: isPlanLinked ? planItem?.id : null,
      source: isPlanLinked ? "PLAN" : "FREE",
    })
    setPhase("ACTIVE")
  }, [
    startSession,
    disciplineName,
    disciplineId,
    plannedSeconds,
    isPlanLinked,
    hasPlanContext,
    planItem?.id,
  ])

  // Uma única fonte de verdade (StudyProvider):
  // - Se já existe sessão ativa (recuperada de refresh/aba), apenas continua.
  // - Caso contrário, inicia vinculada ao bloco do cronograma (nunca duas sessões).
  // O atraso permite que o StudyProvider restaure sessões do localStorage primeiro.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (startedRef.current) return
      startedRef.current = true
      const current = sessionRef.current
      if (current && current.isActive) {
        unminimizeSession()
      } else if (hasPlanContext) {
        startNewSession()
      }
      setIsReady(true)
    }, 150)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reage ao reset (feito na tela ou no widget flutuante): sessão zera e
  // volta ao estado 00:00:00, mantendo disciplina/bloco/tópico para reiniciar.
  useEffect(() => {
    if (!session) {
      if (phase === "ACTIVE" || phase === "EVALUATION") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuestions(0)
        setCorrect(0)
        setReviews(0)
        setEnergyFin(3)
        setPhase("IDLE")
      }
    }
  }, [session, phase])

  // Ao sair da página (navegação interna), minimiza para o widget flutuante
  // sem parar o cronômetro nem perder a sessão.
  useEffect(() => {
    return () => {
      if (sessionRef.current?.isActive) {
        minimizeSession()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFinish = useCallback(() => {
    pauseSession()
    setPhase("EVALUATION")
  }, [pauseSession])

  const handleBackToTimer = useCallback(() => {
    if (session?.phase === "PAUSED") resumeSession()
    setPhase("ACTIVE")
  }, [session?.phase, resumeSession])

  const handleSubmitEvaluation = useCallback(async () => {
    if (isSubmitting) return
    if (correct > questions) {
      toast.error("Acertos não podem ser maiores que as questões.")
      return
    }
    const current = sessionRef.current
    if (!current || !current.isActive) {
      toast.error("Nenhuma sessão ativa para salvar.")
      return
    }
    setIsSubmitting(true)
    try {
      const interrupted =
        current.plannedSeconds > 0 && current.activeSeconds < current.plannedSeconds * 0.9

      // Snapshot dos dados antes de salvar (a sessão é limpa após o sucesso)
      const stats: FinalStats = {
        disciplineName: current.disciplineName,
        durationSeconds: current.activeSeconds,
        focusPercent:
          current.activeSeconds + current.pausedSeconds > 0
            ? Math.round(
                (current.activeSeconds / (current.activeSeconds + current.pausedSeconds)) * 100,
              )
            : null,
        questions,
        correct,
        reviews,
        energy: energyFin,
        interrupted,
      }

      const res = await finalizeAndSaveSession({
        questions_answered: questions,
        questions_correct: correct,
        reviews_completed: reviews,
        energy_level: energyFin,
        interrupted,
      })

      if (!res.success) {
        toast.error(res.error || "Erro ao salvar a sessão.", { duration: 8000 })
        return
      }

      setFinalStats(stats)
      if (res.session) {
        dispatchStudySessionSaved(res.session as SavedStudySession)
      }
      toast.success("Estudo salvo com sucesso!")
      router.refresh()
      setPhase("SUMMARY")
    } catch (error: unknown) {
      console.error("[CRONOGRAMA_SAVE] Erro ao salvar:", error)
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        extra: {
          feature: "cronometro",
          route: "/dashboard/study-session",
          sessionType: sessionRef.current?.source ?? "UNKNOWN",
        },
      })
      toast.error("Erro inesperado ao salvar a sessão.")
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, correct, questions, reviews, energyFin, finalizeAndSaveSession, router])

  if (!isReady) return null

  // Sem bloco do cronograma e sem sessão ativa: orientar o usuário
  if (!hasPlanContext && !(session && session.isActive)) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="bg-muted/50 border rounded-2xl p-8 space-y-4">
          <Minimize2 className="w-10 h-10 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-black">Nenhum estudo iniciado</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Selecione uma matéria no Cronograma do Dia e clique em{" "}
            <span className="font-bold">Iniciar Estudo</span> para usar o cronômetro.
          </p>
          <Button onClick={() => router.push("/dashboard")} className="font-bold">
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (!session || !session.isActive) {
    if (phase === "IDLE" && hasPlanContext) {
      // Estado 00:00:00 após um reset — disciplina/bloco/tópico preservados.
      return (
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <div className="flex items-center justify-center gap-3">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: planColor }}
            />
            <h2 className="text-xl font-bold text-foreground">{disciplineName}</h2>
            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#2563EB]/10 text-[#2563EB] px-2 py-0.5 rounded-full">
              Cronograma
            </span>
          </div>

          <div className="space-y-3">
            <div className="text-7xl md:text-8xl font-black tracking-tighter tabular-nums text-muted-foreground/40">
              00:00:00
            </div>
            <div className="text-sm font-semibold text-muted-foreground">
              Aguardando início · Planejado: {plannedTime} min
            </div>
          </div>

          <Button
            size="lg"
            className="gap-2 w-64"
            onClick={startNewSession}
            aria-label="Iniciar estudo"
          >
            <Play className="w-5 h-5" /> Iniciar
          </Button>
        </div>
      )
    }
    return null
  }

  const isStudying = session.phase === "STUDYING"
  const color = disciplineColorHex(session.disciplineId, colorHex)
  const progress =
    session.plannedSeconds > 0
      ? Math.min((session.activeSeconds / session.plannedSeconds) * 100, 100)
      : 0
  const displayPlannedMin =
    session.plannedSeconds > 0 ? Math.round(session.plannedSeconds / 60) : plannedTime

  /* ─── CRONÔMETRO ─── */
  if (phase === "ACTIVE") {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="flex items-center justify-center gap-3">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h2 className="text-xl font-bold text-foreground">{session.disciplineName}</h2>
          {session.source === "PLAN" && (
            <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#2563EB]/10 text-[#2563EB] px-2 py-0.5 rounded-full">
              Cronograma
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-7xl md:text-8xl font-black tracking-tighter tabular-nums text-foreground">
            {formatTime(session.activeSeconds)}
          </div>
          <div className="text-sm font-semibold text-muted-foreground">
            {isStudying ? "Estudando" : "Pausado"} · Planejado: {displayPlannedMin} min
          </div>
        </div>

        {session.plannedSeconds > 0 && (
          <div className="space-y-1 px-8">
            <Progress value={progress} className="h-3 bg-muted" />
            <div className="flex justify-between text-[11px] font-bold text-muted-foreground px-1">
              <span>Tempo decorrido: {formatDurationShort(session.activeSeconds)}</span>
              <span>Planejado: {formatDurationShort(session.plannedSeconds)}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3 pt-4">
          {isStudying ? (
            <Button
              size="lg"
              variant="secondary"
              className="gap-2 w-36"
              onClick={pauseSession}
              aria-label="Pausar estudo"
            >
              <Pause className="w-5 h-5" /> Pausar
            </Button>
          ) : (
            <Button
              size="lg"
              className="gap-2 w-36"
              onClick={resumeSession}
              aria-label="Retomar estudo"
            >
              <Play className="w-5 h-5" /> Retomar
            </Button>
          )}

          <Button
            size="lg"
            variant="outline"
            className="gap-2 w-36"
            onClick={minimizeSession}
            aria-label="Minimizar cronômetro"
          >
            <Minimize2 className="w-5 h-5" /> Minimizar
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="gap-2 w-36 text-muted-foreground hover:text-rose-500"
            onClick={resetSession}
            disabled={session.activeSeconds + session.pausedSeconds === 0}
            aria-label="Resetar cronômetro"
          >
            <RefreshCcw className="w-5 h-5" /> Resetar
          </Button>

          <Button
            size="lg"
            variant="destructive"
            className="gap-2 w-36"
            onClick={handleFinish}
            aria-label="Encerrar estudo"
          >
            <Square className="w-5 h-5" /> Encerrar
          </Button>
        </div>

        <p className="text-xs text-muted-foreground font-medium">
          O cronômetro continua em segundo plano e aparece na guia do navegador.
        </p>
      </div>
    )
  }

  /* ─── AVALIAÇÃO RÁPIDA ─── */
  if (phase === "EVALUATION") {
    if (isSubmitting) {
      return (
        <div className="max-w-md mx-auto text-center space-y-6 py-12">
          <RefreshCw className="w-12 h-12 animate-spin text-primary mx-auto" />
          <h2 className="text-2xl font-bold">Salvando Sessão</h2>
          <p className="text-muted-foreground font-medium animate-pulse">
            Calculando tempo líquido e foco...
          </p>
        </div>
      )
    }

    const totalSeconds = session.activeSeconds + session.pausedSeconds
    const focusPercent =
      totalSeconds > 0 ? Math.round((session.activeSeconds / totalSeconds) * 100) : null

    return (
      <div className="max-w-xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-500">
        <h2 className="text-3xl font-bold tracking-tight">Avaliação Rápida</h2>
        <p className="text-muted-foreground">
          Registre sua produção em{" "}
          <span className="font-bold">{formatDurationShort(session.activeSeconds)}</span> de estudo
          para treinar o Mentor.
        </p>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="flex items-center gap-3 pb-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-bold text-foreground">{session.disciplineName}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                  Tempo estudado
                </div>
                <div className="font-black text-xl tabular-nums">
                  {formatDurationShort(session.activeSeconds)}
                </div>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-3 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
                  Foco calculado
                </div>
                <div className="font-black text-xl tabular-nums text-blue-600">
                  {focusPercent !== null ? `${focusPercent}%` : "—"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="questions-answered">Questões Respondidas</Label>
                <Input
                  id="questions-answered"
                  type="number"
                  min={0}
                  value={questions}
                  onChange={(e) => setQuestions(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="questions-correct">Acertos</Label>
                <Input
                  id="questions-correct"
                  type="number"
                  min={0}
                  value={correct}
                  onChange={(e) => setCorrect(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reviews-completed">Revisões Concluídas (Tópicos)</Label>
              <Input
                id="reviews-completed"
                type="number"
                min={0}
                value={reviews}
                onChange={(e) => setReviews(Math.max(0, Number(e.target.value)))}
              />
            </div>

            <hr />

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Energia Final</span>
                <span className="font-bold">{energyFin}/5</span>
              </div>
              <Slider
                value={[energyFin]}
                min={1}
                max={5}
                step={1}
                onValueChange={(v) => setEnergyFin(v[0] || 3)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Exausto</span>
                <span>Máxima</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            size="lg"
            variant="outline"
            className="gap-2 sm:w-40"
            onClick={handleBackToTimer}
            aria-label="Voltar para o cronômetro"
          >
            <ArrowLeft className="w-5 h-5" /> Voltar
          </Button>
          <Button
            size="lg"
            className="gap-2 flex-1"
            onClick={handleSubmitEvaluation}
            disabled={isSubmitting}
          >
            <CheckCircle className="w-5 h-5" /> Salvar Sessão
          </Button>
        </div>
      </div>
    )
  }

  /* ─── SESSÃO SALVA ─── */
  if (phase === "SUMMARY" && finalStats) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-in zoom-in-95 duration-500">
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-center">Sessão Concluída!</h2>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-lg font-bold">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              {finalStats.disciplineName}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted p-3 rounded-xl text-center">
                <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                  Tempo
                </div>
                <div className="font-black text-lg tabular-nums">
                  {formatDurationShort(finalStats.durationSeconds)}
                </div>
              </div>
              <div className="bg-blue-500/10 p-3 rounded-xl text-center">
                <div className="text-[10px] font-extrabold uppercase text-blue-600">Foco</div>
                <div className="font-black text-lg tabular-nums text-blue-600">
                  {finalStats.focusPercent !== null ? `${finalStats.focusPercent}%` : "—"}
                </div>
              </div>
              <div className="bg-muted p-3 rounded-xl text-center">
                <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                  Questões
                </div>
                <div className="font-black text-lg tabular-nums">{finalStats.questions}</div>
              </div>
              <div className="bg-muted p-3 rounded-xl text-center">
                <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                  Acertos
                </div>
                <div className="font-black text-lg tabular-nums">{finalStats.correct}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            size="lg"
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/dashboard/history")}
          >
            Ver Histórico
          </Button>
          <Button size="lg" className="flex-1" onClick={() => router.push("/dashboard")}>
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return null
}
