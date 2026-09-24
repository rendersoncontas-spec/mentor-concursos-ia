"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useRouter } from "next/navigation"

import {
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Pause,
  Play,
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
import { Metric, MetricStrip } from "@/components/ui/metric"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Progress } from "@/components/ui/progress"
import type { PlanStatus, PlanType } from "@/domain/study-plan/study-plan.types"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import { DisciplineDetailView } from "@/features/disciplines/components/discipline-detail-view"

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
      return <Badge variant="success">Ativo</Badge>
    case "PAUSED":
      return <Badge variant="warning">Pausado</Badge>
    case "ARCHIVED":
      return <Badge variant="secondary">Arquivado</Badge>
    case "COMPLETED":
      return <Badge variant="outline">Concluído</Badge>
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
    <div className="space-y-4 pb-8">
      {/* RESUMO — faixa única de métricas (antes: 4 cards iguais) */}
      <MetricStrip>
        <Metric label="Plano ativo" value={<span className="block truncate">{activePlan?.name || "Nenhum"}</span>} size="sm" />
        <Metric
          label="Carga semanal"
          value={activePlan ? formatMinutes(activePlan.totalMinutes) : "0h"}
          size="sm"
          tone="primary"
        />
        <Metric label="Disciplinas" value={activePlan?.disciplinesCount || 0} size="sm" />
        <Metric
          label="Aderência real"
          value={
            activePlan?.adherencePercentage !== null && activePlan?.adherencePercentage !== undefined
              ? `${activePlan.adherencePercentage}%`
              : "—"
          }
          size="sm"
        />
      </MetricStrip>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          <p className="text-[13px]">Carregando seus planos…</p>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center">
          <p className="text-sm font-medium text-destructive">{loadError}</p>
          <Button onClick={loadPlans} variant="outline" size="sm">
            Tentar novamente
          </Button>
        </div>
      )}

      {/* PLANO ATIVO — Fase E: superfície neutra em duas regiões (antes era um
          bloco escuro invertido com ícone gigante e botões em caixa alta). */}
      {!isLoading && !loadError && (
        <div className="space-y-6">
          {activePlan ? (
            <section aria-labelledby="plano-atual" className="space-y-2.5">
              <h2 id="plano-atual" className="type-h3 text-foreground">
                Plano atual
              </h2>

              <div className="grid rounded-lg border border-border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
                <div className="min-w-0 space-y-5 p-5">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="type-h2 text-foreground">{activePlan.name}</h3>
                      {statusBadge(activePlan.status)}
                    </div>
                    <p className="prose-width text-[13px] leading-relaxed text-muted-foreground">
                      {activePlan.description ||
                        `Este é seu plano de estudo principal focado em ${activePlan.planType === "CICLO_ROTATIVO" ? "rodar as matérias de forma contínua" : "cumprir uma agenda semanal fixa"}.`}
                    </p>
                  </div>

                  <dl className="grid max-w-xl grid-cols-3 gap-4">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Meta semanal</dt>
                      <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                        {formatMinutes(activePlan.totalMinutes)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Disciplinas</dt>
                      <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                        {activePlan.disciplinesCount}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Início</dt>
                      <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                        {formatDate(activePlan.generatedAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="max-w-xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Aderência ao plano</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {activePlan.adherencePercentage || 0}%
                      </span>
                    </div>
                    <Progress value={activePlan.adherencePercentage || 0} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => router.push("/study-plan")}>
                      Continuar estudando
                      <ChevronRight aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => router.push("/planejamento")}>
                      Abrir planejamento
                    </Button>
                    <div className="flex items-center gap-1 sm:ml-auto">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => handleTogglePause(activePlan, e)}
                        title={activePlan.status === "PAUSED" ? "Retomar plano" : "Pausar plano"}
                        aria-label={activePlan.status === "PAUSED" ? "Retomar plano" : "Pausar plano"}
                      >
                        {activePlan.status === "PAUSED" ? (
                          <Play aria-hidden className="h-4 w-4" />
                        ) : (
                          <Pause aria-hidden className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => handleDuplicate(activePlan, e)}
                        title="Duplicar plano"
                        aria-label="Duplicar plano"
                      >
                        <Copy aria-hidden className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setSelectedPlan(activePlan)}
                        title="Ver detalhes do plano"
                        aria-label="Ver detalhes do plano"
                      >
                        <FileText aria-hidden className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Maiores cargas semanais */}
                <div className="hidden min-w-0 space-y-3 border-border p-5 lg:block lg:border-l">
                  <p className="type-label">Maiores cargas semanais</p>
                  <div className="space-y-3">
                    {activePlan.disciplines.slice(0, 5).map((d) => (
                      <div key={d.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-foreground">{d.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatMinutes(d.weeklyMinutes)}
                          </span>
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
                      type="button"
                      onClick={() => setSelectedPlan(activePlan)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Ver todas as {activePlan.disciplinesCount} disciplinas
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <EmptyState
                icon={Target}
                title="Ainda não há um plano ativo"
                description="Monte um plano no Planejamento para organizar a distribuição dos seus estudos."
                action={
                  <Button size="sm" onClick={() => router.push("/planejamento")}>
                    Criar plano
                  </Button>
                }
              />
            </div>
          )}

          {/* OUTROS PLANOS — lista em linhas com ações sempre visíveis (antes:
              cards com ações que só apareciam no hover, sem acesso por teclado). */}
          <section aria-labelledby="outros-planos" className="space-y-2.5">
            <div className="flex items-end justify-between gap-3">
              <h2 id="outros-planos" className="type-h3 text-foreground">
                Planos pausados e arquivados
              </h2>
              {otherPlans.length > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {otherPlans.length} {otherPlans.length === 1 ? "plano" : "planos"}
                </span>
              )}
            </div>

            {otherPlans.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">
                Nenhum plano anterior encontrado.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="type-label hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_90px_110px_120px] gap-4 border-b border-border bg-muted/40 px-4 py-2 md:grid">
                  <span>Plano</span>
                  <span>Tipo</span>
                  <span>Status</span>
                  <span className="text-right">Carga</span>
                  <span className="text-right">Matérias</span>
                  <span>Criado em</span>
                  <span className="text-right">Ações</span>
                </div>
                <ul className="divide-y divide-border">
                  {otherPlans.map((plan) => (
                    <li
                      key={plan.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/30 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_90px_110px_120px]"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPlan(plan)}
                          className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                        >
                          {plan.name}
                        </button>
                        <p className="text-xs text-muted-foreground md:hidden">
                          {planTypeLabel(plan.planType)} · {formatMinutes(plan.totalMinutes)} ·{" "}
                          {plan.disciplinesCount} matérias
                        </p>
                      </div>
                      <span className="hidden truncate text-xs text-muted-foreground md:block">
                        {planTypeLabel(plan.planType)}
                      </span>
                      <span className="hidden md:block">{statusBadge(plan.status)}</span>
                      <span className="hidden text-right text-xs tabular-nums text-foreground md:block">
                        {formatMinutes(plan.totalMinutes)}
                      </span>
                      <span className="hidden text-right text-xs tabular-nums text-foreground md:block">
                        {plan.disciplinesCount}
                      </span>
                      <span className="hidden text-xs tabular-nums text-muted-foreground md:block">
                        {formatDate(plan.generatedAt)}
                        {plan.versionsCount > 1 && <span className="block">{plan.versionsCount} versões</span>}
                      </span>
                      <div className="row-span-2 flex items-center justify-end gap-0.5 md:row-span-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => handleActivate(plan.id, e)}
                          title="Ativar como principal"
                          aria-label={`Ativar ${plan.name} como plano principal`}
                        >
                          <Play aria-hidden className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => handleDuplicate(plan, e)}
                          title="Duplicar"
                          aria-label={`Duplicar ${plan.name}`}
                        >
                          <Copy aria-hidden className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => handleDelete(plan, e)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Excluir"
                          aria-label={`Excluir ${plan.name}`}
                        >
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {/* PLAN DETAILS DIALOG */}
      <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 rounded-xl gap-0 border shadow-xl">
          {selectedPlan && (
            <div className="flex flex-col">
              {/* DIALOG HEADER */}
              <div className="bg-slate-900 text-white p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-semibold tracking-tight">{selectedPlan.name}</h2>
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
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs h-10 px-6 rounded-xl"
                      >
                        ATIVAR PLANO
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPlan(null)}
                      className="border-slate-700 hover:bg-slate-800 text-white font-semibold text-xs h-10 rounded-xl"
                    >
                      FECHAR
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-slate-800">
                  <div className="space-y-1">
                    <span className="type-label">
                      Carga Semanal
                    </span>
                    <p className="font-semibold text-lg">{formatMinutes(selectedPlan.totalMinutes)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="type-label">
                      Disciplinas
                    </span>
                    <p className="font-semibold text-lg">{selectedPlan.disciplinesCount}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="type-label">
                      Criado em
                    </span>
                    <p className="font-semibold text-lg">{formatDate(selectedPlan.generatedAt)}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="type-label">
                      Aderência
                    </span>
                    <p className="font-semibold text-lg text-emerald-400">
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
                      className="font-semibold text-xs h-9 px-4 rounded-xl flex items-center gap-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Ajustar no Planejamento
                    </Button>
                    <Button
                      variant="outline"
                      onClick={(e) => handleDuplicate(selectedPlan, e)}
                      className="font-semibold text-xs h-9 px-4 rounded-xl flex items-center gap-2"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicar Estratégia
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={(e) => handleDelete(selectedPlan, e)}
                    className="text-rose-500 font-semibold text-xs h-9 px-4 rounded-xl flex items-center gap-2 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir permanentemente
                  </Button>
                </div>

                {/* DISCIPLINAS LIST */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-[13px] font-semibold">
                      Disciplinas do Plano
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedPlan.disciplines.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => openDiscipline(d)}
                        className="p-4 border rounded-xl hover:border-primary hover:shadow-sm cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div className="space-y-0.5">
                          <h4 className="font-semibold text-sm">{d.name}</h4>
                          <p className="type-label">
                            {d.area || "Geral"} · {d.itemsCount} blocos
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm text-primary">
                            {formatMinutes(d.weeklyMinutes)}
                          </p>
                          <p className="type-label">
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
                      <History className="h-4 w-4 text-primary" />
                      <span className="text-[13px] font-semibold">
                        Histórico de Versões do Grupo
                      </span>
                    </div>

                    <div className="border rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[480px]">
                        <thead>
                          <tr className="type-label bg-muted/50 border-b">
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
                              <td className="p-4 font-semibold">v{v.version}</td>
                              <td className="p-4 font-medium">{formatDate(v.generatedAt)}</td>
                              <td className="p-4 font-medium">
                                {formatMinutes(v.weeklyMinutes)}/sem
                              </td>
                              <td className="p-4">{statusBadge(v.status)}</td>
                              <td className="p-4 text-right">
                                <Button
                                  variant="link"
                                  onClick={() => handleActivate(v.id)}
                                  className="text-primary font-semibold text-[11px] p-0 h-auto"
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
