"use client"

import { useState, useEffect } from "react"
import { Timer, StickyNote } from "lucide-react"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import { StickyNotesWidget } from "@/features/dashboard/components/sticky-notes-widget"

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
      <StickyNotesWidget
        isOpen={isNotesOpen}
        onClose={() => setIsNotesOpen(false)}
      />

      {/* Registrar Estudo Modal */}
      <StudyRegisterModal
        open={isRegisterOpen}
        onOpenChange={setIsRegisterOpen}
      />

      {/* Botões Flutuantes Circulares Empilhados (100% Paridade Estudei) */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
        {/* Botão 1 (Superior): Bloco de Notas — Círculo Branco com Borda Verde-Água */}
        <button
          id="fab-sticky-note"
          onClick={() => setIsNotesOpen((prev) => !prev)}
          className="w-12 h-12 rounded-full border-2 border-[#2563EB] bg-white text-[#2563EB] hover:bg-[#2563EB]/10 shadow-md hover:shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
          title="Bloco de Notas"
          aria-label="Bloco de Notas"
        >
          <StickyNote className="h-6 w-6 stroke-[2.2]" />
        </button>

        {/* Botão 2 (Inferior): Registrar Estudo / Cronômetro — Círculo Verde-Água Sólido */}
        <button
          id="fab-register-study"
          onClick={handleOpenCentral}
          className="w-14 h-14 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          title="Registrar Estudo"
          aria-label="Registrar estudo"
        >
          <Timer className="h-7 w-7 stroke-[2.2]" />
        </button>
      </div>
    </>
  )
}

