"use client"

import { useCallback, useMemo, useState } from "react"

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  Layers,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { createCycleAction } from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DEFAULT_MINUTES_BY_DIFFICULTY,
  getDefaultMinutesByDifficulty,
  normalizeDifficulty,
  type CreateCycleInput,
  type CycleItemDifficulty,
} from "@/domain/study-cycle/study-cycle.types"

// Reexportação local para conveniência de formatação digital (HH:MM)
const formatMinutesDigitalLocal = (m: number) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}
import { cn } from "@/lib/utils"

const DEFAULT_CONCURSO_DISCIPLINES = [
  "Língua Portuguesa",
  "Direito Constitucional",
  "Direito Administrativo",
  "Raciocínio Lógico e Matemático",
  "Informática Básica e Avançada",
  "Direito Tributário",
  "Contabilidade Geral",
  "Contabilidade Pública",
  "Auditoria Governamental",
  "Administração Geral",
  "Administração Pública",
  "Administração Financeira e Orçamentária (AFO)",
  "Direito Penal",
  "Direito Processual Penal",
  "Direito Civil",
  "Direito Processual Civil",
  "Legislação Tributária",
  "Comércio Internacional",
  "Legislação Aduaneira",
  "Economia e Finanças Públicas",
  "Estatística",
  "Tecnologia da Informação",
  "Ética no Serviço Público",
  "Redação Oficial",
  "Direitos Humanos",
  "Direito Previdenciário",
  "Direito do Trabalho",
  "Direito Processual do Trabalho",
  "Direito Eleitoral",
  "Língua Inglesa",
  "Língua Espanhola",
]

interface CreateCycleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableDisciplines: { id: string; name: string; area: string | null }[]
  onComplete?: () => void
}

interface SelectedItem {
  disciplineId?: string | undefined
  disciplineName: string
  disciplineArea: string | null
  difficulty: CycleItemDifficulty
  plannedMinutes: number
}

type Step = "identification" | "selection" | "configuration"

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

