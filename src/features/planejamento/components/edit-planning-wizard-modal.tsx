"use client"

import { useState, useMemo, useEffect } from "react"
import {
  RotateCcw,
  Calendar,
  HelpCircle,
  Loader2,
  Sparkles,
  Search,
  X
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { type StudyCycleBlock } from "./estudei-planning-view"
import { generateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"

export interface EditPlanningWizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modalTitle?: string
  initialBlocks?: StudyCycleBlock[]
  onComplete?: () => void
}

const ALL_DISCIPLINES = [
  "Administração Geral",
  "Administração Pública",
  "Contabilidade Geral",
  "Direito Administrativo",
  "Direito Constitucional",
  "Direito Previdenciário",
  "Direito Tributário",
  "Estatística",
  "Fluência em Dados",
  "Legislação Aduaneira",
  "Legislação Tributária",
  "Língua Inglesa",
  "Língua Portuguesa",
  "Raciocínio Lógico",
]

export function EditPlanningWizardModal({
  open,
  onOpenChange,
  modalTitle = "Criar Planejamento",
  initialBlocks,
  onComplete,
}: EditPlanningWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [isSaving, setIsSaving] = useState(false)
  const [allDbDisciplines, setAllDbDisciplines] = useState<string[]>(ALL_DISCIPLINES)
  const [searchTerm, setSearchTerm] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)

  // Step 1 State: Organização
  const [mode, setMode] = useState<"ciclo" | "semanal">("ciclo")

  // Step 2 State: Disciplinas Selecionadas
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([
    "Contabilidade Geral",
    "Direito Administrativo",
    "Direito Constitucional",
    "Direito Tributário",
    "Fluência em Dados",
    "Língua Portuguesa",
    "Raciocínio Lógico",
  ])

  // Step 3 State: Relevância & Conhecimento Sliders
  const [importanceMap, setImportanceMap] = useState<Record<string, number>>({
    "Língua Portuguesa": 2.5,
    "Raciocínio Lógico": 2.5,
    "Contabilidade Geral": 2.5,
    "Direito Tributário": 2.5,
    "Direito Constitucional": 2.5,
  })
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, number>>({
    "Língua Portuguesa": 2.5,
    "Raciocínio Lógico": 2.5,
    "Contabilidade Geral": 2.5,
    "Direito Tributário": 2.5,
    "Direito Constitucional": 2.5,
  })

  // Step 4 State: Horários & Escala de Trabalho
  const [weeklyHours, setWeeklyHours] = useState("25")
  const [selectedDays, setSelectedDays] = useState<string[]>(["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"])
  const [minTime, setMinTime] = useState("45min")
  const [maxTime, setMaxTime] = useState("1h30min")
  const [dayConfigMode, setDayConfigMode] = useState<"semana" | "escala">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_work_scale")
      if (saved && saved !== "normal") return "escala"
    }
    return "semana"
  })
  const [escalaTrabalho, setEscalaTrabalho] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_work_scale")
      if (saved) return saved
    }
    return "24x72"
  })
  const [firstShiftDay, setFirstShiftDay] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_first_shift_day")
      if (saved) return parseInt(saved)
    }
    return 2
  })

  // Pre-fill state when modal opens or initialBlocks change
  useEffect(() => {
    if (open) {
      if (initialBlocks && initialBlocks.length > 0) {
        const uniqueNames = Array.from(new Set(initialBlocks.map(b => b.disciplineName)))
        setSelectedDisciplines(uniqueNames)

        const impMap: Record<string, number> = {}
        const knowMap: Record<string, number> = {}

        initialBlocks.forEach(b => {
          if (!impMap[b.disciplineName]) {
            impMap[b.disciplineName] = Math.min(5, Math.max(1, Math.round((b as any).priorityScore || 3)))
            knowMap[b.disciplineName] = 2.5
          }
        })

        setImportanceMap(impMap)
        setKnowledgeMap(knowMap)

        const totalMins = initialBlocks.reduce((acc, b) => acc + b.durationMinutes, 0)
        if (totalMins > 0) {
          setWeeklyHours(Math.round(totalMins / 60).toString())
        }
      }

      getDisciplinesForAutocomplete()
        .then(res => {
          if (res?.allDisciplines && res.allDisciplines.length > 0) {
            const dbNames = res.allDisciplines.map(d => d.name)
            setAllDbDisciplines(Array.from(new Set([...dbNames, ...ALL_DISCIPLINES])))
          }
        })
        .catch(() => {})
    }
  }, [open, initialBlocks])

  const filteredDbDisciplines = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase().trim()
    return allDbDisciplines.filter((d) => d.toLowerCase().includes(term))
  }, [searchTerm, allDbDisciplines])

  const handleAddCustomDiscipline = (discName: string) => {
    const trimmed = discName.trim()
    if (!trimmed) return

    if (selectedDisciplines.includes(trimmed)) {
      toast.error("Esta matéria já está selecionada no planejamento!")
      return
    }

    setSelectedDisciplines(prev => [trimmed, ...prev])
    setImportanceMap(prev => ({ ...prev, [trimmed]: 2.5 }))
    setKnowledgeMap(prev => ({ ...prev, [trimmed]: 2.5 }))
    toast.success(`Matéria "${trimmed}" adicionada!`)
  }

  const toggleDisciplineSelection = (disc: string) => {
    if (selectedDisciplines.includes(disc)) {
      if (selectedDisciplines.length <= 1) {
        toast.error("Selecione ao menos 1 disciplina.")
        return
      }
      setSelectedDisciplines(selectedDisciplines.filter((d) => d !== disc))
    } else {
      setSelectedDisciplines([...selectedDisciplines, disc])
    }
  }

  const toggleDaySelection = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day))
    } else {
      setSelectedDays([...selectedDays, day])
    }
  }

  const handleNextStep = async () => {
    if (currentStep === 1) setCurrentStep(2)
    else if (currentStep === 2) setCurrentStep(3)
    else if (currentStep === 3) setCurrentStep(4)
    else if (currentStep === 4) {
      setIsSaving(true)
      try {
        if (typeof window !== "undefined") {
          if (dayConfigMode === "escala") {
            localStorage.setItem("mentor_user_work_scale", escalaTrabalho)
            localStorage.setItem("mentor_user_first_shift_day", firstShiftDay.toString())
          } else {
            localStorage.setItem("mentor_user_work_scale", "normal")
          }

          const dayMapShort: Record<string, string> = {
            "Domingo": "dom",
            "Segunda": "seg",
            "Terça": "ter",
            "Quarta": "qua",
            "Quinta": "qui",
            "Sexta": "sex",
            "Sábado": "sab"
          }
          const shortDays = selectedDays.map(d => dayMapShort[d] || d.toLowerCase().slice(0, 3))
          localStorage.setItem("mentor_user_study_days", JSON.stringify(shortDays))
          window.dispatchEvent(new Event("mentor_scale_updated"))
        }

        // Mapear TODAS as disciplinas selecionadas para garantir que nenhuma fique de fora
        const finalImportanceMap: Record<string, number> = {}
        const finalKnowledgeMap: Record<string, number> = {}

        selectedDisciplines.forEach(disc => {
          finalImportanceMap[disc] = importanceMap[disc] ?? 2.5
          finalKnowledgeMap[disc] = knowledgeMap[disc] ?? 2.5
        })

        const res = await generateStudyPlanAction("replan", {
          horasSemana: parseInt(weeklyHours) || 25,
          importanceMap: finalImportanceMap,
          knowledgeMap: finalKnowledgeMap
        })

        if (res.success) {
          toast.success("Planejamento atualizado com sucesso!")
          if (onComplete) onComplete()
          onOpenChange(false)
          setCurrentStep(1)
        } else {
          toast.error(res.error || "Erro ao atualizar o planejamento.")
        }
      } catch (err) {
        toast.error("Erro interno ao atualizar o planejamento.")
      } finally {
        setIsSaving(false)
      }
    }
  }

  const handlePrevStep = () => {
    if (currentStep === 2) setCurrentStep(1)
    else if (currentStep === 3) setCurrentStep(2)
    else if (currentStep === 4) setCurrentStep(3)
  }

  const calculateDisciplineScore = (disc: string) => {
    const imp = importanceMap[disc] ?? 2.5
    const know = knowledgeMap[disc] ?? 2.5
    return imp * (6 - know)
  }

  const totalCalculatedScore = useMemo(() => {
    return selectedDisciplines.reduce((sum, d) => sum + calculateDisciplineScore(d), 0)
  }, [selectedDisciplines, importanceMap, knowledgeMap])

  const getDisciplinePercentage = (disc: string) => {
    if (totalCalculatedScore <= 0) return 0
    const score = calculateDisciplineScore(disc)
    return Math.round((score / totalCalculatedScore) * 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-4 sm:p-6 rounded-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="space-y-6 overflow-y-auto pr-1 sm:pr-2 flex-1 max-h-[calc(90vh-3rem)]">
          {/* Header com Título (Criar Planejamento / Editar Planejamento) & Stepper */}
          <div className="space-y-4">
            <h2 className="text-2xl font-black text-foreground tracking-tight">{modalTitle}</h2>

            {/* Stepper dos 4 Passos (100% Paridade Estudei) */}
            <div className="flex items-center justify-between relative max-w-xl mx-auto py-2">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2 z-0" />

              {/* Passo 1: Organização */}
              <div className="flex flex-col items-center relative z-10 space-y-1">
                <div
                  className={`w-9 h-9 rounded-full font-extrabold text-xs flex items-center justify-center border-2 transition-all ${
                    currentStep === 1
                      ? "bg-[#2563EB] text-white border-[#2563EB] shadow-md scale-110"
                      : currentStep > 1
                      ? "bg-[#2563EB] text-white border-[#2563EB]"
                      : "bg-card text-muted-foreground border-muted"
                  }`}
                >
                  01
                </div>
                <span className="text-[11px] font-bold text-foreground">Organização</span>
              </div>

              {/* Passo 2: Disciplinas */}
              <div className="flex flex-col items-center relative z-10 space-y-1">
                <div
                  className={`w-9 h-9 rounded-full font-extrabold text-xs flex items-center justify-center border-2 transition-all ${
                    currentStep === 2
                      ? "bg-[#2563EB] text-white border-[#2563EB] shadow-md scale-110"
                      : currentStep > 2
                      ? "bg-[#2563EB] text-white border-[#2563EB]"
                      : "bg-card text-muted-foreground border-muted"
                  }`}
                >
                  02
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">Disciplinas</span>
              </div>

              {/* Passo 3: Relevância */}
              <div className="flex flex-col items-center relative z-10 space-y-1">
                <div
                  className={`w-9 h-9 rounded-full font-extrabold text-xs flex items-center justify-center border-2 transition-all ${
                    currentStep === 3
                      ? "bg-[#2563EB] text-white border-[#2563EB] shadow-md scale-110"
                      : currentStep > 3
                      ? "bg-[#2563EB] text-white border-[#2563EB]"
                      : "bg-card text-muted-foreground border-muted"
                  }`}
                >
                  03
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">Relevância</span>
              </div>

              {/* Passo 4: Horários */}
              <div className="flex flex-col items-center relative z-10 space-y-1">
                <div
                  className={`w-9 h-9 rounded-full font-extrabold text-xs flex items-center justify-center border-2 transition-all ${
                    currentStep === 4
                      ? "bg-[#2563EB] text-white border-[#2563EB] shadow-md scale-110"
                      : "bg-card text-muted-foreground border-muted"
                  }`}
                >
                  04
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">Horários</span>
              </div>
            </div>
          </div>

          {/* PASSO 1: Organização (Screenshot 3) */}
          {currentStep === 1 && (
            <div className="space-y-6 pt-2">
              <p className="text-xs font-semibold text-center text-muted-foreground">
                Para iniciar o seu planejamento, escolha a melhor forma de visualização para você:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
                <div
                  onClick={() => setMode("ciclo")}
                  className={`rounded-2xl border-2 p-6 cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-4 ${
                    mode === "ciclo"
                      ? "border-[#2563EB] bg-[#dbeafe]/20 shadow-md"
                      : "border-muted bg-card hover:border-[#2563EB]/50"
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl text-[#2563EB] flex items-center justify-center">
                    <RotateCcw className="h-12 w-12 stroke-[2]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-sm text-foreground">Ciclo de Estudos</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Estude as disciplinas em uma ordem rotativa, sem depender de dias fixos. Ideal para quem precisa de flexibilidade na rotina.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setMode("semanal")}
                  className={`rounded-2xl border-2 p-6 cursor-pointer transition-all flex flex-col items-center justify-between text-center space-y-4 ${
                    mode === "semanal"
                      ? "border-[#2563EB] bg-[#dbeafe]/20 shadow-md"
                      : "border-muted bg-card hover:border-[#2563EB]/50"
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl text-emerald-500 flex items-center justify-center">
                    <Calendar className="h-12 w-12 stroke-[2]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-sm text-foreground">Planejamento Semanal</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Define quais matérias estudar em cada dia da semana. Ótimo para quem prefere uma rotina fixa e estruturada.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-4">
                <Button
                  onClick={handleNextStep}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs"
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}

          {/* PASSO 2: Disciplinas (Screenshot 4) */}
          {currentStep === 2 && (
            <div className="space-y-5 pt-2">
              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Selecione quais das <strong className="text-foreground">suas disciplinas</strong> você deseja colocar no seu <strong className="text-foreground">planejamento</strong>.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Você poderá adicionar outras disciplinas a qualquer momento.
                </p>
              </div>

              {/* Container Card para Adicionar Nova Matéria Personalizada com Autocomplete */}
              <div className="p-3.5 rounded-2xl border border-[#2563EB]/25 bg-gradient-to-br from-[#2563EB]/5 via-background to-muted/20 space-y-2 shadow-2xs">
                <label className="text-[10px] font-extrabold uppercase text-[#2563EB] tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Adicionar nova matéria personalizada
                </label>

                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        id="custom_discipline_step2"
                        placeholder="Digitar nova matéria (ex: Informática, Antropologia)..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value)
                          setShowAutocomplete(true)
                        }}
                        onFocus={() => setShowAutocomplete(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            if (searchTerm.trim()) {
                              handleAddCustomDiscipline(searchTerm)
                              setSearchTerm("")
                              setShowAutocomplete(false)
                            }
                          }
                        }}
                        className="text-xs h-9 pl-8 pr-7 bg-background border border-border rounded-xl shadow-2xs"
                        autoComplete="off"
                      />
                      {searchTerm && (
                        <button
                          type="button"
                          onClick={() => { setSearchTerm(""); setShowAutocomplete(false) }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs shrink-0 px-4 h-9 gap-1 rounded-xl shadow-xs cursor-pointer"
                      onClick={() => {
                        if (searchTerm.trim()) {
                          handleAddCustomDiscipline(searchTerm)
                          setSearchTerm("")
                          setShowAutocomplete(false)
                        } else {
                          toast.error("Digite o nome da matéria para adicionar.")
                        }
                      }}
                    >
                      + Adicionar
                    </Button>
                  </div>

                  {/* Dropdown Flutuante de Autocomplete */}
                  {showAutocomplete && searchTerm.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto divide-y divide-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                        <span>Resultado da busca ({filteredDbDisciplines.length})</span>
                      </div>

                      {filteredDbDisciplines.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground text-center">
                          Nenhuma matéria exata no banco. Pressione <strong>+ Adicionar</strong> para criar "{searchTerm}"!
                        </div>
                      ) : (
                        filteredDbDisciplines.map((item) => {
                          const isAlreadySelected = selectedDisciplines.includes(item)
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => {
                                handleAddCustomDiscipline(item)
                                setSearchTerm("")
                                setShowAutocomplete(false)
                              }}
                              className={`w-full px-3 text-left text-xs font-bold transition-colors flex items-center justify-between py-2 cursor-pointer ${
                                isAlreadySelected
                                  ? "bg-[#2563EB]/10 text-[#2563EB]"
                                  : "hover:bg-muted/80 text-foreground"
                              }`}
                            >
                              <span className="truncate">{item}</span>
                              {isAlreadySelected ? (
                                <span className="text-[10px] font-extrabold uppercase text-[#2563EB] bg-[#2563EB]/15 px-2 py-0.5 rounded-full">
                                  Já Adicionada
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold text-[#2563EB]">
                                  + Selecionar
                                </span>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                {Array.from(new Set([...selectedDisciplines, ...allDbDisciplines])).map((disc) => {
                  const isSelected = selectedDisciplines.includes(disc)
                  return (
                    <button
                      key={disc}
                      type="button"
                      onClick={() => toggleDisciplineSelection(disc)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                        isSelected
                          ? "border-[#2563EB] bg-[#dbeafe]/30 text-[#2563EB] shadow-xs"
                          : "border-muted bg-card text-muted-foreground hover:border-[#2563EB]"
                      }`}
                    >
                      {disc}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="border-[#2563EB] text-[#2563EB] font-bold text-xs px-6 h-9 rounded-xl"
                >
                  Voltar
                </Button>

                <Button
                  onClick={handleNextStep}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-9 rounded-xl shadow-xs"
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}

          {/* PASSO 3: Relevância (Screenshot 5) */}
          {currentStep === 3 && (
            <div className="space-y-5 pt-2">
              <p className="text-xs font-semibold text-center text-muted-foreground">
                Para cada disciplina, selecione a <strong className="text-foreground">importância</strong> (ou peso) para sua prova e seu <strong className="text-foreground">grau de conhecimento</strong>:
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4 max-h-72 overflow-y-auto pr-1">
                  {selectedDisciplines.map((disc) => (
                    <div key={disc} className="rounded-xl border p-3.5 space-y-2 bg-card">
                      <h4 className="font-extrabold text-xs text-foreground">{disc}</h4>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                        <div className="space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>IMPORTÂNCIA</span>
                            <span className="text-foreground font-black">{importanceMap[disc] ?? 2.5}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.5"
                            value={importanceMap[disc] ?? 2.5}
                            onChange={(e) =>
                              setImportanceMap({ ...importanceMap, [disc]: parseFloat(e.target.value) })
                            }
                            className="w-full accent-[#2563EB]"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>CONHECIMENTO</span>
                            <span className="text-foreground font-black">{knowledgeMap[disc] ?? 2.5}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.5"
                            value={knowledgeMap[disc] ?? 2.5}
                            onChange={(e) =>
                              setKnowledgeMap({ ...knowledgeMap, [disc]: parseFloat(e.target.value) })
                            }
                            className="w-full accent-[#2563EB]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedDisciplines.map((disc, idx) => {
                    const pct = getDisciplinePercentage(disc)
                    const colors = [
                      "bg-purple-100/90 text-purple-900 border-purple-200",
                      "bg-rose-100/90 text-rose-900 border-rose-200",
                      "bg-emerald-100/90 text-emerald-900 border-emerald-200",
                      "bg-sky-100/90 text-sky-900 border-sky-200",
                      "bg-amber-100/90 text-amber-900 border-amber-200",
                      "bg-indigo-100/90 text-indigo-900 border-indigo-200",
                      "bg-teal-100/90 text-teal-900 border-teal-200",
                      "bg-fuchsia-100/90 text-fuchsia-900 border-fuchsia-200",
                    ]
                    return (
                      <div
                        key={disc}
                        className={`rounded-lg p-2.5 flex items-center justify-between font-bold text-xs ${
                          colors[idx % colors.length]
                        } border shadow-2xs`}
                      >
                        <span className="font-mono text-xs font-black border-r pr-2 border-current/20 shrink-0">
                          {pct}%
                        </span>
                        <span className="truncate pl-2 text-[11px] font-extrabold">{disc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="border-[#2563EB] text-[#2563EB] font-bold text-xs px-6 h-9 rounded-xl"
                >
                  Voltar
                </Button>

                <Button
                  onClick={handleNextStep}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-9 rounded-xl shadow-xs"
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}

          {/* PASSO 4: Horários (Diferenciado por Ciclo de Estudos vs Planejamento Semanal 100% Estudei Imagem 1) */}
          {currentStep === 4 && (
            <div className="space-y-6 pt-2">
              {mode === "semanal" ? (
                /* Layout Planejamento Semanal (Sua Foto 1 100% Estudei) */
                <div className="space-y-5">
                  <p className="text-xs font-semibold text-center text-muted-foreground">
                    Quais <strong className="text-foreground">dias</strong> e quantas <strong className="text-foreground">horas</strong> pretende estudar?
                  </p>

                  {/* Grid de Dias com Checkboxes e Inputs de Horas Diárias */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                    {[
                      { key: "DOM", label: "DOM" },
                      { key: "QUI", label: "QUI" },
                      { key: "SEG", label: "SEG" },
                      { key: "SEX", label: "SEX" },
                      { key: "TER", label: "TER" },
                      { key: "SÁB", label: "SÁB" },
                      { key: "QUA", label: "QUA" },
                    ].map((d) => (
                      <div key={d.key} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-card">
                        <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
                          <input type="checkbox" className="rounded text-[#2563EB] focus:ring-[#2563EB]" />
                          <span className="px-2.5 py-1 bg-slate-500 text-white rounded-md text-[10px] font-black">
                            {d.label}
                          </span>
                        </label>

                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            defaultValue="00:00"
                            className="w-16 h-7 text-xs font-mono text-center"
                          />
                          <span className="text-[10px] text-muted-foreground font-semibold">horas diárias</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total na Semana Box */}
                  <div className="max-w-xl mx-auto rounded-xl bg-[#dbeafe]/30 border border-[#2563EB]/30 p-3 text-center text-xs font-bold text-[#2563EB]">
                    Total na Semana: 0min
                  </div>

                  {/* Seletor Mínimo e Máximo de Tempo */}
                  <div className="space-y-2 text-center pt-2">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1">
                      Qual <strong className="text-foreground">mínimo</strong> e <strong className="text-foreground">máximo</strong> de tempo que deseja estudar uma mesma disciplina?
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </label>
                    <div className="flex items-center justify-center gap-3">
                      <select
                        value={minTime}
                        onChange={(e) => setMinTime(e.target.value)}
                        className="h-8 bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="Selecione...">Selecione...</option>
                        <option value="30min">30min</option>
                        <option value="45min">45min</option>
                        <option value="1h00min">1h00min</option>
                      </select>
                      <span className="text-xs text-muted-foreground font-bold">a</span>
                      <select
                        value={maxTime}
                        onChange={(e) => setMaxTime(e.target.value)}
                        className="h-8 bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="Selecione...">Selecione...</option>
                        <option value="1h00min">1h00min</option>
                        <option value="1h30min">1h30min</option>
                        <option value="2h00min">2h00min</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                /* Layout Ciclo de Estudos */
                <div className="space-y-6">
                  {/* Campo 1: Horas semanais */}
                  <div className="space-y-2 max-w-sm mx-auto">
                    <label className="text-xs font-semibold text-muted-foreground block text-center">
                      Quantas horas, em média, pretende estudar <strong className="text-foreground">por semana</strong>?
                    </label>
                    <div className="flex justify-center">
                      <input
                        type="number"
                        value={weeklyHours}
                        onChange={(e) => setWeeklyHours(e.target.value)}
                        className="w-32 bg-transparent border-b-2 border-[#2563EB] text-lg font-black text-[#2563EB] text-center py-1 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Banner Informativo Explicito da Carga Horaria */}
                  <div className="max-w-md mx-auto rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/30 p-3 text-center space-y-1">
                    <p className="text-xs font-extrabold text-[#2563EB]">
                      Carga semanal planejada: <span className="text-sm font-black underline">{weeklyHours || 25}h</span>
                    </p>

                    {dayConfigMode === "escala" ? (
                      <div className="text-[11px] text-muted-foreground pt-1.5 border-t border-[#2563EB]/20 space-y-0.5">
                        <p>Carga desejada: <strong className="text-foreground">{weeklyHours || 25}h</strong></p>
                        <p>Carga programada: <strong className="text-[#2563EB]">{weeklyHours || 25}h</strong></p>
                        <p className="text-[10px] text-[#2563EB] font-bold">
                          Motivo: distribuída proporcionalmente de acordo com a escala ({escalaTrabalho})
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Carga programada: <strong className="text-[#2563EB]">{weeklyHours || 25}h</strong> (distribuição completa da semana)
                      </p>
                    )}
                  </div>

                  {/* Toggle: Dias da Semana vs Escala de Trabalho */}
                  <div className="space-y-3 text-center">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1">
                      Como você organiza seus <strong className="text-foreground">dias de estudo</strong>?
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </label>
                    <div className="flex justify-center">
                      <div className="flex p-1 bg-muted rounded-xl gap-1 border">
                        <button
                          type="button"
                          onClick={() => setDayConfigMode("semana")}
                          className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                            dayConfigMode === "semana"
                              ? "bg-[#2563EB] text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Dias da Semana
                        </button>
                        <button
                          type="button"
                          onClick={() => setDayConfigMode("escala")}
                          className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                            dayConfigMode === "escala"
                              ? "bg-[#2563EB] text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Escala de Trabalho / Plantão
                        </button>
                      </div>
                    </div>

                    {dayConfigMode === "semana" ? (
                      /* Pílulas de Dias da Semana */
                      <div className="flex items-center justify-center rounded-xl border border-[#2563EB] overflow-hidden max-w-xl mx-auto mt-2">
                        {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((day) => {
                          const isSelected = selectedDays.includes(day)
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleDaySelection(day)}
                              className={`flex-1 py-2 text-xs font-bold transition-all border-r last:border-r-0 cursor-pointer ${
                                isSelected
                                  ? "bg-[#2563EB] text-white"
                                  : "bg-card text-[#2563EB] hover:bg-[#dbeafe]/20"
                              }`}
                            >
                              {day}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      /* Grid de Escala de Trabalho / Plantão */
                      <div className="space-y-4 max-w-xl mx-auto mt-2">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {[
                            { id: "12x36", label: "12x36", desc: "Plantão 12h / Folga 36h" },
                            { id: "24x72", label: "24x72", desc: "Plantão 24h / Folga 72h" },
                            { id: "24x48", label: "24x48", desc: "Plantão 24h / Folga 48h" },
                            { id: "5x1", label: "5x1", desc: "Trabalha 5d / Folga 1d" },
                            { id: "6x1", label: "6x1", desc: "Trabalha 6d / Folga 1d" },
                            { id: "4x2", label: "4x2", desc: "Trabalha 4d / Folga 2d" },
                          ].map((esc) => (
                            <button
                              key={esc.id}
                              type="button"
                              onClick={() => setEscalaTrabalho(esc.id)}
                              className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                                escalaTrabalho === esc.id
                                  ? "border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]"
                                  : "border-muted bg-card hover:border-[#2563EB]/40 text-muted-foreground"
                              }`}
                            >
                              <div className="font-extrabold text-xs text-foreground">{esc.label}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">{esc.desc}</div>
                            </button>
                          ))}
                        </div>

                        {/* Seleção do dia do 1º Plantão */}
                        <div className="space-y-1.5 text-center pt-2">
                          <label className="text-xs font-semibold text-muted-foreground block">
                            Em qual dia da semana cai o seu <strong className="text-foreground">1º Plantão</strong>?
                          </label>
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, idx) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setFirstShiftDay(idx)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border cursor-pointer ${
                                  firstShiftDay === idx
                                    ? "bg-[#2563EB] text-white border-[#2563EB]"
                                    : "bg-card text-muted-foreground hover:border-[#2563EB]"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Campo 3: Duração Mínima e Máxima */}
                  <div className="space-y-2 text-center pt-2">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1">
                      Qual duração <strong className="text-foreground">mínima</strong> e <strong className="text-foreground">máxima</strong> você deseja para uma sessão de estudos (disciplina)?
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </label>
                    <div className="flex items-center justify-center gap-3">
                      <select
                        value={minTime}
                        onChange={(e) => setMinTime(e.target.value)}
                        className="h-9 bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="30min">30min</option>
                        <option value="45min">45min</option>
                        <option value="1h00min">1h00min</option>
                      </select>
                      <span className="text-xs text-muted-foreground font-bold">a</span>
                      <select
                        value={maxTime}
                        onChange={(e) => setMaxTime(e.target.value)}
                        className="h-9 bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground focus:outline-none cursor-pointer"
                      >
                        <option value="1h00min">1h00min</option>
                        <option value="1h30min">1h30min</option>
                        <option value="2h00min">2h00min</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="border-[#2563EB] text-[#2563EB] font-bold text-xs px-6 h-9 rounded-xl"
                >
                  Voltar
                </Button>

                <Button
                  onClick={handleNextStep}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-9 rounded-xl shadow-xs"
                >
                  Concluir
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

