"use client"

import { useEffect, useState } from "react"

import { Play, SquarePen } from "lucide-react"

import { StickyNotesWidget } from "@/features/dashboard/components/sticky-notes-widget"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { useStudyActions } from "@/features/study-session/components/study-provider"

export function FloatingActionButton() {
  const { sessionSummary, restoreSession, isCentralOpen } = useStudyActions()
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  // Fase E — no mobile os botões flutuantes cobriam o conteúdo durante a
  // rolagem. Agora eles saem de cena ao rolar para baixo e voltam ao rolar
  // para cima, no topo e no fim da página (o <main> tem espaço inferior
  // reservado, então no fim nada fica coberto). No desktop ficam sempre.
  const [isHiddenOnScroll, setIsHiddenOnScroll] = useState(false)

  useEffect(() => {
    const main = document.getElementById("app-main")
    if (!main) return
    const mobile = window.matchMedia("(max-width: 767px)")
    let lastY = main.scrollTop
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = main.scrollTop
        const delta = y - lastY
        const atEnd = y + main.clientHeight >= main.scrollHeight - 8
        if (!mobile.matches || y < 48 || atEnd) setIsHiddenOnScroll(false)
        else if (delta > 6) setIsHiddenOnScroll(true)
        else if (delta < -6) setIsHiddenOnScroll(false)
        lastY = y
      })
    }
    main.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      main.removeEventListener("scroll", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  // Escutar evento de reabrir a central (vem do balão flutuante)
  useEffect(() => {
    const handleOpenCentral = () => {
      setIsRegisterOpen(true)
    }
    window.addEventListener("restore-study-session", handleOpenCentral)
    window.addEventListener("open-study-session-modal", handleOpenCentral)
    return () => {
      window.removeEventListener("restore-study-session", handleOpenCentral)
      window.removeEventListener("open-study-session-modal", handleOpenCentral)
    }
  }, [])

  const handleOpenCentral = () => {
    // Se existe uma sessão ativa E a Central está minimizada → REABRIR A CENTRAL
    if (sessionSummary?.isActive && sessionSummary?.isMinimized) {
      restoreSession()
      return
    }

    // Se a Central já está aberta, não fazer nada
    if (isCentralOpen) {
      return
    }

    // Se existe sessão ativa mas NÃO está minimizada (Central já aberta), não criar outra
    if (sessionSummary?.isActive && !sessionSummary?.isMinimized) {
      return
    }

    // Caso contrário, abrir nova Central (modal de registro)
    setIsRegisterOpen(true)
    window.dispatchEvent(new CustomEvent("study-center-opened"))
  }

  return (
    <>
      {/* Bloco de Notas Post-it Modal */}
      <StickyNotesWidget isOpen={isNotesOpen} onClose={() => setIsNotesOpen(false)} />

      {/* Registrar Estudo Modal */}
      <StudyRegisterModal open={isRegisterOpen} onOpenChange={setIsRegisterOpen} />

      {/* Botões Flutuantes de Ação Rápida */}
      <div
        onFocus={() => setIsHiddenOnScroll(false)}
        className={`fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-50 flex flex-col items-center gap-2.5 sm:gap-3 transition-[transform,opacity] duration-200 ease-out ${
          isHiddenOnScroll ? "pointer-events-none translate-y-[calc(100%+2rem)] opacity-0" : ""
        }`}
      >
        {/* Botão 1 (Superior): Bloco de Notas */}
        <button
          id="fab-sticky-note"
          type="button"
          onClick={() => setIsNotesOpen((prev) => !prev)}
          className="w-11 h-11 rounded-full border border-border bg-card text-foreground hover:bg-muted shadow-md flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Bloco de notas"
          aria-label="Bloco de notas"
        >
          <SquarePen aria-hidden className="h-[18px] w-[18px]" />
        </button>

        {/* Botão 2 (Inferior): Registrar Estudo / Cronômetro */}
        <button
          id="fab-register-study"
          type="button"
          onClick={handleOpenCentral}
          className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background w-12 h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md flex items-center justify-center transition-colors duration-150 cursor-pointer relative ${
            sessionSummary?.isActive ? "ring-2 ring-primary/25 ring-offset-2 ring-offset-background" : ""
          }`}
          title={sessionSummary?.isActive && sessionSummary?.isMinimized
            ? "Reabrir sessão de estudo"
            : sessionSummary?.isActive
            ? "Sessão de estudo aberta"
            : "Registrar estudo"}
          aria-label={sessionSummary?.isActive && sessionSummary?.isMinimized
            ? "Reabrir sessão de estudo"
            : sessionSummary?.isActive
            ? "Sessão de estudo aberta"
            : "Registrar estudo"}
        >
          {sessionSummary?.isActive && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 inline-flex rounded-full h-3 w-3 bg-success border-2 border-background" />
          )}
          <Play aria-hidden className="h-5 w-5 fill-current translate-x-0.5" />
        </button>
      </div>
    </>
  )
}
