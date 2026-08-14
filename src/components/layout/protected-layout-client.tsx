"use client"

import React, { useState } from "react"

import { Menu } from "lucide-react"

import { FloatingActionButton } from "@/components/layout/floating-action-button"
import { AppHeader } from "@/components/layout/header"
import { AppSidebar } from "@/components/layout/sidebar"

interface ProtectedLayoutClientProps {
  userEmail: string
  userName: string
  userId: string
  avatarUrl?: string | null
  logoutAction: () => Promise<void>
  children: React.ReactNode
}

export function ProtectedLayoutClient({
  userEmail,
  userName,
  userId,
  avatarUrl = null,
  logoutAction,
  children,
}: ProtectedLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSidebarOpen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30 relative">
      {/* Botão Flutuante do Menu Mobile (Canto Superior Esquerdo) */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="md:hidden fixed top-3 left-4 z-40 p-2 rounded-xl bg-[#2563EB] text-white shadow-lg hover:bg-[#1D4ED8] transition-all flex items-center justify-center active:scale-95"
        title="Abrir Menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay escuro em telas menores */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar (Fixo no Desktop / Flutuante no Mobile) */}
      <AppSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Área de conteúdo que expande para 100% da largura */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full">
        <AppHeader
          userEmail={userEmail}
          userName={userName}
          userId={userId}
          avatarUrl={avatarUrl}
          logoutAction={logoutAction}
        />

        <main className="flex-1 overflow-y-auto w-full">{children}</main>
      </div>

      <FloatingActionButton />
    </div>
  )
}
