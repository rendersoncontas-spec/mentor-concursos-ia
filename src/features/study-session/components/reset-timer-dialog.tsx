"use client"

import { RefreshCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ResetTimerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ResetTimerDialog({ open, onOpenChange, onConfirm }: ResetTimerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCcw className="w-4 h-4" />
            Resetar o cronômetro?
          </DialogTitle>
          <DialogDescription>
            Todo o tempo desta sessão em andamento será zerado. O estudo ainda não foi salvo no
            Histórico.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            aria-label="Cancelar reset do cronômetro"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            aria-label="Confirmar reset do cronômetro"
          >
            Resetar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
