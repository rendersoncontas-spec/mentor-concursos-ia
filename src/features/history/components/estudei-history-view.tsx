"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  History as HistoryIcon,
  Clock,
  MessageSquare,
  Edit2,
  Trash2,
  GraduationCap,
  Loader2,
  Filter,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { toast } from "sonner"
import { getUserHistoryAction, deleteStudySessionAction } from "@/application/study-history/study-history.actions"

interface Filters {
  dateStart: string
  dateEnd: string
  disciplineId: string
  studyType: string
  technique: string
  timeRange: string
  focusRange: string
}

const EMPTY_FILTERS: Filters = {
  dateStart: "",
  dateEnd: "",
  disciplineId: "",
  studyType: "",
  technique: "",
  timeRange: "",
  focusRange: "",
}

const STUDY_TYPES = [
  { value: "TEORIA", label: "Teoria" },
  { value: "QUESTOES", label: "Questões" },
  { value: "VIDEOAULA", label: "Videoaula" },
  { value: "RESUMO", label: "Resumo" },
  { value: "REVISAO", label: "Revisão" },
  { value: "FLASHCARDS", label: "Flashcards" },
  { value: "OUTRO", label: "Outros" },
]

const TECHNIQUES = [
  { value: "LIVRE", label: "Livre" },
  { value: "POMODORO_25_5", label: "Pomodoro 25/5" },
  { value: "POMODORO_50_10", label: "Pomodoro 50/10" },
  { value: "FLOWTIME", label: "Flowtime" },
  { value: "DEEP_WORK", label: "Deep Work" },
  { value: "PERSONALIZADO", label: "Personalizado" },
]

function getStudyDate(session: any): string {
  return session.started_at ? String(session.started_at).split("T")[0] ?? "" : ""
}

// Formata a DATA DO ESTUDO de forma robusta, sem depender de concatenar strings
function formatStudyDate(value: any): string {
  if (value === null || value === undefined || value === "") return ""
  const str = String(value)
  // Se já é uma data pura YYYY-MM-DD, usar direto para evitar timezone shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-")
    return `${d}/${m}/${y}`
  }
  // Se é ISO string (YYYY-MM-DDTHH:mm:ss), extrair a parte da data (dia local do estudo)
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split("-")
    return `${d}/${m}/${y}`
  }
  // Se é timestamp numérico ou Date
  const date = new Date(value)
  if (!isNaN(date.getTime())) {
    const d = date.getDate()
    const m = date.getMonth() + 1
    const y = date.getFullYear()
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
  }
  return ""
}

// Formata o HORÁRIO DE SALVAMENTO de forma robusta (hora local)
function formatSavedAt(value: any): string {
  if (value === null || value === undefined || value === "") return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function formatHoursMinutes(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m < 10 ? "0" : ""}${m}min`
}

function formatTime(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h < 10 ? "0" + h : h}:${m < 10 ? "0" + m : m}:00`
}

function countActiveFilters(f: Filters): number {
  let count = 0
  if (f.dateStart) count++
  if (f.dateEnd) count++
  if (f.disciplineId) count++
  if (f.studyType) count++
  if (f.technique) count++
  if (f.timeRange) count++
  if (f.focusRange) count++
  return count
}

