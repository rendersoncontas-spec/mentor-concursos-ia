"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Play } from "lucide-react"
import { ReviewPlayerModal } from "./review-player-modal"

export function StartReviewButton({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Play className="h-4 w-4" fill="currentColor" />
        Iniciar
      </button>
      <ReviewPlayerModal open={open} onOpenChange={setOpen} mode="OVERDUE" onFinished={() => router.refresh()} />
    </>
  )
}
