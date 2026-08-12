"use client"

import React, { useState, useEffect } from "react"
import { type DashboardSnapshot, type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"
import { DashboardDndContext } from "./dashboard-dnd-context"
import { SortableWidget } from "./sortable-widget"
import { WIDGET_REGISTRY } from "./dashboard-widget-catalog"
import { DashboardCustomizationModal } from "./dashboard-customization-modal"
import { saveDashboardLayoutAction, resetDashboardLayoutAction } from "@/application/dashboard/dashboard-layout.action"
import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
import { Button } from "@/components/ui/button"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { UserExamModal } from "@/features/dashboard/components/user-exam-modal"
import { WeeklyGoalsModal } from "@/features/dashboard/components/weekly-goals-modal"
import { toast } from "sonner"

export interface DashboardLayoutProps {
  snapshot: DashboardSnapshot
  initialLayout: WidgetConfigItem[]
}

export function DashboardLayout({ snapshot, initialLayout }: DashboardLayoutProps) {
  const [layout, setLayout] = useState<WidgetConfigItem[]>(initialLayout)
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false)
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isExamModalOpen, setIsExamModalOpen] = useState(false)
  useEffect(() => {
    const handleOpenCustomization = () => setIsCustomizationOpen(true)
    window.addEventListener("open-dashboard-customization", handleOpenCustomization)
    
    const handleRestoreStudy = () => setIsRegisterModalOpen(true)
    window.addEventListener("restore-study-session", handleRestoreStudy)
    
    const handleOpenStudySession = () => setIsRegisterModalOpen(true)
    window.addEventListener("open-study-session-modal", handleOpenStudySession)
    
    return () => {
      window.removeEventListener("open-dashboard-customization", handleOpenCustomization)
      window.removeEventListener("restore-study-session", handleRestoreStudy)
      window.removeEventListener("open-study-session-modal", handleOpenStudySession)
    }
  }, [])

  const examName = snapshot?.activeTarget?.exam_name || snapshot?.activeTarget?.target_exam || "Minha Prova"
  const formattedTodayDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date())
  const capitalizedDate = formattedTodayDate.charAt(0).toUpperCase() + formattedTodayDate.slice(1)

  const handleReorder = async (newLayout: WidgetConfigItem[]) => {
    setLayout(newLayout)
    const result = await saveDashboardLayoutAction(newLayout)
    if (!result.success) {
      toast.error("Erro ao salvar ordem dos widgets.")
    }
  }

  const handleSaveLayout = async (newLayout: WidgetConfigItem[]) => {
    setLayout(newLayout)
    const result = await saveDashboardLayoutAction(newLayout)
    if (result.success) {
      toast.success("Home personalizada com sucesso!")
    } else {
      toast.error("Erro ao salvar personalização.")
    }
  }

  const handleRestoreDefault = async () => {
    const result = await resetDashboardLayoutAction()
    if (result.success && result.data) {
      setLayout(result.data)
      toast.success("Layout restaurado para o padrão.")
    }
  }

  // Obter apenas widgets visíveis, ordenados pela position_order
  const visibleWidgets = layout
    .filter((item) => item.visible)
    .sort((a, b) => a.position_order - b.position_order)

  return (
    <div className="flex flex-col min-h-full bg-background/50">
      <div className="flex-1 p-4 md:p-6 space-y-6 w-full pb-24">

        {/* Header Dinâmico e Unificado */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-foreground">Home</h1>
            <p className="text-sm font-bold text-muted-foreground mt-0.5">
              Olá, <span className="text-[#2563EB]">{snapshot?.user?.name || "Estudante"}</span>! Hoje é {capitalizedDate}. 👋 Bem-vindo de volta.
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

        <DashboardDndContext items={visibleWidgets} onReorder={handleReorder}>
          {visibleWidgets.map((item) => {
            const widgetInfo = WIDGET_REGISTRY[item.widget_id]
            if (!widgetInfo) return null

            const WidgetComponent = widgetInfo.component

            const cycleBlocks = snapshot?.cycleBlocks?.map((b) => ({
              id: b.id,
              disciplineName: b.disciplineName,
              disciplineId: b.disciplineId,
              durationMinutes: b.durationMinutes,
              studiedMinutes: 0,
              color: b.color || "#2563EB",
              completed: b.status === "CONCLUIDO",
            })) || []

            return (
              <SortableWidget key={item.widget_id} id={item.widget_id} colSpan={item.col_span}>
                <WidgetComponent
                  snapshot={snapshot}
                  colSpan={item.col_span}
                  cycleBlocks={cycleBlocks}
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

      <StudyRegisterModal
        open={isRegisterModalOpen}
        onOpenChange={setIsRegisterModalOpen}
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
    </div>
  )
}
