"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useRouter } from "next/navigation"

import {
  Archive,
  ArrowLeft,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  type DisciplineDetailStats,
  getDisciplineCatalogTopicsAction,
  getDisciplineDetailStatsAction,
} from "@/application/disciplines/discipline-actions"
import {
  type PlanCardData,
  type PlanDisciplineSummary,
  activatePlanAction,
  deletePlanAction,
  duplicatePlanAction,
  listPlansAction,
  togglePausePlanAction,
} from "@/application/study-plan/list-plans.action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import type { PlanStatus, PlanType } from "@/domain/study-plan/study-plan.types"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import { DisciplineDetailView } from "@/features/disciplines/components/estudei-discipline-detail-view"

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h <= 0) return `${m}min`
  return `${h}h${m.toString().padStart(2, "0")}min`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("pt-BR")
}

function planTypeLabel(type: PlanType | null): string {
  if (type === "CICLO_ROTATIVO") return "Ciclo Rotativo"
  if (type === "CRONOGRAMA_SEMANAL") return "Cronograma Semanal"
  return "Plano"
}

function statusBadge(status: PlanStatus) {
  switch (status) {
    case "ACTIVE":
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] uppercase px-2 h-5">
          Ativo
        </Badge>
      )
    case "PAUSED":
      return (
        <Badge
          variant="outline"
          className="text-amber-600 border-amber-600 font-bold text-[10px] uppercase px-2 h-5"
        >
          Pausado
        </Badge>
      )
    case "ARCHIVED":
      return (
        <Badge
          variant="secondary"
          className="text-muted-foreground font-bold text-[10px] uppercase px-2 h-5"
        >
          Arquivado
        </Badge>
      )
    case "COMPLETED":
      return (
        <Badge
          variant="outline"
          className="text-blue-600 border-blue-600 font-bold text-[10px] uppercase px-2 h-5"
        >
          Concluído
        </Badge>
      )
    default:
      return null
  }
}

