"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Clock,
  Search,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit2,
  CheckCircle2,
  XCircle,
  MapPin,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { toast } from "sonner"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { UserExamModal } from "@/features/dashboard/components/user-exam-modal"
import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
import { deleteUserExamAction } from "@/application/dashboard/user-exam.action"
import { WeeklyGoalsModal } from "@/features/dashboard/components/weekly-goals-modal"
import { DailyPlanningView } from "@/features/planejamento/components/daily-planning-view"
import { type StudyCycleBlock } from "@/features/planejamento/components/estudei-planning-view"

const MOTIVATIONAL_QUOTES = [
  { quote: "Não tenha medo de desistir do bom para perseguir o ótimo", author: "John D. Rockefeller" },
  { quote: "A disciplina é a ponte entre seus objetivos e suas realizações.", author: "Jim Rohn" },
  { quote: "Não espere por uma oportunidade, crie-a com o seu estudo diário.", author: "Provérbio do Concurseiro" },
  { quote: "A dor da disciplina é temporária, mas a glória da aprovação é para sempre.", author: "Autor Desconhecido" },
]

export interface HomeDisciplineRow {
  id: string
  name: string
  tempoFormatted: string
  correctCount: number
  wrongCount: number
  notebookCount: number
  accuracyPercentage: number
}

const DEFAULT_PAINEL_DISCIPLINES: HomeDisciplineRow[] = []

import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"

interface EstudeiHomeViewProps {
  userName?: string
  snapshot?: DashboardSnapshot
}

