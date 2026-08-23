"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getDayDetailAction, type DayDetail } from "@/application/study-history/study-history.actions"

function formatHM(mins: number): string {
  if (mins <= 0) return "0min"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m}min`
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string
}

export function DayDetailModal({ open, onOpenChange, date }: Props) {
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !date) return
    setLoading(true)
    setDetail(null)
    getDayDetailAction(date).then((res) => {
      setDetail(res.data)
      setLoading(false)
    })
  }, [open, date])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-base font-semibold text-foreground capitalize">
            {formatDateBR(date)}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Carregando detalhes...
          </div>
        ) : !detail || detail.totalMinutes === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum estudo registrado neste dia.
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Resumo geral */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Tempo total" value={formatHM(detail.totalMinutes)} />
              <StatCard label="Sessões" value={String(detail.sessionCount)} />
              <StatCard label="Questões" value={String(detail.questionsAnswered)} />
              <StatCard
                label="Acerto"
                value={detail.accuracy !== null ? `${detail.accuracy}%` : "—"}
              />
            </div>

            {detail.questionsAnswered > 0 && (
              <div className="flex gap-4 text-xs text-muted-foreground px-1">
                <span>
                  Acertou: <strong className="text-foreground">{detail.questionsCorrect}</strong>
                </span>
                <span>
                  Errou:{" "}
                  <strong className="text-foreground">
                    {detail.questionsAnswered - detail.questionsCorrect}
                  </strong>
                </span>
              </div>
            )}

            {/* Disciplinas */}
            {detail.disciplines.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Matérias Estudadas
                </h4>
                <div className="space-y-1.5">
                  {detail.disciplines.map((d) => (
                    <div
                      key={d.disciplineId}
                      className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm font-medium text-foreground truncate mr-2">
                        {d.disciplineName}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatHM(d.minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
