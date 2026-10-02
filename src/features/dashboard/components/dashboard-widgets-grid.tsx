"use client"

import React, { useEffect, useState } from "react"

import { toast } from "sonner"

import {
  resetDashboardLayoutAction,
  saveDashboardLayoutAction,
} from "@/application/dashboard/dashboard-layout.action"
import { SectionHeader } from "@/components/ui/section-header"
import { type DashboardSnapshot, type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"

import { DashboardCustomizationModal } from "./dashboard-customization-modal"
import { DashboardDndContext } from "./dashboard-dnd-context"
import { WIDGET_REGISTRY } from "./dashboard-widget-catalog"
import { SortableWidget } from "./sortable-widget"

export interface DashboardWidgetsGridProps {
  snapshot: DashboardSnapshot
  initialLayout: WidgetConfigItem[]
}

// Widgets-âncora: representam "o que preciso fazer agora" e ficam fixos em uma
// área de destaque acima da grade, fora do fluxo de arrastar-e-soltar. Continuam
// respeitando visibilidade (hide/show) e persistência do layout do usuário —
// apenas não participam da reordenação/redimensionamento da grade abaixo.
const HERO_WIDGET_IDS = new Set(["ciclo_estudo", "estudos_hoje"])

/**
 * Fase F.3 (performance) — extraído de `DashboardLayout` para poder ficar
 * atrás de um `<Suspense>` (ver `dashboard-widgets-section.tsx`) sem atrasar o
 * cabeçalho. `DashboardLayout` continua cuidando só do cabeçalho e dos modais
 * que não dependem dos 4 loaders de widgets (registrar estudo, metas, exame).
 * O modal de personalização de layout e o estado `layout`/`isCustomizationOpen`
 * vieram para aqui, porque pertencem à grade, não ao cabeçalho.
 *
 * `onOpenGoalsModal` deixou de ser uma função passada por prop a partir de
 * `DashboardLayout` (que agora está fora desta árvore, do outro lado do
 * Suspense) e passou a disparar o evento global `open-dashboard-goals-modal`,
 * no mesmo padrão já usado por `header.tsx` para abrir a personalização
 * (`open-dashboard-customization`). `DashboardLayout` escuta esse evento e
 * abre o `WeeklyGoalsModal`, exatamente como antes.
 */
export function DashboardWidgetsGrid({ snapshot, initialLayout }: DashboardWidgetsGridProps) {
  const [layout, setLayout] = useState<WidgetConfigItem[]>(() => {
    // Fase F (performance): o layout salvo no servidor tem prioridade (o
    // efeito abaixo já o aplicava logo após montar). Começar direto com ele
    // evita um segundo render logo após a hidratação — e a divergência entre
    // o HTML do servidor e o primeiro render do cliente. O localStorage
    // continua como fallback quando o servidor não tem layout.
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

    // G1.10 (G-49): snapshot para rollback — sem ele, uma falha de
    // persistência deixava a UI (e o reload, via localStorage) fingindo
    // ordem salva.
    const previous = layout
    const persistLocal = (value: WidgetConfigItem[]) => {
      try {
        localStorage.setItem("mentor_dashboard_layout", JSON.stringify(value))
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
    }
    setLayout(merged)
    persistLocal(merged)
    const result = await saveDashboardLayoutAction(merged)
    if (!result.success) {
      setLayout(previous)
      persistLocal(previous)
      toast.error("Erro ao salvar ordem dos widgets.")
    }
  }

  const handleSaveLayout = async (newLayout: WidgetConfigItem[]) => {
    // G1.10 (G-49): mesmo rollback do reorder.
    const previous = layout
    const persistLocal = (value: WidgetConfigItem[]) => {
      try {
        localStorage.setItem("mentor_dashboard_layout", JSON.stringify(value))
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
    }
    setLayout(newLayout)
    persistLocal(newLayout)
    const result = await saveDashboardLayoutAction(newLayout)
    if (result.success) {
      toast.success("Home personalizada com sucesso!")
    } else {
      setLayout(previous)
      persistLocal(previous)
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

  const openGoalsModal = () => window.dispatchEvent(new CustomEvent("open-dashboard-goals-modal"))

  return (
    <>
      {/* Área de destaque: foco de hoje (fora da grade arrastável) */}
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
                  onOpenGoalsModal={openGoalsModal}
                />
              </div>
            )
          })}
        </section>
      )}

      {/* Grade personalizável (arrastar-e-soltar, redimensionar, ocultar) */}
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
                onOpenGoalsModal={openGoalsModal}
              />
            </SortableWidget>
          )
        })}
      </DashboardDndContext>

      <DashboardCustomizationModal
        isOpen={isCustomizationOpen}
        onClose={() => setIsCustomizationOpen(false)}
        layout={layout}
        onSave={handleSaveLayout}
        onRestoreDefault={handleRestoreDefault}
      />
    </>
  )
}
