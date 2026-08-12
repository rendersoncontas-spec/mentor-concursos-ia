"use client"

import { useState } from "react"
import {
  Check,
  X,
  Minus,
  Flag,
  BookOpenCheck,
  Lightbulb,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Trophy,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { SimuladoResultPayload, ScoreBand, TrendSummary } from "@/domain/simulados/types"
import {
  addQuestionToStudyListAction,
  createFlashcardFromQuestionAction,
  sendQuestionToReviewAction,
} from "@/application/simulados/simulados.actions"
import { formatTimer } from "@/application/simulados/simulado-engine"

const SCORE_META: Record<ScoreBand, { label: string; color: string; bg: string }> = {
  EXCELENTE: { label: "Excelente", color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/40" },
  BOM: { label: "Bom", color: "text-sky-600", bg: "bg-sky-500/10 border-sky-500/40" },
  REGULAR: { label: "Regular", color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/40" },
  BAIXO: { label: "Baixo", color: "text-rose-600", bg: "bg-rose-500/10 border-rose-500/40" },
}

interface Props {
  payload: SimuladoResultPayload
  onNewSimulado: () => void
  onSeeHistory: () => void
}

export function SimuladoResultView({ payload, onNewSimulado, onSeeHistory }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [busyQuestion, setBusyQuestion] = useState<string | null>(null)

  const { header, byDiscipline, byTopic, questions, timeStats, insights, trend } = payload
  const scoreMeta = header.score ? SCORE_META[header.score] : null

  const runIntegration = async (fn: (simuladoId: string, questionId: string) => Promise<{ error: string | null }>, simuladoId: string, questionId: string, successMsg: string) => {
    setBusyQuestion(questionId)
    const res = await fn(simuladoId, questionId)
    setBusyQuestion(null)
    if (res.error) toast.error(res.error)
    else toast.success(successMsg)
  }

  const answered = header.totalCorrect + header.totalWrong

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Resultado</p>
            <h2 className="text-xl font-black tracking-tight">{header.name}</h2>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px] font-semibold">{header.simuladoDate ?? ""}</Badge>
              {header.examName && <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">{header.examName}</Badge>}
              {scoreMeta && (
                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border", scoreMeta.bg, scoreMeta.color)}>
                  {scoreMeta.label}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className={cn("text-4xl font-black font-mono", accuracyColor(header.accuracy))}>
              {header.accuracy === null ? "—" : `${Math.round(header.accuracy)}%`}
            </span>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">de acertos</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatCard icon={<Check className="h-4 w-4 text-emerald-600" />} label="Acertos" value={header.totalCorrect} />
          <StatCard icon={<X className="h-4 w-4 text-rose-600" />} label="Erros" value={header.totalWrong} />
          <StatCard icon={<Minus className="h-4 w-4 text-sky-600" />} label="Brancos" value={header.totalBlank} />
          <StatCard icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Tempo" value={header.timeSpentSeconds === null ? "—" : formatTimer(header.timeSpentSeconds)} />
        </div>

        {/* Progress + insights + trends */}
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>Desempenho</span>
              <span>{answered > 0 ? `${Math.round((header.totalCorrect / Math.max(1, answered)) * 100)}% de respostas corretas` : "Nenhuma resposta"}</span>
            </div>
            <Progress value={answered > 0 ? (header.totalCorrect / Math.max(1, answered)) * 100 : 0} className="h-2" />
          </div>

          <div className="flex flex-wrap gap-2">
            <TrendBadge value={trend.accuracy} label="acertos" />
            <TrendBadge value={trend.correct} label="questões" />
            <TrendBadge value={timeTrendValue(trend.time)} label="tempo" />
          </div>

          {insights.length > 0 && (
            <div className="space-y-1.5">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-semibold flex items-center gap-2",
                    insight.severity === "positive" && "bg-emerald-500/5 border-emerald-500/30 text-emerald-600",
                    insight.severity === "warning" && "bg-amber-500/5 border-amber-500/30 text-amber-600",
                    insight.severity === "info" && "bg-muted/40 border-border text-muted-foreground"
                  )}
                >
                  <Lightbulb className="h-4 w-4 shrink-0" />
                  {insight.message}
                </div>
              ))}
            </div>
          )}

          {payload.previousAvgAccuracy !== null && (
            <p className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Média dos seus últimos simulados: {Math.round(payload.previousAvgAccuracy)}%
            </p>
          )}

          {payload.bests.bestAccuracy && (
            <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Melhor resultado: {Math.round(payload.bests.bestAccuracy.value)}% — {payload.bests.bestAccuracy.name}
            </p>
          )}
        </div>
      </div>

      {/* Por disciplina */}
      {byDiscipline.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Por disciplina
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {byDiscipline.map((d) => (
              <div key={d.disciplineId ?? d.disciplineName} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold truncate">{d.disciplineName}</span>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                    {d.correct}/{d.questions} {d.accuracy !== null ? `· ${Math.round(d.accuracy)}%` : ""}
                  </Badge>
                </div>
                <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                  <span className="bg-emerald-500" style={{ width: `${(d.correct / Math.max(1, d.questions)) * 100}%` }} />
                  <span className="bg-rose-500" style={{ width: `${(d.wrong / Math.max(1, d.questions)) * 100}%` }} />
                  <span className="bg-sky-400" style={{ width: `${(d.blank / Math.max(1, d.questions)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Por tópico */}
      {byTopic.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4" /> Por tópico
          </h3>
          <div className="space-y-1.5">
            {byTopic.map((t, i) => (
              <div key={`${t.topicId ?? "null"}-${i}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-muted/30">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{t.topicName ?? "Sem tópico"}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">{t.disciplineName} · {t.questions} questões</p>
                </div>
                <Badge variant={t.accuracy !== null && t.accuracy >= 70 ? "secondary" : "outline"} className="text-[10px] font-mono shrink-0">
                  {t.accuracy !== null ? `${Math.round(t.accuracy)}%` : "—"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Revisão de questões */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Gabarito comentado
          </h3>
          <Badge variant="outline" className="text-[10px] font-mono">{questions.length} questões</Badge>
        </div>

        <div className="space-y-2">
          {questions.map((q, index) => {
            const open = openIndex === index
            const correct = q.isCorrect === true
            const wrong = q.isCorrect === false
            return (
              <div key={q.questionId} className="rounded-xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
                >
                  <span
                    className={cn(
                      "shrink-0 h-7 w-7 rounded-lg flex items-center justify-center font-black text-xs",
                      correct && "bg-emerald-500/15 text-emerald-600",
                      wrong && "bg-rose-500/15 text-rose-600",
                      !q.answered && "bg-sky-500/10 text-sky-600"
                    )}
                  >
                    {correct && <Check className="h-4 w-4" />}
                    {wrong && <X className="h-4 w-4" />}
                    {!q.answered && <Minus className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold truncate">{q.statement}</span>
                    <span className="block text-[10px] text-muted-foreground font-semibold">
                      {q.disciplineName}{q.topicName ? ` · ${q.topicName}` : ""} · {q.orderIndex + 1}ª
                    </span>
                  </span>
                  {q.isMarked && <Flag className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">ver detalhes</span>
                </button>

                {open && (
                  <div className="border-t p-4 space-y-4 bg-muted/10">
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{q.statement}</p>

                    {!q.isCertoErrado && (
                      <div className="space-y-1.5">
                        {(q.alternatives ?? []).map((alt, i) => {
                          const isCorrectAlt = alt.label === q.correctAnswer
                          const isSelected = alt.label === q.selectedAnswer
                          return (
                            <div
                              key={alt.label}
                              className={cn(
                                "rounded-lg border px-3 py-2 text-xs font-medium flex items-start gap-2.5",
                                isCorrectAlt && "border-emerald-500/50 bg-emerald-500/5 text-emerald-700",
                                isSelected && !isCorrectAlt && "border-rose-500/50 bg-rose-500/5 text-rose-700"
                              )}
                            >
                              <span className="shrink-0 font-black">{String.fromCharCode(65 + i)}.</span>
                              <span>{alt.text}</span>
                              {isCorrectAlt && <Check className="h-3.5 w-3.5 ml-auto shrink-0 mt-0.5" />}
                              {isSelected && !isCorrectAlt && <X className="h-3.5 w-3.5 ml-auto shrink-0 mt-0.5" />}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="text-xs space-y-1 font-semibold">
                      <p>
                        Gabarito: <span className="font-black text-emerald-600">{q.correctAnswer}</span>
                        {q.selectedAnswer && (
                          <>
                            {" · "}Sua resposta:{" "}
                            <span className={cn("font-black", correct ? "text-emerald-600" : "text-rose-600")}>{q.selectedAnswer}</span>
                          </>
                        )}
                      </p>
                      {q.responseTimeSeconds !== null && (
                        <p className="text-muted-foreground text-[11px]">Tempo de resposta: {q.responseTimeSeconds}s</p>
                      )}
                    </div>

                    {q.explanation && (
                      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs font-medium leading-relaxed">
                        <span className="block text-[10px] font-black uppercase tracking-wider text-sky-600 mb-1">Explicação</span>
                        {q.explanation}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-[11px] font-bold"
                        disabled={busyQuestion === q.questionId}
                        onClick={() =>
                          runIntegration(sendQuestionToReviewAction, header.id, q.questionId, "Enviada para revisão!")
                        }
                      >
                        <BookOpenCheck className="h-3.5 w-3.5" /> Enviar para revisão
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-[11px] font-bold"
                        disabled={busyQuestion === q.questionId}
                        onClick={() =>
                          runIntegration(createFlashcardFromQuestionAction, header.id, q.questionId, "Flashcard criado!")
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Criar flashcard
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-[11px] font-bold"
                        disabled={busyQuestion === q.questionId}
                        onClick={() =>
                          runIntegration(addQuestionToStudyListAction, header.id, q.questionId, "Adicionada à lista de estudos!")
                        }
                      >
                        <ListChecks className="h-3.5 w-3.5" /> Adicionar aos estudos
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Time stats */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" /> Tempo
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-lg font-black font-mono">{timeStats.totalSeconds > 0 ? formatTimer(timeStats.totalSeconds) : "—"}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Total</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-lg font-black font-mono">{timeStats.avgPerQuestionSeconds ?? "—"}s</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Por questão</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-lg font-black font-mono text-emerald-600">{timeStats.avgPerCorrectSeconds ?? "—"}s</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Por acerto</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-lg font-black font-mono text-rose-600">{timeStats.avgPerWrongSeconds ?? "—"}s</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Por erro</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-3 pb-6">
        <Button onClick={onNewSimulado} className="rounded-xl font-bold px-6 bg-[#2563EB] hover:bg-[#1D4ED8]">
          Novo Simulado
        </Button>
        <Button variant="outline" onClick={onSeeHistory} className="rounded-xl font-bold px-6">
          Ver histórico
        </Button>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3 flex items-center gap-3">
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-lg font-black font-mono leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{label}</p>
      </div>
    </div>
  )
}

function TrendBadge({ value, label }: { value: "UP" | "STABLE" | "DOWN" | null; label: string }) {
  if (!value) return null
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border",
        value === "UP" && "bg-emerald-500/10 border-emerald-500/40 text-emerald-600",
        value === "DOWN" && "bg-rose-500/10 border-rose-500/40 text-rose-600",
        value === "STABLE" && "bg-muted border-border text-muted-foreground"
      )}
    >
      {value === "UP" && <TrendingUp className="h-3 w-3" />}
      {value === "DOWN" && <TrendingDown className="h-3 w-3" />}
      {trendLabel(value)} · {label}
    </span>
  )
}

function trendLabel(value: "UP" | "STABLE" | "DOWN"): string {
  if (value === "UP") return "melhorando"
  if (value === "DOWN") return "caindo"
  return "estável"
}

function timeTrendValue(time: TrendSummary["time"]): "UP" | "STABLE" | "DOWN" | null {
  if (time === "FASTER") return "UP"
  if (time === "SLOWER") return "DOWN"
  if (time === "STABLE") return "STABLE"
  return null
}

function accuracyColor(accuracy: number | null): string {
  if (accuracy === null) return "text-muted-foreground"
  if (accuracy >= 70) return "text-emerald-600"
  if (accuracy >= 50) return "text-amber-600"
  return "text-rose-600"
}