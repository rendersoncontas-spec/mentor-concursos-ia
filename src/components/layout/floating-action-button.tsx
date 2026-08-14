"use client"

import { useEffect, useState } from "react"

import { Play, SquarePen } from "lucide-react"

import { StickyNotesWidget } from "@/features/dashboard/components/sticky-notes-widget"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"

export function FloatingActionButton() {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [isNotesOpen, setIsNotesOpen] = useState(false)

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
      <div className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-center gap-2.5 sm:gap-3 pb-[env(safe-area-inset-bottom,0px)]">
        {/* Botão 1 (Superior): Bloco de Notas */}
        <button
          id="fab-sticky-note"
          onClick={() => setIsNotesOpen((prev) => !prev)}
          className="w-12 h-12 rounded-full border-2 border-primary bg-card/95 text-primary hover:bg-primary/10 shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 backdrop-blur-sm"
          title="Bloco de Notas"
          aria-label="Bloco de Notas"
        >
          <SquarePen className="h-5 w-5 stroke-[2.2]" />
        </button>

        {/* Botão 2 (Inferior): Registrar Estudo / Cronômetro */}
        <button
          id="fab-register-study"
          onClick={handleOpenCentral}
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#2563EB] to-[#3B82F6] hover:from-[#1D4ED8] hover:to-[#2563EB] text-white shadow-xl hover:shadow-2xl shadow-blue-500/25 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          title="Registrar Estudo / Central Inteligente"
          aria-label="Registrar estudo"
        >
          <Play className="h-6 w-6 fill-current translate-x-0.5" />
        </button>
      </div>
    </>
  )
}
