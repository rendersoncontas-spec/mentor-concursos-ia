"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import * as Sentry from "@sentry/nextjs"
import {
  AlertTriangle,
  Clock,
  Database,
  Edit2,
  Filter,
  GraduationCap,
  History as HistoryIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteStudySessionAction,
  getAllHistoryAction,
  getMonthlyHistoryAction,
} from "@/application/study-history/study-history.actions"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { disciplineColorHex } from "@/domain/disciplines/discipline-colors"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import { ImportHistoryModal } from "@/features/importacao/components/import-history-modal"
import { ManageImportsModal } from "@/features/importacao/components/manage-imports-modal"
import { originDisplayName } from "@/features/importacao/lib/origin"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import {
  STUDY_SESSION_SAVED_EVENT,
  readStudySessionSaved,
} from "@/features/study-session/lib/study-session-events"
import { formatDayLabel, getDayInSaoPaulo, getTimeInSaoPaulo } from "@/lib/sao-paulo"

import { StudyCalendar } from "./study-calendar"

type HistorySession = StudyHistory & {
  disciplines?: {
    id?: string
    name?: string
    area?: string | null
    color_hex?: string | null
  } | null
}

type DayGroup = {
  day: string
  label: string
  totalSeconds: number
  activityCount: number
  sessions: HistorySession[]
}

interface Filters {
  dateStart: string
  dateEnd: string
  disciplineId: string
  origin: string
  studyType: string
  technique: string
  timeRange: string
  focusRange: string
}

const EMPTY_FILTERS: Filters = {
  dateStart: "",
  dateEnd: "",
  disciplineId: "",
  origin: "",
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

/** Data YYYY-MM-DD do estudo no fuso oficial (America/Sao_Paulo). */
function getStudyDate(session: HistorySession): string {
  return getDayInSaoPaulo(session.started_at)
}

// Formata o HORÁRIO no fuso de São Paulo
function formatSavedAt(value: unknown): string {
  return getTimeInSaoPaulo(value as string | Date | null | undefined)
}

/** Duração real de uma sessão em SEGUNDOS (unidade real do banco). */
function sessionRealSeconds(s: HistorySession): number {
  const imported = Number(s.metadata?.["imported_seconds"] || 0)
  if (imported > 0) return imported
  return (Number(s.duration_minutes) || 0) * 60
}

/** Formata duração de UMA sessão: "10m29s", "1h00m", "45s". */
function formatSessionDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h === 0 && m === 0) return `${s}s`
  if (h === 0) return `${m}m${s.toString().padStart(2, "0")}s`
  if (s === 0) return `${h}h${m.toString().padStart(2, "0")}m`
  return `${h}h${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`
}

/** Formata o TOTAL do dia: "2h13m44s", "1h10m24s", "34m12s". */
function formatDayTotalSeconds(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h === 0 && m === 0) return `${s}s`
  if (h === 0) return `${m}m${s.toString().padStart(2, "0")}s`
  return `${h}h${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`
}