export function CreateCycleModal({
  open,
  onOpenChange,
  availableDisciplines = [],
  onComplete,
}: CreateCycleModalProps) {
  const [step, setStep] = useState<Step>("identification")
  const [cycleName, setCycleName] = useState("")
  const [contestName, setContestName] = useState("")
  const [editalName, setEditalName] = useState("")
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = useCallback(() => {
    setStep("identification")
    setCycleName("")
    setContestName("")
    setEditalName("")
    setSelectedItems([])
    setSearchTerm("")
  }, [])

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  // Lista combinada de disciplinas para busca rápida
  const allDisciplineCatalog = useMemo(() => {
    const list: { id?: string; name: string; area: string | null }[] = []
    const seenNames = new Set<string>()

    for (const d of availableDisciplines) {
      if (!seenNames.has(d.name.toLowerCase().trim())) {
        seenNames.add(d.name.toLowerCase().trim())
        list.push(d)
      }
    }

    for (const name of DEFAULT_CONCURSO_DISCIPLINES) {
      if (!seenNames.has(name.toLowerCase().trim())) {
        seenNames.add(name.toLowerCase().trim())
        list.push({ name, area: "Geral" })
      }
    }

    return list
  }, [availableDisciplines])

  const filteredDisciplines = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    return allDisciplineCatalog.filter(
      (d) =>
        d.name.toLowerCase().includes(term) &&
        !selectedItems.some((s) => s.disciplineName.toLowerCase() === d.name.toLowerCase())
    )
  }, [allDisciplineCatalog, searchTerm, selectedItems])

  const handleAddDiscipline = useCallback(
    (discipline: { id?: string; name: string; area: string | null }) => {
      const trimmed = discipline.name.trim()
      if (selectedItems.some((s) => s.disciplineName.toLowerCase() === trimmed.toLowerCase())) {
        toast.error("Esta matéria já foi adicionada ao ciclo.")
        return
      }

      setSelectedItems((prev) => [
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
    [selectedItems]
  )

  const handleAddCustomDiscipline = useCallback(() => {
    const trimmed = searchTerm.trim()
    if (!trimmed) return
    if (selectedItems.some((s) => s.disciplineName.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Esta matéria já está no ciclo!")
      return
    }

    const existingInDb = availableDisciplines.find(
      (d) => d.name.toLowerCase() === trimmed.toLowerCase()
    )

    setSelectedItems((prev) => [
      ...prev,
      {
        disciplineId: existingInDb?.id,
        disciplineName: existingInDb?.name || trimmed,
        disciplineArea: existingInDb?.area || "Geral",
        difficulty: "MEDIA",
        plannedMinutes: DEFAULT_MINUTES_BY_DIFFICULTY.MEDIA,
      },
    ])
    setSearchTerm("")
    toast.success(`Matéria "${trimmed}" adicionada!`)
  }, [searchTerm, selectedItems, availableDisciplines])

  const handleRemoveItem = useCallback((index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return
    setSelectedItems((prev) => {
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
    setSelectedItems((prev) => {
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
    setSelectedItems((prev) =>
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
    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, difficulty: normalized, plannedMinutes: defaultMinutes }
        }
        return item
      })
    )
  }, [])

  const totalMinutesPerRound = selectedItems.reduce((acc, i) => acc + i.plannedMinutes, 0)

  const handleCreate = async () => {
    if (!cycleName.trim()) {
      toast.error("Informe um nome para o ciclo.")
      setStep("identification")
      return
    }

    if (selectedItems.length === 0) {
      toast.error("Selecione pelo menos uma matéria para o ciclo.")
      setStep("selection")
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
          disciplineName: item.disciplineName,
          difficulty: item.difficulty,
          plannedMinutes: item.plannedMinutes,
        })),
      }

      const res = await createCycleAction(input)

      if (res.success) {
        toast.success("Ciclo de estudos criado com sucesso!")
        onOpenChange(false)
        resetForm()
        onComplete?.()
      } else {
        toast.error(res.error || "Erro ao criar ciclo.")
      }
    } catch {
      toast.error("Ocorreu um erro ao criar o ciclo. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* CABEÇALHO DO MODAL */}
        <div className="p-5 border-b bg-muted/20">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Criar Ciclo de Estudos
            </DialogTitle>
          </DialogHeader>

          {/* INDICADOR DE ETAPAS */}
          <div className="flex items-center gap-2 mt-3">
            {[
              { key: "identification", label: "1. Identificação" },
              { key: "selection", label: "2. Matérias" },
              { key: "configuration", label: "3. Metas & Resumo" },
            ].map((s) => (
              <div
                key={s.key}
                className={cn(
                  "flex-1 text-center py-1 rounded-md text-xs font-bold transition-all",
                  step === s.key
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ETAPA 1: IDENTIFICAÇÃO */}
          {step === "identification" && (
            <div className="space-y-4 max-w-md mx-auto py-2">
              <div>
                <label className="text-xs font-bold text-foreground">Nome do Ciclo *</label>
                <Input
                  value={cycleName}
                  onChange={(e) => setCycleName(e.target.value)}
                  placeholder="Ex: Receita Federal - Auditor Fiscal"
                  className="mt-1"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Dê um nome para identificar a preparação (ex: Ciclo Básico, Polícia Federal, etc).
                </p>
              </div>

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
                  placeholder="Ex: Auditor Fiscal - Edital 2026"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* ETAPA 2: SELEÇÃO DE MATÉRIAS */}
          {step === "selection" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Pesquise uma matéria ou digite para adicionar nova..."
                    className="pl-9 text-xs"
                  />
                </div>
                {searchTerm.trim() && (
                  <Button
                    size="sm"
                    onClick={handleAddCustomDiscipline}
                    className="text-xs font-bold bg-primary text-primary-foreground"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar
                  </Button>
                )}
              </div>

              {/* LISTA DE MATÉRIAS SUGERIDAS */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Catálogo de disciplinas para concurso (clique para incluir)
                </p>
                <div className="max-h-48 overflow-y-auto border rounded-xl p-1 bg-background divide-y">
                  {filteredDisciplines.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => handleAddDiscipline(d)}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-muted/80 font-medium flex items-center justify-between transition-colors"
                    >
                      <span className="font-bold text-foreground">{d.name}</span>
                      <span className="text-[10px] text-muted-foreground">{d.area || "Geral"}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* MATÉRIAS JÁ SELECIONADAS */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-foreground">
                    Matérias no Ciclo ({selectedItems.length})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Você poderá ordenar e definir o tempo no próximo passo
                  </span>
                </div>

                {selectedItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-3 text-center">
                    Nenhuma matéria adicionada ainda. Selecione disciplinas acima.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                    {selectedItems.map((item, index) => (
                      <span
                        key={item.disciplineName}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-primary/10 border border-primary/20 text-foreground"
                      >
                        <span>{item.disciplineName}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-muted-foreground hover:text-rose-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ETAPA 3: CONFIGURAÇÃO DE METAS, ORDENAÇÃO E RESUMO */}
          {step === "configuration" && (
            <div className="space-y-5">
              {/* RESUMO DO CICLO */}
              <div className="p-4 rounded-xl bg-muted/30 border space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-black text-foreground">
                    Ciclo: {cycleName}
                  </span>
                  <span className="text-xs font-black text-primary">
                    Tempo por volta: {formatMinutes(totalMinutesPerRound)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedItems.length} matérias organizadas em sequência rotativa contínua.
                </p>
              </div>

              {/* SEQUÊNCIA CONFIGURÁVEL */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-foreground block">
                  Sequência do Ciclo (Ajuste tempo, dificuldade e ordem)
                </span>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedItems.map((item, index) => (
                    <div
                      key={item.disciplineName}
                      className="p-3 rounded-xl border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
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

                        {/* AJUSTE DE MINUTOS (Passos de 15 min até 6h) */}
                        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMinutesChange(index, -15)}
                            disabled={item.plannedMinutes <= 15}
                            className="h-6 w-6"
                            title="-15 min"
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
                            title="+15 min"
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
                            disabled={index === selectedItems.length - 1}
                            className="h-7 w-7"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
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
          )}
        </div>

        {/* RODAPÉ E NAVEGAÇÃO DE PASSOS */}
        <div className="p-4 border-t bg-muted/20 flex items-center justify-between">
          <div>
            {step !== "identification" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setStep(step === "configuration" ? "selection" : "identification")
                }
                className="text-xs font-bold gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
            )}
          </div>

          <div>
            {step === "identification" && (
              <Button
                size="sm"
                onClick={() => {
                  if (!cycleName.trim()) {
                    toast.error("Informe um nome para o ciclo.")
                    return
                  }
                  setStep("selection")
                }}
                className="text-xs font-black bg-primary text-primary-foreground gap-1"
              >
                Próximo: Matérias
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}

            {step === "selection" && (
              <Button
                size="sm"
                onClick={() => {
                  if (selectedItems.length === 0) {
                    toast.error("Selecione pelo menos uma matéria para o ciclo.")
                    return
                  }
                  setStep("configuration")
                }}
                className="text-xs font-black bg-primary text-primary-foreground gap-1"
              >
                Próximo: Metas
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}

            {step === "configuration" && (
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isSubmitting || selectedItems.length === 0}
                className="text-xs font-black bg-primary text-primary-foreground gap-1.5 shadow-md"
              >
                <Check className="h-4 w-4" />
                {isSubmitting ? "Criando ciclo..." : "Criar ciclo"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
