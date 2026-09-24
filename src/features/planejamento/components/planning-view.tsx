"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import {
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react"
import { Calendar, Target } from "lucide-react"
import { toast } from "sonner"

import { deactivateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { type CycleOverviewData } from "@/domain/study-plan/study-plan.types"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"

import { DailyPlanningView } from "./daily-planning-view"
import { PlanningGoalsProgressCard } from "./planning-goals-progress-card"
import { PlanningWizardModal } from "./planning-wizard-modal"
import { StudyCalendarView } from "./study-calendar-view"
import { WeeklyPlanningView } from "./weekly-planning-view"

export interface StudyCycleBlock {
  id: string
  disciplineName: string
  disciplineId: string
  durationMinutes: number
  studiedMinutes: number
  color: string
  completed: boolean
  priorityScore?: number
}

interface PlanningViewProps {
  initialData?: CycleOverviewData | null
}

export function PlanningView({ initialData }: PlanningViewProps) {
  const router = useRouter()
  const [hasPlanning, setHasPlanning] = useState(() =>
    Boolean(initialData && initialData.blocks && initialData.blocks.length > 0),
  )
  const [isRemovingPlan, setIsRemovingPlan] = useState(false)
  const [planningType, setPlanningType] = useState<
    "ciclo" | "diario" | "semanal" | "mensal" | "metas"
  >("ciclo")
  const [isManualCreation, setIsManualCreation] = useState(false)

  const [blocks, setBlocks] = useState<StudyCycleBlock[]>(() => {
    if (initialData?.blocks && initialData.blocks.length > 0) {
      return initialData.blocks.map((b) => ({
        id: b.id,
        disciplineName: b.disciplineName,
        disciplineId: b.disciplineId,
        durationMinutes: b.durationMinutes,
        studiedMinutes: (initialData?.history || []).reduce(
          (sum, h) => sum + (h.disciplineId === b.disciplineId ? h.minutes : 0),
          0,
        ),
        color: b.color || "#2563EB",
        completed: false, // Always start as pending, completed is calculated per-day by the view
        priorityScore: b.priorityScore ?? 3,
      }))
    }
    return []
  })
  const [showCompletedOnly, setShowCompletedOnly] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(() => blocks[0]?.id ?? null)

  // Sync state with server-side props
  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialData?.blocks && initialData.blocks.length > 0) {
        const historyData = initialData.history || []
        const nextBlocks = initialData.blocks.map((b) => ({
          id: b.id,
          disciplineName: b.disciplineName,
          disciplineId: b.disciplineId,
          durationMinutes: b.durationMinutes,
          studiedMinutes: historyData.reduce(
            (sum, h) => sum + (h.disciplineId === b.disciplineId ? h.minutes : 0),
            0,
          ),
          color: b.color || "#2563EB",
          completed: false,
          priorityScore: b.priorityScore ?? 3,
        }))
        setHasPlanning(true)
        setBlocks(nextBlocks)
        setActiveBlockId(nextBlocks[0]?.id ?? null)
      } else {
        setHasPlanning(false)
        setBlocks([])
        setActiveBlockId(null)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [initialData])

  // Modais
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isWizardModalOpen, setIsWizardModalOpen] = useState(false)
  const [wizardTitle, setWizardTitle] = useState("Criar planejamento")

  const openCreateWizard = () => {
    setWizardTitle("Criar planejamento")
    setIsWizardModalOpen(true)
  }

  const openEditWizard = () => {
    setWizardTitle("Editar planejamento")
    setIsWizardModalOpen(true)
  }

  // Modo de Edição da Tabela de Sequência
  const [isEditMode, setIsEditMode] = useState(false)

  // Cálculo de estatísticas do ciclo rotativo
  const totalMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const totalStudiedAllTime = blocks.reduce(
    (acc, b) => acc + b.studiedMinutes,
    0,
  )

  // Quantidade de ciclos completos realizados
  const completedCyclesCount =
    totalMinutes > 0 ? Math.floor(totalStudiedAllTime / totalMinutes) : 0

  // Minutos estudados na rodada atual do ciclo rotativo
  const currentRoundStudiedMinutes =
    totalMinutes > 0 ? totalStudiedAllTime % totalMinutes : totalStudiedAllTime

  // Porcentagem de progresso da rodada atual do ciclo (0% a 100%)
  const progressPercentage =
    totalMinutes > 0
      ? Math.min(100, Math.round((currentRoundStudiedMinutes / totalMinutes) * 100))
      : 0

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
    // Fase 6 (auditoria de Loading/UX): esta ação desativa todo o
    // planejamento do usuário, mas não tinha confirmação nem proteção contra
    // duplo clique — diferente de outras ações destrutivas do projeto
    // (ex.: excluir sessão em history-view.tsx), que já pedem confirmação.
    if (isRemovingPlan) return
    const confirmed = window.confirm(
      "Remover o planejamento atual?\nVocê pode criar um novo planejamento depois, mas o atual será desativado.",
    )
    if (!confirmed) return
    setIsRemovingPlan(true)
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
    } finally {
      setIsRemovingPlan(false)
    }
  }

  const handleStartStudy = (block: StudyCycleBlock) => {
    toast.success(`Iniciando sessão de estudo para ${block.disciplineName}!`)
    const targetDuration =
      block.durationMinutes > 0
        ? Math.max(1, block.durationMinutes - block.studiedMinutes)
        : block.durationMinutes
    router.push(`/dashboard/study-session?planId=${block.id}&duration=${targetDuration}`)
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
      <div className="space-y-4">
        {/* Redesign 2.0: antes havia dois "cards de escolha" ("Nomeia
            Inteligente" / "Criar manualmente") que abriam exatamente o mesmo
            assistente. Agora é um estado vazio com uma única ação. */}
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Calendar}
            title="Nenhum planejamento criado"
            description="O assistente monta a distribuição semanal a partir do seu perfil, escala de trabalho e carga horária. Leva cerca de 2 minutos, e tudo pode ser ajustado depois."
            action={
              <Button onClick={openCreateWizard}>
                Criar planejamento
              </Button>
            }
          />
        </div>

        {/* Modal Assistente 4 Passos Criar Planejamento */}
        <PlanningWizardModal
          open={isWizardModalOpen}
          onOpenChange={setIsWizardModalOpen}
          mode="create"
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
      {/* Redesign 2.0: o título da página já está no cabeçalho fixo
          (app/(protected)/planejamento/page.tsx); aqui fica só a barra de
          visões + ações, sem um segundo H1. */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-border pb-3">
        <div role="tablist" aria-label="Visões do planejamento" className="flex items-center gap-0.5 p-0.5 bg-muted rounded-md w-fit flex-wrap">
        <button
          onClick={() => setPlanningType("ciclo")}
          role="tab"
          aria-selected={planningType === "ciclo"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[13px] font-medium transition-colors ${
            planningType === "ciclo"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Ciclo
        </button>

        <button
          onClick={() => setPlanningType("diario")}
          role="tab"
          aria-selected={planningType === "diario"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[13px] font-medium transition-colors ${
            planningType === "diario"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Dia
        </button>

        <button
          onClick={() => setPlanningType("semanal")}
          role="tab"
          aria-selected={planningType === "semanal"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[13px] font-medium transition-colors ${
            planningType === "semanal"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Semana
        </button>

        <button
          onClick={() => setPlanningType("mensal")}
          role="tab"
          aria-selected={planningType === "mensal"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[13px] font-medium transition-colors ${
            planningType === "mensal"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Mês
        </button>

        <button
          onClick={() => setPlanningType("metas")}
          role="tab"
          aria-selected={planningType === "metas"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[13px] font-medium transition-colors ${
            planningType === "metas"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          Metas e horas
        </button>
              </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isManualCreation || blocks.length === 0 ? (
            <Button
              onClick={handleSaveChanges}
            >
              Salvar planejamento
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleResetCycle}
              >
                Recomeçar ciclo
              </Button>

              <Button
                onClick={openEditWizard}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Replanejar
              </Button>

              <Button
                variant="outline"
                onClick={handleRemovePlan}
                disabled={isRemovingPlan}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {isRemovingPlan ? "Removendo..." : "Remover"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Render selected view */}
      {planningType === "diario" && (
        <DailyPlanningView
          blocks={blocks}
          history={initialData?.history || []}
          onSwitchToCiclo={() => setPlanningType("ciclo")}
          onReplan={openEditWizard}
        />
      )}

      {planningType === "semanal" && (
        <WeeklyPlanningView
          blocks={blocks}
          history={initialData?.history || []}
          onReplan={openEditWizard}
          onRemove={handleRemovePlan}
        />
      )}

      {planningType === "mensal" && <StudyCalendarView blocks={blocks} onReplan={openEditWizard} />}

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
          <div className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] border-y border-border sm:divide-x divide-border">
            <div className="px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Ciclos completos
              </span>
              <p className="text-xl font-semibold text-foreground tabular-nums mt-0.5">
                {completedCyclesCount}
              </p>
            </div>

            <div className="px-4 py-3 flex flex-col justify-center space-y-2 border-t sm:border-t-0 border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Progresso da rodada {completedCyclesCount + 1}
                </span>
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {formatHoursMinutes(currentRoundStudiedMinutes)} / {formatHoursMinutes(totalMinutes)} ({progressPercentage}%)
                </span>
              </div>

              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Layout de Duas Colunas: Sequência dos Estudos (Esq) + Donut (Dir) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h2 className="text-[13px] font-semibold text-foreground">
                  Sequência dos estudos
                </h2>

                <button
                  onClick={() => setShowCompletedOnly(!showCompletedOnly)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold transition-colors"
                >
                  {showCompletedOnly ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  <span>Ver finalizados</span>
                </button>
              </div>

              {(() => {
                if (blocks.length === 0) {
                  return (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Nenhuma disciplina neste planejamento.
                      </p>
                      <Button
                        onClick={handleAddDisciplineRow}
                        size="sm"
                      >
                        Adicionar matéria
                      </Button>
                    </div>
                  )
                }

                return (
                  /* VISTA DE LEITURA (Modo Padrão) */
                  <div className="divide-y divide-border max-h-[420px] overflow-y-auto pr-1">
                    {visibleBlocks.map((block) => {
                      const isSelected = activeBlockId === block.id
                      const blockCycleTarget = block.durationMinutes
                      const blockRoundStudied = Math.max(
                        0,
                        block.studiedMinutes - completedCyclesCount * blockCycleTarget,
                      )
                      const progressPct =
                        blockCycleTarget > 0
                          ? (blockRoundStudied / blockCycleTarget) * 100
                          : 0
                      const isCompleted = progressPct >= 100
                      const remaining = blockCycleTarget - blockRoundStudied
                      const isOver = remaining < 0

                      return (
                        <div
                          key={block.id}
                          onMouseEnter={() => setActiveBlockId(block.id)}
                          className={`border-l-2 transition-colors ${
                            isSelected
                              ? "bg-primary/[0.04] border-l-primary"
                              : "border-l-transparent hover:bg-muted/30"
                          }`}
                        >
                          <div className="px-3 py-3 cursor-pointer space-y-2">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <h4 className="font-semibold text-sm text-foreground">
                                  {block.disciplineName}
                                </h4>
                                <div className="flex items-center gap-2 text-xs tabular-nums">
                                  {isOver ? (
                                    <span className="text-foreground">
                                      Extra: {formatHoursMinutes(Math.abs(remaining))}
                                    </span>
                                  ) : remaining === 0 ? (
                                    <span className="text-success inline-flex items-center gap-1">
                                      <Check className="h-3.5 w-3.5" /> Concluído nesta rodada
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Falta: {formatHoursMinutes(remaining)}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground">
                                    · Meta: {formatHoursMinutes(block.durationMinutes)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span
                                  className={`text-[13px] font-medium tabular-nums ${isCompleted ? "text-success" : "text-foreground"}`}
                                >
                                  {Math.min(100, progressPct).toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            <div className="w-full bg-muted rounded-full h-1 overflow-hidden relative">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${isCompleted ? "bg-success" : "bg-primary"}`}
                                style={{
                                  width: `${Math.min(progressPct, 100)}%`,
                                  backgroundColor: isCompleted ? undefined : block.color,
                                }}
                              />
                            </div>
                          </div>

                          {isSelected && (
                            <div className="flex items-center gap-4 px-3 pb-3 text-xs text-muted-foreground">
                              <button
                                onClick={() => handleStartStudy(block)}
                                className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
                              >
                                <PlayCircle className="h-3.5 w-3.5 text-primary" />
                                <span>Iniciar estudo</span>
                              </button>

                              <button
                                onClick={() => setIsRegisterModalOpen(true)}
                                className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
                              >
                                <PlusCircle className="h-3.5 w-3.5 text-primary" />
                                <span>Registrar manualmente</span>
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
                    onClick={openEditWizard}
                    variant="outline"
                  >
                    Editar ciclo
                  </Button>
                </div>
              )}
            </div>

            {/* Coluna Direita: CICLO */}
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between items-center text-center space-y-4">
              <span className="text-[13px] font-semibold text-foreground block border-b border-border pb-2.5 w-full text-left">
                Distribuição do ciclo
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
                      <span className="text-2xl font-semibold text-foreground tracking-tight">
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
      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />

      {/* Modal Assistente 4 Passos Editar Planejamento */}
      <PlanningWizardModal
        open={isWizardModalOpen}
        onOpenChange={setIsWizardModalOpen}
        mode="edit"
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