function formatHoursMinutes(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m < 10 ? "0" : ""}${m}min`
}

function countActiveFilters(f: Filters): number {
  let count = 0
  if (f.dateStart) count++
  if (f.dateEnd) count++
  if (f.disciplineId) count++
  if (f.origin) count++
  if (f.studyType) count++
  if (f.technique) count++
  if (f.timeRange) count++
  if (f.focusRange) count++
  return count
}

export function HistoryView() {
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [loading, setLoading] = useState(true)
  const [queryError, setQueryError] = useState(false)
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1)
  const [monthlySessions, setMonthlySessions] = useState<HistorySession[]>([])
  const [loadingMonthly, setLoadingMonthly] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)
  const [importFilterId, setImportFilterId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("import")
  })
  const [editingSession, setEditingSession] = useState<HistorySession | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    const { data, error } = await getAllHistoryAction()
    if (error) {
      setQueryError(true)
      Sentry.captureMessage("Falha ao carregar histórico", {
        level: "error",
        extra: { feature: "historico", error },
      })
      toast.error("Erro ao carregar histórico: " + error)
    } else if (data) {
      setQueryError(false)
      setSessions(data as HistorySession[])
    }
    setLoading(false)
  }, [])

  const loadMonthlyHistory = useCallback(async (year: number, month: number) => {
    setLoadingMonthly(true)
    const { data, error } = await getMonthlyHistoryAction(year, month)
    if (error) {
      toast.error("Erro ao carregar calendário: " + error)
    } else if (data) {
      setMonthlySessions(data)
    }
    setLoadingMonthly(false)
  }, [])

  // Insere/substitui a sessão REAL retornada pelo banco no estado local,
  // deduplicando por id. O agrupamento por dia (dayGroups) recalcula sozinho.
  const upsertSession = useCallback(
    (saved: HistorySession) => {
      setSessions((prev) => {
        const index = prev.findIndex((s) => s.id === saved.id)
        if (index !== -1) {
          const next = [...prev]
          next[index] = saved
          return next
        }
        return [...prev, saved]
      })

      setMonthlySessions((prev) => {
        const day = getDayInSaoPaulo(saved.started_at)
        if (!day) return prev
        const [year, month] = day.split("-").map(Number)
        if (year !== calendarYear || month !== calendarMonth) return prev
        const index = prev.findIndex((s) => s.id === saved.id)
        if (index !== -1) {
          const next = [...prev]
          next[index] = saved
          return next
        }
        return [...prev, saved]
      })
    },
    [calendarYear, calendarMonth],
  )

  // Qualquer instância do modal (incluindo a do botão flutuante global, que
  // NÃO passa por handleModalClose) notifica o Histórico após salvar/editar.
  useEffect(() => {
    const handler = (event: Event) => {
      const saved = readStudySessionSaved(event)
      if (!saved) {
        Sentry.captureMessage("Evento de sessão salva sem sessão válida", {
          extra: { feature: "historico" },
        })
        return
      }
      upsertSession(saved as HistorySession)
    }
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, handler)
    return () => window.removeEventListener(STUDY_SESSION_SAVED_EVENT, handler)
  }, [upsertSession])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadHistory()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadHistory])

  useEffect(() => {
    if (viewMode !== "calendar") return
    const timer = setTimeout(() => {
      void loadMonthlyHistory(calendarYear, calendarMonth)
    }, 0)
    return () => clearTimeout(timer)
  }, [viewMode, calendarYear, calendarMonth, loadMonthlyHistory])

  const clearImportFilter = () => {
    setImportFilterId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("import")
    window.history.replaceState({}, "", url.toString())
  }

  // Close filter panel on outside click or ESC
  useEffect(() => {
    if (!showFilters) return
    const handleClick = (e: MouseEvent) => {
      if (
        filterPanelRef.current &&
        !filterPanelRef.current.contains(e.target as Node) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(e.target as Node)
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
    sessions.forEach((s) => {
      const id = s.discipline_id
      const name = s.disciplines?.name || "Estudo Livre"
      if (id && !map.has(id)) map.set(id, name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sessions])

  // Unique origins from sessions (imported sessions only)
  const origins = useMemo(() => {
    const map = new Map<string, string>()
    sessions.forEach((s) => {
      if (!s.origin_source) return
      const name = s.origin_source_name || originDisplayName(s.origin_source ?? null, null)
      if (!map.has(name)) map.set(name, name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sessions])

  // Apply filters
  const filteredSessions = useMemo(() => {
    let result = [...sessions]

    if (importFilterId) {
      result = result.filter((s) => s.import_batch_id === importFilterId)
    }
    if (filters.dateStart) {
      result = result.filter((s) => getStudyDate(s) >= filters.dateStart)
    }
    if (filters.dateEnd) {
      result = result.filter((s) => getStudyDate(s) <= filters.dateEnd)
    }
    if (filters.disciplineId) {
      result = result.filter((s) => s.discipline_id === filters.disciplineId)
    }
    if (filters.origin) {
      if (filters.origin === "mentor") {
        result = result.filter((s) => !s.origin_source)
      } else {
        result = result.filter((s) => s.origin_source_name === filters.origin)
      }
    }
    if (filters.studyType) {
      result = result.filter((s) => s.study_type === filters.studyType)
    }
    if (filters.technique) {
      result = result.filter((s) => s.technique === filters.technique)
    }
    if (filters.timeRange) {
      result = result.filter((s) => {
        const mins = s.duration_minutes || 0
        switch (filters.timeRange) {
          case "0-30":
            return mins <= 30
          case "30-60":
            return mins > 30 && mins <= 60
          case "60-120":
            return mins > 60 && mins <= 120
          case "120+":
            return mins > 120
          default:
            return true
        }
      })
    }
    if (filters.focusRange) {
      result = result.filter((s) => {
        const rawFocus = s.metadata?.["focus_percentage"]
        if (rawFocus === null || rawFocus === undefined) return false
        const focus = Number(rawFocus)
        switch (filters.focusRange) {
          case "0-49":
            return focus >= 0 && focus < 50
          case "50-69":
            return focus >= 50 && focus < 70
          case "70-89":
            return focus >= 70 && focus < 90
          case "90-100":
            return focus >= 90 && focus <= 100
          default:
            return true
        }
      })
    }

    return result
  }, [sessions, filters, importFilterId])

  const filteredMonthlySessions = useMemo(() => {
    let result = [...monthlySessions]

    if (importFilterId) {
      result = result.filter((s) => s.import_batch_id === importFilterId)
    }
    // Calendário não usa filtro de data início/fim
    if (filters.disciplineId) {
      result = result.filter((s) => s.discipline_id === filters.disciplineId)
    }
    if (filters.origin) {
      if (filters.origin === "mentor") {
        result = result.filter((s) => !s.origin_source)
      } else {
        result = result.filter((s) => s.origin_source_name === filters.origin)
      }
    }
    if (filters.studyType) {
      result = result.filter((s) => s.study_type === filters.studyType)
    }
    if (filters.technique) {
      result = result.filter((s) => s.technique === filters.technique)
    }
    if (filters.timeRange) {
      result = result.filter((s) => {
        const mins = s.duration_minutes || 0
        switch (filters.timeRange) {
          case "0-30":
            return mins <= 30
          case "30-60":
            return mins > 30 && mins <= 60
          case "60-120":
            return mins > 60 && mins <= 120
          case "120+":
            return mins > 120
          default:
            return true
        }
      })
    }
    if (filters.focusRange) {
      result = result.filter((s) => {
        const rawFocus = s.metadata?.["focus_percentage"]
        if (rawFocus === null || rawFocus === undefined) return false
        const focus = Number(rawFocus)
        switch (filters.focusRange) {
          case "0-49":
            return focus >= 0 && focus < 50
          case "50-69":
            return focus >= 50 && focus < 70
          case "70-89":
            return focus >= 70 && focus < 90
          case "90-100":
            return focus >= 90 && focus <= 100
          default:
            return true
        }
      })
    }

    return result
  }, [monthlySessions, filters, importFilterId])

  // KPIs from filtered (todas as sessões estão em memória → soma sempre precisa)
  const activeFilterCount = countActiveFilters(filters)
  const currentSessions = viewMode === "calendar" ? filteredMonthlySessions : filteredSessions
  const totalMinutes = currentSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  const totalCorrect = currentSessions.reduce(
    (acc, s) => acc + Number(s.metadata?.["questions_correct"] || 0),
    0,
  )
  const totalAnswered = currentSessions.reduce(
    (acc, s) => acc + Number(s.metadata?.["questions_answered"] || 0),
    0,
  )
  const totalWrong = totalAnswered - totalCorrect
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0
  const totalPagesRead = currentSessions.reduce(
    (acc, s) => acc + Number(s.metadata?.["pages_read"] || 0),
    0,
  )

  // Agrupamento por dia (fuso America/Sao_Paulo): data → total real → atividades → sessões (mais recente primeiro)
  const dayGroups = useMemo(() => {
    const map = new Map<string, HistorySession[]>()
    for (const s of filteredSessions) {
      const day = getStudyDate(s)
      if (!day) continue
      const list = map.get(day)
      if (list) list.push(s)
      else map.set(day, [s])
    }
    const groups: DayGroup[] = []
    for (const [day, daySessions] of map.entries()) {
      const sorted = [...daySessions].sort((a, b) => {
        const t = (s: HistorySession) => new Date(s.started_at || s.created_at || 0).getTime()
        return t(b) - t(a)
      })
      groups.push({
        day,
        label: formatDayLabel(day),
        totalSeconds: sorted.reduce((acc, s) => acc + sessionRealSeconds(s), 0),
        activityCount: sorted.length,
        sessions: sorted,
      })
    }
    groups.sort((a, b) => (a.day < b.day ? 1 : -1))
    return groups
  }, [filteredSessions])

  const handleEditSession = (session: HistorySession) => {
    setEditingSession(session)
    setIsRegisterOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setIsRegisterOpen(open)
    if (!open) {
      setEditingSession(null)
      void loadHistory()
      if (viewMode === "calendar") {
        void loadMonthlyHistory(calendarYear, calendarMonth)
      }
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const confirmed = window.confirm(
      "Excluir esta sessão de estudo?\nEsta ação não pode ser desfeita.",
    )
    if (!confirmed) return
    try {
      const { error } = await deleteStudySessionAction(sessionId)
      if (error) {
        toast.error("Erro ao excluir: " + error)
      } else {
        toast.success("Sessão excluída com sucesso")
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        setMonthlySessions((prev) => prev.filter((s) => s.id !== sessionId))
      }
    } catch {
      Sentry.captureMessage("Erro inesperado ao excluir sessão de estudo", {
        extra: { feature: "historico" },
      })
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <h1 className="text-2xl font-black text-foreground">Histórico</h1>
          <div className="inline-flex items-center bg-muted/60 p-1 rounded-xl border shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-black rounded-lg transition-all ${viewMode === "list" ? "bg-background text-[#2563EB] shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-black rounded-lg transition-all ${viewMode === "calendar" ? "bg-background text-[#2563EB] shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Clock className="h-3.5 w-3.5" />
              Calendário
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <Button
            onClick={() => setIsRegisterOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
          >
            Adicionar Estudo
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Importar Histórico
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Importar histórico de estudos de outra plataforma
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="outline"
            onClick={() => setIsManageOpen(true)}
            className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2"
          >
            <Database className="h-4 w-4" />
            Gerenciar Importações
          </Button>

          <Button
            variant="outline"
            className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs gap-2"
          >
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
                className="absolute right-0 top-full mt-2 z-50 bg-card border rounded-xl shadow-lg p-4 w-[min(360px,calc(100vw-2rem))] space-y-4"
              >
                {/* Date Start */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={filters.dateStart}
                    onChange={(e) => setFilters((f) => ({ ...f, dateStart: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  />
                </div>

                {/* Date End */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={filters.dateEnd}
                    onChange={(e) => setFilters((f) => ({ ...f, dateEnd: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  />
                </div>

                {/* Discipline */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Disciplina
                  </label>
                  <select
                    value={filters.disciplineId}
                    onChange={(e) => setFilters((f) => ({ ...f, disciplineId: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todas</option>
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Origin */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Origem
                  </label>
                  <select
                    value={filters.origin}
                    onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todas as origens</option>
                    <option value="mentor">Nomeia</option>
                    {origins.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Study Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Tipo de Estudo
                  </label>
                  <select
                    value={filters.studyType}
                    onChange={(e) => setFilters((f) => ({ ...f, studyType: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todos</option>
                    {STUDY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Technique / Mode */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Modo
                  </label>
                  <select
                    value={filters.technique}
                    onChange={(e) => setFilters((f) => ({ ...f, technique: e.target.value }))}
                    className="w-full h-8 px-3 text-xs border rounded-lg bg-background"
                  >
                    <option value="">Todos</option>
                    {TECHNIQUES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time Range */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Tempo Estudado
                  </label>
                  <select
                    value={filters.timeRange}
                    onChange={(e) => setFilters((f) => ({ ...f, timeRange: e.target.value }))}
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
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">
                    Foco
                  </label>
                  <select
                    value={filters.focusRange}
                    onChange={(e) => setFilters((f) => ({ ...f, focusRange: e.target.value }))}
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
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            TEMPO DE ESTUDO
          </span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">
              {formatHoursMinutes(totalMinutes)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            DESEMPENHO
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">{totalCorrect} Acertos</span>
              <span className="text-rose-500 block">{totalWrong > 0 ? totalWrong : 0} Erros</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">{accuracy}%</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            SESSÕES
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              {viewMode === "list" ? (
                <>
                  <span className="text-primary block">
                    {filteredSessions.length.toLocaleString("pt-BR")} registro
                    {filteredSessions.length !== 1 ? "s" : ""}
                  </span>
                  {activeFilterCount > 0 && (
                    <span className="text-muted-foreground block">Com filtros aplicados</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-primary block">
                    {filteredMonthlySessions.length} registro
                    {filteredMonthlySessions.length !== 1 ? "s" : ""} neste mês
                  </span>
                  {activeFilterCount > 0 && (
                    <span className="text-muted-foreground block">Com filtros aplicados</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            PÁGINAS LIDAS
          </span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">{totalPagesRead}</span>
          </div>
        </div>
      </div>

      {/* Registros */}
      {importFilterId && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 px-4 py-3">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-extrabold text-[#2563EB]">Filtrando uma importação</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {filteredSessions.length} sessão{filteredSessions.length !== 1 ? "es" : ""} desta
              importação.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearImportFilter}
            className="text-[11px] font-bold shrink-0"
          >
            Limpar filtro
          </Button>
        </div>
      )}

      <div className="space-y-4 pt-2">
        {(() => {
          if (viewMode === "calendar") {
            return (
              <StudyCalendar
                sessions={filteredMonthlySessions}
                currentYear={calendarYear}
                currentMonth={calendarMonth}
                onNavigate={(y, m) => {
                  setCalendarYear(y)
                  setCalendarMonth(m)
                }}
                onEditSession={handleEditSession}
                onDeleteSession={handleDeleteSession}
                isLoading={loadingMonthly}
              />
            )
          }

          if (loading)
            return (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )
          if (queryError)
            return (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 border rounded-xl bg-card/50">
                <AlertTriangle className="h-10 w-10 text-rose-500/70" />
                <h3 className="text-base font-extrabold text-foreground">
                  Não foi possível carregar seu histórico
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ocorreu um erro ao consultar seus registros. Tente novamente em instantes.
                </p>
                <Button
                  size="sm"
                  onClick={() => void loadHistory()}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5"
                >
                  Tentar novamente
                </Button>
              </div>
            )
          if (filteredSessions.length === 0)
            return (
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
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setIsRegisterOpen(true)}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5"
                  >
                    Adicionar estudo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsImportOpen(true)}
                    className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs"
                  >
                    Importar histórico
                  </Button>
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                    className="text-xs font-bold"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            )
          return (
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  LINHA DO TEMPO
                  {activeFilterCount > 0 &&
                    ` (${filteredSessions.length} resultado${filteredSessions.length !== 1 ? "s" : ""})`}
                </span>
                <div className="flex-1 h-0.5 bg-[#2563EB]/30" />
              </div>

              {dayGroups.map((day) => (
                <div key={day.day} className="space-y-3">
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-lg font-black text-foreground">{day.label}</h2>
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {day.activityCount} atividade{day.activityCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-black text-[#2563EB]">
                      Total: {formatDayTotalSeconds(day.totalSeconds)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {day.sessions.map((session) => {
                      const disc = session.disciplines
                      const color = disciplineColorHex(
                        session.discipline_id || "",
                        disc?.color_hex ?? null,
                      )
                      return (
                        <div
                          key={session.id}
                          className="rounded-xl border bg-card p-4 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 hover:border-[#2563EB]/60 transition-all"
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                              className="w-1.5 h-10 rounded-full shrink-0 mt-0.5"
                              style={{ backgroundColor: color }}
                            />
                            <div className="space-y-0.5 min-w-0">
                              <h3 className="font-extrabold text-xs text-foreground tracking-tight">
                                {disc?.name || "Estudo Livre"}
                              </h3>
                              {session.origin_source && (
                                <span className="inline-flex items-center rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#2563EB]">
                                  Importado ·{" "}
                                  {originDisplayName(
                                    session.origin_source,
                                    session.origin_source_name,
                                  )}
                                </span>
                              )}
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Horário: {formatSavedAt(session.started_at) || "Não informado"}
                              </p>
                              {session.study_type && (
                                <p className="text-[11px] font-bold text-primary">
                                  {STUDY_TYPES.find((t) => t.value === session.study_type)?.label ||
                                    session.study_type}
                                </p>
                              )}
                              {Number(session.metadata?.["flashcards_reviewed"] || 0) > 0 && (
                                <p className="text-[11px] text-emerald-600 font-semibold">
                                  Flashcards:{" "}
                                  {Number(session.metadata?.["flashcards_reviewed"] || 0)} revisados
                                  ({Number(session.metadata?.["flashcards_correct"] || 0)} acertos)
                                </p>
                              )}
                              {Number(session.metadata?.["questions_answered"] || 0) > 0 && (
                                <p className="text-[11px] text-blue-600 font-semibold">
                                  Questões: {Number(session.metadata?.["questions_correct"] || 0)}/
                                  {Number(session.metadata?.["questions_answered"] || 0)} acertos
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 self-end lg:self-center shrink-0">
                            <span className="text-xs font-mono text-muted-foreground font-bold flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatSessionDuration(sessionRealSeconds(session))}
                            </span>

                            <span className="px-4 py-1 rounded-md bg-[#2563EB] text-white font-extrabold text-[10px] tracking-wider uppercase shadow-xs">
                              FOCO{" "}
                              {session.metadata?.["focus_percentage"] !== null &&
                              session.metadata?.["focus_percentage"] !== undefined
                                ? `${String(session.metadata["focus_percentage"])}%`
                                : "—"}
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
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      <StudyRegisterModal
        open={isRegisterOpen}
        onOpenChange={handleModalClose}
        mode={editingSession ? "edit" : "create"}
        {...(editingSession ? { sessionToEdit: editingSession } : {})}
      />

      <ImportHistoryModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={() => {
          void loadHistory()
        }}
      />

      <ManageImportsModal
        open={isManageOpen}
        onOpenChange={setIsManageOpen}
        onChanged={() => {
          void loadHistory()
        }}
        onImportClick={() => setIsImportOpen(true)}
      />
    </div>
  )
}
