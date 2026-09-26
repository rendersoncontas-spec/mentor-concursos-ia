"use client"

import { useCallback, useState, useTransition } from "react"

import { useRouter } from "next/navigation"
import { Archive, PauseCircle, Play, Plus, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import {
  getReviewsOverviewAction,
  setReviewItemFlagAction,
} from "@/application/review-engine/review.actions"
import { reviewItemLabel } from "@/application/review-engine/review-queue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Metric } from "@/components/ui/metric"
import { SectionHeader } from "@/components/ui/section-header"
import {
  REVIEW_SOURCE_LABEL,
  REVIEW_STATE_LABEL,
  type ReviewItemView,
  type ReviewsOverview,
} from "@/domain/reviews/models"
import { AddToReviewModal } from "@/features/reviews/components/add-to-review-modal"
import { ReviewSessionModal } from "@/features/reviews/components/review-session-modal"
import { formatStudyDateInSaoPaulo } from "@/lib/sao-paulo"

/** Data/hora de vencimento em texto curto, no fuso do aluno. */
function dueLabel(iso: string): string {
  return formatStudyDateInSaoPaulo(iso) || "—"
}

/** Frase honesta do rodapé: o que há para hoje ou quando volta a próxima. */
function queueSummary(dueTotal: number, nextDueAt: string | null): string {
  if (dueTotal > 0) return `${dueTotal} ${dueTotal === 1 ? "item" : "itens"} para revisar hoje.`
  if (nextDueAt) return `Nada para hoje. Próxima revisão: ${dueLabel(nextDueAt)}.`
  return "Você não tem revisões agendadas."
}

function ItemRow({
  item,
  actions,
}: {
  item: ReviewItemView
  actions?: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{reviewItemLabel(item)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.disciplineName} · {REVIEW_SOURCE_LABEL[item.sourceType]} · {REVIEW_STATE_LABEL[item.state]}
          {item.reps > 0 ? ` · ${item.reps} ${item.reps === 1 ? "revisão" : "revisões"}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-xs text-muted-foreground">{dueLabel(item.dueAt)}</span>
        {actions}
      </div>
    </li>
  )
}

export function ReviewsView({ initialOverview }: { initialOverview: ReviewsOverview }) {
  const router = useRouter()
  const [overview, setOverview] = useState<ReviewsOverview>(initialOverview)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [sessionItemId, setSessionItemId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    const res = await getReviewsOverviewAction()
    if (res.data) setOverview(res.data)
    startTransition(() => router.refresh())
  }, [router])

  const flag = useCallback(
    async (itemId: string, action: "SUSPEND" | "UNSUSPEND" | "ARCHIVE" | "RESTORE", message: string) => {
      const res = await setReviewItemFlagAction(itemId, action)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(message)
      await refresh()
    },
    [refresh],
  )

  const { counts, due, upcoming, suspended, archived, retention, nextDueAt } = overview

  // Fase I.5 (achado A2): `counts === null` quer dizer que a leitura NÃO
  // aconteceu. Nesse caso a página não monta resumo, fila nem seções — todas
  // ficariam zeradas e pareceriam "você não tem revisões", que é justamente a
  // mentira que esta correção elimina. O aluno vê o que de fato houve: uma falha
  // de carregamento, com a opção de tentar de novo.
  if (counts === null) {
    return (
      <div className="space-y-6">
        <section
          aria-label="Erro ao carregar as revisões"
          className="rounded-lg border border-border bg-card p-6"
        >
          <EmptyState
            title="Não foi possível carregar suas revisões"
            description="A consulta ao servidor falhou, então não temos como dizer quantas revisões você tem. Nada foi perdido: tente novamente em instantes."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={isPending} onClick={() => void refresh()}>
                  <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Tentar novamente
                </Button>
                {/* A sessão é aberta pelo servidor e não depende das contagens:
                    não desabilitamos por falta de um dado que não conseguimos ler. */}
                <Button
                  size="sm"
                  onClick={() => {
                    setSessionItemId(null)
                    setSessionOpen(true)
                  }}
                >
                  <Play aria-hidden className="mr-1.5 h-3.5 w-3.5" fill="currentColor" />
                  {overview.hasActiveSession ? "Continuar revisão" : "Iniciar revisão"}
                </Button>
              </div>
            }
          />
        </section>

        <ReviewSessionModal
          open={sessionOpen}
          itemId={sessionItemId}
          onOpenChange={(open) => {
            setSessionOpen(open)
            if (!open) void refresh()
          }}
        />
      </div>
    )
  }

  const dueTotal = counts.overdue + counts.today + counts.newItems

  return (
    <div className="space-y-6">
      {/* Resumo: só números medidos. Sem revisões respondidas, a retenção é "—". */}
      <section
        aria-label="Resumo das revisões"
        className="rounded-lg border border-border bg-card"
      >
        <div className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
          <div className="p-4">
            <Metric label="Para revisar agora" value={dueTotal} hint={`${counts.overdue} atrasadas`} />
          </div>
          <div className="p-4">
            <Metric label="Novas" value={counts.newItems} hint="nunca revisadas" />
          </div>
          <div className="p-4">
            <Metric label="Próximas" value={counts.upcoming} hint="já agendadas" />
          </div>
          <div className="p-4">
            <Metric
              label="Retenção"
              value={retention.rate === null ? "—" : `${Math.round(retention.rate * 100)}%`}
              hint={
                retention.answered === 0
                  ? "sem respostas ainda"
                  : `${retention.answered} ${retention.answered === 1 ? "resposta" : "respostas"} (12 meses)`
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <p className="text-[13px] text-muted-foreground">
            {queueSummary(dueTotal, nextDueAt)}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              Adicionar tópico
            </Button>
            <Button
              size="sm"
              disabled={dueTotal === 0 || isPending}
              onClick={() => {
                setSessionItemId(null)
                setSessionOpen(true)
              }}
            >
              <Play aria-hidden className="mr-1.5 h-3.5 w-3.5" fill="currentColor" />
              {overview.hasActiveSession ? "Continuar revisão" : "Iniciar revisão"}
            </Button>
          </div>
        </div>
      </section>

      {/* Fila: atrasadas → de hoje → novas (ordem do servidor). */}
      <section aria-label="Fila de revisão" className="space-y-3">
        <SectionHeader
          as="h2"
          title="Para revisar agora"
          description="Atrasadas primeiro, depois as de hoje e as novas"
        />
        <div className="rounded-lg border border-border bg-card">
          {due.length === 0 ? (
            <EmptyState
              title="Nenhuma revisão para agora"
              description={
                counts.upcoming > 0
                  ? "Os itens agendados aparecem em “Próximas”."
                  : "Adicione um tópico ou subtópico do seu edital para começar a revisar."
              }
              action={
                counts.upcoming === 0 ? (
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                    Adicionar tópico
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {due.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Suspender ${reviewItemLabel(item)}`}
                      onClick={() => void flag(item.id, "SUSPEND", "Item suspenso.")}
                    >
                      <PauseCircle aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section aria-label="Próximas revisões" className="space-y-3">
          <SectionHeader as="h2" title="Próximas" description="Datas calculadas pelas suas respostas" />
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {upcoming.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Revisar ${reviewItemLabel(item)} agora`}
                      onClick={() => {
                        setSessionItemId(item.id)
                        setSessionOpen(true)
                      }}
                    >
                      Revisar agora
                    </Button>
                  }
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {suspended.length > 0 && (
        <section aria-label="Revisões suspensas" className="space-y-3">
          <SectionHeader as="h2" title="Suspensas" description="Fora da fila, com o progresso preservado" />
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {suspended.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Reativar ${reviewItemLabel(item)}`}
                        onClick={() => void flag(item.id, "UNSUSPEND", "Item reativado.")}
                      >
                        <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                        Reativar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Arquivar ${reviewItemLabel(item)}`}
                        onClick={() => void flag(item.id, "ARCHIVE", "Item arquivado.")}
                      >
                        <Archive aria-hidden className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  }
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section aria-label="Revisões arquivadas" className="space-y-3">
          <SectionHeader
            as="h2"
            title="Arquivadas"
            description="Fora das revisões; o histórico de respostas continua guardado"
          />
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {archived.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Restaurar ${reviewItemLabel(item)}`}
                      onClick={() => void flag(item.id, "RESTORE", "Item restaurado.")}
                    >
                      <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  }
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {counts.archived > archived.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {archived.length} de {counts.archived} itens arquivados.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        <Badge variant="outline">Como funciona</Badge>{" "}
        Cada resposta recalcula a data da próxima revisão pelo algoritmo FSRS, a partir do seu
        histórico. Nada é agendado automaticamente a partir das sessões de estudo: você escolhe o que
        entra na revisão.
      </p>

      <ReviewSessionModal
        open={sessionOpen}
        itemId={sessionItemId}
        onOpenChange={(open) => {
          setSessionOpen(open)
          if (!open) void refresh()
        }}
      />
      <AddToReviewModal
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) void refresh()
        }}
      />
    </div>
  )
}