export function EstudeiHomeView({ userName = "Estudante", snapshot }: EstudeiHomeViewProps) {
  const router = useRouter()
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isExamModalOpen, setIsExamModalOpen] = useState(false)
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false)
  const [studyPeriod, setStudyPeriod] = useState<"HOJE" | "SEMANA" | "MES" | "TOTAL">("HOJE")

  // Cálculo da Data da Prova do usuário
  const examDateStr = snapshot?.activeTarget?.exam_date
  const examName = snapshot?.activeTarget?.exam_name || snapshot?.activeTarget?.target_exam || "Minha Prova"
  const examTime = snapshot?.activeTarget?.exam_time
  const examLocation = snapshot?.activeTarget?.exam_location
  const editalProgress = snapshot?.stats?.editalProgress ?? 0

  let daysRemaining: number | null = null
  let countdownLabel = ""
  if (examDateStr) {
    const targetDate = new Date(examDateStr + "T00:00:00")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffTime = targetDate.getTime() - today.getTime()
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (daysRemaining > 0) {
      countdownLabel = `Faltam ${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"}`
    } else if (daysRemaining === 0) {
      countdownLabel = "Hoje é o dia da sua prova!"
    } else {
      countdownLabel = `Prova realizada há ${Math.abs(daysRemaining)} dias`
    }
  }

  const formattedExamDate = examDateStr
    ? new Date(examDateStr + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : ""

  const handleDeleteExam = async () => {
    if (!confirm("Tem certeza que deseja excluir a data desta prova?")) return
    try {
      const result = await deleteUserExamAction()
      if (result.success) {
        toast.success("Data da prova excluída com sucesso.")
        router.refresh()
      } else {
        toast.error(result.error || "Erro ao excluir data da prova.")
      }
    } catch {
      toast.error("Erro inesperado ao excluir data da prova.")
    }
  }

  // Navegação e Paginação de Constância de Estudos (Heatmap)
  const [streakOffset, setStreakOffset] = useState(0) // 0 = Período atual (últimos 30 dias até hoje)
  const [customStudiedDates, setCustomStudiedDates] = useState<Record<string, boolean>>({})

  // Data final do período exibido de 30 dias
  const endDate = useMemo(() => {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    d.setDate(d.getDate() + streakOffset * 30)
    return d
  }, [streakOffset])

  // Data inicial do período (29 dias antes da data final)
  const startDate = useMemo(() => {
    const d = new Date(endDate)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 29)
    return d
  }, [endDate])

  // Rótulo dinâmico do intervalo formatado: "DD/MM ~ DD/MM"
  const formattedDateRange = useMemo(() => {
    const startDay = startDate.getDate().toString().padStart(2, "0")
    const startMonth = (startDate.getMonth() + 1).toString().padStart(2, "0")
    const endDay = endDate.getDate().toString().padStart(2, "0")
    const endMonth = (endDate.getMonth() + 1).toString().padStart(2, "0")
    return `${startDay}/${startMonth} ~ ${endDay}/${endMonth}`
  }, [startDate, endDate])

  // Gerar os 30 dias correspondentes ao período ativo
  const streakDays = useMemo(() => {
    const daysOfWeekList = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"]
    const monthsList = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."]

    // Mapear heatmap vindo do Supabase por YYYY-MM-DD
    const heatmapMap = new Map<string, boolean>()
    if (snapshot?.analytics?.heatmap) {
      snapshot.analytics.heatmap.forEach((hm) => {
        if (hm.minutes > 0 || (hm.sessions && hm.sessions > 0)) {
          heatmapMap.set(hm.date, true)
        }
      })
    }

    return Array.from({ length: 30 }).map((_, idx) => {
      const d = new Date(startDate)
      d.setDate(d.getDate() + idx)

      const year = d.getFullYear()
      const month = (d.getMonth() + 1).toString().padStart(2, "0")
      const day = d.getDate().toString().padStart(2, "0")
      const dateIso = `${year}-${month}-${day}`
      const dayOfWeek = daysOfWeekList[d.getDay()] || "segunda-feira"
      const formattedDate = `${day}/${monthsList[d.getMonth()]}`

      let studied = false
      if (customStudiedDates[dateIso] !== undefined) {
        studied = customStudiedDates[dateIso]
      } else if (heatmapMap.has(dateIso)) {
        studied = true
      }

      return {
        id: `stk-${dateIso}-${idx}`,
        dateIso,
        date: d,
        dayOfWeek,
        formattedDate,
        studied,
      }
    })
  }, [startDate, snapshot, customStudiedDates, streakOffset])

  const homeCycleBlocks: StudyCycleBlock[] = useMemo(() => {
    if (snapshot?.cycleBlocks && snapshot.cycleBlocks.length > 0) {
      return snapshot.cycleBlocks.map((b: any) => ({
        id: b.id,
        disciplineName: b.disciplineName,
        disciplineId: b.disciplineId,
        durationMinutes: b.durationMinutes,
        studiedMinutes: b.studiedMinutes || 0,
        color: b.color || "#2563EB",
        completed: b.status === "CONCLUIDO",
      }))
    }
    return []
  }, [snapshot?.cycleBlocks])

  const streakCount = snapshot?.stats?.consecutiveStreak ?? streakDays.filter((d) => d.studied).length
  const longestStreak = snapshot?.stats?.longestStreak ?? streakCount


  const toggleStreakDay = (dateIso: string, currentStudied: boolean) => {
    setCustomStudiedDates((prev) => ({
      ...prev,
      [dateIso]: !currentStudied,
    }))
    toast.success("Status de estudo do dia atualizado!")
  }

  const handlePrevStreakPeriod = () => {
    setStreakOffset((prev) => prev - 1)
  }

  const handleNextStreakPeriod = () => {
    setStreakOffset((prev) => (prev < 0 ? prev + 1 : 0))
  }

  // Citação do dia
  const [todayQuote] = useState(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
    const quoteIndex = dayOfYear % MOTIVATIONAL_QUOTES.length
    return MOTIVATIONAL_QUOTES[quoteIndex] || MOTIVATIONAL_QUOTES[0] || { quote: "Mantenha o foco", author: "Mentor Concursos" }
  })

  // Modal Lembretes
  const [reminders, setReminders] = useState<string[]>([])
  const [isLembreteModalOpen, setIsLembreteModalOpen] = useState(false)
  const [lembreteConteudo, setLembreteConteudo] = useState("")
  const [lembreteTipo, setLembreteTipo] = useState("Outros")
  const [lembreteData, setLembreteData] = useState("")
  const [lembreteHora, setLembreteHora] = useState("")

  const handleSaveLembrete = (e: React.FormEvent) => {
    e.preventDefault()
    if (!lembreteConteudo.trim()) {
      toast.error("Informe o conteúdo do lembrete.")
      return
    }

    const formatted = `${lembreteConteudo.trim()} ${lembreteData ? `(${lembreteData}${lembreteHora ? ` ${lembreteHora}` : ""})` : ""}`
    setReminders([formatted, ...reminders])
    toast.success("Novo lembrete salvo com sucesso!")
    setLembreteConteudo("")
    setLembreteData("")
    setLembreteHora("")
    setIsLembreteModalOpen(false)
  }

  const handleDisciplineClick = (discName: string) => {
    router.push(`/disciplines?name=${encodeURIComponent(discName)}`)
  }

  const formattedTodayDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date())
  const capitalizedDate = formattedTodayDate.charAt(0).toUpperCase() + formattedTodayDate.slice(1)

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header com Título Home e Botões do Topo (100% Estudei Imagem 1) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Home</h1>
          <p className="text-sm font-bold text-muted-foreground mt-0.5">
            Olá, <span className="text-[#2563EB]">{snapshot?.user?.name || userName || "Estudante"}</span>! Hoje é {capitalizedDate}. 👋 Bem-vindo de volta.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setIsRegisterModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs cursor-pointer"
          >
            Adicionar Estudo
          </Button>

          <TargetSelectorDropdown initialActiveTargetName={examName} />
        </div>
      </div>

      {/* 2. Grade de 4 Cards Métricos do Topo + Frase Motivacional */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TEMPO DE ESTUDO */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            TEMPO DE ESTUDO
          </span>
          <div className="text-right">
            <span className="text-2xl font-black text-foreground font-mono">
              {(() => {
                const mins = snapshot?.stats?.weeklyMinutes ?? 0
                const h = Math.floor(mins / 60)
                const m = mins % 60
                return `${h}h${m.toString().padStart(2, "0")}min`
              })()}
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
              <span className="text-emerald-600 block">{snapshot?.stats?.correctQuestions ?? 0} Acertos</span>
              <span className="text-rose-500 block">{snapshot?.stats?.wrongQuestions ?? 0} Erros</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">
              {(snapshot?.stats?.totalQuestions ?? 0) > 0 ? `${snapshot?.stats?.accuracyPercentage}%` : "—"}
            </span>
          </div>
        </div>

        {/* Card 3: PROGRESSO NO EDITAL */}
        <div className="rounded-xl border bg-card p-5 shadow-xs flex flex-col justify-between h-28">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            PROGRESSO NO EDITAL
          </span>
          <div className="flex items-end justify-between">
            <div className="text-[11px] font-bold space-y-0.5">
              <span className="text-emerald-600 block">{snapshot?.stats?.completedTopics ?? 0} Tópicos Concluídos</span>
              <span className="text-rose-500 block">{snapshot?.stats?.pendingTopics ?? 0} Tópicos Pendentes</span>
            </div>
            <span className="text-2xl font-black text-foreground font-mono">
              {snapshot?.stats?.editalProgress ?? 0}%
            </span>
          </div>
        </div>

        {/* Card 4: Frase Motivacional */}
        <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between italic text-xs text-muted-foreground">
          <p className="font-serif leading-relaxed text-foreground/90">
            &ldquo;{todayQuote.quote}&rdquo;
          </p>
          <span className="text-[10px] font-mono font-bold text-right text-[#2563EB] not-italic mt-1 block">
            — {todayQuote.author}
          </span>
        </div>
      </div>

      {/* 3. Card CONSTÂNCIA NOS ESTUDOS com Mensagem de Felicitação */}
      <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
              CONSTÂNCIA NOS ESTUDOS
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              Você está há <strong className="text-foreground">{streakCount} dias</strong> sem falhar! Seu recorde é de <strong className="text-foreground">{longestStreak} dias</strong> sem falhas. 🗓️
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-muted-foreground">
            <button
              type="button"
              onClick={handlePrevStreakPeriod}
              title="Período Anterior (30 dias)"
              className="p-1 rounded-md hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-[#2563EB] px-1">{formattedDateRange}</span>
            <button
              type="button"
              onClick={handleNextStreakPeriod}
              disabled={streakOffset === 0}
              title="Período Seguinte"
              className={`p-1 rounded-md transition-colors ${
                streakOffset === 0
                  ? "opacity-30 cursor-not-allowed text-muted-foreground"
                  : "hover:bg-muted hover:text-foreground cursor-pointer"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Heatmap de Quadradinhos Adaptativo por Tamanho de Tela */}
        <div className="w-full py-2">
          <div className="flex items-center justify-between gap-1 sm:gap-1.5 w-full">
            {streakDays.map((day, idx) => {
              // Exibe dinamicamente conforme a largura da tela sem corte nem transbordo:
              // Mobile (<640px): 10 dias (idx >= 20)
              // SM (640px+): 15 dias (idx >= 15)
              // MD (768px+): 20 dias (idx >= 10)
              // LG (1024px+): 25 dias (idx >= 5)
              // XL (1280px+): 30 dias (todos)
              let visibilityClass = "flex"
              if (idx < 5) visibilityClass = "hidden xl:flex"
              else if (idx < 10) visibilityClass = "hidden lg:flex"
              else if (idx < 15) visibilityClass = "hidden md:flex"
              else if (idx < 20) visibilityClass = "hidden sm:flex"

              return (
                <div key={day.id} className={`relative group cursor-pointer flex-1 justify-center ${visibilityClass}`}>
                  {/* Tooltip sem corte - Posicionado acima dos elementos */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none transition-all duration-200">
                    <div className="bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap">
                      {day.dayOfWeek}, {day.formattedDate}
                      {day.studied ? " (Estudado ✓)" : " (Não estudado)"}
                    </div>
                    <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900 -mt-0.5" />
                  </div>

                  <button
                    type="button"
                    title={`${day.dayOfWeek}, ${day.formattedDate}: ${day.studied ? "Estudado ✓" : "Não estudado"}`}
                    onClick={() => toggleStreakDay(day.dateIso, day.studied)}
                    className={`w-6 h-6 sm:w-6 sm:h-6 rounded-md transition-all flex items-center justify-center ${
                      day.studied
                        ? "bg-[#2563EB] text-white shadow-2xs hover:scale-110"
                        : "bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 hover:scale-105"
                    }`}
                  >
                    {day.studied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 3.B Visão Diária do Ciclo (Cronograma do Dia Destaque em cima do Painel) */}
      {homeCycleBlocks.length > 0 && (
        <div className="w-full rounded-2xl border bg-card p-4 sm:p-6 shadow-xs space-y-4">
          <DailyPlanningView blocks={homeCycleBlocks} />
        </div>
      )}

      {/* 4. Grid Parte A (PAINEL + 3 WIDGETS - Fotos 1 e 2 100% Estudei) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna da Esquerda (2/3 da largura): PAINEL DE DISCIPLINAS (Sua Foto 1 e 2) */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider block border-b pb-3">
            PAINEL
          </span>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b text-muted-foreground font-extrabold text-[11px]">
                  <th className="pb-3 px-3">Disciplinas</th>
                  <th className="pb-3 px-3 text-center">Tempo</th>
                  <th className="pb-3 px-3 text-center text-emerald-600">✔</th>
                  <th className="pb-3 px-3 text-center text-rose-500">✖</th>
                  <th className="pb-3 px-3 text-center">📝</th>
                  <th className="pb-3 px-3 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y font-semibold">
                {(!snapshot?.rawDisciplines || snapshot.rawDisciplines.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground font-semibold text-xs">
                      Nenhuma disciplina cadastrada. Gere um planejamento ou adicione manualmente.
                    </td>
                  </tr>
                ) : (
                  snapshot.rawDisciplines.map((disc: any, idx: number) => (
                  <tr
                    key={disc.id}
                    className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                      idx % 2 === 0 ? "bg-muted/10" : "bg-card"
                    }`}
                    onClick={() => handleDisciplineClick(disc.name)}
                  >
                    <td className="py-2.5 px-3 font-bold text-[#2563EB] hover:underline">{disc.name}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{disc.tempoFormatted}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-600">{disc.correctCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-rose-500">{disc.wrongCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{disc.notebookCount}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-extrabold">
                      {disc.accuracyPercentage > 0 ? (
                        <span className={disc.accuracyPercentage >= 70 ? "text-emerald-600" : "text-rose-500"}>
                          {disc.accuracyPercentage}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna da Direita (1/3 da largura): 3 WIDGETS (Fotos 1 e 2 100% Estudei) */}
        <div className="space-y-6">
          {/* Widget 1: DATA DA PROVA */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3 relative">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
                DATA DA PROVA
              </span>
              {examDateStr ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsExamModalOpen(true)}
                    title="Editar Prova"
                    className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteExam}
                    title="Excluir Prova"
                    className="text-muted-foreground hover:text-rose-500 p-1 rounded-md transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(true)}
                  title="Criar Prova"
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {daysRemaining !== null && examDateStr ? (
              <div className="space-y-3 pt-1">
                {/* Nome da Prova */}
                <div className="flex items-start gap-2">
                  <span className="text-sm">📅</span>
                  <div>
                    <h4 className="text-xs font-black text-foreground leading-tight">{examName}</h4>
                    {examLocation && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" /> {examLocation}
                      </p>
                    )}
                  </div>
                </div>

                {/* Data e Hora */}
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span>🗓️</span>
                  <span>
                    {formattedExamDate} {examTime ? `às ${examTime}` : ""}
                  </span>
                </div>

                {/* Contador Regressivo */}
                <div className="flex items-center gap-2">
                  <span className="text-sm">⏳</span>
                  <span className="text-xs font-extrabold text-[#2563EB] bg-[#2563EB]/10 px-2.5 py-1 rounded-lg">
                    {countdownLabel}
                  </span>
                </div>

                {/* Barra de Progresso do Cronograma / Edital */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-muted-foreground">Progresso do Edital</span>
                    <span className="text-foreground">{editalProgress}% concluído</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563EB] transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, editalProgress))}%` }}
                    />
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center justify-between pt-2 border-t text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setIsExamModalOpen(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" /> Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/planejamento")}
                    className="text-[#2563EB] hover:underline flex items-center gap-1"
                  >
                    Ver Planejamento <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  Acompanhe aqui quantos dias faltam para a sua prova!
                </p>
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(true)}
                  className="text-xs font-bold text-[#2563EB] underline block hover:text-[#1D4ED8] transition-colors"
                >
                  Criar Prova
                </button>
              </div>
            )}
          </div>

          {/* Widget 2: METAS DE ESTUDO SEMANAL */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4 relative">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
                METAS DE ESTUDO SEMANAL
              </span>
              <button 
                type="button" 
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setIsGoalsModalOpen(true)}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-4 pt-1">
              {/* Meta Horas de Estudo */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-muted-foreground">
                  <span>
                    {(() => {
                      const achievedMins = snapshot?.analytics?.goals?.weekly?.achieved ?? 0
                      const targetMins = snapshot?.analytics?.goals?.weekly?.target ?? 1200
                      const achH = Math.floor(achievedMins / 60)
                      const achM = achievedMins % 60
                      const tgtH = Math.floor(targetMins / 60)
                      const tgtM = targetMins % 60
                      return `${achH}h${achM.toString().padStart(2, "0")}min / ${tgtH}h${tgtM.toString().padStart(2, "0")}min`
                    })()}
                  </span>
                  <span className="font-sans font-semibold text-foreground">Horas</span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden relative flex items-center">
                  {(() => {
                    const hPct = snapshot?.analytics?.goals?.weekly?.percentage ?? 0
                    return (
                      <>
                        <div
                          className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                          style={{ width: `${hPct}%` }}
                        />
                        {hPct > 0 && (
                          <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black text-foreground z-10">
                            {hPct}%
                          </span>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Meta Questões */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-muted-foreground">
                  <span>
                    {snapshot?.analytics?.goals?.questions?.achieved ?? 0} / {snapshot?.analytics?.goals?.questions?.target ?? 100}
                  </span>
                  <span className="font-sans font-semibold text-foreground">Questões</span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden relative flex items-center">
                  {(() => {
                    const qPct = snapshot?.analytics?.goals?.questions?.percentage ?? 0
                    return (
                      <>
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${qPct}%` }}
                        />
                        <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black text-foreground z-10">
                          {qPct}%
                        </span>
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Meta Revisões */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-muted-foreground">
                  <span>
                    {snapshot?.analytics?.goals?.revisions?.achieved ?? 0} / {snapshot?.analytics?.goals?.revisions?.target ?? 5}
                  </span>
                  <span className="font-sans font-semibold text-foreground">Revisões</span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden relative flex items-center">
                  {(() => {
                    const rPct = snapshot?.analytics?.goals?.revisions?.percentage ?? 0
                    return (
                      <>
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${rPct}%` }}
                        />
                        <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black text-foreground z-10">
                          {rPct}%
                        </span>
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Meta Dias Ativos */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-muted-foreground">
                  <span>
                    {snapshot?.analytics?.goals?.studyDays?.achieved ?? 0} / {snapshot?.analytics?.goals?.studyDays?.target ?? 6}
                  </span>
                  <span className="font-sans font-semibold text-foreground">Dias Ativos</span>
                </div>
                <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden relative flex items-center">
                  {(() => {
                    const dPct = snapshot?.analytics?.goals?.studyDays?.percentage ?? 0
                    return (
                      <>
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-500"
                          style={{ width: `${dPct}%` }}
                        />
                        <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black text-foreground z-10">
                          {dPct}%
                        </span>
                      </>
                    )
                  })()}
                </div>
              </div>

            </div>
          </div>

          {/* Widget 3: ESTUDO SEMANAL */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
                ESTUDO SEMANAL
              </span>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                  <button type="button" className="p-0.5 hover:text-foreground cursor-pointer">
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span>Semana Atual</span>
                  <button type="button" className="p-0.5 hover:text-foreground cursor-pointer">
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                <Button className="bg-[#2563EB] text-white font-extrabold text-[10px] h-6 px-2.5 rounded-md cursor-pointer">
                  TEMPO
                </Button>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <div className="h-32 flex items-end justify-between gap-2 border-b pb-1 px-2">
                {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day, idx) => {
                  const ev = snapshot?.analytics?.evolution?.[idx]
                  let mins = ev?.value ?? 0
                  if (ev?.value === undefined) {
                    if (idx === 2 || idx === 4) {
                      mins = snapshot?.stats?.weeklyMinutes ? 60 : 0
                    }
                  }
                  const heightPct = mins > 0 ? Math.min(100, Math.max(10, Math.round((mins / 120) * 100))) : 4
                  const barClass = mins > 0 ? "bg-[#2563EB]" : "bg-muted/30"
                  return (
                    <div key={day} className="flex flex-col items-center flex-1 h-full justify-end">
                      <div
                        className={`w-full rounded-t-sm transition-all ${barClass}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground px-2">
                {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <p className="text-[10px] font-semibold text-muted-foreground pt-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-[#2563EB]" />
                Total Estudado: <strong>
                  {(() => {
                    const mins = snapshot?.stats?.weeklyMinutes ?? 0
                    const h = Math.floor(mins / 60)
                    const m = mins % 60
                    return `${h}h${m.toString().padStart(2, "0")}min`
                  })()}
                </strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Grid Parte B (REVISÕES, TEMPO DE ESTUDO, PLANEJAMENTO, LEMBRETES, ÚLTIMAS ATIVIDADES) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t">
        {/* Coluna Esquerda: REVISÕES + PLANEJAMENTO */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card REVISÕES */}
          <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                <div className="w-16 h-16 rounded-xl border-2 border-muted bg-muted/20 flex items-center justify-center">
                  <Search className="h-8 w-8 text-[#2563EB]" />
                </div>
              </div>

              <div className="text-center sm:text-left space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  REVISÕES
                </span>
                <h3 className="text-sm font-bold text-foreground">
                  {(snapshot?.reviews?.count ?? 0) > 0
                    ? `Você tem ${snapshot?.reviews?.count} revisão(ões) pendente(s) para hoje!`
                    : "Você não tem revisões agendadas para hoje."}
                </h3>
              </div>
            </div>

            <Button
              onClick={() => router.push("/revisoes")}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-10 rounded-xl shadow-xs shrink-0 cursor-pointer"
            >
              {(snapshot?.reviews?.count ?? 0) > 0 ? "Ver Revisões" : "Ir para Revisões"}
            </Button>
          </div>

          {/* Card PLANEJAMENTO */}
          <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <div className="w-20 h-20 bg-muted/30 border-2 border-muted rounded-xl p-2 flex flex-col gap-1">
                  <div className="w-full h-3 bg-[#2563EB]/30 rounded-xs" />
                  <div className="w-3/4 h-3 bg-rose-500/30 rounded-xs" />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  PLANEJAMENTO
                </span>
                <h3 className="text-base font-extrabold text-foreground">
                  {(snapshot?.todayPlanItems?.length ?? 0) > 0
                    ? `Você tem ${snapshot?.todayPlanItems?.length} item(ns) no seu plano de estudos de hoje.`
                    : "Ops, parece que você ainda não tem um planejamento para hoje."}
                </h3>
                <p className="text-xs text-muted-foreground font-medium">
                  {(snapshot?.todayPlanItems?.length ?? 0) > 0 ? "Continue firme nos estudos!" : "Vamos criar um plano?"}
                </p>
              </div>
            </div>

            <Button
              onClick={() => router.push("/planejamento")}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-10 rounded-xl shadow-xs shrink-0 cursor-pointer"
            >
              {(snapshot?.todayPlanItems?.length ?? 0) > 0 ? "Ver Planejamento" : "Criar Planejamento"}
            </Button>
          </div>
        </div>

        {/* Coluna Direita: TEMPO DE ESTUDO (Aba HOJE/SEMANA/MÊS/TOTAL) */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-6">
          <div className="space-y-4">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block border-b pb-3">
              TEMPO DE ESTUDO
            </span>

            <div className="flex items-center justify-between bg-muted p-1 rounded-lg text-[10px] font-bold">
              {(["HOJE", "SEMANA", "MES", "TOTAL"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setStudyPeriod(period)}
                  className={`flex-1 py-1 rounded-md transition-all uppercase cursor-pointer ${
                    studyPeriod === period
                      ? "bg-[#2563EB] text-white shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-36 h-36 rounded-full border-8 border-muted/40 bg-muted/10 flex items-center justify-center p-4">
                <Clock className="h-10 w-10 text-[#2563EB]/60" />
              </div>
              <h3 className="text-sm font-extrabold text-foreground">
                {(() => {
                  let mins = 0
                  if (studyPeriod === "HOJE") mins = snapshot?.stats?.dailyMinutes ?? 0
                  else if (studyPeriod === "SEMANA") mins = snapshot?.stats?.weeklyMinutes ?? 0
                  else mins = snapshot?.stats?.monthlyMinutes ?? 0

                  if (mins === 0) return "Você ainda não estudou no período selecionado."
                  const h = Math.floor(mins / 60)
                  const m = mins % 60
                  return `Tempo estudado: ${h}h${m.toString().padStart(2, "0")}min`
                })()}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Grid Parte C (LEMBRETES + ÚLTIMAS ATIVIDADES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Card LEMBRETES */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block border-b pb-3">
            LEMBRETES
          </span>

          {reminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 py-6">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-foreground">Você ainda não criou nenhum lembrete.</h4>
                <p className="text-xs text-muted-foreground font-medium max-w-xs">
                  Use este espaço para anotar coisas importantes: datas de inscrição, provas, boletos a pagar, aulas...
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 flex-1 max-h-40 overflow-y-auto">
              {reminders.map((rem, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-semibold p-2 bg-muted/30 rounded-lg">
                  <span className="truncate pr-2">{rem}</span>
                  <button
                    onClick={() => setReminders(reminders.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-rose-500 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setIsLembreteModalOpen(true)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 rounded-xl shadow-xs cursor-pointer"
            >
              Criar Lembrete
            </Button>
          </div>
        </div>

        {/* Card ÚLTIMAS ATIVIDADES */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
              ÚLTIMAS ATIVIDADES
            </span>

            <div className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground">
              <span className="text-foreground">REGISTROS</span>
              <div className="w-16 h-1 bg-[#2563EB] rounded-full" />
              <span className="text-muted-foreground">⏱ {snapshot?.stats?.weeklyMinutes ?? 0}m</span>
            </div>
          </div>

          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
            {(snapshot?.recentActivities?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground font-medium py-4 text-center">
                Nenhuma atividade registrada recentemente.
              </p>
            ) : (
              snapshot?.recentActivities?.map((act) => (
                <div key={act.id} className="border-l-2 border-[#2563EB] pl-3 py-1 space-y-0.5">
                  <h5 className="font-extrabold text-xs text-foreground uppercase">{act.discipline_name}</h5>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {act.subject_name || `Sessão de ${act.duration_minutes} min via ${act.study_source}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Registrar Estudo Manual */}
      <StudyRegisterModal
        open={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
      />

      {/* Modal Novo Lembrete */}
      <Dialog open={isLembreteModalOpen} onOpenChange={setIsLembreteModalOpen}>
        <DialogContent className="sm:max-w-xl p-6 rounded-2xl">
          <form onSubmit={handleSaveLembrete} className="space-y-6">
            <h2 className="text-2xl font-black text-foreground tracking-tight">Novo Lembrete</h2>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                CONTEÚDO*
              </label>
              <input
                type="text"
                value={lembreteConteudo}
                onChange={(e) => setLembreteConteudo(e.target.value)}
                placeholder=""
                required
                className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  TIPO*
                </label>
                <select
                  value={lembreteTipo}
                  onChange={(e) => setLembreteTipo(e.target.value)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none cursor-pointer"
                >
                  <option value="Outros">Outros</option>
                  <option value="Prova">Prova</option>
                  <option value="Inscrição">Inscrição</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Aula">Aula</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  DATA
                </label>
                <div className="flex items-center gap-1 border-b border-[#2563EB] pb-1">
                  <input
                    type="text"
                    placeholder="dd/mm/aaaa"
                    value={lembreteData}
                    onChange={(e) => setLembreteData(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-foreground focus:outline-none font-mono"
                  />
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  HORA
                </label>
                <div className="flex items-center gap-1 border-b border-[#2563EB] pb-1">
                  <input
                    type="text"
                    placeholder="--:--"
                    value={lembreteHora}
                    onChange={(e) => setLembreteHora(e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-foreground focus:outline-none font-mono"
                  />
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-[#dbeafe] hover:bg-[#2563EB] text-[#2563EB] hover:text-white font-bold text-xs px-8 h-9 rounded-xl transition-all shadow-xs"
              >
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Data da Prova */}
      <UserExamModal
        open={isExamModalOpen}
        onOpenChange={setIsExamModalOpen}
        initialData={snapshot?.activeTarget}
        defaultExamName={snapshot?.activeTarget?.target_exam}
      />
      <WeeklyGoalsModal 
        open={isGoalsModalOpen} 
        onOpenChange={setIsGoalsModalOpen} 
        profile={snapshot?.user ?? null} 
      />
    </div>
  )
}

