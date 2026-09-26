"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { CheckCircle2, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  answerReviewCardAction,
  finalizeReviewSessionAction,
  getActiveReviewSessionAction,
  startReviewSessionAction,
} from "@/application/review-engine/review.actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  REVIEW_BUCKET_LABEL,
  REVIEW_SOURCE_LABEL,
  type ReviewGrade,
  type ReviewSessionReport,
  type ReviewSessionState,
} from "@/domain/reviews/models"
import { formatStudyDateInSaoPaulo } from "@/lib/sao-paulo"

/** Identificador da resposta: o servidor usa isso para não aplicar duas vezes. */
function operationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `op-${Date.now()}-${Math.round(performance.now() * 1000)}`
}

/** Subtítulo do modal: resumo, progresso real da fila ou estado neutro. */
function describeSession(
  report: ReviewSessionReport | null,
  card: ReviewSessionState["card"] | null,
  session: ReviewSessionState | null,
): string {
  if (report) return "Resumo da sessão"
  if (!card) return "Sessão de revisão"
  // Fase I.5 (A2): `remaining` nulo = a contagem não pôde ser lida. Mostra "—",
  // nunca "0 na fila", que faria o aluno pensar que acabou.
  const remaining = session?.remaining ?? null
  const queue = remaining === null ? "—" : String(remaining)
  // Fase I.7: o mesmo princípio vale para o contador de respostas — sessão que
  // não pôde ser lida mostra "—", nunca "0 respondidas".
  const answered = session?.itemsAnswered ?? null
  const done = answered === null ? "—" : String(answered)
  return `${done} respondidas · ${queue} na fila`
}

const GRADE_ORDER: ReviewGrade[] = [1, 2, 3, 4]

function gradeVariant(grade: ReviewGrade): "destructive" | "outline" | "default" | "secondary" {
  if (grade === 1) return "destructive"
  if (grade === 2) return "outline"
  if (grade === 4) return "secondary"
  return "default"
}

