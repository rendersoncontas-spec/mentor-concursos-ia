"use client"

import React, { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { getDailyMessage } from "@/features/dashboard/components/daily-message-banner"
import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
import { UserExamModal } from "@/features/dashboard/components/user-exam-modal"
import { WeeklyGoalsModal } from "@/features/dashboard/components/weekly-goals-modal"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"

export interface DashboardLayoutProps {
  snapshot: DashboardSnapshot
  serverDate: string
  children: ReactNode
}

/**
 * Fase F.3 (performance) — cuidava antes também do estado de layout
 * (`layout`, `isCustomizationOpen`) e da renderização da grade de widgets.
 * Essas duas coisas foram extraídas para `DashboardWidgetsGrid`
 * (ver dashboard-widgets-grid.tsx), que agora fica atrás de um <Suspense> em
 * page.tsx e chega aqui via `children`. Isso deixa o cabeçalho (este
 * componente) livre para aparecer assim que `snapshot` estiver pronto, sem
 * esperar os 4 loaders mais lentos dos widgets.
 *
 * `onOpenGoalsModal` deixou de ser passado por prop para os widgets daqui —
 * eles agora disparam o evento global `open-dashboard-goals-modal`, que este
 * componente escuta abaixo, no mesmo padrão já usado por `header.tsx` para
 * abrir a personalização (`open-dashboard-customization`, escutado antes em
 * `DashboardWidgetsGrid`). O comportamento para quem usa o app é idêntico: o
 * clique no botão "Metas" de um widget continua abrindo o mesmo
 * `WeeklyGoalsModal`.
 */
export function DashboardLayout({ snapshot, serverDate, children }: DashboardLayoutProps) {
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isExamModalOpen, setIsExamModalOpen] = useState(false)

  useEffect(() => {
    const handleOpenGoalsModal = () => setIsGoalsModalOpen(true)
    window.addEventListener("open-dashboard-goals-modal", handleOpenGoalsModal)
    return () => {
      window.removeEventListener("open-dashboard-goals-modal", handleOpenGoalsModal)
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

        {/* 2. Área de widgets: "Foco de hoje" + grade personalizável.
            Atrás de um <Suspense> em page.tsx (ver dashboard-widgets-section.tsx
            e dashboard-widgets-grid.tsx) — chega pronta ou em streaming. */}
        {children}
      </div>

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
