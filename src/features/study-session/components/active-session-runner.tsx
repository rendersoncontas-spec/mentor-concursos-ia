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
  Volume2,
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

import { FocusSoundControl } from "./focus-sound-control"
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
    updatePlannedSeconds,
    focusSound,
    focusSoundVolume,
    focusSoundIsPlaying,
    selectFocusSound,
    changeFocusSoundVolume,
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
    const result = startSession({
      disciplineName,
      disciplineId,
      topicName: "",
      studyType: "TEORIA",
      technique: "LIVRE",
      plannedSeconds,
      planItemId: isPlanLinked ? planItem?.id : null,
      source: isPlanLinked ? "PLAN" : "FREE",
    })
    if (!result.started) return
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

  const handleMinimize = useCallback(() => {
    minimizeSession()
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/dashboard/planejamento")
    }
  }, [minimizeSession, router])

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
        setPhase("ACTIVE")
      } else if (hasPlanContext) {
        startNewSession()
      }
      setIsReady(true)
    }, 150)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Garante que se uma sessão estiver ativa, a fase vá para ACTIVE
  useEffect(() => {
    if (session?.isActive && phase === "IDLE") {
      setPhase("ACTIVE")
    }
  }, [session?.isActive, phase])

  // Sincroniza a duração planejada caso o bloco do cronograma tenha tempo customizado (ex: pendência/replanejamento de 28min)
  useEffect(() => {
    if (
      session &&
      session.isActive &&
      hasPlanContext &&
      plannedSeconds > 0 &&
      session.plannedSeconds !== plannedSeconds &&
      (session.planItemId === (isPlanLinked ? planItem?.id : null) ||
        session.disciplineId === disciplineId)
    ) {
      updatePlannedSeconds(plannedSeconds)
    }
  }, [
    session,
    plannedSeconds,
    hasPlanContext,
    isPlanLinked,
    planItem?.id,
    disciplineId,
    updatePlannedSeconds,
  ])

  // Reage ao reset (feito na tela ou no widget flutuante): sessão zera e
  // volta ao estado 00:00:00, mantendo disciplina/bloco/tópico para reiniciar.
  useEffect(() => {
    if (!session) {
      if (phase === "ACTIVE" || phase === "EVALUATION") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuestions(0)
        setCorrect(0)
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
        energy: energyFin,
        interrupted,
      }

      const res = await finalizeAndSaveSession({
        questions_answered: questions,
        questions_correct: correct,
        energy_level: energyFin,
        interrupted,
      })

      if (!res.success) {
        toast.error(res.error || "Erro ao salvar a sessão.", { duration: 8000 })
        return
      }

      setFinalStats(stats)
      if (res.pending) {
        toast.success("Estudo salvo offline. Será sincronizado quando a conexão voltar.")
      } else {
        if (res.session) {
          // Fase F.2: a resposta da Server Action (que chamou revalidatePath)
          // já traz a página atual re-renderizada com dados novos.
          dispatchStudySessionSaved(res.session as SavedStudySession, { serverRefresh: true })
        }
        toast.success("Estudo salvo com sucesso!")
      }
      // Fase F.2: salvamento confirmado no servidor → a resposta da Server
      // Action (que chamou revalidatePath) já trouxe a página atual
      // re-renderizada; router.refresh() só no caminho offline, como antes.
      if (res.pending) router.refresh()
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
  }, [isSubmitting, correct, questions, energyFin, finalizeAndSaveSession, router])

  if (!isReady) return null

  // Sem bloco do cronograma e sem sessão ativa: orientar o usuário
  if (!hasPlanContext && !(session && session.isActive)) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="py-10 space-y-2">
          <Minimize2 aria-hidden className="w-5 h-5 mx-auto text-muted-foreground/70" />
          <h2 className="text-sm font-medium text-foreground">Nenhum estudo iniciado</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Selecione uma matéria no cronograma do dia e clique em{" "}
            <span className="font-medium text-foreground">Iniciar</span> para usar o cronômetro.
          </p>
          <Button onClick={() => router.push("/dashboard")} variant="outline" size="sm" className="mt-2">
            Voltar ao início
          </Button>
        </div>
      </div>
    )
  }

  if (!session || !session.isActive) {
    if (phase === "IDLE" && hasPlanContext) {
      // Estado 00:00:00 após um reset — disciplina/bloco/tópico preservados.
      return (
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: planColor }}
            />
            <h2 className="type-h2 text-foreground">{disciplineName}</h2>
            <span className="text-xs text-muted-foreground">· Cronograma</span>
          </div>

          <div className="space-y-3">
            <div className="text-5xl md:text-6xl font-medium tracking-tight tabular-nums text-muted-foreground/50">
              00:00:00
            </div>
            <div className="text-[13px] text-muted-foreground tabular-nums">
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
  // Redesign 2.0 — hierarquia: disciplina → modo → tempo → ações →
  // informações secundárias. O estado ativo é indicado por texto + ponto de
  // cor (teal estudando / âmbar pausado), sem glow nem número gigante.
  if (phase === "ACTIVE") {
    return (
      <div className="max-w-xl mx-auto space-y-8">
        {/* Barra superior: voltar/minimizar */}
        <div className="flex items-center justify-between w-full">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMinimize}
            className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Minimizar cronômetro e voltar"
          >
            <ArrowLeft className="w-4 h-4" /> Minimizar e voltar
          </Button>
          <span className="text-xs text-muted-foreground">Modo estudo</span>
        </div>

        <section aria-label="Cronômetro" className="text-center space-y-5">
          {/* 1. Disciplina */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <h2 className="type-h2 text-foreground">{session.disciplineName}</h2>
            </div>
            {/* 2. Modo / estado */}
            <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
              <span
                aria-hidden
                className={`w-1.5 h-1.5 rounded-full ${isStudying ? "bg-primary" : "bg-warning"}`}
              />
              <span className="text-foreground font-medium">
                {isStudying ? "Estudando" : "Pausado"}
              </span>
              {session.source === "PLAN" && <span>· Cronograma</span>}
              <span className="tabular-nums">· Planejado: {displayPlannedMin} min</span>
            </p>
          </div>

          {/* 3. Tempo */}
          <div
            className={`text-5xl md:text-6xl font-medium tracking-tight tabular-nums ${
              isStudying ? "text-foreground" : "text-muted-foreground"
            }`}
            aria-live="off"
          >
            {formatTime(session.activeSeconds)}
          </div>

          {session.plannedSeconds > 0 && (
            <div className="space-y-1.5 max-w-sm mx-auto">
              <Progress value={progress} className="h-1" />
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>Decorrido: {formatDurationShort(session.activeSeconds)}</span>
                <span>Planejado: {formatDurationShort(session.plannedSeconds)}</span>
              </div>
            </div>
          )}

          {/* 4. Ações — uma primária, demais neutras */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <div className="flex flex-wrap justify-center gap-2">
              {isStudying ? (
                <Button
                  size="lg"
                  className="gap-2 w-36 cursor-pointer"
                  onClick={pauseSession}
                  aria-label="Pausar estudo"
                >
                  <Pause className="w-4 h-4" /> Pausar
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="gap-2 w-36 cursor-pointer"
                  onClick={resumeSession}
                  aria-label="Retomar estudo"
                >
                  <Play className="w-4 h-4" /> Retomar
                </Button>
              )}

              <Button
                size="lg"
                variant="outline"
                className="gap-2 w-36 cursor-pointer"
                onClick={handleFinish}
                aria-label="Encerrar estudo"
              >
                <Square className="w-4 h-4" /> Encerrar
              </Button>
            </div>

            <div className="flex flex-wrap justify-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground cursor-pointer"
                onClick={handleMinimize}
                aria-label="Minimizar cronômetro"
              >
                <Minimize2 className="w-4 h-4" /> Minimizar
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                onClick={resetSession}
                disabled={session.activeSeconds + session.pausedSeconds === 0}
                aria-label="Resetar cronômetro"
              >
                <RefreshCcw className="w-4 h-4" /> Resetar
              </Button>
            </div>
          </div>
        </section>

        {/* 5. Informações secundárias: som de foco */}
        <section aria-label="Som ambiente de foco" className="border-t border-border pt-4 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" /> Som ambiente de foco
            </span>
            {focusSound !== "off" && focusSoundIsPlaying && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-primary" /> Tocando
              </span>
            )}
          </div>
          <FocusSoundControl
            selectedSound={focusSound}
            volume={focusSoundVolume}
            isPlaying={focusSoundIsPlaying}
            onSelectSound={selectFocusSound}
            onVolumeChange={changeFocusSoundVolume}
          />
        </section>

        <p className="text-xs text-muted-foreground text-center">
          O cronômetro continua em segundo plano e aparece na guia do navegador.
        </p>
      </div>
    )
  }

  /* ─── AVALIAÇÃO RÁPIDA ─── */
  if (phase === "EVALUATION") {
    if (isSubmitting) {
      return (
        <div className="max-w-md mx-auto text-center space-y-6 py-6">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
          <h2 className="type-h3">Salvando sessão</h2>
          <p className="text-[13px] text-muted-foreground">
            Calculando tempo líquido e foco…
          </p>
        </div>
      )
    }

    const totalSeconds = session.activeSeconds + session.pausedSeconds
    const focusPercent =
      totalSeconds > 0 ? Math.round((session.activeSeconds / totalSeconds) * 100) : null

    return (
      <div className="max-w-xl mx-auto space-y-6">
        <h2 className="type-h2">Avaliação rápida</h2>
        <p className="text-sm text-muted-foreground">
          Registre sua produção em{" "}
          <span className="font-semibold">{formatDurationShort(session.activeSeconds)}</span> de estudo
          para treinar o Mentor.
        </p>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="flex items-center gap-3 pb-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-semibold text-foreground">{session.disciplineName}</span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-border border-y border-border">
              <div className="p-3 text-center">
                <div className="text-xs text-muted-foreground">
                  Tempo estudado
                </div>
                <div className="font-semibold text-xl tabular-nums">
                  {formatDurationShort(session.activeSeconds)}
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs text-muted-foreground">
                  Foco calculado
                </div>
                <div className="font-semibold text-xl tabular-nums text-primary">
                  {focusPercent !== null ? `${focusPercent}%` : "—"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="questions-answered">Questões respondidas</Label>
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

            {/*
              Fase I.6 (achado M6): aqui havia o campo "Revisões concluídas
              (tópicos)". O número ia para o metadata do estudo, não era lido por
              nada e alimentava um stub que só escrevia no console — nenhum item do
              motor de revisões era concluído. O campo sugeria ao aluno que ele
              estava marcando revisões como feitas, e não estava.

              Revisão continua sendo o que a decisão D2 define: o aluno adiciona o
              tópico em /dashboard/reviews e responde lá. Nada aqui cria, conclui ou
              agenda revisão.
            */}

            <hr />

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Energia Final</span>
                <span className="font-semibold">{energyFin}/5</span>
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
            <CheckCircle className="w-4 h-4" /> Salvar sessão
          </Button>
        </div>
      </div>
    )
  }

  /* ─── SESSÃO SALVA ─── */
  if (phase === "SUMMARY" && finalStats) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-1.5">
          <CheckCircle aria-hidden className="w-6 h-6 text-success mx-auto" />
          <h2 className="type-h2">Sessão concluída</h2>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-[15px] font-semibold">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              {finalStats.disciplineName}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border border-y border-border">
              <div className="p-3 text-center">
                <div className="text-xs text-muted-foreground">
                  Tempo
                </div>
                <div className="font-semibold text-lg tabular-nums">
                  {formatDurationShort(finalStats.durationSeconds)}
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs text-muted-foreground">Foco</div>
                <div className="font-semibold text-lg tabular-nums text-primary">
                  {finalStats.focusPercent !== null ? `${finalStats.focusPercent}%` : "—"}
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs text-muted-foreground">
                  Questões
                </div>
                <div className="font-semibold text-lg tabular-nums">{finalStats.questions}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs text-muted-foreground">
                  Acertos
                </div>
                <div className="font-semibold text-lg tabular-nums">{finalStats.correct}</div>
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
            Ver histórico
          </Button>
          <Button size="lg" className="flex-1" onClick={() => router.push("/dashboard")}>
            Voltar ao início
          </Button>
        </div>
      </div>
    )
  }

  return null
}
