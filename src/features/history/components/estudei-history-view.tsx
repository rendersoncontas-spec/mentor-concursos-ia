"use client"

import { useState, useEffect } from "react"
import {
  History as HistoryIcon,
  Plus,
  ChevronDown,
  Filter,
  Clock,
  MessageSquare,
  Edit2,
  Trash2,
  GraduationCap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { toast } from "sonner"

export interface HistorySessionItem {
  id: string
  dateGroup: "HOJE" | "ONTEM" | "ESTA SEMANA" | "ANTERIORES"
  disciplineName: string
  topicTitle: string
  durationFormatted: string // ex: "00:00:03" ou "00:45:00"
  durationMinutes: number
  correctCount: number
  wrongCount: number
  totalQuestions: number
  categoryTag: "REVISÃO" | "TEORIA" | "EXERCÍCIOS" | "LEITURA"
}

const DEFAULT_POPULATED_SESSIONS: HistorySessionItem[] = [
  {
    id: "h-1",
    dateGroup: "HOJE",
    disciplineName: "ADMINISTRAÇÃO PÚBLICA",
    topicTitle: "1. Administração Pública: do modelo racional-legal ao paradigma pós-burocrático; o Estado oligárquico e patrimonial...",
    durationFormatted: "00:00:03",
    durationMinutes: 1,
    correctCount: 0,
    wrongCount: 0,
    totalQuestions: 0,
    categoryTag: "REVISÃO",
  },
]

export function EstudeiHistoryView() {
  const [sessions, setSessions] = useState<HistorySessionItem[]>(DEFAULT_POPULATED_SESSIONS)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)

  // Carregar do localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mentor_study_history")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed)
        }
      } catch (e) {}
    }
  }, [])

  const handleRemoveSession = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id)
    setSessions(updated)
    localStorage.setItem("mentor_study_history", JSON.stringify(updated))
    toast.success("Registro de estudo removido.")
  }

  // Cálculo de KPIs
  const totalMinutes = sessions.reduce((acc, s) => acc + s.durationMinutes, 0)
  const totalCorrect = sessions.reduce((acc, s) => acc + s.correctCount, 0)
  const totalWrong = sessions.reduce((acc, s) => acc + s.wrongCount, 0)
  const totalQuestions = totalCorrect + totalWrong
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0

  const formatHoursMinutes = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h${m < 10 ? "0" : ""}${m}min`
  }

  return (
    <div className="space-y-6">
      {/* Top Header Actions — Paridade 100% com o Estudei */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-foreground">Histórico</h1>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <Button
            onClick={() => setIsRegisterOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
          >
            Adicionar Estudo
          </Button>

          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2">
            <GraduationCap className="h-4 w-4" />
            Analista Tributário
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>

          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Top Metric Cards Row — 4 Cards Paridade 100% Estudei */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TEMPO DE ESTUDO */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            TEMPO DE ESTUDO
          </span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">{formatHoursMinutes(totalMinutes)}</span>
          </div>
        </div>

        {/* Card 2: DESEMPENHO */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            DESEMPENHO
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">{totalCorrect} Acertos</span>
              <span className="text-rose-500 block">{totalWrong} Erros</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">{accuracy}%</span>
          </div>
        </div>

        {/* Card 3: PROGRESSO NO EDITAL */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            PROGRESSO NO EDITAL
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">1 Tópico Concluído</span>
              <span className="text-rose-500 block">274 Tópicos Pendentes</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">0%</span>
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

      {/* Seção de Registros de Estudo Agrupados por Data (Sua Foto 1 100% Estudei) */}
      <div className="space-y-4 pt-2">
        {/* Header da Seção HOJE com linha divisória verde-água */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">HOJE</span>
          <div className="flex-1 h-0.5 bg-[#2563EB]/30" />
          <span className="text-xs font-mono text-muted-foreground font-bold flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatHoursMinutes(totalMinutes)}
          </span>
        </div>

        {/* Lista de Registros */}
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-xl border bg-card p-4 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 hover:border-[#2563EB]/60 transition-all"
            >
              {/* Esquerda: Barra de Cor + Títulos */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-1.5 h-10 rounded-full bg-[#38bdf8] shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <h3 className="font-extrabold text-xs text-foreground tracking-tight">
                    {session.disciplineName}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                    {session.topicTitle}
                  </p>
                </div>
              </div>

              {/* Direita: Tempo, Questões, Badge de Categoria e Ícones de Ação (Screenshot 1) */}
              <div className="flex items-center gap-4 self-end lg:self-center shrink-0">
                {/* Tempo Formatado */}
                <span className="text-xs font-mono text-muted-foreground font-bold flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {session.durationFormatted}
                </span>

                {/* Questões: Acertos (Verde), Erros (Vermelho), Total (Cinza) */}
                <div className="flex items-center gap-3 text-xs font-bold font-mono">
                  <span className="text-emerald-600">{session.correctCount}</span>
                  <span className="text-rose-500">{session.wrongCount}</span>
                  <span className="text-muted-foreground">{session.totalQuestions}</span>
                </div>

                {/* Badge da Categoria (REVISÃO em vermelho/coral) */}
                <span className="px-4 py-1 rounded-md bg-[#f87171] text-white font-extrabold text-[10px] tracking-wider uppercase shadow-xs">
                  {session.categoryTag}
                </span>

                {/* Ícones de Ação: Comentário, Editar, Lixeira */}
                <div className="flex items-center gap-2 text-muted-foreground/50">
                  <button
                    type="button"
                    onClick={() => toast.info("Adicionar observação sobre o estudo")}
                    className="hover:text-foreground p-1 transition-colors"
                    title="Observação"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(true)}
                    className="hover:text-foreground p-1 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveSession(session.id)}
                    className="hover:text-rose-500 p-1 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Registrar Estudo Manual */}
      <StudyRegisterModal
        open={isRegisterOpen}
        onOpenChange={setIsRegisterOpen}
      />
    </div>
  )
}