export function ReviewSessionModal({
  open,
  itemId,
  onOpenChange,
}: {
  open: boolean
  itemId?: string | null
  onOpenChange: (open: boolean) => void
}) {
  const [session, setSession] = useState<ReviewSessionState | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [report, setReport] = useState<ReviewSessionReport | null>(null)
  // Instante em que o card atual apareceu (medida real do tempo de resposta).
  // Fica em ref e é preenchido fora do render, nunca durante ele.
  const shownAtRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setReport(null)
    setRevealed(false)
    const res = itemId ? await startReviewSessionAction(itemId) : await startReviewSessionAction()
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
      onOpenChange(false)
      return
    }
    setSession(res.data)
    shownAtRef.current = Date.now()
  }, [itemId, onOpenChange])

  useEffect(() => {
    if (!open) return
    // A sessão existente (ou nova) só é conhecida pelo servidor; carregar ao
    // abrir é o mesmo padrão dos outros modais do app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [open, load])

  const finish = useCallback(async () => {
    if (!session) {
      onOpenChange(false)
      return
    }
    setLoading(true)
    const res = await finalizeReviewSessionAction(session.sessionId)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setReport(res.data)
    if (res.data?.cycleSyncError) toast.error(res.data.cycleSyncError)
  }, [session, onOpenChange])

  const answer = useCallback(
    async (grade: ReviewGrade) => {
      if (!session?.card || answering) return
      setAnswering(true)
      const res = await answerReviewCardAction({
        sessionId: session.sessionId,
        itemId: session.card.itemId,
        grade,
        durationSeconds:
          shownAtRef.current === null
            ? 0
            : Math.max(0, Math.round((Date.now() - shownAtRef.current) / 1000)),
        clientOperationId: operationId(),
      })
      setAnswering(false)

      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.data?.conflict) {
        toast.error("Este item já havia sido respondido em outra aba. Atualizando a fila.")
      }
      const next = res.data?.session ?? null
      setSession(next)
      setRevealed(false)
      shownAtRef.current = Date.now()

      // Fila vazia: encerra a sessão e mostra o resumo real.
      //
      // Fase I.5 (A2): `remaining === null` significa que a contagem não pôde ser
      // lida — nesse caso NÃO encerramos nada. Encerrar por falha de leitura era
      // como tratar erro igual a "acabou": o aluno perderia a sessão em curso.
      if (next && !next.card && next.remaining === 0) {
        const finalize = await finalizeReviewSessionAction(next.sessionId)
        if (finalize.data) setReport(finalize.data)
        if (finalize.data?.cycleSyncError) toast.error(finalize.data.cycleSyncError)
      }
    },
    [session, answering],
  )

  // Ao reabrir depois de fechar no meio, retoma a sessão que ficou aberta.
  useEffect(() => {
    if (!open || session || loading || report) return
    void (async () => {
      const res = await getActiveReviewSessionAction()
      if (res.data) setSession(res.data)
    })()
  }, [open, session, loading, report])

  const card = session?.card ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisão</DialogTitle>
          <DialogDescription>{describeSession(report, card, session)}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            <span className="ml-2 text-sm">Carregando…</span>
          </div>
        )}

        {!loading && report && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 aria-hidden className="h-4 w-4 text-success" />
              {report.itemsAnswered === 0
                ? "Nenhum item respondido nesta sessão."
                : `${report.itemsAnswered} ${report.itemsAnswered === 1 ? "item revisado" : "itens revisados"}.`}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Lembrei</dt>
                <dd className="tabular-nums font-medium text-foreground">{report.remembered}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Errei</dt>
                <dd className="tabular-nums font-medium text-foreground">{report.forgot}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duração</dt>
                <dd className="tabular-nums font-medium text-foreground">{report.durationMinutes} min</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Próxima revisão</dt>
                <dd className="tabular-nums font-medium text-foreground">
                  {report.nextDueAt ? formatStudyDateInSaoPaulo(report.nextDueAt) : "—"}
                </dd>
              </div>
            </dl>
            {report.studyRegistered && (
              <p className="text-xs text-muted-foreground">
                O tempo desta sessão foi registrado no seu histórico de estudos como revisão.
              </p>
            )}
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}

        {!loading && !report && !card && (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-foreground">Nada para revisar agora.</p>
            <Button variant="outline" onClick={() => void finish()}>
              Encerrar sessão
            </Button>
          </div>
        )}

        {!loading && !report && card && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{REVIEW_SOURCE_LABEL[card.sourceType]}</Badge>
                <Badge variant={card.bucket === "OVERDUE" ? "warning" : "secondary"}>
                  {REVIEW_BUCKET_LABEL[card.bucket]}
                </Badge>
                <span className="text-xs text-muted-foreground">{card.disciplineName}</span>
              </div>
              {card.parentTitle && (
                <p className="mt-3 text-xs text-muted-foreground">{card.parentTitle}</p>
              )}
              <p className="mt-1 text-base font-medium leading-snug text-foreground">{card.title}</p>
              <p className="mt-3 text-[13px] text-muted-foreground">
                {revealed
                  ? "Você lembrou deste conteúdo?"
                  : "Tente lembrar do conteúdo deste tópico antes de responder."}
              </p>
            </div>

            {!revealed ? (
              <Button className="w-full" onClick={() => setRevealed(true)}>
                <Eye aria-hidden className="mr-1.5 h-4 w-4" />
                Já tentei lembrar
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADE_ORDER.map((grade) => {
                  const preview = card.previews.find((p) => p.grade === grade)
                  return (
                    <Button
                      key={grade}
                      variant={gradeVariant(grade)}
                      disabled={answering}
                      aria-label={`${preview?.label ?? ""} — volta em ${preview?.preview ?? ""}`}
                      onClick={() => void answer(grade)}
                      className="h-auto flex-col py-2"
                    >
                      <span className="text-[13px] font-medium">{preview?.label}</span>
                      <span className="text-[11px] font-normal opacity-80">{preview?.preview}</span>
                    </Button>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {card.reps === 0
                  ? "Primeira revisão deste item."
                  : `${card.reps} ${card.reps === 1 ? "revisão" : "revisões"}${card.lapses > 0 ? ` · ${card.lapses} ${card.lapses === 1 ? "esquecimento" : "esquecimentos"}` : ""}`}
              </p>
              <Button variant="ghost" size="sm" onClick={() => void finish()}>
                Encerrar sessão
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
