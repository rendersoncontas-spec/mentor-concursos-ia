"use client"

import { useState } from "react"
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  Plus,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  BookOpen,
  MessageSquare,
  GraduationCap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
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
  onBack: () => void
}

export function EstudeiDisciplineDetailView({
  disciplineName,
  topicsTotal = 0,
  topics = [],
  onBack,
}: DisciplineDetailProps) {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [checkedTopics, setCheckedTopics] = useState<Record<number, boolean>>({})

  const hasHistory = topics.length > 0
  const topicList = topics

  const toggleTopic = (id: number) => {
    setCheckedTopics((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const completedCount = Object.values(checkedTopics).filter(Boolean).length
  const progressPercentage = topicList.length > 0 ? Math.round((completedCount / topicList.length) * 100) : 0

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Actions — 100% Estudei Foto 2 e 5 */}
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
            <h1 className="text-2xl font-black text-foreground tracking-tight">{disciplineName}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setIsRegisterModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
          >
            Adicionar Estudo
          </Button>

          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2">
            <GraduationCap className="h-4 w-4" />
            Analista Tributário
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Row de 4 Cards Métricos (Fotos 2, 4 e 5 100% Estudei) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TEMPO DE ESTUDO */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            TEMPO DE ESTUDO
          </span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">
              {hasHistory ? "10h00min" : "0h00min"}
            </span>
          </div>
        </div>

        {/* Card 2: DESEMPENHO */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            DESEMPENHO
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">0 Acertos</span>
              <span className="text-rose-500 block">0 Erros</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">0%</span>
          </div>
        </div>

        {/* Card 3: PROGRESSO NO EDITAL */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            PROGRESSO NO EDITAL
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">1 Tópicos Concluídos</span>
              <span className="text-rose-500 block">33 Tópicos Pendentes</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">3%</span>
          </div>
        </div>

        {/* Card 4: PÁGINAS LIDAS */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            PÁGINAS LIDAS
          </span>
          <div className="flex items-end justify-between">
            <span className="text-[11px] text-muted-foreground font-semibold">0.0 páginas por hora</span>
            <span className="text-2xl font-black text-foreground font-mono">0</span>
          </div>
        </div>
      </div>

      {/* Card Central: HISTÓRICO DE REGISTROS (Estado Vazio ou Populado - Fotos 2 e 5) */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block border-b pb-3">
          HISTÓRICO DE REGISTROS
        </span>

        {!hasHistory ? (
          /* Estado Vazio (Sua Foto 2) */
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <div className="w-20 h-24 bg-muted/60 border-2 border-muted rounded-lg transform -rotate-6 flex flex-col p-2 space-y-1">
                <div className="w-8 h-2 bg-[#2563EB] rounded-xs mx-auto mb-1" />
                <div className="w-full h-1.5 bg-muted-foreground/30 rounded-xs" />
                <div className="w-3/4 h-1.5 bg-muted-foreground/30 rounded-xs" />
              </div>

              <div className="w-20 h-24 bg-card border-2 border-[#2563EB] rounded-lg shadow-md absolute transform rotate-3 flex flex-col p-2 space-y-1">
                <div className="w-8 h-2 bg-[#2563EB] rounded-xs mx-auto mb-1" />
                <div className="w-full h-1.5 bg-[#2563EB]/40 rounded-xs" />
                <div className="w-4/5 h-1.5 bg-[#2563EB]/40 rounded-xs" />
                <div className="w-2/3 h-1.5 bg-[#2563EB]/40 rounded-xs" />
              </div>
            </div>

            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-extrabold text-foreground">
                Você ainda não fez nenhum registro de estudo nesta disciplina
              </h3>
              <p className="text-xs text-muted-foreground font-medium">Vamos registrar?</p>
            </div>

            <Button
              onClick={() => setIsRegisterModalOpen(true)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 shadow-xs"
            >
              Adicionar Estudo
            </Button>
          </div>
        ) : (
          /* Estado Populado com Tabela de Registros (Sua Foto 5) */
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground font-semibold">
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Categoria</th>
                  <th className="px-3 py-2.5 text-center">Tempo</th>
                  <th className="px-3 py-2.5 text-center text-emerald-600">✔</th>
                  <th className="px-3 py-2.5 text-center text-rose-500">✖</th>
                  <th className="px-3 py-2.5 text-center">%</th>
                  <th className="px-3 py-2.5 text-center">Material</th>
                  <th className="px-4 py-2.5">Tópico</th>
                  <th className="px-3 py-2.5 text-center">Páginas</th>
                  <th className="px-3 py-2.5 text-center">Vídeos</th>
                  <th className="px-3 py-2.5 text-center">Comentário</th>
                </tr>
              </thead>
              <tbody className="divide-y font-semibold">
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-muted-foreground">06/08/26</td>
                  <td className="px-4 py-3">
                    <span className="px-3 py-0.5 rounded bg-[#f87171] text-white font-extrabold text-[10px] tracking-wider uppercase">
                      REVISÃO
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center font-mono font-bold">10:00:00</td>
                  <td className="px-3 py-3 text-center font-mono text-emerald-600">0</td>
                  <td className="px-3 py-3 text-center font-mono text-rose-500">0</td>
                  <td className="px-3 py-3 text-center font-mono">0</td>
                  <td className="px-3 py-3 text-center font-mono text-muted-foreground">-</td>
                  <td className="px-4 py-3 text-foreground font-bold max-w-[200px] truncate">
                    1. Teoria da administração e das organizações.
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-muted-foreground">-</td>
                  <td className="px-3 py-3 text-center font-mono text-muted-foreground">-</td>
                  <td className="px-3 py-3 text-center">
                    <button type="button" className="text-muted-foreground/60 hover:text-foreground">
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Seção Inferior: EDITAL VERTICALIZADO da Disciplina (Fotos 3 e 5 100% Estudei) */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden space-y-4 p-6">
        <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block border-b pb-3">
          EDITAL VERTICALIZADO
        </span>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground font-extrabold text-[11px]">
                <th className="px-3 py-2.5 w-10 text-center"></th>
                <th className="px-4 py-2.5">Tópicos</th>
                <th className="px-3 py-2.5 text-center text-emerald-600">✔</th>
                <th className="px-3 py-2.5 text-center text-rose-500">✖</th>
                <th className="px-3 py-2.5 text-center">📝</th>
                <th className="px-3 py-2.5 text-center">%</th>
                <th className="px-3 py-2.5 text-center">📅</th>
                <th className="px-3 py-2.5 text-center">📱</th>
                <th className="px-4 py-2.5 text-center">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y font-semibold">
              {topicList.map((topic, idx) => {
                const isDone = !!checkedTopics[topic.id]
                return (
                  <tr
                    key={topic.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      idx % 2 === 1 ? "bg-muted/10" : "bg-card"
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleTopic(topic.id)}
                        className="w-4 h-4 rounded text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                      />
                    </td>
                    <td className={`px-4 py-3 font-bold ${isDone ? "text-emerald-700" : "text-foreground"}`}>
                      {topic.title}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-emerald-600">{topic.correct}</td>
                    <td className="px-3 py-3 text-center font-mono text-rose-500">{topic.wrong}</td>
                    <td className="px-3 py-3 text-center font-mono text-muted-foreground">{topic.notebook}</td>
                    <td className="px-3 py-3 text-center font-mono">{topic.accuracy}</td>
                    <td className="px-3 py-3 text-center font-mono text-muted-foreground">{topic.date}</td>
                    <td className="px-3 py-3 text-center font-mono text-muted-foreground">{topic.questions}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toast.info("Adicionar link de caderno")}
                        className="text-[#2563EB] font-bold hover:underline"
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
      <StudyRegisterModal
        open={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
      />
    </div>
  )
}

