"use client"

import { useState } from "react"
import { Play, Pause, Square, CheckCircle, Brain, Target, AlertCircle, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"

import { useSmartTimer } from "../hooks/use-smart-timer"
import { startStudySessionAction } from "@/application/study-history/study-history.actions"
import { finalizeSmartSessionAction } from "@/application/study-session/study-session.actions"
import type { SessionCompletionPayload, SessionSummary } from "@/application/study-session/study-session.models"
import type { StudyHistoryInsert } from "@/domain/study-history/study-history.types"
import type { StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"

type SessionPhase = "SETUP" | "ACTIVE" | "EVALUATION" | "SUMMARY"

interface ActiveSessionRunnerProps {
  planItem?: StudyPlanItemWithDetails
}

export function ActiveSessionRunner({ planItem }: ActiveSessionRunnerProps) {
  const router = useRouter()
  
  // Contexto do Mentor de Estudos - calcular antes do hook
  const plannedTime = planItem?.duration_minutes || 60
  const disciplineName = planItem?.discipline?.name || "Estudo Livre"
  
  const timer = useSmartTimer(plannedTime)
  
  const [phase, setPhase] = useState<SessionPhase>("SETUP")
  
  // Setup State
  const [focusInit, setFocusInit] = useState(3)
  const [energyInit, setEnergyInit] = useState(3)
  
  // Evaluation State
  const [focusFin, setFocusFin] = useState(3)
  const [energyFin, setEnergyFin] = useState(3)
  const [questions, setQuestions] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [reviews, setReviews] = useState(0)
  
  // Loading & Result
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [progressMsg, setProgressMsg] = useState("Finalizando...")
  
  const isRecoveredSession = timer.hasRecovered && phase === "SETUP"
  const currentPhase = isRecoveredSession ? "ACTIVE" : phase

  const handleStart = async () => {
    // Inicia no banco para marcar o momento exato
    const sessionData: Omit<StudyHistoryInsert, "user_id"> = {
      discipline_id: planItem?.discipline_id ?? "",
      study_plan_item_id: planItem?.id ?? null,
      study_source: planItem ? "PLAN" : "FREE",
      study_type: null,
      technique: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_minutes: null,
      active_minutes: null,
      paused_minutes: null,
      planned_minutes: plannedTime,
      completed: false,
      interrupted: false,
      energy_level: null,
      difficulty: null,
      focus_score: null,
      mood: null,
      notes: null,
      metadata: null,
    }
    const result = await startStudySessionAction(sessionData)
    
    if (result.data) {
      timer.startTimer(result.data.id, planItem?.id || null, focusInit, energyInit)
      setPhase("ACTIVE")
    } else {
      toast.error("Erro ao iniciar sessão: " + result.error)
    }
  }

  const handleFinish = () => {
    timer.pauseTimer()
    setPhase("EVALUATION")
  }

  const handleSubmitEvaluation = async () => {
    setIsSubmitting(true)
    setProgressMsg("Calculando tempo líquido...")
    
    // Simulate progression for premium UX
    setTimeout(() => setProgressMsg("Atualizando Question Engine..."), 800)
    setTimeout(() => setProgressMsg("Recalculando seu IGA..."), 1600)
    
    const sessionId = timer.state.sessionId
    if (!sessionId) {
      toast.error("Não foi possível identificar a sessão ativa.")
      setIsSubmitting(false)
      return
    }

    const payload: SessionCompletionPayload = {
      sessionId,
      ...(timer.state.planId ? { planId: timer.state.planId } : {}),
      ...(planItem?.discipline_id ? { disciplineId: planItem.discipline_id } : {}),
      durationMinutes: timer.elapsedMinutes,
      energyInitial: timer.state.energyInitial,
      energyFinal: energyFin,
      focusInitial: timer.state.focusInitial,
      focusFinal: focusFin,
      interrupted: timer.elapsedMinutes < plannedTime * 0.9,
      questionsAnswered: questions,
      correctAnswers: correct,
      wrongAnswers: questions - correct,
      reviewsCompleted: reviews
    }
    
    const res = await finalizeSmartSessionAction(payload)
    
    setIsSubmitting(false)
    if (res.data) {
      setSummary(res.data)
      setPhase("SUMMARY")
      timer.clearTimer()
    } else {
      toast.error("Erro ao finalizar sessão: " + res.error)
      setPhase("ACTIVE")
    }
  }

  const handleReturn = () => {
    router.push("/dashboard")
  }

  // Renderers por Fase
  if (currentPhase === "SETUP") {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-primary/10 border border-primary/20 p-6 rounded-xl flex gap-4 items-start">
          <Brain className="h-8 w-8 text-primary shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-lg text-primary mb-1">Por que estudar {disciplineName} hoje?</h3>
            <p className="text-muted-foreground leading-relaxed">
              De acordo com o seu perfil, a sua retenção neste assunto começou a decair. 
              Garantir {plannedTime} minutos hoje vai assegurar a memorização de longo prazo.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Como você está agora?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium flex items-center gap-2"><Target className="w-4 h-4 text-blue-500"/> Foco</span>
                <span className="font-bold">{focusInit}/5</span>
              </div>
              <Slider value={[focusInit]} min={1} max={5} step={1} onValueChange={(v) => setFocusInit(v[0] || 3)} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Disperso</span>
                <span>Hyper-foco</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4 text-orange-500"/> Energia</span>
                <span className="font-bold">{energyInit}/5</span>
              </div>
              <Slider value={[energyInit]} min={1} max={5} step={1} onValueChange={(v) => setEnergyInit(v[0] || 3)} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Exausto</span>
                <span>Máxima</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button size="lg" className="w-full gap-2" onClick={handleStart}>
              <Play className="w-5 h-5" /> Começar Sessão ({plannedTime} min)
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (currentPhase === "ACTIVE") {
    const progress = Math.min((timer.elapsedMinutes / plannedTime) * 100, 100)
    const isFinished = timer.isFinished
    
    return (
      <div className="max-w-2xl mx-auto text-center space-y-8">
        
        {timer.inactivityWarning && (
          <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 p-4 rounded-xl flex items-center justify-center gap-3 animate-in fade-in zoom-in">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Detectamos inatividade. O tempo líquido foi pausado automaticamente.</span>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-xl font-medium text-muted-foreground">{disciplineName}</h2>
          <div className={`text-7xl md:text-8xl font-black tracking-tighter tabular-nums text-foreground ${isFinished ? "text-rose-500 animate-pulse" : ""}`}>
            {timer.formattedTime}
          </div>
          <div className="text-muted-foreground font-medium">
            {isFinished ? "Tempo esgotado!" : `de ${plannedTime} min planejados`}
          </div>
        </div>

        <div className="space-y-2 px-8">
          <Progress value={progress} className="h-3 bg-muted" />
        </div>

        <div className="flex justify-center gap-4 pt-4">
          {timer.state.isRunning ? (
            <Button size="lg" variant="secondary" className="gap-2 w-32" onClick={timer.pauseTimer}>
              <Pause className="w-5 h-5" /> Pausar
            </Button>
          ) : (
            <Button size="lg" className="gap-2 w-32" onClick={timer.resumeTimer}>
              <Play className="w-5 h-5" /> Continuar
            </Button>
          )}
          
          <Button size="lg" variant="destructive" className="gap-2 w-32" onClick={handleFinish}>
            <Square className="w-5 h-5" /> Encerrar
          </Button>
        </div>
      </div>
    )
  }

  if (phase === "EVALUATION") {
    if (isSubmitting) {
      return (
        <div className="max-w-md mx-auto text-center space-y-6 py-12">
          <RefreshCw className="w-12 h-12 animate-spin text-primary mx-auto" />
          <h2 className="text-2xl font-bold">Salvando Sessão</h2>
          <p className="text-muted-foreground font-medium animate-pulse">{progressMsg}</p>
        </div>
      )
    }

    return (
      <div className="max-w-xl mx-auto space-y-6 animate-in slide-in-from-bottom-8 duration-500">
        <h2 className="text-3xl font-bold tracking-tight">Avaliação Rápida</h2>
        <p className="text-muted-foreground">Registre sua produção em {timer.elapsedMinutes} minutos para treinar o Mentor.</p>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Questões Respondidas</label>
                <Input type="number" min={0} value={questions} onChange={e => setQuestions(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Acertos</label>
                <Input type="number" min={0} max={questions} value={correct} onChange={e => setCorrect(Number(e.target.value))} />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Revisões Concluídas (Tópicos)</label>
              <Input type="number" min={0} value={reviews} onChange={e => setReviews(Number(e.target.value))} />
            </div>

            <hr />

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Foco Final</span>
                <span className="font-bold">{focusFin}/5</span>
              </div>
              <Slider value={[focusFin]} min={1} max={5} step={1} onValueChange={(v) => setFocusFin(v[0] || 3)} />
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="font-medium">Energia Final</span>
                <span className="font-bold">{energyFin}/5</span>
              </div>
              <Slider value={[energyFin]} min={1} max={5} step={1} onValueChange={(v) => setEnergyFin(v[0] || 3)} />
            </div>
          </CardContent>
          <CardFooter>
            <Button size="lg" className="w-full gap-2" onClick={handleSubmitEvaluation}>
              <CheckCircle className="w-5 h-5" /> Salvar Sessão
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (phase === "SUMMARY" && summary) {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-in zoom-in-95 duration-500">
        <div className="bg-primary/10 text-primary p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center mb-6">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-center">Sessão Concluída!</h2>
        
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-lg font-medium italic text-primary">&quot;{summary.mentorResponse}&quot;</p>
            <div className="flex flex-col justify-center items-center gap-2">
              <div className="flex justify-center items-center gap-4 text-2xl font-bold">
                <span className="text-muted-foreground text-sm uppercase tracking-wider">IGA Atual</span>
                <span>{summary.igaAfter}</span>
              </div>
              {summary.focusVariation > 0 && summary.energyVariation > 0 && (
                <div className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold">
                  Sua consistência melhorou consideravelmente nesta sessão!
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-muted p-4 rounded-xl text-center">
            <div className="text-sm text-muted-foreground mb-1">Tempo</div>
            <div className="font-bold text-xl">{summary.durationMinutes}m</div>
          </div>
          <div className="bg-muted p-4 rounded-xl text-center">
            <div className="text-sm text-muted-foreground mb-1">Acerto</div>
            <div className="font-bold text-xl">{summary.accuracy}%</div>
          </div>
          <div className="bg-muted p-4 rounded-xl text-center">
            <div className="text-sm text-muted-foreground mb-1">Δ Foco</div>
            <div className="font-bold text-xl text-blue-600">{summary.focusVariation > 0 ? `+${summary.focusVariation}` : summary.focusVariation}</div>
          </div>
          <div className="bg-muted p-4 rounded-xl text-center">
            <div className="text-sm text-muted-foreground mb-1">Δ Energia</div>
            <div className="font-bold text-xl text-orange-600">{summary.energyVariation > 0 ? `+${summary.energyVariation}` : summary.energyVariation}</div>
          </div>
        </div>

        <Button size="lg" className="w-full" onClick={handleReturn}>
          Voltar ao Dashboard
        </Button>
      </div>
    )
  }

  return null
}
