"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import * as Sentry from "@sentry/nextjs"
import {
  AlertTriangle,
  Clock,
  CloudOff,
  Database,
  Filter,
  History as HistoryIcon,
  Loader2,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react"
import dynamic from "next/dynamic"
import { toast } from "sonner"

import {
  deleteStudySessionAction,
  getHistoryListAction,
  getHistorySessionForEditAction,
  getMonthlyHistoryAction,
} from "@/application/study-history/study-history.actions"
import { unpackHistoryList } from "@/application/study-history/history-list-payload"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { disciplineColorHex } from "@/domain/disciplines/discipline-colors"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import { filterHistorySessions } from "@/features/history/lib/filter-history-sessions"
import {
  HISTORY_INITIAL_VISIBLE_SESSIONS,
  HISTORY_VISIBLE_SESSIONS_STEP,
  selectVisibleDayGroups,
} from "@/features/history/lib/visible-day-groups"
import { ManageImportsModal } from "@/features/importacao/components/manage-imports-modal"
import { originDisplayName } from "@/features/importacao/lib/origin"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import {
  STUDY_SESSION_OFFLINE_RESOLVED_EVENT,
  STUDY_SESSION_QUEUED_EVENT,
  STUDY_SESSION_SAVED_EVENT,
  readStudySessionOfflineResolved,
  readStudySessionQueued,
  readStudySessionSaved,
} from "@/features/study-session/lib/study-session-events"
import { buildPendingStudySession, getClientUserId, syncQueue } from "@/infrastructure/offline"
import { formatDayLabel, getDayInSaoPaulo, getTimeInSaoPaulo } from "@/lib/sao-paulo"
import { formatDuration, formatDurationMinutes } from "@/lib/format-duration"

import { StudyCalendar } from "./study-calendar"

// Carregado sob demanda (Fase 6, auditoria de bundle): ImportHistoryModal
// importa estaticamente a biblioteca xlsx (pesada) via excel-reader.ts. Como
// antes era um import estático no topo do arquivo, o JS do xlsx era baixado
// sempre que a página Histórico carregava, mesmo que o usuário nunca abrisse
// o modal de importação. Com next/dynamic, esse JS fica num chunk separado,
// fora do bundle principal desta página.
const ImportHistoryModal = dynamic(
  () =>
    import("@/features/importacao/components/import-history-modal").then(
      (mod) => mod.ImportHistoryModal,
    ),
  { ssr: false },
)

type HistorySession = StudyHistory & {
  disciplines?: {
    id?: string
    name?: string
    area?: string | null
    color_hex?: string | null
  } | null
  /** Fase C (offline-first): true enquanto o registro só existe localmente, aguardando sincronização. */
  _offlinePending?: true
  _operationId?: string
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
  { value: "AUDIO", label: "Áudio / Podcast" },
  { value: "AULA_VIVO", label: "Aula ao Vivo" },
  { value: "DISCURSIVA", label: "Discursiva / Redação" },
  { value: "DOUTRINA", label: "Doutrina" },
  { value: "DUOLINGO", label: "Duolingo" },
  { value: "ESTUDO_IA", label: "Estudo com IA" },
  { value: "FLASHCARDS", label: "Flashcards" },
  { value: "INFORMATIVOS", label: "Informativos" },
  { value: "JURISPRUDENCIA", label: "Jurisprudência" },
  { value: "LEI_SECA", label: "Lei Seca" },
  { value: "LEITURA", label: "Leitura / PDF" },
  { value: "MAPA_MENTAL", label: "Mapa Mental" },
  { value: "MONITORIA", label: "Monitoria / Mentoria" },
  { value: "QUESTOES", label: "Questões" },
  { value: "RESUMO", label: "Resumo" },
  { value: "REVISAO", label: "Revisão" },
  { value: "SIMULADO", label: "Simulado" },
  { value: "TEORIA", label: "Teoria" },
  { value: "VIDEOAULA", label: "Videoaula" },
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
    try {
      // Fase F.2: payload enxuto (só o que a lista, os filtros e os totais
      // usam); a linha completa é buscada ao clicar em "Editar".
      const { data: payload, error } = await getHistoryListAction()
      const data = payload ? unpackHistoryList(payload) : null
      if (error) {
        setQueryError(true)
        Sentry.captureMessage("Falha ao carregar histórico", {
          level: "error",
          extra: { feature: "historico", error },
        })
        toast.error("Erro ao carregar histórico: " + error)
      } else if (data) {
        setQueryError(false)
        // Preserva os itens pendentes locais (Fase C): o servidor nunca vai
        // devolvê-los (ainda não existem lá), então eles não fazem parte de
        // `data` — sem isto, cada refresh do Histórico os apagaria da tela.
        setSessions((prev) => {
          const stillPending = prev.filter((s) => s._offlinePending)
          return [...(data as HistorySession[]), ...stillPending]
        })
      }
    } catch (err) {
      // Falha de rede ao chamar a Server Action (ex.: offline) — item 6:
      // isto não pode derrubar a tela nem esconder os estudos pendentes já
      // visíveis localmente. O indicador global de conectividade (item 14)
      // já avisa o usuário; aqui só evitamos um erro não tratado.
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        extra: { feature: "historico", step: "load_history_offline" },
      })
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

  // Fase C (offline-first) — item 6: um estudo salvo offline aparece aqui
  // IMEDIATAMENTE (evento separado de STUDY_SESSION_SAVED_EVENT — ver
  // study-session-events.ts — porque ainda não existe no servidor).
  useEffect(() => {
    const handleQueued = (event: Event) => {
      const saved = readStudySessionQueued(event)
      if (saved) upsertSession(saved as HistorySession)
    }
    const handleResolved = (event: Event) => {
      const operationId = readStudySessionOfflineResolved(event)
      if (!operationId) return
      // A sincronização terminou (com sucesso ou erro definitivo) — o
      // placeholder local dá lugar ao registro real (já upsertado pelo
      // handler de STUDY_SESSION_SAVED_EVENT acima) ou simplesmente sai da
      // lista, sem duplicar a linha do tempo.
      setSessions((prev) => prev.filter((s) => s.id !== `pending:${operationId}`))
    }
    window.addEventListener(STUDY_SESSION_QUEUED_EVENT, handleQueued)
    window.addEventListener(STUDY_SESSION_OFFLINE_RESOLVED_EVENT, handleResolved)
    return () => {
      window.removeEventListener(STUDY_SESSION_QUEUED_EVENT, handleQueued)
      window.removeEventListener(STUDY_SESSION_OFFLINE_RESOLVED_EVENT, handleResolved)
    }
  }, [upsertSession])

  // Fase C, item 16 do teste real: fechar/reabrir o app deve continuar
  // mostrando os estudos ainda não sincronizados — eles vivem no IndexedDB
  // (sync_queue), não em memória, então precisam ser recarregados no mount.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const userId = await getClientUserId()
      if (!userId || cancelled) return
      const [pending, syncing, failed] = await Promise.all([
        syncQueue.getByStatus(userId, "PENDING"),
        syncQueue.getByStatus(userId, "SYNCING"),
        syncQueue.getByStatus(userId, "FAILED"),
      ])
      const ops = [...pending, ...syncing, ...failed].filter(
        (op) => op.type === "STUDY_SESSION_CREATE",
      )
      if (ops.length === 0 || cancelled) return
      setSessions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id))
        const additions = ops
          .map((op) =>
            buildPendingStudySession(op.payload as Record<string, unknown>, op.operationId, userId),
          )
          .filter((s) => !existingIds.has(s.id)) as HistorySession[]
        return additions.length > 0 ? [...prev, ...additions] : prev
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  // Apply filters (Fase F.1: lógica movida sem alteração para
  // lib/filter-history-sessions.ts, onde é coberta por testes)
  const filteredSessions = useMemo(
    () => filterHistorySessions(sessions, filters, importFilterId),
    [sessions, filters, importFilterId],
  )

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
  // Fase H: sem questões nas sessões filtradas não há desempenho — "—", não "0%".
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null
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

  // Fase F (performance): a lista desenha dias inteiros aos poucos (≈150
  // registros na 1ª tela, +300 por clique) em vez de ≈2.800 linhas de uma vez.
  // Totais, contagens e filtros continuam valendo para TODAS as sessões. Ao
  // mudar qualquer filtro a lista volta ao começo (o limite é guardado junto
  // com a "assinatura" dos filtros em que foi ampliado).
  const filtersSignature = JSON.stringify(filters)
  const [visibleBudget, setVisibleBudget] = useState({
    signature: filtersSignature,
    sessions: HISTORY_INITIAL_VISIBLE_SESSIONS,
  })
  const sessionBudget =
    visibleBudget.signature === filtersSignature
      ? visibleBudget.sessions
      : HISTORY_INITIAL_VISIBLE_SESSIONS
  const visibleDays = useMemo(
    () => selectVisibleDayGroups(dayGroups, sessionBudget),
    [dayGroups, sessionBudget],
  )
  const handleShowMoreDays = () => {
    setVisibleBudget({
      signature: filtersSignature,
      sessions: visibleDays.visibleSessionCount + HISTORY_VISIBLE_SESSIONS_STEP,
    })
  }

  // Fase F.2: a lista só tem os campos de exibição; o modal de edição precisa
  // da linha COMPLETA (notes, metadata inteiro — que é espalhado no update).
  // Busca só aquela sessão; se falhar, não abre o modal com dados parciais
  // (salvar com dados parciais apagaria campos da sessão).
  const handleEditSession = async (session: HistorySession) => {
    const { data: full, error } = await getHistorySessionForEditAction(session.id)
    if (error || !full) {
      toast.error("Não foi possível abrir a sessão para edição: " + (error ?? "sessão não encontrada"))
      return
    }
    setEditingSession(full as unknown as HistorySession)
    setIsRegisterOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setIsRegisterOpen(open)
    if (!open) {
      setEditingSession(null)
      // Fase F.2: sem recarregar o histórico inteiro ao fechar o modal. Um
      // estudo salvo/editado já entra na lista pelo STUDY_SESSION_SAVED_EVENT
      // (ou QUEUED, offline) com a linha real do banco — o mesmo mecanismo que
      // já atualizava o Histórico quando se salva pelo botão flutuante global.
      // Antes, até "Cancelar" recarregava as ~2.800 sessões.
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
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div role="tablist" aria-label="Visualização do histórico" className="inline-flex items-center bg-muted p-0.5 rounded-md">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              role="tab"
              aria-selected={viewMode === "list"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[5px] transition-colors ${viewMode === "list" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              role="tab"
              aria-selected={viewMode === "calendar"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[5px] transition-colors ${viewMode === "calendar" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Clock className="h-3.5 w-3.5" />
              Calendário
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:justify-end flex-wrap">
          <Button onClick={() => setIsRegisterOpen(true)}>
            Adicionar estudo
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  aria-label="Importar histórico"
                  className="gap-2 max-sm:px-3"
                >
                  <Upload aria-hidden className="h-4 w-4" />
                  <span className="hidden sm:inline">Importar histórico</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Importar histórico de estudos de outra plataforma
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Ações administrativas menos frequentes: hierarquia mais discreta (ghost) */}
          <Button
            variant="ghost"
            onClick={() => setIsManageOpen(true)}
            aria-label="Gerenciar importações"
            title="Gerenciar importações"
            className="text-muted-foreground hover:text-foreground gap-2 max-sm:px-3"
          >
            <Database aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">Gerenciar importações</span>
          </Button>

          {/* Fase E: removido o botão "Cargo alvo" — ele nunca teve ação (entrou
              sem onClick no commit 5acd970) e o Histórico não tem filtro nem
              vínculo por cargo/concurso para ele acionar. */}
          <div className="relative">
            <Button
              ref={filterButtonRef}
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-label={activeFilterCount > 0 ? `Filtros (${activeFilterCount} ativos)` : "Filtros"}
              className={`gap-2 max-sm:px-3 ${activeFilterCount > 0 ? "border-primary/40 text-primary" : ""}`}
            >
              <Filter aria-hidden className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilterCount > 0 ? <span className="tabular-nums">({activeFilterCount})</span> : null}
            </Button>

            {showFilters && (
              <div
                ref={filterPanelRef}
                className="absolute right-0 top-full mt-2 z-50 bg-popover border border-border rounded-lg shadow-lg p-4 w-[min(360px,calc(100vw-2rem))] space-y-3"
              >
                {/* Date Start */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={filters.dateStart}
                    onChange={(e) => setFilters((f) => ({ ...f, dateStart: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
                  />
                </div>

                {/* Date End */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={filters.dateEnd}
                    onChange={(e) => setFilters((f) => ({ ...f, dateEnd: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
                  />
                </div>

                {/* Discipline */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Disciplina
                  </label>
                  <select
                    value={filters.disciplineId}
                    onChange={(e) => setFilters((f) => ({ ...f, disciplineId: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
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
                  <label className="text-xs font-medium text-muted-foreground">
                    Origem
                  </label>
                  <select
                    value={filters.origin}
                    onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
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
                  <label className="text-xs font-medium text-muted-foreground">
                    Tipo de Estudo
                  </label>
                  <select
                    value={filters.studyType}
                    onChange={(e) => setFilters((f) => ({ ...f, studyType: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
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
                  <label className="text-xs font-medium text-muted-foreground">
                    Modo
                  </label>
                  <select
                    value={filters.technique}
                    onChange={(e) => setFilters((f) => ({ ...f, technique: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
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
                  <label className="text-xs font-medium text-muted-foreground">
                    Tempo Estudado
                  </label>
                  <select
                    value={filters.timeRange}
                    onChange={(e) => setFilters((f) => ({ ...f, timeRange: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
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
                  <label className="text-xs font-medium text-muted-foreground">
                    Foco
                  </label>
                  <select
                    value={filters.focusRange}
                    onChange={(e) => setFilters((f) => ({ ...f, focusRange: e.target.value }))}
                    className="w-full h-9 px-2.5 text-[13px] border border-input rounded-md bg-card"
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
                    className="flex-1"
                  >
                    Limpar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowFilters(false)}
                    className="flex-1"
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resumo do período: uma única superfície com hierarquia (não 4 cards repetidos) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-border [&>*]:border-border max-lg:[&>*:nth-child(even)]:border-l max-lg:[&>*:nth-child(n+3)]:border-t lg:divide-x lg:divide-border">
        <div className="px-4 py-3 space-y-0.5">
          <span className="text-xs text-muted-foreground">
            Tempo de estudo
          </span>
          <p className="text-xl font-semibold text-foreground tabular-nums">
            {formatDurationMinutes(totalMinutes)}
          </p>
        </div>

        <div className="px-4 py-3 space-y-0.5">
          <span className="text-xs text-muted-foreground">
            Desempenho
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-xl font-semibold text-foreground tabular-nums">{accuracy === null ? "—" : `${accuracy}%`}</p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {totalCorrect} acertos · {totalWrong > 0 ? totalWrong : 0} erros
            </span>
          </div>
        </div>

        <div className="px-4 py-3 space-y-0.5">
          <span className="text-xs text-muted-foreground">
            Sessões
          </span>
          {viewMode === "list" ? (
            <p className="text-xl font-semibold text-foreground tabular-nums">
              {filteredSessions.length.toLocaleString("pt-BR")}
              {activeFilterCount > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2 align-middle">
                  com filtros
                </span>
              )}
            </p>
          ) : (
            <p className="text-xl font-semibold text-foreground tabular-nums">
              {filteredMonthlySessions.length}
              <span className="text-xs font-normal text-muted-foreground ml-2 align-middle">
                neste mês{activeFilterCount > 0 ? " · com filtros" : ""}
              </span>
            </p>
          )}
        </div>

        <div className="px-4 py-3 space-y-0.5">
          <span className="text-xs text-muted-foreground">
            Páginas lidas
          </span>
          <p className="text-xl font-semibold text-foreground tabular-nums">{totalPagesRead}</p>
        </div>
      </div>

      {/* Registros */}
      {importFilterId && (
        <div className="flex items-center justify-between gap-3 border-l-2 border-primary bg-primary/5 px-4 py-2.5">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[13px] font-medium text-foreground">Filtrando uma importação</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {filteredSessions.length} sessão{filteredSessions.length !== 1 ? "es" : ""} desta
              importação.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearImportFilter}
            className="shrink-0"
          >
            Limpar filtro
          </Button>
        </div>
      )}

      <div className="space-y-4">
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
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 border border-border rounded-lg bg-card">
                <AlertTriangle aria-hidden className="h-5 w-5 text-destructive" />
                <h3 className="text-sm font-medium text-foreground">
                  Não foi possível carregar seu histórico
                </h3>
                <p className="text-[13px] text-muted-foreground">
                  Ocorreu um erro ao consultar seus registros. Tente novamente em instantes.
                </p>
                <Button
                  size="sm"
                  onClick={() => void loadHistory()}
                  className="mt-2"
                >
                  Tentar novamente
                </Button>
              </div>
            )
          if (filteredSessions.length === 0)
            return (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 border border-border rounded-lg bg-card">
                <HistoryIcon aria-hidden className="h-5 w-5 text-muted-foreground/70" />
                <h3 className="text-sm font-medium text-foreground">
                  {activeFilterCount > 0
                    ? "Nenhum estudo encontrado com os filtros selecionados"
                    : "Nenhum estudo registrado"}
                </h3>
                <p className="text-[13px] text-muted-foreground max-w-sm">
                  {activeFilterCount > 0
                    ? "Tente ajustar ou limpar os filtros para ver seus registros."
                    : "Comece um estudo ou registre manualmente para acompanhar seu progresso."}
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => setIsRegisterOpen(true)}
                  >
                    Adicionar estudo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsImportOpen(true)}
                  >
                    Importar histórico
                  </Button>
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            )
          // Redesign 2.0 — registro em formato de diário/log: um bloco por
          // dia, linhas compactas separadas por divisórias (sem um card por
          // registro). Pendência offline é informação funcional discreta.
          return (
            <div className="space-y-6">
              {activeFilterCount > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {filteredSessions.length} resultado{filteredSessions.length !== 1 ? "s" : ""} com os filtros atuais
                </p>
              )}

              {visibleDays.visible.map((day) => (
                <section key={day.day} aria-label={day.label} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="flex items-baseline gap-2">
                      <h2 className="type-h3 text-foreground">{day.label}</h2>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {day.activityCount} registro{day.activityCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-[13px] tabular-nums text-foreground">
                      <span className="text-muted-foreground">Total </span>
                      {formatDuration(day.totalSeconds)}
                    </span>
                  </div>

                  <ul className="rounded-lg border border-border bg-card divide-y divide-border">
                    {day.sessions.map((session) => {
                      const disc = session.disciplines
                      const color = disciplineColorHex(
                        session.discipline_id || "",
                        disc?.color_hex ?? null,
                      )
                      const studyTypeLabel = session.study_type
                        ? STUDY_TYPES.find((t) => t.value === session.study_type)?.label ||
                          session.study_type
                        : null
                      const questionsAnswered = Number(session.metadata?.["questions_answered"] || 0)
                      const flashcardsReviewed = Number(session.metadata?.["flashcards_reviewed"] || 0)
                      return (
                        <li
                          key={session.id}
                          className="group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_4.5rem_4.5rem] items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                        >
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatSavedAt(session.started_at) || "—"}
                          </span>

                          <div className="min-w-0">
                            <p className="flex items-center gap-2 min-w-0">
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="line-clamp-2 sm:line-clamp-1 break-words text-sm font-medium text-foreground">
                                {disc?.name || "Estudo livre"}
                              </span>
                            </p>
                            <p className="pl-4 text-xs text-muted-foreground truncate">
                              {[
                                studyTypeLabel,
                                session.origin_source
                                  ? `Importado · ${originDisplayName(
                                      session.origin_source,
                                      session.origin_source_name,
                                    )}`
                                  : null,
                                questionsAnswered > 0
                                  ? `Questões ${Number(session.metadata?.["questions_correct"] || 0)}/${questionsAnswered}`
                                  : null,
                                flashcardsReviewed > 0
                                  ? `Flashcards ${flashcardsReviewed} (${Number(session.metadata?.["flashcards_correct"] || 0)} acertos)`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {session._offlinePending && (
                              <p className="pl-4 mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <CloudOff aria-hidden className="h-3 w-3" />
                                Pendente de sincronização
                              </p>
                            )}
                          </div>

                          <span className="text-[13px] tabular-nums font-medium text-foreground text-right">
                            {formatDuration(sessionRealSeconds(session))}
                          </span>

                          <span className="hidden sm:block text-xs tabular-nums text-muted-foreground text-right">
                            {session.metadata?.["focus_percentage"] !== null &&
                            session.metadata?.["focus_percentage"] !== undefined
                              ? `Foco ${String(session.metadata["focus_percentage"])}%`
                              : "—"}
                          </span>

                          <div className="col-start-3 row-start-2 sm:col-start-auto sm:row-start-auto flex items-center justify-end gap-0.5">
                            {!session._offlinePending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleEditSession(session)}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                                  title="Editar"
                                  aria-label="Editar registro"
                                >
                                  <SquarePen className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteSession(session.id)}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  title="Excluir"
                                  aria-label="Excluir registro"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}

              {visibleDays.hiddenDayCount > 0 && (
                <div className="flex flex-col items-center gap-1 pt-2">
                  <Button variant="outline" size="sm" onClick={handleShowMoreDays}>
                    Mostrar dias anteriores
                  </Button>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {visibleDays.visibleSessionCount.toLocaleString("pt-BR")} de{" "}
                    {(visibleDays.visibleSessionCount + visibleDays.hiddenSessionCount).toLocaleString("pt-BR")}{" "}
                    registros exibidos
                  </p>
                </div>
              )}
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