export function PlanosView() {
  const router = useRouter()
  const [plans, setPlans] = useState<PlanCardData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanCardData | null>(null)
  const [viewingDiscipline, setViewingDiscipline] = useState<PlanDisciplineSummary | null>(null)
  const [catalogTopics, setCatalogTopics] = useState<CatalogTopicWithSubTopics[]>([])
  const [disciplineStats, setDisciplineStats] = useState<DisciplineDetailStats | null>(null)
  const viewingDisciplineRef = useRef<PlanDisciplineSummary | null>(null)

  const openDiscipline = async (disc: PlanDisciplineSummary) => {
    viewingDisciplineRef.current = disc
    setViewingDiscipline(disc)
    setCatalogTopics([])
    setDisciplineStats(null)
    const [catalogRes, statsRes] = await Promise.all([
      getDisciplineCatalogTopicsAction(disc.name),
      getDisciplineDetailStatsAction(disc.name),
    ])
    if (!viewingDisciplineRef.current) return
    if (catalogRes.success) setCatalogTopics(catalogRes.topics)
    if (statsRes.success) setDisciplineStats(statsRes.data)
  }

  const closeDiscipline = () => {
    viewingDisciplineRef.current = null
    setCatalogTopics([])
    setDisciplineStats(null)
    setViewingDiscipline(null)
  }

  const loadPlans = useCallback(() => {
    void (async () => {
      setIsLoading(true)
      setLoadError(null)
      const res = await listPlansAction()
      if (res.data) {
        setPlans(res.data)
      } else {
        setLoadError(res.error || "Erro ao carregar planos.")
      }
      setIsLoading(false)
    })()
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  const activePlan = plans.find((p) => p.active || p.status === "ACTIVE")
  const otherPlans = plans.filter((p) => p.id !== activePlan?.id)

  const handleTogglePause = async (plan: PlanCardData, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      const res = await togglePausePlanAction(plan.id, plan.status)
      if (res.success) {
        toast.success(res.newStatus === "PAUSED" ? "Plano pausado com sucesso!" : "Plano retomado!")
        loadPlans()
      } else {
        toast.error(res.error || "Erro ao atualizar status.")
      }
    } catch {
      toast.error("Erro inesperado.")
    }
  }

  const handleActivate = async (planId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      const res = await activatePlanAction(planId)
      if (res.success) {
        toast.success("Plano ativado com sucesso!")
        loadPlans()
      } else {
        toast.error(res.error || "Erro ao ativar plano.")
      }
    } catch {
      toast.error("Erro inesperado.")
    }
  }

  const handleDuplicate = async (plan: PlanCardData, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const name = window.prompt("Nome da nova versão:", `${plan.name} (Cópia)`)
    if (name === null) return
    try {
      const res = await duplicatePlanAction(plan.id, name)
      if (res.success) {
        toast.success("Plano duplicado com sucesso!")
        loadPlans()
      } else {
        toast.error(res.error || "Erro ao duplicar.")
      }
    } catch {
      toast.error("Erro inesperado.")
    }
  }

  const handleDelete = async (plan: PlanCardData, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (
      !window.confirm(
        `Excluir o plano "${plan.name}"?\nEsta ação não apaga seu histórico de estudos.`,
      )
    )
      return
    try {
      const res = await deletePlanAction(plan.id)
      if (res.success) {
        toast.success("Plano excluído.")
        if (selectedPlan?.id === plan.id) setSelectedPlan(null)
        loadPlans()
      } else {
        toast.error(res.error || "Erro ao excluir.")
      }
    } catch {
      toast.error("Erro inesperado.")
    }
  }

  if (viewingDiscipline) {
    return (
      <DisciplineDetailView
        disciplineName={viewingDiscipline.name}
        catalogTopics={catalogTopics}
        stats={disciplineStats}
        onBack={closeDiscipline}
      />
    )
  }

  return (
    <div className="space-y-8 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-slate-900/5 dark:bg-slate-100/5 p-6 rounded-3xl border">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-foreground tracking-tight">PLANOS DE ESTUDO</h1>
          <p className="text-xs text-muted-foreground font-medium max-w-lg">
            Organize suas estratégias de estudo e escolha qual plano seguir para sua aprovação.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.push("/planejamento")}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-xs px-6 h-11 rounded-2xl shadow-lg shadow-[#2563EB]/20 flex items-center gap-2 group"
          >
            <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform" />
            CRIAR NOVO PLANO
          </Button>
        </div>
      </div>

      {/* STATE SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Plano Ativo
          </span>
          <span className="text-sm font-black text-foreground truncate block">
            {activePlan?.name || "Nenhum"}
          </span>
        </div>
        <div className="bg-card border p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Carga Semanal
          </span>
          <span className="text-sm font-black text-[#2563EB] block">
            {activePlan ? formatMinutes(activePlan.totalMinutes) : "0h"}
          </span>
        </div>
        <div className="bg-card border p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Disciplinas
          </span>
          <span className="text-sm font-black text-foreground block">
            {activePlan?.disciplinesCount || 0}
          </span>
        </div>
        <div className="bg-card border p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Aderência Real
          </span>
          <span className="text-sm font-black text-emerald-500 block">
            {activePlan?.adherencePercentage != null ? `${activePlan.adherencePercentage}%` : "—"}
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />
          <p className="text-sm font-bold text-muted-foreground">Carregando sua estratégia...</p>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/30 p-12 flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center">
            <Trash2 className="h-6 w-6 text-rose-500" />
          </div>
          <p className="text-sm text-rose-900 font-bold">{loadError}</p>
          <Button
            onClick={loadPlans}
            variant="outline"
            className="border-rose-200 text-rose-600 font-bold text-xs h-9"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* PLANO ATIVO DISPLAY */}
      {!isLoading && !loadError && (
        <div className="space-y-6">
          {activePlan ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-black uppercase tracking-widest text-foreground">
                  Plano Atual
                </span>
              </div>

              <div className="group relative bg-slate-900 dark:bg-white text-slate-100 dark:text-slate-900 rounded-[2rem] overflow-hidden shadow-2xl transition-all">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ShieldCheck className="h-32 w-32" />
                </div>

                <div className="relative z-10 p-8 md:p-10 flex flex-col lg:flex-row gap-10">
                  <div className="flex-1 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-black tracking-tight">{activePlan.name}</h2>
                        {statusBadge(activePlan.status)}
                      </div>
                      <p className="text-sm text-slate-400 dark:text-slate-500 font-medium leading-relaxed max-w-xl">
                        {activePlan.description ||
                          `Este é seu plano de estudo principal focado em ${activePlan.planType === "CICLO_ROTATIVO" ? "rodar as matérias de forma contínua" : "cumprir uma agenda semanal fixa"}.`}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 py-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Metas
                        </span>
                        <div className="flex items-center gap-2 font-black text-lg">
                          <Clock className="h-4 w-4 text-[#2563EB]" />
                          {formatMinutes(activePlan.totalMinutes)}/sem
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Conteúdo
                        </span>
                        <div className="flex items-center gap-2 font-black text-lg">
                          <Target className="h-4 w-4 text-emerald-400" />
                          {activePlan.disciplinesCount} matérias
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Início
                        </span>
                        <div className="flex items-center gap-2 font-black text-lg">
                          <Calendar className="h-4 w-4 text-sky-400" />
                          {formatDate(activePlan.generatedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <BarChart3 className="h-3.5 w-3.5" /> Progresso da Estratégia
                        </span>
                        <span>{activePlan.adherencePercentage || 0}% de aderência</span>
                      </div>
                      <Progress
                        value={activePlan.adherencePercentage || 0}
                        className="h-2 bg-slate-800 dark:bg-slate-200"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-4">
                      <Button
                        onClick={() => router.push("/study-plan")}
                        className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-xs px-8 h-12 rounded-2xl shadow-lg shadow-[#2563EB]/40 flex items-center gap-2"
                      >
                        CONTINUAR ESTUDANDO
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => router.push("/planejamento")}
                        className="border-slate-700 dark:border-slate-300 hover:bg-slate-800 dark:hover:bg-slate-100 text-foreground font-black text-xs px-6 h-12 rounded-2xl flex items-center gap-2"
                      >
                        ABRIR PLANEJAMENTO
                      </Button>
                      <div className="flex items-center gap-2 h-12 px-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleTogglePause(activePlan, e)}
                          className="h-10 w-10 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100"
                          title={activePlan.status === "PAUSED" ? "Retomar" : "Pausar"}
                        >
                          {activePlan.status === "PAUSED" ? (
                            <Play className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <Pause className="h-5 w-5 text-amber-400" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDuplicate(activePlan, e)}
                          className="h-10 w-10 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100"
                          title="Duplicar / Criar Versão"
                        >
                          <Copy className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedPlan(activePlan)}
                          className="h-10 w-10 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100"
                          title="Ver Detalhes"
                        >
                          <FileText className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* MINI PREVIEW DAS DISCIPLINAS */}
                  <div className="hidden lg:flex flex-col w-64 bg-slate-800/50 dark:bg-slate-50/50 rounded-2xl border border-slate-700/50 dark:border-slate-200/50 p-5 space-y-4">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Top 5 Disciplinas
                    </span>
                    <div className="space-y-3">
                      {activePlan.disciplines.slice(0, 5).map((d) => (
                        <div key={d.id} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="truncate w-32">{d.name}</span>
                            <span className="text-[#2563EB]">{formatMinutes(d.weeklyMinutes)}</span>
                          </div>
                          <Progress
                            value={Math.min(
                              100,
                              (d.weeklyMinutes /
                                (activePlan.totalMinutes / activePlan.disciplinesCount)) *
                                50,
                            )}
                            className="h-1"
                          />
                        </div>
                      ))}
                    </div>
                    {activePlan.disciplinesCount > 5 && (
                      <button
                        onClick={() => setSelectedPlan(activePlan)}
                        className="text-[10px] font-black text-[#2563EB] hover:underline uppercase text-center pt-2"
                      >
                        + {activePlan.disciplinesCount - 5} OUTRAS
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EMPTY STATE SEM PLANO ATIVO */
            <div className="rounded-[2.5rem] border-4 border-dashed border-slate-200 dark:border-slate-800 p-16 flex flex-col items-center gap-6 text-center">
              <div className="h-24 w-24 rounded-full bg-[#2563EB]/10 flex items-center justify-center">
                <Target className="h-12 w-12 text-[#2563EB]" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-2xl font-black text-foreground">AINDA NÃO HÁ UM PLANO ATIVO</h2>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  Crie uma estratégia de preparação para organizar seus estudos e acelerar sua
                  aprovação.
                </p>
              </div>
              <Button
                onClick={() => router.push("/planejamento")}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-xs px-10 h-14 rounded-3xl shadow-xl shadow-[#2563EB]/30 flex items-center gap-2"
              >
                CRIAR MEU PRIMEIRO PLANO
              </Button>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Ou use o Planejamento para montar o cronograma
              </p>
            </div>
          )}

          {/* LISTA DE OUTROS PLANOS */}
          <div className="space-y-6 pt-6">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Estratégias Arquivadas / Pausadas
                </span>
              </div>
              {otherPlans.length > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {otherPlans.length} planos
                </span>
              )}
            </div>

            {otherPlans.length === 0 ? (
              <div className="bg-muted/30 rounded-3xl p-10 flex flex-col items-center gap-2 text-center border-2 border-dashed">
                <History className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground font-bold italic">
                  Nenhum plano anterior encontrado.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {otherPlans.map((plan) => (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className="group bg-card border rounded-3xl p-6 shadow-xs hover:shadow-xl hover:border-[#2563EB]/40 transition-all cursor-pointer relative"
                  >
                    <div className="absolute top-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleActivate(plan.id, e)}
                        className="h-8 w-8 rounded-lg hover:bg-emerald-50 text-emerald-600"
                        title="Ativar como Principal"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDuplicate(plan, e)}
                        className="h-8 w-8 rounded-lg hover:bg-sky-50 text-[#2563EB]"
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDelete(plan, e)}
                        className="h-8 w-8 rounded-lg hover:bg-rose-50 text-rose-500"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-base text-foreground truncate pr-16">
                            {plan.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusBadge(plan.status)}
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            {planTypeLabel(plan.planType)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-1">
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">
                            Carga
                          </span>
                          <div className="text-xs font-black flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-[#2563EB]" />{" "}
                            {formatMinutes(plan.totalMinutes)}
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">
                            Matérias
                          </span>
                          <div className="text-xs font-black flex items-center gap-1.5">
                            <Target className="h-3 w-3 text-emerald-500" /> {plan.disciplinesCount}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" /> {formatDate(plan.generatedAt)}
                        </div>
                        {plan.versionsCount > 1 && (
                          <div className="flex items-center gap-1 text-[#2563EB]">
                            <History className="h-3 w-3" /> {plan.versionsCount} versões
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PLAN DETAILS DIALOG */}
      <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-3xl gap-0 border-none shadow-2xl">
          {selectedPlan && (
            <div className="flex flex-col">
              {/* DIALOG HEADER */}
              <div className="bg-slate-900 text-white p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-black tracking-tight">{selectedPlan.name}</h2>
                      {statusBadge(selectedPlan.status)}
                    </div>
                    <p className="text-xs text-slate-400 font-medium">
                      {planTypeLabel(selectedPlan.planType)} · Versão {selectedPlan.version}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedPlan.active && (
                      <Button
                        onClick={() => handleActivate(selectedPlan.id)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs h-10 px-6 rounded-xl"
                      >
                        ATIVAR PLANO
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPlan(null)}
                      className="border-slate-700 hover:bg-slate-800 text-white font-black text-xs h-10 rounded-xl"
                    >
                      FECHAR
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-slate-800">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                      Carga Semanal
                    </span>
                    <p className="font-black text-lg">{formatMinutes(selectedPlan.totalMinutes)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                      Disciplinas
                    </span>
                    <p className="font-black text-lg">{selectedPlan.disciplinesCount}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                      Criado em
                    </span>
                    <p className="font-black text-lg">{formatDate(selectedPlan.generatedAt)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">
                      Aderência
                    </span>
                    <p className="font-black text-lg text-emerald-400">
                      {selectedPlan.adherencePercentage || 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* DIALOG CONTENT */}
              <div className="p-8 space-y-8 bg-background">
                {/* ACTIONS BAR */}
                <div className="flex items-center justify-between pb-6 border-b">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => router.push("/planejamento")}
                      className="font-bold text-xs h-9 px-4 rounded-xl flex items-center gap-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Ajustar no Planejamento
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => handleDuplicate(selectedPlan, e)}
                      className="font-bold text-xs h-9 px-4 rounded-xl flex items-center gap-2"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicar Estratégia
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={(e) => handleDelete(selectedPlan, e)}
                    className="text-rose-500 font-bold text-xs h-9 px-4 rounded-xl flex items-center gap-2 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir permanentemente
                  </Button>
                </div>

                {/* DISCIPLINAS LIST */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-[#2563EB]" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Disciplinas do Plano
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedPlan.disciplines.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => openDiscipline(d)}
                        className="p-4 border rounded-2xl hover:border-[#2563EB] hover:shadow-sm cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div className="space-y-0.5">
                          <h4 className="font-black text-sm">{d.name}</h4>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">
                            {d.area || "Geral"} · {d.itemsCount} blocos
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-sm text-[#2563EB]">
                            {formatMinutes(d.weeklyMinutes)}
                          </p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">
                            por semana
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HISTÓRICO DE VERSÕES */}
                {selectedPlan.previousVersions.length > 0 && (
                  <div className="space-y-4 pt-6">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[#2563EB]" />
                      <span className="text-xs font-black uppercase tracking-widest">
                        Histórico de Versões do Grupo
                      </span>
                    </div>

                    <div className="border rounded-2xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[9px] border-b">
                            <th className="text-left p-4">Versão</th>
                            <th className="text-left p-4">Gerado em</th>
                            <th className="text-left p-4">Carga</th>
                            <th className="text-left p-4">Status</th>
                            <th className="text-right p-4">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPlan.previousVersions.map((v) => (
                            <tr
                              key={v.id}
                              className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                            >
                              <td className="p-4 font-black">v{v.version}</td>
                              <td className="p-4 font-medium">{formatDate(v.generatedAt)}</td>
                              <td className="p-4 font-medium">
                                {formatMinutes(v.weeklyMinutes)}/sem
                              </td>
                              <td className="p-4">{statusBadge(v.status)}</td>
                              <td className="p-4 text-right">
                                <Button
                                  variant="link"
                                  onClick={() => handleActivate(v.id)}
                                  className="text-[#2563EB] font-bold text-[11px] p-0 h-auto"
                                >
                                  Restaurar
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { PlanosView as EstudeiPlanosView }
