"use client"

import { useState } from "react"
import { Calendar, Clock, MapPin, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { saveUserExamAction, deleteUserExamAction } from "@/application/dashboard/user-exam.action"

import { useRouter } from "next/navigation"

export interface UserExamData {
  examName?: string | null
  examDate?: string | null
  examTime?: string | null
  examLocation?: string | null
  exam_name?: string | null
  exam_date?: string | null
  exam_time?: string | null
  exam_location?: string | null
  target_exam?: string | null
}

export interface UserExamModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: UserExamData | null | undefined
  defaultExamName?: string | null | undefined
  onSuccess?: () => void
}

export function UserExamModal({
  open,
  onOpenChange,
  initialData,
  defaultExamName,
  onSuccess,
}: UserExamModalProps) {
  const router = useRouter()

  const initialExamName = initialData?.exam_name || initialData?.examName || initialData?.target_exam || defaultExamName || ""
  const initialExamDate = initialData?.exam_date || initialData?.examDate || ""
  const initialExamTime = initialData?.exam_time || initialData?.examTime || ""
  const initialExamLocation = initialData?.exam_location || initialData?.examLocation || ""

  const [examName, setExamName] = useState(initialExamName)
  const [examDate, setExamDate] = useState(initialExamDate)
  const [examTime, setExamTime] = useState(initialExamTime)
  const [examLocation, setExamLocation] = useState(initialExamLocation)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEditing = Boolean(initialData?.exam_date || initialData?.examDate)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!examDate) {
      toast.error("Por favor, selecione a data da prova.")
      return
    }

    setLoading(true)
    try {
      const result = await saveUserExamAction({
        examName,
        examDate,
        examTime,
        examLocation,
      })

      if (result.success) {
        toast.success(isEditing ? "Data da prova atualizada com sucesso!" : "Data da prova cadastrada com sucesso!")
        onOpenChange(false)
        router.refresh()
        if (onSuccess) onSuccess()
      } else {
        toast.error(result.error || "Erro ao salvar data da prova.")
      }
    } catch {
      toast.error("Erro inesperado ao conectar ao banco de dados.")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja excluir a data desta prova?")) return

    setDeleting(true)
    try {
      const result = await deleteUserExamAction()

      if (result.success) {
        toast.success("Data da prova excluída com sucesso.")
        onOpenChange(false)
        router.refresh()
        if (onSuccess) onSuccess()
      } else {
        toast.error(result.error || "Erro ao excluir prova.")
      }
    } catch {
      toast.error("Erro inesperado ao excluir prova.")
    } finally {
      setDeleting(false)
    }
  }

  let saveButtonLabel = "Salvar Prova"
  if (loading) {
    saveButtonLabel = "Salvando..."
  } else if (isEditing) {
    saveButtonLabel = "Atualizar Prova"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 rounded-2xl">
        <DialogHeader className="space-y-1 text-left border-b pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-foreground">
                {isEditing ? "Editar Data da Prova" : "Cadastrar Data da Prova"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Acompanhe a contagem regressiva para o dia do seu concurso.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {/* Nome da Prova */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground block">
              Nome do Concurso / Cargo <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Input
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="Ex: Analista Tributário - Receita Federal"
              className="text-xs rounded-xl"
            />
          </div>

          {/* Data da Prova */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
              Data da Prova <span className="text-rose-500">*</span>
            </label>
            <Input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              required
              className="text-xs rounded-xl"
            />
          </div>

          {/* Horário e Local (Grid 2 colunas) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Horário <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <Input
                type="time"
                value={examTime}
                onChange={(e) => setExamTime(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Local <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <Input
                value={examLocation}
                onChange={(e) => setExamLocation(e.target.value)}
                placeholder="Ex: Bloco B - Unicamp"
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-between pt-4 border-t gap-2">
            {isEditing ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || loading}
                className="h-9 px-3 text-xs font-bold rounded-xl flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{deleting ? "Excluindo..." : "Excluir"}</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={loading || deleting}
                className="h-9 px-5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs"
              >
                {saveButtonLabel}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

