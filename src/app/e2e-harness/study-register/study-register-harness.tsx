"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"

export function StudyRegisterHarness() {
  const [open, setOpen] = useState(false)
  return (
    <div className="page-container py-8 space-y-4">
      <h1 className="type-h1">Registro de estudo (harness E2E)</h1>
      <Button onClick={() => setOpen(true)}>Abrir Central de estudos</Button>
      <StudyRegisterModal open={open} onOpenChange={setOpen} />
    </div>
  )
}
