"use client"

import { useEffect, useState } from "react"

import { Clock, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  deleteManualStudyTimeAction,
  getDisciplinesForCalendarAction,
  getManualEntryForDayAction,
  saveManualStudyTimeAction,
} from "@/application/study-history/study-history.actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatDayLabel } from "@/lib/sao-paulo"

interface ManualStudyTimeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateStr: string
  onSaved: () => void
}

export function ManualStudyTimeModal({
  open,
  onOpenChange,
  dateStr,
  onSaved,
}: ManualStudyTimeModalProps) {
  const [hours, setHours] = useState("")
  const [minutes, setMinutes] = useState("")
  const [disciplineId, setDisciplineId] = useState("")
  const [disciplines, setDisciplines] = useState<{ id: string; name: string }[]>([])
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Load disciplines and existing entry when modal opens
  useEffect(() => {
    if (!open) return

    setFetching(true)
    setHours("")
    setMinutes("")
    setDisciplineId("")
    setExistingSessionId(null)
    setShowDeleteConfirm(false)

    Promise.all([
      getDisciplinesForCalendarAction(),
      getManualEntryForDayAction(dateStr),
    ]).then(([discRes, entryRes]) => {
      if (discRes.data) setDisciplines(discRes.data)
      if (entryRes.data) {
        const entry = entryRes.data
        const h = Math.floor(entry.durationMinutes / 60)
        const m = entry.durationMinutes % 60
        setHours(h > 0 ? String(h) : "")
        setMinutes(m > 0 ? String(m) : "")
        setDisciplineId(entry.disciplineId)
        setExistingSessionId(entry.sessionId)
      } else if (discRes.data && discRes.data.length === 1 && discRes.data[0]) {
        setDisciplineId(discRes.data[0].id)
      }
      setFetching(false)
    })
  }, [open, dateStr])

  const totalMinutes =
    (parseInt(hours || "0", 10) || 0) * 60 + (parseInt(minutes || "0", 10) || 0)

  const canSave = totalMinutes > 0 && disciplineId.length > 0 && !loading

  const handleSave = async () => {
    if (!canSave) return
    setLoading(true)
    const res = await saveManualStudyTimeAction(dateStr, totalMinutes, disciplineId)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Tempo de estudo atualizado.")
      onOpenChange(false)
      onSaved()
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    const res = await deleteManualStudyTimeAction(dateStr)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success("Registro removido.")
      setShowDeleteConfirm(false)
      onOpenChange(false)
      onSaved()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            Registrar estudo
          </DialogTitle>
          <DialogDescription className="text-xs">
            {formatDayLabel(dateStr)}
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-4">
            {/* Discipline selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Disciplina</Label>
              <Select value={disciplineId} onValueChange={setDisciplineId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map((d, idx) => (
                    <SelectItem key={`${d.id}-${idx}`} value={d.id} className="text-xs">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time inputs */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tempo estudado</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    placeholder="0"
                    value={hours}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === "" || (Number(v) >= 0 && Number(v) <= 24)) setHours(v)
                    }}
                    className="h-9 text-center text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground text-center mt-0.5">horas</p>
                </div>
                <span className="text-lg font-bold text-muted-foreground mt-[-14px]">:</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={minutes}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === "" || (Number(v) >= 0 && Number(v) <= 59)) setMinutes(v)
                    }}
                    className="h-9 text-center text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground text-center mt-0.5">minutos</p>
                </div>
              </div>
              {totalMinutes > 0 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Total: {Math.floor(totalMinutes / 60)}h{totalMinutes % 60 > 0 ? `${totalMinutes % 60}min` : "00min"}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-row items-center gap-2 sm:gap-2">
          {existingSessionId && !showDeleteConfirm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="h-8 px-2 text-[11px] text-muted-foreground hover:text-destructive mr-auto"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Remover
            </Button>
          )}
          {showDeleteConfirm && (
            <div className="flex items-center gap-1.5 mr-auto">
              <span className="text-[11px] text-muted-foreground">Remover?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
                className="h-7 px-2 text-[10px]"
              >
                Sim
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-7 px-2 text-[10px]"
              >
                Não
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 px-3 text-[11px] font-bold"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
            className="h-8 px-3 text-[11px] font-bold"
          >
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
