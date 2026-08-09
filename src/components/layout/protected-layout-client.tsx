"use client"

import React, { useState } from "react"
import { AppSidebar } from "@/components/layout/sidebar"
import { AppHeader } from "@/components/layout/header"
import { FloatingActionButton } from "@/components/layout/floating-action-button"
import { Menu } from "lucide-react"

interface ProtectedLayoutClientProps {
  userEmail: string
  userName: string
  logoutAction: () => Promise<void>
  children: React.ReactNode
}

export function ProtectedLayoutClient({
  userEmail,
  userName,
  logoutAction,
  children,
}: ProtectedLayoutClientProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30 relative">
      {/* Botão Flutuante do Menu Mobile (Canto Superior Esquerdo) */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="md:hidden fixed top-3 left-4 z-50 p-2 rounded-xl bg-[#2563EB] text-white shadow-lg hover:bg-[#1D4ED8] transition-all flex items-center justify-center active:scale-95"
        title="Abrir Menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay escuro em telas menores */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-[90] backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar (Fixo no Desktop / Flutuante no Mobile) */}
      <AppSidebar
        logoutAction={logoutAction}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        className={isSidebarOpen ? "block" : "hidden md:flex shrink-0"}
      />

      {/* Área de conteúdo que expande para 100% da largura */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full">
        <AppHeader
          userEmail={userEmail}
          userName={userName}
          logoutAction={logoutAction}
        />

        <main className="flex-1 overflow-y-auto w-full">{children}</main>
      </div>

      <FloatingActionButton />
    </div>
  )
}
