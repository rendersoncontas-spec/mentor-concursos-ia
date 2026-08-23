"use client"

import { useCallback, useEffect, useState } from "react"

import { ArrowLeft, ArrowRight, Check, GripVertical, Minus, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"

import { createCycleAction } from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CycleItemPriority, CreateCycleInput } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"

interface CreateCycleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableDisciplines: { id: string; name: string; area: string | null }[]
  onComplete?: () => void
}

interface SelectedItem {
  disciplineId: string
  disciplineName: string
  priority: CycleItemPriority
  plannedMinutes: number
}

type Step = "identification" | "selection" | "review"

const PRIORITY_OPTIONS: { value: CycleItemPriority; label: string }[] = [
  { value: "ALTA", label: "Alta" },
  { value: "MEDIA", label: "Média" },
  { value: "BAIXA", label: "Baixa" },
]

const MINUTES_PRESETS = [30, 45, 60, 90, 120, 150]

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}min`
  if (min === 0) return `${h}h`
  return `${h}h${min}min`
}

export function CreateCycleModal({
  open,
  onOpenChange,
  availableDisciplines,
  onComplete,
}: CreateCycleModalProps) {
  const [step, setStep] = useState<Step>("identification")
  const [cycleName, setCycleName] = useState("")
  const [contestName, setContestName] = useState("")
  const [editalName, setEditalName] = useState("")
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setStep("identification")
      setCycleName("")
      setContestName("")
      setEditalName("")
      setSelectedItems([])
      setSearchTerm("")
    }
  }, [open])

  const filteredDisciplines = availableDisciplines.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedItems.some((s) => s.disciplineId === d.id)
  )

  const handleAddDiscipline = useCallback(
    (discipline: { id: string; name: string }) => {
      setSelectedItems((prev) => [
        ...prev,
        {
          disciplineId: discipline.id,
          disciplineName: discipline.name,
          priority: "MEDIA" as CycleItemPriority,
          plannedMinutes: 60,
        },
      ])
    },
    []
  )

  const handleRemoveDiscipline = useCallback((disciplineId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.disciplineId !== disciplineId))
  }, [])

  const handleUpdatePriority = useCallback((disciplineId: string, priority: CycleItemPriority) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.disciplineId === disciplineId ? { ...i, priority } : i))
    )
  }, [])

  const handleUpdateMinutes = useCallback((disciplineId: string, minutes: number) => {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.disciplineId === disciplineId
          ? { ...i, plannedMinutes: Math.max(5, Math.min(480, minutes)) }
          : i
      )
    )
  }, [])

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return
    setSelectedItems((prev) => {
      const next = [...prev]
      const a = next[index]
      const b = next[index - 1]
      if (!a || !b) return prev
      next[index] = b
      next[index - 1] = a
      return next
    })
  }, [])

  const handleMoveDown = useCallback((index: number) => {
    setSelectedItems((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      const a = next[index]
      const b = next[index + 1]
      if (!a || !b) return prev
      next[index] = b
      next[index + 1] = a
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!cycleName.trim()) {
      toast.error("Informe o nome do ciclo.")
      return
    }
    if (selectedItems.length === 0) {
      toast.error("Selecione pelo menos uma matéria.")
      return
    }

    setIsSubmitting(true)
    try {
      const input: CreateCycleInput = {
        name: cycleName.trim(),
        contestName: contestName.trim() || null,
        editalName: editalName.trim() || null,
        items: selectedItems.map((item) => ({
          disciplineId: item.disciplineId,
          priority: item.priority,
          plannedMinutes: item.plannedMinutes,
        })),
      }

      const result = await createCycleAction(input)
      if (result.success) {
        toast.success("Ciclo criado com sucesso!")
        onOpenChange(false)
        onComplete?.()
      } else {
        toast.error(result.error || "Erro ao criar ciclo.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [cycleName, contestName, editalName, selectedItems, onOpenChange, onComplete])

  const totalMinutes = selectedItems.reduce((s, i) => s + i.plannedMinutes, 0)

  const canNextStep =
    (step === "identification" && cycleName.trim().length > 0) ||
    (step === "selection" && selectedItems.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-card border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Criar Ciclo de Estudo</h2>
              <div className="flex items-center gap-2 mt-1">
                {(["identification", "selection", "review"] as Step[]).map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                        step === s
                          ? "bg-[#2563EB] text-white"
                          : i < ["identification", "selection", "review"].indexOf(step)
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {i < ["identification", "selection", "review"].indexOf(step) ? "✓" : i + 1}
                    </div>
                    {i < 2 && (
                      <div
                        className={cn(
                          "w-6 h-0.5",
                          i < ["identification", "selection", "review"].indexOf(step)
                            ? "bg-emerald-500"
                            : "bg-muted"
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {step === "identification" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  Nome do ciclo <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Ex: Ciclo Receita Federal"
                  value={cycleName}
                  onChange={(e) => setCycleName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Concurso</label>
                <Input
                  placeholder="Ex: Receita Federal — Auditor Fiscal"
                  value={contestName}
                  onChange={(e) => setContestName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Edital (opcional)</label>
                <Input
                  placeholder="Ex: Edital Receita Federal 2026"
                  value={editalName}
                  onChange={(e) => setEditalName(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === "selection" && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar disciplina..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {selectedItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Selecionadas ({selectedItems.length})
                  </p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {selectedItems.map((item, index) => (
                      <div
                        key={item.disciplineId}
                        className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2"
                      >
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <Plus className="h-3 w-3 rotate-180" />
                          </button>
                          <button
                            onClick={() => handleMoveDown(index)}
                            disabled={index === selectedItems.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.disciplineName}
                          </p>
                        </div>
                        <Select
                          value={item.priority}
                          onValueChange={(v) =>
                            handleUpdatePriority(item.disciplineId, v as CycleItemPriority)
                          }
                        >
                          <SelectTrigger className="w-20 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (
                              <SelectItem key={p.value} value={p.value} className="text-xs">
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              handleUpdateMinutes(item.disciplineId, item.plannedMinutes - 15)
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-xs font-bold text-foreground w-10 text-center">
                            {formatMinutes(item.plannedMinutes)}
                          </span>
                          <button
                            onClick={() =>
                              handleUpdateMinutes(item.disciplineId, item.plannedMinutes + 15)
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleRemoveDiscipline(item.disciplineId)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Disponíveis
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {filteredDisciplines.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Nenhuma disciplina disponível
                    </p>
                  )}
                  {filteredDisciplines.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleAddDiscipline(d)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-muted/50 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{d.name}</span>
                      {d.area && (
                        <span className="text-xs text-muted-foreground ml-auto">{d.area}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nome
                </p>
                <p className="text-sm font-semibold text-foreground">{cycleName}</p>
                {contestName && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-2">
                      Concurso
                    </p>
                    <p className="text-sm text-foreground">{contestName}</p>
                  </>
                )}
                {editalName && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-2">
                      Edital
                    </p>
                    <p className="text-sm text-foreground">{editalName}</p>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Matérias: </span>
                  <span className="font-bold text-foreground">{selectedItems.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tempo total: </span>
                  <span className="font-bold text-foreground">{formatMinutes(totalMinutes)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Sequência
                </p>
                <div className="space-y-1">
                  {selectedItems.map((item, index) => (
                    <div
                      key={item.disciplineId}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
                    >
                      <span className="text-xs font-bold text-muted-foreground w-5">
                        {index + 1}.
                      </span>
                      <span className="flex-1 text-sm text-foreground">{item.disciplineName}</span>
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded",
                          item.priority === "ALTA" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          item.priority === "MEDIA" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                          item.priority === "BAIXA" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}
                      >
                        {item.priority}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMinutes(item.plannedMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t px-6 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step === "identification") onOpenChange(false)
              else if (step === "selection") setStep("identification")
              else setStep("selection")
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {step === "identification" ? "Cancelar" : "Voltar"}
          </Button>
          {step === "review" ? (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold"
            >
              <Check className="h-4 w-4 mr-1" />
              {isSubmitting ? "Criando..." : "Criar ciclo"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setStep(step === "identification" ? "selection" : "review")}
              disabled={!canNextStep}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold"
            >
              Próximo
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
