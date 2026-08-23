"use client"

import React, { useEffect, useState } from "react"

import { toast } from "sonner"
import { Plus } from "lucide-react"

import {
  resetDashboardLayoutAction,
  saveDashboardLayoutAction,
} from "@/application/dashboard/dashboard-layout.action"
import { Button } from "@/components/ui/button"
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
      toast.error(result.error || "Erro ao salvar personalização.")
    }
  }

  const handleRestoreDefault = async () => {
    const result = await resetDashboardLayoutAction()
    if (result.success && result.data) {
      setLayout(result.data)
      toast.success("Layout restaurado para o padrão.")
    }
  }

  // Obter apenas widgets visíveis na grade
  const visibleWidgets = layout
    .filter((item) => item.visible && item.widget_id !== "mensagem_dia")
    .sort((a, b) => a.position_order - b.position_order)

  return (
    <div className="flex flex-col min-h-full bg-background/50">
      <div className="flex-1 px-4 sm:px-5 pt-4 pb-20 space-y-3 sm:space-y-3.5 w-full max-w-full">
        {/* 1. Header: Saudação + Frase Motivacional */}
        {(() => {
          const msg = getDailyMessage()
          return (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 min-w-0 pb-1">
              <div className="flex-1 min-w-0 space-y-0.5">
                <h1 className="text-lg sm:text-xl font-bold text-foreground tracking-tight leading-snug">
                  Olá, <span className="text-[#2563EB] dark:text-blue-400 font-extrabold">{snapshot?.user?.name || "Estudante"}</span>! 👋
                </h1>
                <p className="text-xs sm:text-[13px] font-medium text-muted-foreground leading-relaxed">
                  Hoje é {capitalizedDate}. Bem-vindo de volta.
                </p>
                <p
                  className="text-xs sm:text-[14px] font-medium italic text-foreground/85 leading-relaxed pt-0.5"
                  style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  <span className="not-italic text-[#2563EB] dark:text-blue-400 mr-1.5" aria-hidden="true">✨</span>
                  &ldquo;{msg.text}&rdquo;
                  <span className="text-[11px] font-semibold text-muted-foreground/60 not-italic ml-1.5">
                    — {msg.author}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-2.5 w-full md:w-auto shrink-0 pt-1 md:pt-0">
                <Button
                  onClick={() => {
                    setIsRegisterModalOpen(true)
                    window.dispatchEvent(new CustomEvent("study-center-opened"))
                  }}
                  className="flex-1 md:flex-initial bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm px-3.5 sm:px-4 shadow-sm hover:shadow-md hover:shadow-blue-500/20 active:scale-[0.98] transition-all cursor-pointer rounded-xl h-9 sm:h-10 shrink-0 whitespace-nowrap min-w-0"
                >
                  <Plus className="w-4 h-4 mr-1.5 shrink-0 stroke-[2.5]" />
                  <span>Adicionar Estudo</span>
                </Button>
                <TargetSelectorDropdown initialActiveTargetName={examName} className="flex-1 md:flex-initial md:w-[260px] lg:w-[290px] min-w-0" />
              </div>
            </div>
          )
        })()}

        {/* 2. Widgets do Dashboard (inclui TempodeEstudo, Desempenho, Constância, etc.) */}
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
