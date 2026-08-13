"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  ShieldCheck,
  Calendar,
  ArrowLeft,
  Archive,
  Loader2,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { toast } from "sonner"

import { EstudeiDisciplineDetailView } from "@/features/disciplines/components/estudei-discipline-detail-view"
import { getDisciplineCatalogTopicsAction, getDisciplineDetailStatsAction, type DisciplineDetailStats } from "@/application/disciplines/discipline-actions"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import {
  listPlansAction,
  type PlanCardData,
  type PlanDisciplineSummary,
} from "@/application/study-plan/list-plans.action"
import { deactivateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import type { PlanType } from "@/domain/study-plan/study-plan.types"

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

const REASON_LABELS: Record<string, string> = {
  manual: "Criado manualmente",
  replan: "Replanejado",
  ai_wizard: "Gerado com assistente",
  AI: "Gerado com assistente",
}

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? (reason ? reason : "")
}

function planTitle(plan: PlanCardData): string {
  return `Plano de Estudos v${plan.version}`
}

export function EstudeiPlanosView() {
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

  // Modal Arquivar Plano
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [planToArchive, setPlanToArchive] = useState<PlanCardData | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  const loadPlans = useCallback(() => {
    void (async () => {
      await Promise.resolve()
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

  const activePlans = plans.filter((p) => p.active)
  const archivedPlans = plans.filter((p) => !p.active)

  const handleOpenArchiveModal = (plan: PlanCardData, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setPlanToArchive(plan)
    setIsArchiveModalOpen(true)
  }

  const handleConfirmArchive = async () => {
    if (!planToArchive) return
    setIsArchiving(true)
    try {
      const res = await deactivateStudyPlanAction()
      if (res.success) {
        setPlans((prev) => prev.map((p) => ({ ...p, active: false })))
        if (selectedPlan?.id === planToArchive.id) {
          setSelectedPlan(null)
        }
        toast.success(`Plano "${planTitle(planToArchive)}" arquivado com sucesso!`)
      } else {
        toast.error(res.error || "Erro ao arquivar o plano.")
      }
    } catch {
      toast.error("Erro inesperado ao arquivar o plano.")
    } finally {
      setIsArchiving(false)
      setIsArchiveModalOpen(false)
      setPlanToArchive(null)
    }
  }

  if (viewingDiscipline) {
    return (
      <EstudeiDisciplineDetailView
        disciplineName={viewingDiscipline.name}
        catalogTopics={catalogTopics}
        stats={disciplineStats}
        onBack={closeDiscipline}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* VISTA 1: Lista de Planos (Ativos + Arquivados) */}
      {!selectedPlan ? (
        <div className="space-y-8">
          <h1 className="text-2xl font-black text-foreground">Planos</h1>

          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-2xl border bg-card p-10 shadow-xs flex flex-col items-center gap-4 text-center my-4">
              <p className="text-sm text-muted-foreground font-medium">{loadError}</p>
              <Button
                onClick={loadPlans}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {!isLoading && !loadError && activePlans.length === 0 && (
            /* Card Estado Vazio Sem Planos Ativos */
            <div className="rounded-2xl border bg-card p-10 shadow-xs flex flex-col md:flex-row items-center justify-between gap-8 my-4">
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                  <div className="w-24 h-28 bg-muted/40 border-2 border-muted rounded-xl transform -rotate-6 flex flex-col p-3" />
                  <div className="w-24 h-28 bg-card border-2 border-[#2563EB] rounded-xl shadow-md absolute transform rotate-6 flex flex-col p-3" />
                </div>

                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl font-extrabold text-foreground">
                    Ops, parece que você ainda não tem um plano ativo
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Crie seu cronograma no Planejamento — escolha seu concurso e disciplinas para gerar o plano.
                  </p>
                </div>
              </div>

              <Button
                onClick={() => router.push("/planejamento")}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs shrink-0"
              >
                Criar no Planejamento
              </Button>
            </div>
          )}

          {!isLoading && !loadError && activePlans.length > 0 && (
            /* Grid de Cards dos Planos Ativos */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card Criar Novo Plano */}
              <div
                onClick={() => router.push("/planejamento")}
                className="rounded-2xl border border-muted bg-card p-6 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-5 group"
              >
                <div className="w-16 h-16 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Plus className="h-8 w-8 stroke-[2.5]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-foreground">Criar Novo Plano</h3>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    Gere um novo cronograma a partir do seu concurso no Planejamento.
                  </p>
                </div>
              </div>

              {/* Cards dos Planos Existentes */}
              {activePlans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className="rounded-2xl border bg-card p-6 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group relative"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs border group-hover:scale-105 transition-transform">
                      <ShieldCheck className="h-9 w-9 text-[#2563EB]" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-base text-[#2563EB] truncate" title={planTitle(plan)}>
                          {planTitle(plan)}
                        </h3>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
                        <p>{planTypeLabel(plan.planType)}</p>
                        <p>Disciplinas: {plan.disciplinesCount}</p>
                        <p>Itens: {plan.itemsCount}</p>
                        <p className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatMinutes(plan.totalMinutes)}/semana
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between h-full space-y-4">
                    {/* Botões de Ação do Card: Arquivar */}
                    <div className="flex items-center gap-1.5 text-muted-foreground/60">
                      <button
                        type="button"
                        onClick={(e) => handleOpenArchiveModal(plan, e)}
                        className="p-1 hover:text-foreground transition-colors"
                        title="Arquivar"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-[#2563EB]" />
                      <span>{formatDate(plan.generatedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SEÇÃO PLANOS ARQUIVADOS */}
          {archivedPlans.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                PLANOS ARQUIVADOS
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {archivedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-2xl border bg-card p-5 shadow-xs flex items-center justify-between gap-4 opacity-70"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 border">
                        <ShieldCheck className="h-8 w-8 text-[#2563EB]" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <h3 className="font-extrabold text-sm text-foreground truncate" title={planTitle(plan)}>
                          {planTitle(plan)}
                        </h3>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>{planTypeLabel(plan.planType)}</p>
                          <p>Disciplinas: {plan.disciplinesCount}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full space-y-3">
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-[#2563EB]" />
                        <span>{formatDate(plan.generatedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VISTA 2: Detalhes do Plano Selecionado */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedPlan(null)}
              className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-[#2563EB] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar para Todos os Planos</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-slate-900 border flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ShieldCheck className="h-10 w-10 text-[#2563EB]" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-[#2563EB] tracking-tight">
                      {planTitle(selectedPlan)}
                    </h2>
                    {selectedPlan.active && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <button
                          onClick={() => handleOpenArchiveModal(selectedPlan)}
                          className="p-1 hover:text-foreground transition-colors"
                          title="Arquivar"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
                    <p>
                      <strong className="text-foreground">Tipo:</strong> {planTypeLabel(selectedPlan.planType)}
                    </p>
                    <p>
                      <strong className="text-foreground">Origem:</strong>{" "}
                      {reasonLabel(selectedPlan.generatedReason) || "—"}
                    </p>
                    <p>
                      <strong className="text-foreground">Criado em:</strong> {formatDate(selectedPlan.generatedAt)}
                    </p>
                    <p>
                      <strong className="text-foreground">Disciplinas:</strong> {selectedPlan.disciplinesCount}{" "}
                      &nbsp;&nbsp;&nbsp;&nbsp;
                      <strong className="text-foreground">Itens do plano:</strong> {selectedPlan.itemsCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => router.push("/planejamento")}
                  className="w-full sm:w-auto border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-5 h-9"
                >
                  Ajustar no Planejamento
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="space-y-1 mb-4">
                <span className="text-2xl font-black text-foreground">
                  {formatMinutes(selectedPlan.totalMinutes)}
                </span>
                <span className="text-[11px] text-muted-foreground font-semibold block">
                  Carga semanal de estudo
                </span>
              </div>

              <div className="w-full grid grid-cols-2 gap-4 border-t pt-3">
                <div>
                  <span className="text-lg font-bold text-[#2563EB] block">{selectedPlan.disciplinesCount}</span>
                  <span className="text-[10px] text-muted-foreground font-medium">Disciplinas</span>
                </div>
                <div className="border-l">
                  <span className="text-lg font-bold text-[#2563EB] block">{selectedPlan.itemsCount}</span>
                  <span className="text-[10px] text-muted-foreground font-medium">Itens no plano</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cards das Disciplinas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {selectedPlan.disciplines.map((disc) => (
              <div
                key={disc.id}
                onClick={() => openDiscipline(disc)}
                className="rounded-2xl border bg-card p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 rounded-full bg-[#2563EB]" />
                    <h3 className="font-extrabold text-sm text-foreground truncate">{disc.name}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
                  <div>
                    <span className="text-sm font-black text-foreground block">
                      {formatMinutes(disc.weeklyMinutes)}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-semibold block">Min / Semana</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-foreground block">{disc.itemsCount}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold block">Itens</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-foreground block truncate">
                      {disc.area ?? "Geral"}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-semibold block">Área</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Arquivar Plano */}
      <Dialog open={isArchiveModalOpen} onOpenChange={setIsArchiveModalOpen}>
        <DialogContent className="sm:max-w-md p-6 rounded-2xl text-center space-y-6">
          {/* Ícone Grande do Ponto de Interrogação */}
          <div className="flex justify-center pt-2">
            <div className="w-20 h-20 rounded-full bg-[#dbeafe] text-[#2563EB] flex items-center justify-center text-4xl font-black shadow-xs">
              ?
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-foreground">Arquivar Plano?</h2>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Tem certeza que deseja arquivar o plano &apos;{planToArchive ? planTitle(planToArchive) : ""}&apos;?
              Ele será desativado e você poderá gerar um novo cronograma no Planejamento.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsArchiveModalOpen(false)}
              disabled={isArchiving}
              className="border-muted-foreground/40 text-foreground font-bold text-xs px-8 h-10 rounded-xl"
            >
              Cancelar
            </Button>

            <Button
              onClick={handleConfirmArchive}
              disabled={isArchiving}
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs"
            >
              {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, arquivar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}