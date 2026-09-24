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
        className="inline-flex h-9 items-center gap-2 bg-primary text-primary-foreground px-3.5 rounded-md font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Play className="h-3.5 w-3.5" fill="currentColor" />
        Iniciar revisão
      </button>
      <ReviewPlayerModal open={open} onOpenChange={setOpen} mode="OVERDUE" onFinished={() => router.refresh()} />
    </>
  )
}
