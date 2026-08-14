"use client"

import React, { useState } from "react"

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
    <div className="flex h-screen overflow-hidden bg-muted/30 relative w-full max-w-full">
      {/* Overlay escuro em telas menores */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Fixo no Desktop / Drawer Flutuante no Mobile) */}
      <AppSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Área de conteúdo que expande para 100% da largura */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden w-full max-w-full">
        <AppHeader
          userEmail={userEmail}
          userName={userName}
          userId={userId}
          avatarUrl={avatarUrl}
          logoutAction={logoutAction}
          onOpenMenu={() => setIsSidebarOpen(true)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full">
          {children}
        </main>
      </div>

      <FloatingActionButton />
    </div>
  )
}
