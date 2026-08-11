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
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { toast } from "sonner"
import { getUserHistoryAction, deleteStudySessionAction } from "@/application/study-history/study-history.actions"

export function EstudeiHistoryView() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<any>(null)

  const loadHistory = async () => {
    setLoading(true)
    const { data, error } = await getUserHistoryAction(50)
    if (error) {
      toast.error("Erro ao carregar histórico: " + error)
    } else if (data) {
      setSessions(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const handleEditSession = (session: any) => {
    setEditingSession(session)
    setIsRegisterOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setIsRegisterOpen(open)
    if (!open) {
      setEditingSession(null)
      loadHistory()
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const confirmed = window.confirm("Excluir esta sessão de estudo?\nEsta ação não pode ser desfeita.")
    if (!confirmed) return

    try {
      const { error } = await deleteStudySessionAction(sessionId)
      if (error) {
        toast.error("Erro ao excluir: " + error)
      } else {
        toast.success("Sessão excluída com sucesso")
        setSessions(prev => prev.filter(s => s.id !== sessionId))
      }
    } catch (err) {
      toast.error("Erro inesperado ao excluir")
    }
  }

  // Cálculo de KPIs
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  // Como study_history não grava correctCount nativamente, estamos zerando temporariamente no mockup dinâmico
  const totalCorrect = 0
  const totalWrong = 0
  const totalQuestions = totalCorrect + totalWrong
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0

  const formatHoursMinutes = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h${m < 10 ? "0" : ""}${m}min`
  }
  
  const formatTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h < 10 ? "0" + h : h}:${m < 10 ? "0" + m : m}:00`
  }

  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
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
            Cargo Alvo
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>

          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Top Metric Cards Row */}
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
              <span className="text-emerald-600 block">0 Tópicos Concluídos</span>
              <span className="text-rose-500 block">0 Tópicos Pendentes</span>
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

      {/* Seção de Registros */}
      <div className="space-y-4 pt-2">
        {loading ? (
          <div className="flex items-center justify-center p-12">
             <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 border rounded-xl bg-card/50">
            <HistoryIcon className="h-10 w-10 text-muted-foreground/30" />
            <h3 className="text-base font-extrabold text-foreground">Você ainda não realizou nenhum estudo</h3>
            <p className="text-xs text-muted-foreground">Inicie uma sessão de estudos ou cadastre manualmente para visualizar aqui.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">REGISTROS RECENTES</span>
              <div className="flex-1 h-0.5 bg-[#2563EB]/30" />
            </div>

            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border bg-card p-4 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 hover:border-[#2563EB]/60 transition-all"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-1.5 h-10 rounded-full bg-[#38bdf8] shrink-0 mt-0.5" />
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="font-extrabold text-xs text-foreground tracking-tight">
                        {session.disciplines?.name || "Estudo Livre"}
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                        Data: {new Date(session.started_at).toLocaleDateString()}
                      </p>
                      {session.study_type && (
                        <p className="text-[11px] font-bold text-primary">
                          Tipo: {session.study_type}
                        </p>
                      )}
                      {session.metadata?.flashcards_reviewed > 0 && (
                        <p className="text-[11px] text-emerald-600 font-semibold">
                          Flashcards: {session.metadata.flashcards_reviewed} revisados ({session.metadata.flashcards_correct || 0} acertos)
                        </p>
                      )}
                      {session.metadata?.questions_answered > 0 && (
                        <p className="text-[11px] text-blue-600 font-semibold">
                          Questões: {session.metadata.questions_correct || 0}/{session.metadata.questions_answered} acertos
                        </p>
                      )}
                      {session.created_at && (
                        <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                          Salvo às: {new Date(session.created_at).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end lg:self-center shrink-0">
                    <span className="text-xs font-mono text-muted-foreground font-bold flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatTime(session.duration_minutes || 0)}
                    </span>

                    <span className="px-4 py-1 rounded-md bg-[#2563EB] text-white font-extrabold text-[10px] tracking-wider uppercase shadow-xs">
                      FOCO {session.metadata?.focus_percentage || "0"}%
                    </span>

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
                        onClick={() => handleEditSession(session)}
                        className="hover:text-foreground p-1 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session.id)}
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
        )}
      </div>

      <StudyRegisterModal
        open={isRegisterOpen}
        onOpenChange={handleModalClose}
        sessionToEdit={editingSession}
        mode={editingSession ? "edit" : "create"}
      />
    </div>
  )
}

