"use client"

import { useEffect, useRef, useState } from "react"
import { Eye, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  answerReviewCardAction,
  finalizeReviewSessionAction,
  getActiveReviewSessionAction,
  revealReviewCardAction,
  startReviewSessionAction,
} from "@/application/review-engine/review.actions"
import type {
  ReviewCardFront,
  ReviewCardReveal,
  ReviewSessionMode,
} from "@/domain/reviews/models"

interface ReviewPlayerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: ReviewSessionMode
  onFinished?: () => void
}

interface SessionView {
  sessionId: string
  mode: ReviewSessionMode
  cardsTotal: number
  answered: number
  nextCard: ReviewCardFront | null
  nextCardId: string | null
  isFinished: boolean
}

export function ReviewPlayerModal({ open, onOpenChange, mode = "ALL", onFinished }: ReviewPlayerModalProps) {
  const [session, setSession] = useState<SessionView | null>(null)
  const [revealed, setRevealed] = useState<ReviewCardReveal | null>(null)
  const [starting, setStarting] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardStartAt = useRef(0)

  const resetState = () => {
    setSession(null)
    setRevealed(null)
    setError(null)
    setStarting(false)
    setRevealing(false)
    setAnswering(false)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      resetState()
      if (!open) return
      setStarting(true)
      try {
        let res = await getActiveReviewSessionAction()
        if (!res.data && !res.error) {
          res = await startReviewSessionAction({ mode })
        }
        if (cancelled) return
        if (res.error) {
          setError(res.error)
          return
        }
        if (res.data) {
          setSession(res.data)
          cardStartAt.current = Date.now()
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao iniciar revisão.")
      } finally {
        if (!cancelled) setStarting(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleReveal = async () => {
    if (!session?.nextCardId || revealing) return
    setRevealing(true)
    try {
      const res = await revealReviewCardAction(session.nextCardId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setRevealed(res.data)
    } finally {
      setRevealing(false)
    }
  }

  const handleAnswer = async (grade: 1 | 2 | 3 | 4) => {
    if (!session?.sessionId || !session.nextCardId || answering) return
    setAnswering(true)
    try {
      const elapsed = Math.max(1, Math.round((Date.now() - cardStartAt.current) / 1000))
      const res = await answerReviewCardAction(session.sessionId, session.nextCardId, grade, elapsed)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.data) {
        setSession({
          sessionId: session.sessionId,
          mode: session.mode,
          cardsTotal: res.data.cardsTotal,
          answered: res.data.answered,
          nextCard: res.data.nextCard,
          nextCardId: res.data.nextCardId,
          isFinished: res.data.isFinished,
        })
        setRevealed(null)
        cardStartAt.current = Date.now()
        if (res.data.isFinished) onFinished?.()
      }
    } finally {
      setAnswering(false)
    }
  }

  const close = () => {
    const s = session
    onOpenChange(false)
    if (s && !s.isFinished && s.answered > 0) {
      void finalizeReviewSessionAction(s.sessionId)
    }
    onFinished?.()
  }

  const front = session?.nextCard
  const progress = session ? `${Math.min(session.answered + (front ? 1 : 0), session.cardsTotal)} / ${session.cardsTotal}` : ""

  return (
    <Dialog open={open} onOpenChange={(next) => (next || close())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4 pr-6">
            <span>Revisão Espacial</span>
            {session && !session.isFinished && (
              <span className="text-xs font-semibold text-muted-foreground">{progress} cartões</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {starting && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Montando sua fila de revisão...</span>
          </div>
        )}

        {!starting && error && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}

        {!starting && !error && session?.isFinished && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-sm font-bold">Revisão concluída!</p>
            <p className="text-xs text-muted-foreground">
              Você revisou {session.cardsTotal} cartão{session.cardsTotal === 1 ? "" : "ões"}. A memória foi atualizada com
              os intervalos do FSRS.
            </p>
            <Button size="sm" onClick={close}>
              Fechar
            </Button>
          </div>
        )}

        {!starting && !error && !session?.isFinished && front && (
          <div className="space-y-4">
            <div className="min-h-40 rounded-xl border bg-muted/20 p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {front.disciplineName}
                  {front.topicName ? ` · ${front.topicName}` : ""}
                </span>
                {front.flag && (
                  <span className="text-[11px] font-bold text-red-500 uppercase">{front.flag.replace("_", " ")}</span>
                )}
              </div>
              <p className="text-base font-medium whitespace-pre-wrap flex-1">{front.front}</p>
              <p className="text-xs text-muted-foreground">
                {front.reviewCount} revisão{front.reviewCount === 1 ? "" : "ões"} ·{" "}
                {front.lapsesCount} lapso{front.lapsesCount === 1 ? "" : "s"}
              </p>
            </div>

            {revealed ? (
              <div className="space-y-4">
                <div className="rounded-xl border bg-emerald-500/5 p-5">
                  <p className="text-xs font-bold text-emerald-600 mb-2 uppercase">Resposta</p>
                  <p className="text-sm whitespace-pre-wrap">{revealed.back || "Sem resposta registrada."}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {revealed.intervals.map((interval) => (
                    <Button
                      key={interval.grade}
                      variant={gradeVariant(interval.grade)}
                      disabled={answering}
                      onClick={() => void handleAnswer(interval.grade as 1 | 2 | 3 | 4)}
                    >
                      {interval.label}
                      <span className="ml-auto text-xs opacity-70">{interval.preview}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button onClick={() => void handleReveal()} disabled={revealing}>
                  {revealing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  Mostrar resposta
                </Button>
              </div>
            )}
          </div>
        )}

        {!starting && !error && !session && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium">Nenhuma revisão disponível nesta fila.</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function gradeVariant(grade: number): "destructive" | "default" | "outline" {
  if (grade === 1) return "destructive"
  if (grade === 4) return "default"
  return "outline"
}