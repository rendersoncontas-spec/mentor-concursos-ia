"use client"

import { useState } from "react"
import {
  RotateCcw,
  Calendar,
  HelpCircle,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export interface EditPlanningWizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modalTitle?: string
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
  onComplete,
}: EditPlanningWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)

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

  // Step 4 State: Horários
  const [weeklyHours, setWeeklyHours] = useState("25")
  const [selectedDays, setSelectedDays] = useState<string[]>(["Sexta", "Sábado"])
  const [minTime, setMinTime] = useState("45min")
  const [maxTime, setMaxTime] = useState("1h30min")

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

  const handleNextStep = () => {
    if (currentStep === 1) setCurrentStep(2)
    else if (currentStep === 2) setCurrentStep(3)
    else if (currentStep === 3) setCurrentStep(4)
    else if (currentStep === 4) {
      toast.success("Planejamento gerado com sucesso!")
      if (onComplete) onComplete()
      onOpenChange(false)
      setCurrentStep(1)
    }
  }

  const handlePrevStep = () => {
    if (currentStep === 2) setCurrentStep(1)
    else if (currentStep === 3) setCurrentStep(2)
    else if (currentStep === 4) setCurrentStep(3)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-6 rounded-2xl">
        <div className="space-y-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                {ALL_DISCIPLINES.map((disc) => {
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
                  {selectedDisciplines.slice(0, 5).map((disc) => (
                    <div key={disc} className="rounded-xl border p-3.5 space-y-2 bg-card">
                      <h4 className="font-extrabold text-xs text-foreground">{disc}</h4>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                        <div className="space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>IMPORTÂNCIA</span>
                            <span>{importanceMap[disc] || 2.5}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.5"
                            value={importanceMap[disc] || 2.5}
                            onChange={(e) =>
                              setImportanceMap({ ...importanceMap, [disc]: parseFloat(e.target.value) })
                            }
                            className="w-full accent-[#2563EB]"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>CONHECIMENTO</span>
                            <span>{knowledgeMap[disc] || 2.5}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.5"
                            value={knowledgeMap[disc] || 2.5}
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

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {selectedDisciplines.slice(0, 5).map((disc, idx) => {
                    const colors = ["bg-purple-200", "bg-rose-200", "bg-emerald-200", "bg-sky-200", "bg-amber-200"]
                    return (
                      <div
                        key={disc}
                        className={`rounded-lg p-3 flex items-center justify-between font-bold text-xs ${
                          colors[idx % colors.length]
                        } text-slate-900 border`}
                      >
                        <span className="font-mono text-xs font-black border-r pr-2 border-slate-400">
                          {Math.round(100 / Math.min(selectedDisciplines.length, 5))}%
                        </span>
                        <span className="truncate pl-2">{disc}</span>
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
                  <div className="space-y-1 max-w-sm mx-auto">
                    <label className="text-xs font-semibold text-muted-foreground block text-center">
                      Quantas horas, em média, pretende estudar <strong className="text-foreground">por semana</strong>?
                    </label>
                    <div className="flex justify-center">
                      <input
                        type="number"
                        value={weeklyHours}
                        onChange={(e) => setWeeklyHours(e.target.value)}
                        className="w-32 bg-transparent border-b border-[#2563EB] text-base font-bold text-foreground text-center py-1 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Campo 2: Dias da Semana em Pílulas */}
                  <div className="space-y-2 text-center">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1">
                      Em quais dias você pretende <strong className="text-foreground">estudar</strong>?
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </label>
                    <div className="flex items-center justify-center rounded-xl border border-[#2563EB] overflow-hidden max-w-xl mx-auto">
                      {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((day) => {
                        const isSelected = selectedDays.includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDaySelection(day)}
                            className={`flex-1 py-2 text-xs font-bold transition-all border-r last:border-r-0 ${
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

