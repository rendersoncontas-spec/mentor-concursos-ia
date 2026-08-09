"use client"

import React from "react"
import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DashboardFloatingButtonProps {
  onClick: () => void
}

export function DashboardFloatingButton({ onClick }: DashboardFloatingButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40">
      <Button
        onClick={onClick}
        size="icon"
        className="w-14 h-14 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-2xl transition-transform hover:scale-110 active:scale-95"
        title="Personalizar Home"
      >
        <Settings2 className="w-6 h-6" />
      </Button>
    </div>
  )
}
