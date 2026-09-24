"use client"

import React, { useEffect, useState } from "react"

import { toast } from "sonner"
import { Plus } from "lucide-react"

import {
  resetDashboardLayoutAction,
  saveDashboardLayoutAction,
} from "@/application/dashboard/dashboard-layout.action"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/ui/section-header"
import { type DashboardSnapshot, type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"
import { getDailyMessage } from "@/features/dashboard/components/daily-message-banner"
import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
import { UserExamModal } from "@/features/dashboard/components/user-exam-modal"
import { WeeklyGoalsModal } from "@/features/dashboard/components/weekly-goals-modal"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"

import { DashboardCustomizationModal } from "./dashboard-customization-modal"
import { DashboardDndContext } from "./dashboard-dnd-context"
import { WIDGET_REGISTRY } from "./dashboard-widget-catalog"
import { SortableWidget } from "./sortable-widget"

export interface DashboardLayoutProps {
  snapshot: DashboardSnapshot
  initialLayout: WidgetConfigItem[]
  serverDate: string
}

// Widgets-âncora: representam "o que preciso fazer agora" e ficam fixos em uma
// área de destaque acima da grade, fora do fluxo de arrastar-e-soltar. Continuam
// respeitando visibilidade (hide/show) e persistência do layout do usuário —
// apenas não participam da reordenação/redimensionamento da grade abaixo.
const HERO_WIDGET_IDS = new Set(["ciclo_estudo", "estudos_hoje"])

export function DashboardLayout({ snapshot, initialLayout, serverDate }: DashboardLayoutProps) {
  const [layout, setLayout] = useState<WidgetConfigItem[]>(() => {
    // Fase F (performance): o layout salvo no servidor tem prioridade (o
    // efeito abaixo já o aplicava logo após montar). Começar direto com ele
    // evita um segundo render do Dashboard inteiro logo após a hidratação — e
    // a divergência entre o HTML do servidor e o primeiro render do cliente.
    // O localStorage continua como fallback quando o servidor não tem layout.
    if (initialLayout && initialLayout.length > 0) return initialLayout
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mentor_dashboard_layout")
        if (saved) return JSON.parse(saved) as WidgetConfigItem[]
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
    }
    return initialLayout
  })
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false)
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isExamModalOpen, setIsExamModalOpen] = useState(false)

  useEffect(() => {
    if (initialLayout && initialLayout.length > 0) {
      setLayout(initialLayout)
      try {
        localStorage.setItem("mentor_dashboard_layout", JSON.stringify(initialLayout))
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
    }
  }, [initialLayout])

  useEffect(() => {
    const handleOpenCustomization = () => setIsCustomizationOpen(true)
    window.addEventListener("open-dashboard-customization", handleOpenCustomization)
    return () => {
      window.removeEventListener("open-dashboard-customization", handleOpenCustomization)
    }
  }, [])

  const examName =
    snapshot?.activeTarget?.exam_name || snapshot?.activeTarget?.target_exam || "Minha Prova"
  const date = new Date(serverDate)
  const formattedTodayDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date)
  const capitalizedDate = formattedTodayDate.charAt(0).toUpperCase() + formattedTodayDate.slice(1)

  // A grade arrastável agora só contém os widgets que não são âncora ("Hoje").
  // Ao reordenar, reconstruímos o layout completo preservando a posição dos
  // widgets-âncora e de quaisquer itens ocultos, para não perdê-los.
  const handleReorder = async (newGridOrder: WidgetConfigItem[]) => {
    const heroIds = new Set(heroWidgets.map((w) => w.widget_id))
    const gridIds = new Set(newGridOrder.map((w) => w.widget_id))
    const rest = layout.filter((w) => !heroIds.has(w.widget_id) && !gridIds.has(w.widget_id))
    const merged = [...heroWidgets, ...newGridOrder, ...rest].map((item, index) => ({
      ...item,
      position_order: index + 1,
    }))

    setLayout(merged)
    try {
      localStorage.setItem("mentor_dashboard_layout", JSON.stringify(merged))
    } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
    const result = await saveDashboardLayoutAction(merged)
    if (!result.success) {
      toast.error("Erro ao salvar ordem dos widgets.")
    }
  }

  const handleSaveLayout = async (newLayout: WidgetConfigItem[]) => {
    setLayout(newLayout)
    try {
      localStorage.setItem("mentor_dashboard_layout", JSON.stringify(newLayout))
    } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
    const result = await saveDashboardLayoutAction(newLayout)
    if (result.success) {
      toast.success("Home personalizada com sucesso!")
    } else {
      toast.error(result.error || "Erro ao salvar personalização.")
    }
  }

  const handleRestoreDefault = async () => {
    const result = await resetDashboardLayoutAction()
    if (result.success && result.data) {
      setLayout(result.data)
      try {
        localStorage.removeItem("mentor_dashboard_layout")
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
      toast.success("Layout restaurado para o padrão.")
    }
  }

  // Obter apenas widgets visíveis na grade
  const hasActivePlan = snapshot?.cycleBlocks && snapshot.cycleBlocks.length > 0
  const visibleWidgets = layout
    .filter((item) => item.visible && item.widget_id !== "mensagem_dia" && !(item.widget_id === "estudos_hoje" && !hasActivePlan))
    .sort((a, b) => a.position_order - b.position_order)

  // Widgets-âncora ("Hoje") ficam fora da grade arrastável, em destaque editorial.
  // Continuam respeitando visibilidade e ordem entre si — apenas não são
  // reordenados/redimensionados junto com o restante da grade.
  const heroWidgets = visibleWidgets.filter((item) => HERO_WIDGET_IDS.has(item.widget_id))
  const gridWidgets = visibleWidgets.filter((item) => !HERO_WIDGET_IDS.has(item.widget_id))

  const buildCycleBlocks = () =>
    snapshot?.cycleBlocks?.map((b) => ({
      id: b.id,
      disciplineName: b.disciplineName,
      disciplineId: b.disciplineId,
      durationMinutes: b.durationMinutes,
      studiedMinutes: b.studiedMinutes ?? 0,
      color: b.color || "#2563EB",
      completed: b.status === "CONCLUIDO",
    })) || []

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Fase E: mesmo container de todas as páginas (antes: 1440px fixos,
          que deixavam faixas vazias nas laterais em monitores de 1600–1920px). */}
      <div className="flex-1 page-container pt-5 pb-8 space-y-5">
        {/* 1. Header: Saudação + Frase Motivacional */}
{(() => {
            const msg = getDailyMessage(date)
          return (
            // Redesign 2.0 — cabeçalho editorial: data como contexto, saudação
            // em grafite (sem destaque colorido), mensagem do dia como linha
            // secundária discreta e ações à direita.
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 min-w-0 border-b border-border pb-4">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[13px] text-muted-foreground">{capitalizedDate}</p>
                <h1 className="type-h1 text-foreground">
                  Olá, {snapshot?.user?.name || "Estudante"}
                </h1>
                <p
                  className="text-[13px] text-muted-foreground leading-relaxed max-w-3xl"
                  style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  &ldquo;{msg.text}&rdquo;
                  <span className="text-muted-foreground/70 ml-1.5">— {msg.author}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                <TargetSelectorDropdown initialActiveTargetName={examName} className="flex-1 md:flex-initial md:w-[240px] lg:w-[270px] min-w-0" />
                <Button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="shrink-0 whitespace-nowrap"
                >
                  <Plus aria-hidden className="w-4 h-4" />
                  <span>Adicionar estudo</span>
                </Button>
              </div>
            </header>
          )
        })()}

        {/* 2. Área de destaque: foco de hoje (fora da grade arrastável) */}
        {heroWidgets.length > 0 && (
          <section aria-labelledby="foco-de-hoje" className="space-y-2.5">
            <SectionHeader id="foco-de-hoje" title="Foco de hoje" />
            {heroWidgets.map((item) => {
              const widgetInfo = WIDGET_REGISTRY[item.widget_id]
              if (!widgetInfo) return null
              const WidgetComponent = widgetInfo.component
              return (
                <div
                  key={item.widget_id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  <WidgetComponent
                    snapshot={snapshot}
                    colSpan={item.col_span}
                    cycleBlocks={buildCycleBlocks()}
                    onOpenGoalsModal={() => setIsGoalsModalOpen(true)}
                    onOpenExamModal={() => setIsExamModalOpen(true)}
                  />
                </div>
              )
            })}
          </section>
        )}

        {/* 3. Grade personalizável (arrastar-e-soltar, redimensionar, ocultar) */}
        {gridWidgets.length > 0 && (
          <SectionHeader title="Visão geral" className="pt-1" />
        )}
        <DashboardDndContext items={gridWidgets} onReorder={handleReorder}>
          {gridWidgets.map((item) => {
            const widgetInfo = WIDGET_REGISTRY[item.widget_id]
            if (!widgetInfo) return null

            const WidgetComponent = widgetInfo.component

            return (
              <SortableWidget key={item.widget_id} id={item.widget_id} colSpan={item.col_span}>
                <WidgetComponent
                  snapshot={snapshot}
                  colSpan={item.col_span}
                  cycleBlocks={buildCycleBlocks()}
                  onOpenGoalsModal={() => setIsGoalsModalOpen(true)}
                  onOpenExamModal={() => setIsExamModalOpen(true)}
                />
              </SortableWidget>
            )
          })}
        </DashboardDndContext>
      </div>

      <DashboardCustomizationModal
        isOpen={isCustomizationOpen}
        onClose={() => setIsCustomizationOpen(false)}
        layout={layout}
        onSave={handleSaveLayout}
        onRestoreDefault={handleRestoreDefault}
      />
      <UserExamModal
        open={isExamModalOpen}
        onOpenChange={setIsExamModalOpen}
        initialData={snapshot?.activeTarget}
        defaultExamName={snapshot?.activeTarget?.target_exam}
      />
      <WeeklyGoalsModal
        open={isGoalsModalOpen}
        onOpenChange={setIsGoalsModalOpen}
        profile={snapshot?.user}
      />
      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />
    </div>
  )
}
