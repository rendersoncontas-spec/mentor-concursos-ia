"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ArrowDown,
  ArrowUp,
  Clock,
  Layers,
  Minus,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { updateFullCycleAction } from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DEFAULT_MINUTES_BY_DIFFICULTY,
  getDefaultMinutesByDifficulty,
  normalizeDifficulty,
  type CycleItemDifficulty,
  type CycleOverview,
  type UpdateCycleInput,
} from "@/domain/study-cycle/study-cycle.types"

const formatMinutesDigitalLocal = (m: number) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}
import { cn } from "@/lib/utils"

interface EditItem {
  id?: string | undefined
  disciplineId?: string | undefined
  disciplineName: string
  disciplineArea: string | null
  difficulty: CycleItemDifficulty
  plannedMinutes: number
}

interface EditCycleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  overview: CycleOverview | null
  availableDisciplines: { id: string; name: string; area: string | null }[]
  onComplete?: () => void
}

const DIFFICULTY_OPTIONS: { value: CycleItemDifficulty; label: string; color: string }[] = [
  { value: "FACIL", label: "Fácil", color: "text-emerald-600 dark:text-emerald-400" },
  { value: "MEDIA", label: "Média", color: "text-amber-600 dark:text-amber-400" },
  { value: "DIFICIL", label: "Difícil", color: "text-rose-600 dark:text-rose-400" },
]

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}min`
  if (min === 0) return `${h}h`
  return `${h}h ${min}min`
}

export function EditCycleModal({
  open,
  onOpenChange,
  overview,
  availableDisciplines = [],
  onComplete,
}: EditCycleModalProps) {
  const [cycleName, setCycleName] = useState("")
  const [contestName, setContestName] = useState("")
  const [editalName, setEditalName] = useState("")
  const [items, setItems] = useState<EditItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (overview) {
      setCycleName(overview.cycle.name)
      setContestName(overview.cycle.contest_name || "")
      setEditalName(overview.cycle.edital_name || "")

      const currentIds = items.map((i) => i.id).filter((id): id is string => id !== undefined)
      const currentDifficulties = new Map<string, CycleItemDifficulty>()
      items.forEach((item) => {
        if (item.id !== undefined) {
          currentDifficulties.set(item.id, normalizeDifficulty(item.difficulty))
        }
      })

      setItems(
        overview.items.map((i) => ({
          id: i.itemId,
          disciplineId: i.disciplineId,
          disciplineName: i.disciplineName,
          disciplineArea: i.disciplineArea,
          difficulty: normalizeDifficulty(i.difficulty),
          plannedMinutes: i.plannedMinutes,
        }))
      )

      setItems((prev) =>
        prev.map((item) => {
          if (item.id) {
            const existingDifficulty = currentDifficulties.get(item.id)
            if (existingDifficulty && item.difficulty !== existingDifficulty) {
              return { ...item, difficulty: existingDifficulty }
            }
          }
          return item
        })
      )
    }
  }, [overview?.cycle.id])

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return
    setItems((prev) => {
      const next = [...prev]
      const temp = next[index - 1]
      const current = next[index]
      if (temp && current) {
        next[index - 1] = current
        next[index] = temp
      }
      return next
    })
  }, [])

  const handleMoveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      const temp = next[index + 1]
      const current = next[index]
      if (temp && current) {
        next[index + 1] = current
        next[index] = temp
      }
      return next
    })
  }, [])

  const handleMinutesChange = useCallback((index: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const newMin = Math.max(15, Math.min(360, item.plannedMinutes + delta))
          return { ...item, plannedMinutes: newMin }
        }
        return item
      })
    )
  }, [])

  const handleDifficultyChange = useCallback((index: number, diff: CycleItemDifficulty) => {
    const normalized = normalizeDifficulty(diff)
    const defaultMinutes = getDefaultMinutesByDifficulty(normalized)
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, difficulty: normalized, plannedMinutes: defaultMinutes } : item
      )
    )
  }, [])

  const handleRemove = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const filteredDisciplines = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return []
    return availableDisciplines.filter(
      (d) =>
        d.name.toLowerCase().includes(term) &&
        !items.some((it) => it.disciplineName.toLowerCase() === d.name.toLowerCase())
    )
  }, [availableDisciplines, searchTerm, items])

  const handleAddDiscipline = useCallback(
    (discipline: { id?: string; name: string; area: string | null }) => {
      const trimmed = discipline.name.trim()
      if (items.some((i) => i.disciplineName.toLowerCase() === trimmed.toLowerCase())) {
        toast.error("Esta matéria já está no ciclo.")
        return
      }

      setItems((prev) => [
        ...prev,
        {
          disciplineId: discipline.id,
          disciplineName: trimmed,
          disciplineArea: discipline.area || "Geral",
          difficulty: "MEDIA",
          plannedMinutes: DEFAULT_MINUTES_BY_DIFFICULTY.MEDIA,
        },
      ])
      setSearchTerm("")
    },
    [items]
  )

  const handleAddCustom = useCallback(() => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return
    if (items.some((i) => i.disciplineName.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Esta matéria já está no ciclo!")
      return
    }

    const matchDb = availableDisciplines.find(
      (d) => d.name.toLowerCase() === trimmed.toLowerCase()
    )

    setItems((prev) => [
      ...prev,
      {
        disciplineId: matchDb?.id,
        disciplineName: matchDb?.name || trimmed,
        disciplineArea: matchDb?.area || "Geral",
        difficulty: "MEDIA",
        plannedMinutes: DEFAULT_MINUTES_BY_DIFFICULTY.MEDIA,
      },
    ])
    setSearchTerm("")
  }, [searchTerm, items, availableDisciplines])

  const totalMinutes = items.reduce((acc, i) => acc + i.plannedMinutes, 0)

  const handleSave = async () => {
    if (!overview) return
    if (!cycleName.trim()) {
      toast.error("Informe o nome do ciclo.")
      return
    }
    if (items.length === 0) {
      toast.error("O ciclo precisa ter pelo menos uma matéria.")
      return
    }

    setIsSubmitting(true)
    try {
      const payload: UpdateCycleInput = {
        id: overview.cycle.id,
        name: cycleName.trim(),
        contestName: contestName.trim() || null,
        editalName: editalName.trim() || null,
        items: items.map((item, idx) => ({
          id: item.id,
          disciplineId: item.disciplineId,
          disciplineName: item.disciplineName,
          difficulty: normalizeDifficulty(item.difficulty),
          plannedMinutes: item.plannedMinutes,
          order: idx + 1,
        })),
      }

      const res = await updateFullCycleAction(payload)
      if (res.success) {
        toast.success("Ciclo atualizado com sucesso!")
        onOpenChange(false)
        onComplete?.()
      } else {
        toast.error(res.error || "Erro ao salvar alterações do ciclo.")
      }
    } catch {
      toast.error("Erro inesperado ao salvar alterações.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* CABEÇALHO */}
        <div className="p-5 border-b bg-muted/20">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Editar Ciclo de Estudos
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-1">
            Altere matérias, tempos de meta e ordem da fila sem perder o histórico do ciclo.
          </p>
        </div>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* INFORMAÇÕES BÁSICAS */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-foreground">Nome do Ciclo *</label>
              <Input
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                placeholder="Ex: Auditor Fiscal da Receita Federal"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-foreground">Concurso Alvo (Opcional)</label>
                <Input
                  value={contestName}
                  onChange={(e) => setContestName(e.target.value)}
                  placeholder="Ex: Receita Federal"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground">Edital / Cargo (Opcional)</label>
                <Input
                  value={editalName}
                  onChange={(e) => setEditalName(e.target.value)}
                  placeholder="Ex: 2026 - Auditor"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* ADICIONAR MATÉRIA */}
          <div className="space-y-2 pt-2 border-t">
            <label className="text-xs font-bold text-foreground">Adicionar Matéria à Fila</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Pesquise ou digite uma nova matéria..."
                  className="pl-9 text-xs"
                />
              </div>
              {searchTerm.trim() && (
                <Button
                  size="sm"
                  onClick={handleAddCustom}
                  className="text-xs font-bold bg-primary text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>

            {/* SUGESTÕES DE AUTOCOMPLETE */}
            {filteredDisciplines.length > 0 && (
              <div className="max-h-36 overflow-y-auto border rounded-xl p-1 bg-background space-y-0.5 shadow-sm">
                {filteredDisciplines.slice(0, 5).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleAddDiscipline(d)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-muted font-medium flex items-center justify-between"
                  >
                    <span>{d.name}</span>
                    <span className="text-[10px] text-muted-foreground">{d.area || "Geral"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* LISTA DE MATÉRIAS CONFIGURADAS */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-foreground">
                Fila de Matérias ({items.length})
              </span>
              <span className="text-xs font-bold text-primary">
                Total: {formatMinutes(totalMinutes)} por volta
              </span>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {items.map((item, index) => (
                <div
                  key={`${item.disciplineName}-${index}`}
                  className="p-3 rounded-xl border bg-card/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-black text-muted-foreground w-6 text-center">
                      #{index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground truncate">
                        {item.disciplineName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{item.disciplineArea || "Geral"}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* SELETOR DE DIFICULDADE */}
                    <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 text-[11px] font-bold gap-0.5">
                      {DIFFICULTY_OPTIONS.map((opt) => {
                        const isSelected = normalizeDifficulty(item.difficulty) === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleDifficultyChange(index, opt.value)}
                            className={cn(
                              "px-2.5 py-1 rounded-md transition-all font-bold cursor-pointer select-none",
                              isSelected && opt.value === "FACIL" && "bg-emerald-500 text-white font-black shadow-xs ring-1 ring-emerald-600/30",
                              isSelected && opt.value === "MEDIA" && "bg-amber-500 text-white font-black shadow-xs ring-1 ring-amber-600/30",
                              isSelected && opt.value === "DIFICIL" && "bg-rose-500 text-white font-black shadow-xs ring-1 ring-rose-600/30",
                              !isSelected && opt.value === "FACIL" && "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20",
                              !isSelected && opt.value === "MEDIA" && "text-muted-foreground hover:text-amber-600 hover:bg-amber-50/60 dark:hover:bg-amber-950/20",
                              !isSelected && opt.value === "DIFICIL" && "text-muted-foreground hover:text-rose-600 hover:bg-rose-50/60 dark:hover:bg-rose-950/20"
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* AJUSTE DE MINUTOS */}
                    <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMinutesChange(index, -15)}
                        disabled={item.plannedMinutes <= 15}
                        className="h-6 w-6"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
<span className="text-xs font-black w-14 text-center">
                          {formatMinutesDigitalLocal(item.plannedMinutes)}
                        </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMinutesChange(index, 15)}
                        disabled={item.plannedMinutes >= 360}
                        className="h-6 w-6"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* ORDENAÇÃO */}
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="h-7 w-7"
                        title="Mover para cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === items.length - 1}
                        className="h-7 w-7"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(index)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        title="Remover matéria"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="p-4 border-t bg-muted/20 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSubmitting}
            className="bg-primary text-primary-foreground font-black text-xs gap-1.5 shadow-sm"
          >
            <Save className="h-3.5 w-3.5" />
            {isSubmitting ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
