"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  RotateCcw,
  RefreshCw,
  Clock,
  CheckSquare,
  Square,
  PlayCircle,
  PlusCircle,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { toast } from "sonner"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { EditPlanningWizardModal } from "./edit-planning-wizard-modal"
import { WeeklyPlanningView } from "./weekly-planning-view"
import { DailyPlanningView } from "./daily-planning-view"
import { StudyCalendarView } from "./study-calendar-view"
import { AiPlanningWizard } from "./ai-planning-wizard"
import { Sparkles, Settings2, BrainCircuit, Bot, Calendar, LayoutGrid, Target } from "lucide-react"
import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import { deactivateStudyPlanAction, generateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"

export interface StudyCycleBlock {
  id: string
  disciplineName: string
  disciplineId: string
  durationMinutes: number
  studiedMinutes: number
  color: string
  completed: boolean
}

const DISCIPLINES_OPTIONS = [
  "Direito Tributário",
  "Raciocínio Lógico",
  "Língua Portuguesa",
  "Direito Administrativo",
  "Direito Constitucional",
  "Contabilidade Geral",
  "Fluência em Dados",
  "Legislação Aduaneira",
  "Legislação Tributária",
  "Estatística",
  "Administração Geral",
  "Administração Pública",
]

const COLOR_PALETTE = [
  "#a78bfa", "#4ade80", "#f87171", "#fb923c", "#60a5fa",
  "#c084fc", "#38bdf8", "#facc15", "#dbeafe", "#fce7f3",
]

interface EstudeiPlanningViewProps {
  initialData?: CycleOverviewData | null
}

import { PlanningGoalsProgressCard } from "./planning-goals-progress-card"

export function EstudeiPlanningView({ initialData }: EstudeiPlanningViewProps) {
  const router = useRouter()
  const [hasPlanning, setHasPlanning] = useState(() => Boolean(initialData && initialData.blocks && initialData.blocks.length > 0))
  const [planningType, setPlanningType] = useState<"ciclo" | "diario" | "semanal" | "mensal" | "metas">("ciclo")
  const [isManualCreation, setIsManualCreation] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // Sync state with server-side props
  useEffect(() => {
    if (initialData?.blocks && initialData.blocks.length > 0) {
      const historyData = initialData?.history || []
      setHasPlanning(true)
      setBlocks(initialData.blocks.map((b) => ({
        id: b.id,
        disciplineName: b.disciplineName,
        disciplineId: b.disciplineId,
        durationMinutes: b.durationMinutes,
        studiedMinutes: historyData.reduce((sum, h) => sum + (h.disciplineId === b.disciplineId ? h.minutes : 0), 0),
        color: b.color || "#2563EB",
        completed: false, // Always start as pending, completed is calculated per-day by the view
      })))
      if (initialData.blocks[0]) {
        setActiveBlockId(initialData.blocks[0].id)
      }
    } else {
      setHasPlanning(false)
      setBlocks([])
    }
  }, [initialData])

  const [blocks, setBlocks] = useState<StudyCycleBlock[]>(() => {
    if (initialData?.blocks && initialData.blocks.length > 0) {
      return initialData.blocks.map((b) => ({
        id: b.id,
        disciplineName: b.disciplineName,
        disciplineId: b.disciplineId,
        durationMinutes: b.durationMinutes,
        studiedMinutes: (initialData?.history || []).reduce((sum, h) => sum + (h.disciplineId === b.disciplineId ? h.minutes : 0), 0),
        color: b.color || "#2563EB",
        completed: false, // Always start as pending, completed is calculated per-day by the view
      }))
    }
    return []
  })
  const [completedCyclesCount] = useState(0)
  const [showCompletedOnly, setShowCompletedOnly] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(() => (blocks[0]?.id ? blocks[0].id : null))

  // Modais
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false)
  const [isManualChoiceModalOpen, setIsManualChoiceModalOpen] = useState(false)
  const [isWizardModalOpen, setIsWizardModalOpen] = useState(false)
  const [wizardTitle, setWizardTitle] = useState("Criar Planejamento")

  // Modo de Edição da Tabela de Sequência
  const [isEditMode, setIsEditMode] = useState(false)

  // Cálculo de estatísticas
  const totalMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const studiedMinutes = blocks.reduce((acc, b) => acc + b.studiedMinutes + (b.completed ? b.durationMinutes : 0), 0)
  const progressPercentage = totalMinutes > 0 ? Math.min(100, Math.round((studiedMinutes / totalMinutes) * 100)) : 0

  const formatHoursMinutes = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h00min`
    return `${h}h${m < 10 ? "0" : ""}${m}min`
  }

  const handleResetCycle = () => {
    setBlocks(blocks.map((b) => ({ ...b, studiedMinutes: 0, completed: false })))
    toast.success("Ciclo recomeçado do zero!")
  }

  const handleRemovePlan = async () => {
    try {
      const res = await deactivateStudyPlanAction()
      if (res.success) {
        setHasPlanning(false)
        setBlocks([])
        toast.success("Planejamento desativado com sucesso!")
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao remover planejamento.")
      }
    } catch {
      toast.error("Erro de conexão ao desativar o planejamento.")
    }
  }



  const handleStartStudy = (block: StudyCycleBlock) => {
    toast.success(`Iniciando sessão de estudo para ${block.disciplineName}!`)
    router.push(`/dashboard/study-session?planId=${block.id}`)
  }

  const handleUpdateBlockDiscipline = (id: string, newDiscipline: string) => {
    const colorIndex = DISCIPLINES_OPTIONS.indexOf(newDiscipline) % COLOR_PALETTE.length
    const newColor = COLOR_PALETTE[colorIndex >= 0 ? colorIndex : 0] || "#2563EB"
    setBlocks(
      blocks.map((b) => (b.id === id ? { ...b, disciplineName: newDiscipline, color: newColor } : b))
    )
  }

  const handleUpdateBlockMinutes = (id: string, newMinutes: number) => {
    setBlocks(
      blocks.map((b) => (b.id === id ? { ...b, durationMinutes: Math.max(5, newMinutes) } : b))
    )
  }

  const handleDuplicateBlock = (index: number) => {
    const target = blocks[index]
    if (!target) return
    const duplicatedBlock: StudyCycleBlock = {
      id: `cb-${Math.random().toString(36).substring(2, 9)}`,
      disciplineName: target.disciplineName,
      disciplineId: target.disciplineId,
      durationMinutes: target.durationMinutes,
      studiedMinutes: 0,
      color: target.color,
      completed: false,
    }
    const updated = [...blocks]
    updated.splice(index + 1, 0, duplicatedBlock)
    setBlocks(updated)
    toast.success(`Disciplina "${target.disciplineName}" duplicada.`)
  }

  const handleRemoveBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id))
    toast.success("Disciplina removida do ciclo.")
  }

  const handleAddDisciplineRow = () => {
    const newBlock: StudyCycleBlock = {
      id: `cb-${Math.random().toString(36).substring(2, 9)}`,
      disciplineName: "Selecione...",
      disciplineId: "",
      durationMinutes: 60,
      studiedMinutes: 0,
      color: "#2563EB",
      completed: false,
    }
    setBlocks([...blocks, newBlock])
    toast.success("Nova linha adicionada ao planejamento!")
  }

  const handleSaveChanges = () => {
    if (blocks.length === 0) {
      toast.error("Adicione ao menos uma disciplina antes de salvar.")
      return
    }
    setIsEditMode(false)
    setIsManualCreation(false)
    setHasPlanning(true)
    toast.success("Planejamento salvo com sucesso!")
  }

  const visibleBlocks = showCompletedOnly ? blocks.filter((b) => b.completed) : blocks

  // Donut Segments SVG (puro, sem mutações)
  const donutSegments = blocks.map((block, idx) => {
    const previousMinutes = blocks.slice(0, idx).reduce((acc, b) => acc + b.durationMinutes, 0)
    const startAngle = (previousMinutes / (totalMinutes || 1)) * 360
    const portion = block.durationMinutes / (totalMinutes || 1)
    const angle = portion * 360

    const radius = 80
    const center = 100
    const x1 = (center + radius * Math.cos((Math.PI * (startAngle - 90)) / 180)).toFixed(4)
    const y1 = (center + radius * Math.sin((Math.PI * (startAngle - 90)) / 180)).toFixed(4)
    const x2 = (center + radius * Math.cos((Math.PI * (startAngle + angle - 90)) / 180)).toFixed(4)
    const y2 = (center + radius * Math.sin((Math.PI * (startAngle + angle - 90)) / 180)).toFixed(4)
    const largeArc = angle > 180 ? 1 : 0

    return {
      id: block.id,
      name: block.disciplineName,
      color: block.color,
      path: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
    }
  })

  // VISTA 1: SEM PLANEJAMENTO
  if (!hasPlanning && !isManualCreation) {
    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-black text-foreground">Planejamento</h1>
        </div>

        <div className="min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-card rounded-2xl border shadow-xs space-y-12 my-4">
          
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center justify-center gap-3 text-[#2563EB] mb-2">
              <BrainCircuit className="w-8 h-8" />
              <h2 className="text-2xl font-black">Criar Planejamento Inteligente</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vamos montar um planejamento completo para você. Escolha uma opção abaixo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
            {/* AI Option */}
            <div 
              onClick={() => {
                setWizardTitle("Criar Planejamento com IA")
                setIsWizardModalOpen(true)
              }}
              className="bg-card border-2 border-[#2563EB]/20 hover:border-[#2563EB] rounded-3xl p-8 flex flex-col items-center text-center space-y-6 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-500/10 group"
            >
              <div className="w-16 h-16 bg-[#2563EB]/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Bot className="w-8 h-8 text-[#2563EB]" />
              </div>
              <div className="space-y-3 flex-1">
                <h3 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
                  Mentor IA <Sparkles className="w-4 h-4 text-[#2563EB]" />
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O Mentor monta todo o seu planejamento automaticamente com base no seu perfil, escala de trabalho e carga horária.
                </p>
                <div className="inline-flex items-center text-[10px] font-bold text-[#2563EB] bg-[#2563EB]/10 px-2 py-1 rounded-full uppercase tracking-wider">
                  Tempo: ~2 minutos
                </div>
              </div>
              <Button className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold h-12 rounded-xl">
                Começar com IA
              </Button>
            </div>

            {/* Manual Option */}
            <div 
              onClick={() => {
                setWizardTitle("Criar Planejamento Manual")
                setIsWizardModalOpen(true)
              }}
              className="bg-card border-2 border-muted hover:border-foreground/30 rounded-3xl p-8 flex flex-col items-center text-center space-y-6 cursor-pointer transition-all hover:shadow-md group"
            >
              <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Settings2 className="w-8 h-8 text-foreground/70" />
              </div>
              <div className="space-y-3 flex-1">
                <h3 className="text-lg font-bold text-foreground">
                  Criar Manualmente
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Monte disciplina por disciplina, configurando sua escala e relevâncias em 4 passos.
                </p>
                <div className="inline-flex items-center text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-wider">
                  Para Usuários Avançados
                </div>
              </div>
              <Button variant="outline" className="w-full border-2 h-12 font-bold rounded-xl text-foreground hover:bg-muted">
                Criar Manualmente
              </Button>
            </div>
          </div>
        </div>

        {/* Wizard Modal */}
        <AiPlanningWizard 
          open={isChoiceModalOpen} 
          onOpenChange={setIsChoiceModalOpen}
          onSuccess={() => {
            // Apenas aciona um router refresh pra view buscar dados novos
            // e o useEffect cuidará da tela de carregamento/sucesso
            router.refresh()
          }}
        />

        {/* Modal 2: Escolha Manual (Ciclo de Estudos vs Planejamento Semanal - Sua Foto 2) */}
        <Dialog open={isManualChoiceModalOpen} onOpenChange={setIsManualChoiceModalOpen}>
          <DialogContent className="sm:max-w-xl p-6 rounded-2xl">
            <div className="space-y-6">
              <div className="space-y-1 text-center">
                <h2 className="text-2xl font-black text-foreground tracking-tight">Criar Planejamento</h2>
                <p className="text-xs font-semibold text-muted-foreground">
                  Para iniciar o seu planejamento, escolha a melhor forma de visualização para você:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Opção 1: Ciclo de Estudos */}
                <div
                  onClick={() => {
                    setIsManualChoiceModalOpen(false)
                    setPlanningType("ciclo")
                    setIsManualCreation(true)
                    setHasPlanning(true)
                    setBlocks([])
                  }}
                  className="rounded-2xl border-2 border-muted bg-card hover:border-[#2563EB] p-6 cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-4 shadow-xs"
                >
                  <div className="w-16 h-16 rounded-2xl text-[#2563EB] flex items-center justify-center">
                    <RotateCcw className="h-12 w-12 stroke-[2]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-sm text-foreground">Ciclo de Estudos</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Estude as disciplinas em uma ordem rotativa, sem depender de dias fixos. Ideal para quem precisa de flexibilidade na rotina.
                    </p>
                  </div>
                </div>

                {/* Opção 2: Planejamento Semanal */}
                <div
                  onClick={() => {
                    setIsManualChoiceModalOpen(false)
                    setPlanningType("semanal")
                    setIsManualCreation(false)
                    setHasPlanning(true)
                  }}
                  className="rounded-2xl border-2 border-muted bg-card hover:border-[#2563EB] p-6 cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-4 shadow-xs"
                >
                  <div className="w-16 h-16 rounded-2xl text-emerald-500 flex items-center justify-center">
                    <CalendarDays className="h-12 w-12 stroke-[2]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-sm text-foreground">Planejamento Semanal</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Define quais matérias estudar em cada dia da semana. Ótimo para quem prefere uma rotina fixa e estruturada.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Assistente 4 Passos Criar Planejamento */}
        <EditPlanningWizardModal
          open={isWizardModalOpen}
          onOpenChange={setIsWizardModalOpen}
          modalTitle={wizardTitle}
          onComplete={() => {
            setHasPlanning(true)
            router.refresh()
          }}
        />
      </div>
    )
  }



  // VISTA 2.B: CICLO DE ESTUDOS (Modo Criar Manual / Populado)
  return (
    <div className="space-y-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Planejamento</h1>
          <p className="text-xs text-muted-foreground font-semibold">
            Gerencie e acompanhe seu cronograma de estudos diário, semanal e mensal.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isManualCreation || blocks.length === 0 ? (
            <Button
              onClick={handleSaveChanges}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 rounded-xl shadow-xs"
            >
              Salvar Planejamento
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleResetCycle}
                className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-4 h-9"
              >
                Recomeçar Ciclo
              </Button>

              <Button
                onClick={() => {
                  setWizardTitle("Editar Planejamento")
                  setIsWizardModalOpen(true)
                }}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-4 h-9 shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Replanejar
              </Button>

              <Button
                variant="outline"
                onClick={handleRemovePlan}
                className="border-rose-400 text-rose-500 hover:bg-rose-50 font-bold text-xs px-4 h-9"
              >
                Remover
              </Button>
            </>
          )}
        </div>
      </div>

      {/* View Switcher Tabs (Ciclo, Diário, Semanal, Calendário Mensal) */}
      <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl border w-fit flex-wrap">
        <button
          onClick={() => setPlanningType("ciclo")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
            planningType === "ciclo"
              ? "bg-card text-primary shadow-xs border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Ciclo Rotativo
        </button>

        <button
          onClick={() => setPlanningType("diario")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
            planningType === "diario"
              ? "bg-card text-primary shadow-xs border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Visão Diária
        </button>

        <button
          onClick={() => setPlanningType("semanal")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
            planningType === "semanal"
              ? "bg-card text-primary shadow-xs border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Agenda Semanal
        </button>

        <button
          onClick={() => setPlanningType("mensal")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
            planningType === "mensal"
              ? "bg-card text-primary shadow-xs border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Calendário Mensal
        </button>

        <button
          onClick={() => setPlanningType("metas")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
            planningType === "metas"
              ? "bg-card text-primary shadow-xs border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          Metas & Horas
        </button>
      </div>

      {/* Render selected view */}
      {planningType === "diario" && (
        <DailyPlanningView
          blocks={blocks}
          history={initialData?.history || []}
          onSwitchToCiclo={() => setPlanningType("ciclo")}
          onReplan={() => {
            setWizardTitle("Editar Planejamento")
            setIsWizardModalOpen(true)
          }}
        />
      )}

      {planningType === "semanal" && (
        <WeeklyPlanningView
          blocks={blocks}
          history={initialData?.history || []}
          onReplan={() => {
            setWizardTitle("Editar Planejamento")
            setIsWizardModalOpen(true)
          }}
          onRemove={handleRemovePlan}
        />
      )}

      {planningType === "mensal" && (
        <StudyCalendarView
          blocks={blocks}
          onReplan={() => {
            setWizardTitle("Editar Planejamento")
            setIsWizardModalOpen(true)
          }}
        />
      )}

      {planningType === "metas" && (
        <PlanningGoalsProgressCard
          blocks={blocks}
          onStartSession={(id) => {
            setActiveBlockId(id)
            setIsRegisterModalOpen(true)
          }}
        />
      )}

      {planningType === "ciclo" && (
        <div className="space-y-6">
          {/* Top Metrics Cards: Ciclos Completos + Progresso */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="rounded-xl border bg-card p-5 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
                CICLOS COMPLETOS
              </span>

              <div className="py-2 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border-4 border-[#2563EB] flex items-center justify-center text-xl font-black text-[#2563EB] shadow-sm">
                  {completedCyclesCount}
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 rounded-xl border bg-card p-5 shadow-sm flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
                  PROGRESSO
                </span>
                <span className="text-xs font-bold text-foreground">
                  {formatHoursMinutes(studiedMinutes)} / {formatHoursMinutes(totalMinutes)}
                </span>
              </div>

              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-[#2563EB] rounded-full transition-all duration-700"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Layout de Duas Colunas: Sequência dos Estudos (Esq) + Donut (Dir) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                  SEQUÊNCIA DOS ESTUDOS
                </span>

                <button
                  onClick={() => setShowCompletedOnly(!showCompletedOnly)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold transition-colors"
                >
                  {showCompletedOnly ? (
                    <CheckSquare className="h-4 w-4 text-[#2563EB]" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  <span>VER FINALIZADOS</span>
                </button>
              </div>

              {(() => {
                if (blocks.length === 0) {
                  return (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Nenhuma disciplina cadastrada neste planejamento.
                      </p>
                      <Button
                        onClick={handleAddDisciplineRow}
                        className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xl shadow-xs"
                      >
                        Adicionar Matéria
                      </Button>
                    </div>
                  )
                }

            return (
              /* VISTA DE LEITURA (Modo Padrão) */
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2 pb-10">
              {visibleBlocks.map((block) => {
                const isSelected = activeBlockId === block.id
                const progressPct = block.durationMinutes > 0 ? (block.studiedMinutes / block.durationMinutes) * 100 : 0
                const isCompleted = progressPct >= 100
                const remaining = block.durationMinutes - block.studiedMinutes
                const isOver = remaining < 0

                return (
                  <div
                    key={block.id}
                    onMouseEnter={() => setActiveBlockId(block.id)}
                    className={`rounded-xl border transition-all ${
                      isSelected
                        ? "bg-card border-[#2563EB] shadow-md ring-2 ring-[#2563EB]/10 scale-[1.01]"
                        : "bg-card border-border hover:border-[#2563EB]/50"
                    }`}
                  >
                    <div className="p-4 cursor-pointer space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="font-black text-sm text-foreground">{block.disciplineName}</h4>
                          <div className="flex items-center gap-2 text-[11px] font-bold">
                            {isOver ? (
                              <span className="text-emerald-500">Extra: {formatHoursMinutes(Math.abs(remaining))}</span>
                            ) : (
                              <span className="text-orange-500">Falta: {formatHoursMinutes(remaining)}</span>
                            )}
                            <span className="text-muted-foreground">- Meta: {formatHoursMinutes(block.durationMinutes)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-black ${isCompleted ? 'text-emerald-500' : 'text-[#2563EB]'}`}>
                            {progressPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-muted rounded-full h-3 overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${isCompleted ? 'bg-emerald-500' : 'bg-[#2563EB]'}`}
                          style={{ width: `${Math.min(progressPct, 100)}%`, backgroundColor: isCompleted ? undefined : block.color }}
                        />
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/40 border-t text-[11px] font-bold text-muted-foreground">
                        <button
                          onClick={() => handleStartStudy(block)}
                          className="flex items-center gap-1 text-slate-800 dark:text-slate-200 hover:text-[#2563EB] transition-colors"
                        >
                          <PlayCircle className="h-3.5 w-3.5 text-[#2563EB]" />
                          <span>Iniciar Estudo</span>
                        </button>

                        <button
                          onClick={() => setIsRegisterModalOpen(true)}
                          className="flex items-center gap-1 text-slate-800 dark:text-slate-200 hover:text-[#2563EB] transition-colors"
                        >
                          <PlusCircle className="h-3.5 w-3.5 text-[#2563EB]" />
                          <span>Adicionar Estudo Manualmente</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            )
          })()}

          {!isEditMode && !isManualCreation && blocks.length > 0 && (
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  setWizardTitle("Editar Planejamento")
                  setIsWizardModalOpen(true)
                }}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 h-9 rounded-xl shadow-xs"
              >
                Editar Ciclo
              </Button>
            </div>
          )}
        </div>

        {/* Coluna Direita: CICLO */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between items-center text-center space-y-6">
          <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider block border-b pb-3 w-full text-left">
            CICLO
          </span>

          {blocks.length === 0 ? (
            <div className="my-auto py-16 text-muted-foreground text-xs font-semibold">
              Nenhuma disciplina no ciclo
            </div>
          ) : (
            <>
              <div className="relative w-64 h-64 flex items-center justify-center my-auto">
                <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                  {donutSegments.map((seg) => (
                    <path
                      key={seg.id}
                      d={seg.path}
                      fill={seg.color}
                      className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                    />
                  ))}
                  <circle cx="100" cy="100" r="60" className="fill-card" />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-foreground tracking-tight">
                    {formatHoursMinutes(totalMinutes)}
                  </span>
                </div>
              </div>

              <div className="w-full h-3 rounded-full overflow-hidden flex">
                {blocks.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      width: `${(b.durationMinutes / (totalMinutes || 1)) * 100}%`,
                      backgroundColor: b.color,
                    }}
                    className="h-full"
                    title={`${b.disciplineName}: ${b.durationMinutes}min`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Card de Metas & Progresso por Período (Semana / Mês / Ano / Total) */}
      <PlanningGoalsProgressCard
        blocks={blocks}
        onStartSession={(id) => {
          setActiveBlockId(id)
          setIsRegisterModalOpen(true)
        }}
      />
    </div>
  )}

      {/* Modal Registrar Estudo Manual */}
      <StudyRegisterModal
        open={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
      />

      {/* Modal Assistente 4 Passos Editar Planejamento */}
      <EditPlanningWizardModal
        open={isWizardModalOpen}
        onOpenChange={setIsWizardModalOpen}
        modalTitle={wizardTitle}
        initialBlocks={blocks}
        onComplete={() => {
          setHasPlanning(true)
          setIsManualCreation(false)
          router.refresh()
        }}
      />
    </div>
  )
}

