"use client"

import { useState } from "react"
import { BellRing, Plus, CheckCircle2, Circle, Trash2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface ReminderItem {
  id: string
  title: string
  completed: boolean
  dueDate?: string | undefined
  createdAt: string
}

function getSavedReminders(): ReminderItem[] {
  if (typeof window === "undefined") return []
  const saved = localStorage.getItem("mentor_user_reminders")
  if (!saved) return []
  try {
    return JSON.parse(saved) as ReminderItem[]
  } catch {
    return []
  }
}

export function RemindersWidget({ className }: { className?: string }) {
  const [reminders, setReminders] = useState<ReminderItem[]>(getSavedReminders)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDate, setNewDate] = useState("")


  // Salvar no localStorage
  const saveReminders = (updated: ReminderItem[]) => {
    setReminders(updated)
    localStorage.setItem("mentor_user_reminders", JSON.stringify(updated))
  }

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    const item: ReminderItem = {
      id: `rem-${Date.now()}`,
      title: newTitle.trim(),
      completed: false,
      dueDate: newDate || undefined,
      createdAt: new Date().toISOString(),
    }

    saveReminders([item, ...reminders])
    setNewTitle("")
    setNewDate("")
    setIsModalOpen(false)
  }

  const toggleReminder = (id: string) => {
    const updated = reminders.map((r) =>
      r.id === id ? { ...r, completed: !r.completed } : r
    )
    saveReminders(updated)
  }

  const deleteReminder = (id: string) => {
    const updated = reminders.filter((r) => r.id !== id)
    saveReminders(updated)
  }

  return (
    <div className={cn("rounded-xl border bg-card p-5 shadow-sm space-y-4 flex flex-col justify-between min-h-[300px] h-full", className)}>
      {/* Card Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            LEMBRETES
          </h3>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="h-7 text-xs font-semibold gap-1 text-primary hover:text-primary hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Criar Lembrete</span>
        </Button>
      </div>

      {/* Lista ou Estado Vazio */}
      {reminders.length === 0 ? (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-6 px-4">
          {/* Ilustração Padrão Estudei */}
          <div className="flex flex-col gap-2 p-4 rounded-xl border bg-muted/20 w-44 shrink-0 shadow-inner">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <div className="h-2 w-20 bg-emerald-500/30 rounded" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted border text-muted-foreground">
              <Circle className="h-4 w-4 shrink-0" />
              <div className="h-2 w-24 bg-muted-foreground/20 rounded" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted border text-muted-foreground">
              <Circle className="h-4 w-4 shrink-0" />
              <div className="h-2 w-16 bg-muted-foreground/20 rounded" />
            </div>
          </div>

          {/* Texto de Estado Vazio */}
          <div className="space-y-3 text-center sm:text-left flex-1">
            <h4 className="font-bold text-base text-foreground leading-snug">
              Você ainda não criou nenhum lembrete.
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              Use este espaço para anotar coisas importantes: datas de inscrição, provas, boletos a pagar, aulas ao vivo...
            </p>
            <div className="pt-1">
              <Button
                onClick={() => setIsModalOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-5 shadow-sm"
              >
                Criar Lembrete
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {reminders.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                item.completed
                  ? "bg-muted/30 border-muted text-muted-foreground line-through opacity-75"
                  : "bg-card border-border hover:border-primary/40 shadow-2xs"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => toggleReminder(item.id)}
                  className="text-primary hover:scale-110 transition-transform shrink-0"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate text-foreground">{item.title}</p>
                  {item.dueDate && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3" /> {item.dueDate}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => deleteReminder(item.id)}
                className="text-muted-foreground/50 hover:text-rose-500 p-1 rounded transition-colors"
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar Lembrete */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <BellRing className="h-4 w-4 text-primary" />
              Criar Novo Lembrete
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddReminder} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Título do Lembrete *
              </label>
              <Input
                placeholder="Ex: Inscrição Concurso PF, Aula de Português..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Data do Evento (Opcional)
              </label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
                Salvar Lembrete
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
