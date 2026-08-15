"use client"

import React, { useEffect, useState } from "react"

import { toast } from "sonner"

import {
  resetDashboardLayoutAction,
  saveDashboardLayoutAction,
} from "@/application/dashboard/dashboard-layout.action"
import { Button } from "@/components/ui/button"
import { type DashboardSnapshot, type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"
import { DailyMessageBanner } from "@/features/dashboard/components/daily-message-banner"
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
    return () => {
      window.removeEventListener("open-dashboard-customization", handleOpenCustomization)
    }
  }, [])

  const examName =
    snapshot?.activeTarget?.exam_name || snapshot?.activeTarget?.target_exam || "Minha Prova"
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

  // Obter apenas widgets visíveis na grade (mensagem_dia fica no topo fixo em destaque)
  const visibleWidgets = layout
    .filter((item) => item.visible && item.widget_id !== "mensagem_dia")
    .sort((a, b) => a.position_order - b.position_order)

  return (
    <div className="flex flex-col min-h-full bg-background/50">
      <div className="flex-1 p-3.5 sm:p-5 space-y-3 sm:space-y-3.5 w-full pb-20">
        {/* 1. Header: Título e Saudação */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-[28px] font-black text-foreground tracking-tight leading-none">
            Home
          </h1>
          <p className="text-xs sm:text-[13px] font-semibold text-muted-foreground mt-1">
            Olá, <span className="text-[#2563EB]">{snapshot?.user?.name || "Estudante"}</span>! Hoje
            é {capitalizedDate}. 👋 Bem-vindo de volta.
          </p>
        </div>

        {/* 2. Mensagem do Dia: Faixa Compacta e Elegante no Topo */}
        <DailyMessageBanner />

        {/* 3. Ações Principais: Adicionar Estudo e Seletor de Cargo */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5 w-full min-w-0">
          <Button
            onClick={() => {
              setIsRegisterModalOpen(true)
              window.dispatchEvent(new CustomEvent("study-center-opened"))
            }}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-4 shadow-2xs cursor-pointer w-full sm:w-auto h-8.5 shrink-0"
          >
            Adicionar Estudo
          </Button>
          <TargetSelectorDropdown initialActiveTargetName={examName} className="w-full sm:w-auto" />
        </div>

        <DashboardDndContext items={visibleWidgets} onReorder={handleReorder}>
          {visibleWidgets.map((item) => {
            const widgetInfo = WIDGET_REGISTRY[item.widget_id]
            if (!widgetInfo) return null

            const WidgetComponent = widgetInfo.component

            const cycleBlocks =
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

      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />
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
