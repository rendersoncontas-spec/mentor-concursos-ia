"use client"

import { Fragment, useState } from "react"

import { ArrowLeft, ChevronDown, GraduationCap, MessageSquare, Plus } from "lucide-react"
import { toast } from "sonner"

import { type DisciplineDetailStats } from "@/application/disciplines/discipline-actions"
import { Button } from "@/components/ui/button"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"

export interface TopicItem {
  id: number
  title: string
  correct: number
  wrong: number
  notebook: number
  accuracy: number
  date: string
  questions: number
}

export interface DisciplineDetailProps {
  disciplineName: string
  topicsTotal?: number
  topics?: TopicItem[]
  catalogTopics?: CatalogTopicWithSubTopics[]
  stats?: DisciplineDetailStats | null
  targetName?: string
  onBack: () => void
}

export function DisciplineDetailView({
  disciplineName,
  topicsTotal: _topicsTotal = 0,
  topics = [],
  catalogTopics = [],
  stats,
  targetName,
  onBack,
}: DisciplineDetailProps) {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [checkedTopics, setCheckedTopics] = useState<Record<string, boolean>>({})

  const hasHistory = topics.length > 0
  const topicList = topics

  const statsMinutes = stats?.minutes ?? null
  const statsAnswered = stats?.questionsAnswered ?? 0
  const statsCorrect = stats?.correct ?? 0
  const statsPages = stats?.pagesRead ?? null
  const statsWrong = statsAnswered - statsCorrect
  const accuracyPct = statsAnswered > 0 ? Math.round((statsCorrect / statsAnswered) * 100) : null

  const toggleTopic = (id: string) => {
    setCheckedTopics((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const isTopicDone = (topic: CatalogTopicWithSubTopics): boolean => {
    if (checkedTopics[topic.id]) return true
    const subs = topic.subtopics ?? []
    return subs.length > 0 && subs.every((s) => checkedTopics[s.id])
  }

  const hasCatalog = catalogTopics.length > 0
  const totalTopics = hasCatalog ? catalogTopics.length : _topicsTotal
  const doneTopics = hasCatalog ? catalogTopics.filter(isTopicDone).length : 0
  const progressPercent = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-[#fef08a] rounded-full" />
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{disciplineName}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <Button
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex-1 sm:flex-initial bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm px-3.5 sm:px-4 h-9 sm:h-10 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer whitespace-nowrap min-w-0"
          >
            <Plus className="w-4 h-4 mr-1.5 shrink-0 stroke-[2.5]" />
            Adicionar Estudo
          </Button>

          {targetName && (
            <Button
              variant="outline"
              className="flex-1 sm:flex-initial bg-card/90 hover:bg-accent/70 dark:bg-card/70 border border-border/80 text-foreground font-semibold text-xs sm:text-[13px] gap-2 rounded-xl h-9 sm:h-10 px-3 shadow-xs"
            >
              <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <GraduationCap className="h-3.5 w-3.5 shrink-0" />
              </div>
              <span className="truncate max-w-[160px] sm:max-w-[220px]">{targetName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
            </Button>
          )}
        </div>
      </div>

      {/* Resumo da disciplina: uma única superfície com hierarquia (não 4 cards repetidos) */}
      <div className="rounded-xl border bg-card grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-border">
        <div className="p-5 space-y-1">
          <span className="type-label">
            Tempo de estudo
          </span>
          <p className="text-2xl font-semibold text-primary tabular-nums">
            {formatMinutesLabel(statsMinutes)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <span className="type-label">
            Desempenho
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {accuracyPct === null ? "–" : `${accuracyPct}%`}
            </p>
            <span className="text-[11px] font-semibold">
              <span className="text-emerald-600">{stats ? `${statsCorrect} acertos` : "–"}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="text-rose-500">{stats ? `${statsWrong} erros` : "–"}</span>
            </span>
          </div>
        </div>

        <div className="p-5 space-y-1">
          <span className="type-label">
            Progresso no edital
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-2xl font-semibold text-foreground tabular-nums">{progressPercent}%</p>
            <span className="text-[11px] font-semibold">
              <span className="text-emerald-600">{doneTopics} concluídos</span>
              <span className="text-muted-foreground"> · </span>
              <span className="text-rose-500">{totalTopics - doneTopics} pendentes</span>
            </span>
          </div>
        </div>

        <div className="p-5 space-y-1">
          <span className="type-label">
            Páginas lidas
          </span>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {statsPages === null ? "–" : statsPages}
          </p>
          <p className="text-[11px] text-muted-foreground font-semibold">
            {statsPages === null || statsMinutes === null || statsMinutes <= 0
              ? ""
              : `${((statsPages / statsMinutes) * 60).toFixed(1)} páginas por hora`}
          </p>
        </div>
      </div>

      {/* Card Central: HISTÓRICO DE REGISTROS (Estado Vazio ou Populado - Fotos 2 e 5) */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <span className="text-[13px] font-semibold text-foreground block border-b pb-3">
          HISTÓRICO DE REGISTROS
        </span>

        {!hasHistory ? (
          /* Estado Vazio (Sua Foto 2) */
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <div className="w-20 h-24 bg-muted/60 border border-muted rounded-lg transform -rotate-6 flex flex-col p-2 space-y-1">
                <div className="w-8 h-2 bg-primary rounded-xs mx-auto mb-1" />
                <div className="w-full h-1.5 bg-muted-foreground/30 rounded-xs" />
                <div className="w-3/4 h-1.5 bg-muted-foreground/30 rounded-xs" />
              </div>

              <div className="w-20 h-24 bg-card border border-primary rounded-lg shadow-xs absolute transform rotate-3 flex flex-col p-2 space-y-1">
                <div className="w-8 h-2 bg-primary rounded-xs mx-auto mb-1" />
                <div className="w-full h-1.5 bg-primary/40 rounded-xs" />
                <div className="w-4/5 h-1.5 bg-primary/40 rounded-xs" />
                <div className="w-2/3 h-1.5 bg-primary/40 rounded-xs" />
              </div>
            </div>

            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-semibold text-foreground">
                Você ainda não fez nenhum registro de estudo nesta disciplina
              </h3>
              <p className="text-xs text-muted-foreground font-medium">Vamos registrar?</p>
            </div>

            <Button
              onClick={() => setIsRegisterModalOpen(true)}
            >
              Adicionar Estudo
            </Button>
          </div>
        ) : (
          /* Estado Populado com Tabela de Registros (Sua Foto 5) */
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-left">
              <thead>
                <tr className="type-label border-b">
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Categoria</th>
                  <th className="px-2 py-2 text-center">Tempo</th>
                  <th className="px-2 py-2 text-center" title="Acertos">Acertos</th>
                  <th className="px-2 py-2 text-center" title="Erros">Erros</th>
                  <th className="px-2 py-2 text-center">%</th>
                  <th className="px-2 py-2 text-center">Material</th>
                  <th className="px-2 py-2">Tópico</th>
                  <th className="px-2 py-2 text-center">Páginas</th>
                  <th className="px-2 py-2 text-center">Vídeos</th>
                  <th className="px-2 py-2 text-center">Comentário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-semibold">
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">06/08/26</td>
                  <td className="px-2 py-2">
                    <span className="px-3 py-0.5 rounded bg-[#f87171] text-white font-semibold text-[11px]">
                      REVISÃO
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums font-semibold">10:00:00</td>
                  <td className="px-2 py-2 text-center tabular-nums text-emerald-600">0</td>
                  <td className="px-2 py-2 text-center tabular-nums text-rose-500">0</td>
                  <td className="px-2 py-2 text-center tabular-nums">0</td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">-</td>
                  <td className="px-2 py-2 text-foreground font-semibold max-w-[200px] truncate">
                    1. Teoria da administração e das organizações.
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">-</td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">-</td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      className="text-muted-foreground/60 hover:text-foreground"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Seção Inferior: EDITAL VERTICALIZADO da Disciplina */}
      <div className="rounded-xl border bg-card overflow-hidden space-y-4 p-6">
        <span className="text-[13px] font-semibold text-foreground block border-b pb-3">
          EDITAL VERTICALIZADO
        </span>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="type-label border-b">
                <th className="py-2.5 px-3 w-10 text-center" />
                <th className="py-2.5 px-3">Tópicos</th>
                <th className="py-2.5 px-3 text-center" title="Acertos">Acertos</th>
                <th className="py-2.5 px-3 text-center" title="Erros">Erros</th>
                <th className="py-2.5 px-3 text-center" title="Total de questões">Questões</th>
                <th className="py-2.5 px-3 text-center">%</th>
                <th className="py-2.5 px-3 text-center">Data</th>
                <th className="py-2.5 px-3 text-center">Sessões</th>
                <th className="py-2.5 px-3 text-center">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-semibold">
              {hasCatalog
                ? catalogTopics.map((topic, idx) => {
                    const isDone = isTopicDone(topic)
                    const subs = topic.subtopics ?? []
                    const subsDone = subs.filter((s) => checkedTopics[s.id]).length
                    const subsPercent =
                      subs.length > 0 ? Math.round((subsDone / subs.length) * 100) : null
                    return (
                      <Fragment key={topic.id}>
                        <tr
                          className={`hover:bg-muted/20 transition-colors ${
                            idx % 2 === 1 ? "bg-muted/10" : "bg-card"
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => toggleTopic(topic.id)}
                              className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                            />
                          </td>
                          <td
                            className={`font-semibold py-2.5 px-3 ${isDone ? "text-emerald-700" : "text-foreground"}`}
                          >
                            {topic.name}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums text-emerald-600">
                            {subsDone}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums text-rose-500">
                            {subs.length - subsDone}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums">
                            {subsPercent === null ? "-" : `${subsPercent}%`}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => toast.info("Adicionar link de caderno")}
                              className="text-primary font-semibold hover:underline"
                            >
                              Adicionar
                            </button>
                          </td>
                        </tr>
                        {subs.map((sub) => {
                          const subDone = !!checkedTopics[sub.id]
                          return (
                            <tr
                              key={sub.id}
                              className={`hover:bg-muted/20 transition-colors ${
                                idx % 2 === 1 ? "bg-muted/10" : "bg-card"
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={subDone}
                                  onChange={() => toggleTopic(sub.id)}
                                  className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                                />
                              </td>
                              <td
                                className={`py-2.5 px-3 pl-9 text-muted-foreground ${subDone ? "text-emerald-700" : ""}`}
                              >
                                <span className="mr-1.5 text-muted-foreground/50">└</span>
                                {sub.name}
                              </td>
                              <td className="py-2.5 px-3 text-center" />
                              <td className="py-2.5 px-3 text-center" />
                              <td className="py-2.5 px-3 text-center" />
                              <td className="py-2.5 px-3 text-center" />
                              <td className="py-2.5 px-3 text-center" />
                              <td className="py-2.5 px-3 text-center" />
                              <td className="py-2.5 px-3" />
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })
                : topicList.map((topic, idx) => {
                    const isDone = !!checkedTopics[topic.id]
                    return (
                      <tr
                        key={topic.id}
                        className={`hover:bg-muted/20 transition-colors ${
                          idx % 2 === 1 ? "bg-muted/10" : "bg-card"
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => toggleTopic(String(topic.id))}
                            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>
                        <td
                          className={`font-semibold py-2.5 px-3 ${isDone ? "text-emerald-700" : "text-foreground"}`}
                        >
                          {topic.title}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-emerald-600">
                          {topic.correct}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-rose-500">
                          {topic.wrong}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                          {topic.notebook}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums">{topic.accuracy}</td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                          {topic.date}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                          {topic.questions}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toast.info("Adicionar link de caderno")}
                            className="text-primary font-semibold hover:underline"
                          >
                            Adicionar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrar Estudo */}
      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />
    </div>
  )
}

function formatMinutesLabel(minutes: number | null): string {
  if (minutes === null) return "–"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}min` : `${m}min`
}