export function EstudeiHistoryView() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  const loadHistory = async () => {
    setLoading(true)
    const { data, error } = await getUserHistoryAction(200)
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

  // Close filter panel on outside click or ESC
  useEffect(() => {
    if (!showFilters) return
    const handleClick = (e: MouseEvent) => {
      if (
        filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node) &&
        filterButtonRef.current && !filterButtonRef.current.contains(e.target as Node)
      ) {
        setShowFilters(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFilters(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [showFilters])

  // Unique disciplines from sessions
  const disciplines = useMemo(() => {
    const map = new Map<string, string>()
    sessions.forEach(s => {
      const id = s.discipline_id
      const name = s.disciplines?.name || "Estudo Livre"
      if (id && !map.has(id)) map.set(id, name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sessions])

  // Unique study dates
  const studyDates = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => {
      const d = getStudyDate(s)
      if (d) set.add(d)
    })
    return Array.from(set).sort()
  }, [sessions])

  // Apply filters
  const filteredSessions = useMemo(() => {
    let result = [...sessions]

    if (filters.dateStart) {
      result = result.filter(s => getStudyDate(s) >= filters.dateStart)
    }
    if (filters.dateEnd) {
      result = result.filter(s => getStudyDate(s) <= filters.dateEnd)
    }
    if (filters.disciplineId) {
      result = result.filter(s => s.discipline_id === filters.disciplineId)
    }
    if (filters.studyType) {
      result = result.filter(s => s.study_type === filters.studyType)
    }
    if (filters.technique) {
      result = result.filter(s => s.technique === filters.technique)
    }
    if (filters.timeRange) {
      result = result.filter(s => {
        const mins = s.duration_minutes || 0
        switch (filters.timeRange) {
          case "0-30": return mins <= 30
          case "30-60": return mins > 30 && mins <= 60
          case "60-120": return mins > 60 && mins <= 120
          case "120+": return mins > 120
          default: return true
        }
      })
    }
    if (filters.focusRange) {
      result = result.filter(s => {
        const focus = s.metadata?.focus_percentage || 0
        switch (filters.focusRange) {
          case "0-49": return focus >= 0 && focus < 50
          case "50-69": return focus >= 50 && focus < 70
          case "70-89": return focus >= 70 && focus < 90
          case "90-100": return focus >= 90 && focus <= 100
          default: return true
        }
      })
    }

    return result
  }, [sessions, filters])

  // KPIs from filtered
  const totalMinutes = filteredSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  const totalCorrect = filteredSessions.reduce((acc, s) => acc + (s.metadata?.questions_correct || 0), 0)
  const totalAnswered = filteredSessions.reduce((acc, s) => acc + (s.metadata?.questions_answered || 0), 0)
  const totalWrong = totalAnswered - totalCorrect
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0
  const totalPages = filteredSessions.reduce((acc, s) => acc + (s.metadata?.pages_read || 0), 0)
  const activeFilterCount = countActiveFilters(filters)

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
    } catch {
      toast.error("Erro inesperado ao excluir")
    }
  }

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTERS)
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
          </Button>

          <div className="relative">
            <Button
              ref={filterButtonRef}
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2 ${activeFilterCount > 0 ? "bg-[#2563EB]/5" : ""}`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>

            {showFilters && (
              <div
                ref={filterPanelRef}
                className="absolute right-0 top-full mt-2 z-50 bg-card border rounded-xl shadow-lg p-4 w-[360px] space-y-4"
              >
                {/* Date Start */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Data Início</label>
                  <input
                    type="date"
                    value={filters.dateStart}
                    onChange={e => setFilters(f => ({ ...f, dateStart: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  />
                </div>

                {/* Date End */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Data Fim</label>
                  <input
                    type="date"
                    value={filters.dateEnd}
                    onChange={e => setFilters(f => ({ ...f, dateEnd: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  />
                </div>

                {/* Discipline */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Disciplina</label>
                  <select
                    value={filters.disciplineId}
                    onChange={e => setFilters(f => ({ ...f, disciplineId: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todas</option>
                    {disciplines.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Study Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Tipo de Estudo</label>
                  <select
                    value={filters.studyType}
                    onChange={e => setFilters(f => ({ ...f, studyType: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todos</option>
                    {STUDY_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Technique / Mode */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Modo</label>
                  <select
                    value={filters.technique}
                    onChange={e => setFilters(f => ({ ...f, technique: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todos</option>
                    {TECHNIQUES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Time Range */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Tempo Estudado</label>
                  <select
                    value={filters.timeRange}
                    onChange={e => setFilters(f => ({ ...f, timeRange: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todos</option>
                    <option value="0-30">Até 30 min</option>
                    <option value="30-60">30–60 min</option>
                    <option value="60-120">1–2 horas</option>
                    <option value="120+">Mais de 2 horas</option>
                  </select>
                </div>

                {/* Focus Range */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Foco</label>
                  <select
                    value={filters.focusRange}
                    onChange={e => setFilters(f => ({ ...f, focusRange: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todos</option>
                    <option value="0-49">0–49%</option>
                    <option value="50-69">50–69%</option>
                    <option value="70-89">70–89%</option>
                    <option value="90-100">90–100%</option>
                  </select>
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                    className="flex-1 text-xs font-bold"
                  >
                    Limpar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowFilters(false)}
                    className="flex-1 text-xs font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">TEMPO DE ESTUDO</span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">{formatHoursMinutes(totalMinutes)}</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">DESEMPENHO</span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">{totalCorrect} Acertos</span>
              <span className="text-rose-500 block">{totalWrong > 0 ? totalWrong : 0} Erros</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">{accuracy}%</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">SESSÕES</span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-primary block">{filteredSessions.length} registro{filteredSessions.length !== 1 ? "s" : ""}</span>
              {activeFilterCount > 0 && (
                <span className="text-muted-foreground block">de {sessions.length} total</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">PÁGINAS LIDAS</span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">{totalPages}</span>
          </div>
        </div>
      </div>

      {/* Registros */}
      <div className="space-y-4 pt-2">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 border rounded-xl bg-card/50">
            <HistoryIcon className="h-10 w-10 text-muted-foreground/30" />
            <h3 className="text-base font-extrabold text-foreground">
              {activeFilterCount > 0
                ? "Nenhum estudo encontrado com os filtros selecionados"
                : "Você ainda não realizou nenhum estudo"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {activeFilterCount > 0
                ? "Tente ajustar ou limpar os filtros para ver seus registros."
                : "Inicie uma sessão de estudos ou cadastre manualmente para visualizar aqui."}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="text-xs font-bold">
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                REGISTROS RECENTES
                {activeFilterCount > 0 && ` (${filteredSessions.length} resultado${filteredSessions.length !== 1 ? "s" : ""})`}
              </span>
              <div className="flex-1 h-0.5 bg-[#2563EB]/30" />
            </div>

            <div className="space-y-3">
              {filteredSessions.map((session) => (
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
                        Data: {formatStudyDate(session.started_at) || "Não informada"}
                      </p>
                      {session.study_type && (
                        <p className="text-[11px] font-bold text-primary">
                          Tipo: {STUDY_TYPES.find(t => t.value === session.study_type)?.label || session.study_type}
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
                      <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                        Salvo às: {formatSavedAt(session.created_at) || formatSavedAt(session.started_at) || "--:--"}
                      </p>
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
