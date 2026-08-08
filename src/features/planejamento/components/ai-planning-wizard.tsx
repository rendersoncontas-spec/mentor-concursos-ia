"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Bot, Sparkles, BrainCircuit, Loader2, ArrowRight, ArrowLeft, Calendar, Clock, BookOpen, GraduationCap, Settings2, CheckCircle2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { generateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import { getActiveTargetNameAction } from "@/application/concursos/get-active-target.action"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface AiPlanningWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const CONCURSOS_POPULARES = [
  "Receita Federal",
  "Polícia Federal",
  "Polícia Rodoviária Federal",
  "TCU",
  "Banco do Brasil",
  "INSS",
  "Tribunais (TRT/TRE/TJ)",
  "Outro",
]

const DIAS_SEMANA = [
  { id: "seg", label: "Segunda" },
  { id: "ter", label: "Terça" },
  { id: "qua", label: "Quarta" },
  { id: "qui", label: "Quinta" },
  { id: "sex", label: "Sexta" },
  { id: "sab", label: "Sábado" },
  { id: "dom", label: "Domingo" },
]

const LOADING_STEPS = [
  "Analisando edital...",
  "Calculando pesos e relevância...",
  "Montando ciclo de estudos...",
  "Distribuindo disciplinas na carga horária...",
  "Programando algoritmo de revisões espaçadas...",
  "Finalizando metas semanais..."
]

export function AiPlanningWizard({ open, onOpenChange, onSuccess }: AiPlanningWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingTextIndex, setLoadingTextIndex] = useState(0)

  // Form State
  const [concurso, setConcurso] = useState("Concurso")
  const [cargo, setCargo] = useState("")
  const [customConcurso, setCustomConcurso] = useState("")
  const [dataProva, setDataProva] = useState("")
  const [horasSemana, setHorasSemana] = useState([25])
  const [tipoDias, setTipoDias] = useState<"semana" | "escala">("semana")
  const [diasDisponiveis, setDiasDisponiveis] = useState<string[]>(["seg", "ter", "qua", "qui", "sex"])
  const [escalaTrabalho, setEscalaTrabalho] = useState("24x72")
  const [metodo, setMetodo] = useState("ciclo")
  const [nivel, setNivel] = useState("iniciante")

  // Ajuste Fino State
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([])
  const [importanceMap, setImportanceMap] = useState<Record<string, number>>({})
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, number>>({})

  // Reseta o wizard ao fechar
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(4)
        setIsGenerating(false)
        setLoadingTextIndex(0)
      }, 500)
    } else {
      setStep(4)
      getActiveTargetNameAction().then(res => {
        if (res.success && res.name) {
          setConcurso(res.name)
        }
      })
    }
  }, [open])

  // Animação de textos de loading
  useEffect(() => {
    if (isGenerating && loadingTextIndex < LOADING_STEPS.length - 1) {
      const timer = setTimeout(() => {
        setLoadingTextIndex(prev => prev + 1)
      }, 1500) // Troca o texto a cada 1.5s
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isGenerating, loadingTextIndex])

  const handleNext = () => {
    if (step === 7) {
      // Popular disciplinas baseadas no concurso
      const discNames = ["Língua Portuguesa", "Direito Constitucional", "Direito Administrativo", "Raciocínio Lógico"]
      const target = concurso
      if (target.toLowerCase().includes("receita")) {
        discNames.push("Direito Tributário", "Contabilidade Geral", "Legislação Aduaneira")
      } else if (target.toLowerCase().includes("polícia")) {
        discNames.push("Direito Penal", "Direito Processual Penal", "Legislação Especial", "Informática")
      } else if (target.toLowerCase().includes("tcu")) {
        discNames.push("Auditoria Governamental", "Contabilidade Pública", "Controle Externo", "Economia")
      } else if (target.toLowerCase().includes("banco") || target.toLowerCase().includes("inss")) {
        discNames.push("Conhecimentos Bancários", "Direito Previdenciário", "Informática")
      } else {
        discNames.push("Informática", "Estatística")
      }
      setSelectedDisciplines(discNames)
      
      const imp: Record<string, number> = {}
      const know: Record<string, number> = {}
      discNames.forEach(d => {
        imp[d] = 3
        know[d] = nivel === "iniciante" ? 1 : nivel === "intermediario" ? 3 : 4
      })
      setImportanceMap(imp)
      setKnowledgeMap(know)
    }
    setStep(prev => prev + 1)
  }
  const handleBack = () => setStep(prev => prev - 1)

  const toggleDia = (id: string) => {
    setDiasDisponiveis(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    
    // Save selected scale to localStorage so the calendar and weekly views pick it up
    if (typeof window !== "undefined") {
      let mappedScale = "normal"
      if (tipoDias === "escala") {
        mappedScale = (escalaTrabalho || "").split(" ")[0]! // "5x1 (Folga 1)" -> "5x1", "24x72" -> "24x72"
      }
      localStorage.setItem("mentor_user_work_scale", mappedScale)
      localStorage.setItem("mentor_user_study_days", JSON.stringify(tipoDias === "semana" ? diasDisponiveis : ["seg", "ter", "qua", "qui", "sex", "sab"]))
      // Reset the first shift day to 1 when creating a new plan just as a sensible default
      localStorage.setItem("mentor_user_first_shift_day", "1")
      window.dispatchEvent(new Event("mentor_scale_updated"))
    }

    // Simula um tempo mínimo para a UX do loader
    const minimumWait = new Promise(resolve => setTimeout(resolve, 8000))
    
    try {
      // Chama a action real do backend
      const [res] = await Promise.all([
        generateStudyPlanAction("ai_wizard", {
          concurso: concurso,
          cargo: "",
          dataProva: "",
          horasSemana: horasSemana[0],
          diasDisponiveis: tipoDias === "semana" ? diasDisponiveis : [escalaTrabalho], // pass scale as fallback
          metodo,
          nivel,
          importanceMap,
          knowledgeMap
        }),
        minimumWait
      ])

      if (res.success) {
        setStep(10) // Success Step
      } else {
        setStep(10)
      }
    } catch (err) {
      toast.error("Erro inesperado ao gerar planejamento.")
    } finally {
      setIsGenerating(false)
    }
  }

  const renderStepContent = () => {
    switch (step) {
      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Horas por semana?</h2>
              <p className="text-sm text-muted-foreground">Quantas horas por semana você consegue estudar de verdade?</p>
            </div>
            <div className="py-12 px-6 flex flex-col items-center space-y-10">
              <div className="text-6xl font-black text-[#2563EB] drop-shadow-sm tabular-nums">
                {horasSemana[0]}h
              </div>
              <Slider 
                value={horasSemana} 
                onValueChange={setHorasSemana} 
                max={60} 
                min={5} 
                step={1} 
                className="w-full"
              />
              <div className="flex justify-between w-full text-xs text-muted-foreground font-semibold">
                <span>5h (Mínimo)</span>
                <span>60h (Insano)</span>
              </div>
            </div>
          </div>
        )
      case 5:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Dias disponíveis</h2>
              <p className="text-sm text-muted-foreground">Como funciona a sua disponibilidade de estudo?</p>
            </div>
            
            <div className="flex justify-center mt-4">
              <div className="flex p-1 bg-muted rounded-xl gap-1">
                <button 
                  onClick={() => setTipoDias("semana")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tipoDias === "semana" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Dias da Semana
                </button>
                <button 
                  onClick={() => setTipoDias("escala")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tipoDias === "escala" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Escala de Trabalho
                </button>
              </div>
            </div>

            {tipoDias === "semana" ? (
              <div className="flex flex-col items-center">
                <div className="flex flex-wrap gap-3 justify-center mt-4 max-w-sm">
                  {DIAS_SEMANA.map(dia => {
                    const isSelected = diasDisponiveis.includes(dia.id)
                    return (
                      <button
                        key={dia.id}
                        onClick={() => toggleDia(dia.id)}
                        className={`px-6 py-3 rounded-full border-2 text-sm font-bold transition-all ${isSelected ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-md' : 'border-muted bg-card hover:border-[#2563EB]/40 text-foreground'}`}
                      >
                        {dia.label}
                      </button>
                    )
                  })}
                </div>
                {diasDisponiveis.length === 0 && (
                  <p className="text-center text-xs text-rose-500 font-semibold mt-4">Selecione ao menos 1 dia.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center mt-4 space-y-4 max-w-sm mx-auto">
                <p className="text-xs text-muted-foreground text-center">
                  Selecione sua escala ou padrão de folgas. O ciclo vai rodar normalmente nos dias em que você estudar.
                </p>
                <div className="grid grid-cols-2 gap-3 w-full">
                  {["12x36", "24x72", "24x48", "5x1 (Folga 1)", "6x1 (Folga 1)", "4x2 (Folga 2)", "Outra"].map(esc => (
                    <button
                      key={esc}
                      onClick={() => setEscalaTrabalho(esc)}
                      className={`py-3 rounded-xl border-2 text-xs font-bold transition-all ${escalaTrabalho === esc ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]' : 'border-muted bg-card hover:border-[#2563EB]/40 text-muted-foreground'}`}
                    >
                      {esc}
                    </button>
                  ))}
                </div>
                {escalaTrabalho === "Outra" && (
                  <Input placeholder="Ex: Estuda 3 dias, folga 1" className="mt-2 text-sm" />
                )}
              </div>
            )}
          </div>
        )
      case 6:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Como prefere estudar?</h2>
              <p className="text-sm text-muted-foreground">Como o Mentor IA deve distribuir as disciplinas?</p>
            </div>
            <div className="grid grid-cols-1 gap-4 mt-8">
              <div onClick={() => setMetodo("ciclo")} className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${metodo === "ciclo" ? 'border-[#2563EB] bg-[#2563EB]/5' : 'border-muted bg-card hover:border-[#2563EB]/40'}`}>
                <div className={`p-3 rounded-xl ${metodo === "ciclo" ? 'bg-[#2563EB] text-white' : 'bg-muted text-foreground'}`}>
                  <Loader2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Ciclo</h3>
                  <p className="text-xs text-muted-foreground mt-1">Rotação contínua baseada em pesos e dificuldade. Flexível.</p>
                </div>
              </div>

              <div onClick={() => setMetodo("agenda")} className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${metodo === "agenda" ? 'border-[#2563EB] bg-[#2563EB]/5' : 'border-muted bg-card hover:border-[#2563EB]/40'}`}>
                <div className={`p-3 rounded-xl ${metodo === "agenda" ? 'bg-[#2563EB] text-white' : 'bg-muted text-foreground'}`}>
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Agenda</h3>
                  <p className="text-xs text-muted-foreground mt-1">Disciplinas amarradas a dias específicos da semana.</p>
                </div>
              </div>

              <div onClick={() => setMetodo("livre")} className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${metodo === "livre" ? 'border-[#2563EB] bg-[#2563EB]/5' : 'border-muted bg-card hover:border-[#2563EB]/40'}`}>
                <div className={`p-3 rounded-xl ${metodo === "livre" ? 'bg-[#2563EB] text-white' : 'bg-muted text-foreground'}`}>
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Livre</h3>
                  <p className="text-xs text-muted-foreground mt-1">Metas gerais, mas sem ordem de matérias pré-definida.</p>
                </div>
              </div>
            </div>
          </div>
        )
      case 7:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Qual seu nível?</h2>
              <p className="text-sm text-muted-foreground">Para dosarmos a quantidade de teoria vs questões.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              {[
                { id: "iniciante", label: "Iniciante", desc: "Começando do zero", icon: GraduationCap },
                { id: "intermediario", label: "Intermediário", desc: "Já vi a teoria", icon: BookOpen },
                { id: "avancado", label: "Avançado", desc: "Foco em questões", icon: BrainCircuit }
              ].map(n => (
                <div key={n.id} onClick={() => setNivel(n.id)} className={`p-5 rounded-2xl border-2 text-center cursor-pointer transition-all flex flex-col items-center gap-3 ${nivel === n.id ? 'border-[#2563EB] bg-[#2563EB]/5 text-[#2563EB]' : 'border-muted bg-card hover:border-[#2563EB]/40 text-muted-foreground hover:text-foreground'}`}>
                  <n.icon className="w-8 h-8" />
                  <div>
                    <h3 className="font-bold text-sm text-foreground">{n.label}</h3>
                    <p className="text-[10px] opacity-80 mt-1 leading-tight">{n.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      case 8:
        return (
          <div className="space-y-4">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Ajuste Fino da IA</h2>
              <p className="text-sm text-muted-foreground">O Mentor IA mapeou as seguintes disciplinas. Ajuste os pesos se desejar.</p>
            </div>

            <div className="max-h-[340px] overflow-y-auto pr-2 space-y-4 pb-4">
              {selectedDisciplines.map((disc) => (
                <div key={disc} className="border-2 border-muted rounded-xl p-4 bg-card space-y-4 relative group">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">{disc}</h3>
                    <button 
                      onClick={() => {
                        setSelectedDisciplines(prev => prev.filter(d => d !== disc))
                        const newImp = { ...importanceMap }
                        const newKnow = { ...knowledgeMap }
                        delete newImp[disc]
                        delete newKnow[disc]
                        setImportanceMap(newImp)
                        setKnowledgeMap(newKnow)
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 text-xs font-bold bg-rose-500/10 px-2 py-1 rounded-md"
                    >
                      Remover
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">Relevância</span>
                        <span className="text-xs font-black text-foreground">{importanceMap[disc] ?? 3}</span>
                      </div>
                      <Slider
                        value={[importanceMap[disc] ?? 3]}
                        max={5}
                        min={1}
                        step={0.5}
                        onValueChange={(val) => setImportanceMap({ ...importanceMap, [disc]: val[0]! })}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">Seu Nível</span>
                        <span className="text-xs font-black text-foreground">{knowledgeMap[disc] ?? 3}</span>
                      </div>
                      <Slider
                        value={[knowledgeMap[disc] ?? 3]}
                        max={5}
                        min={1}
                        step={0.5}
                        onValueChange={(val) => setKnowledgeMap({ ...knowledgeMap, [disc]: val[0]! })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pt-2 border-t flex gap-2">
              <Input 
                id="nova_disciplina"
                placeholder="Sentiu falta de alguma matéria?" 
                className="text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    const val = e.currentTarget.value.trim()
                    if (val && !selectedDisciplines.includes(val)) {
                      setSelectedDisciplines([...selectedDisciplines, val])
                      setImportanceMap({ ...importanceMap, [val]: 3 })
                      setKnowledgeMap({ ...knowledgeMap, [val]: 3 })
                      e.currentTarget.value = ""
                    }
                  }
                }}
              />
              <Button 
                variant="outline"
                className="shrink-0 text-xs font-bold"
                onClick={(e) => {
                  const input = document.getElementById("nova_disciplina") as HTMLInputElement
                  const val = input?.value.trim()
                  if (val && !selectedDisciplines.includes(val)) {
                    setSelectedDisciplines([...selectedDisciplines, val])
                    setImportanceMap({ ...importanceMap, [val]: 3 })
                    setKnowledgeMap({ ...knowledgeMap, [val]: 3 })
                    input.value = ""
                  }
                }}
              >
                + Adicionar
              </Button>
            </div>
          </div>
        )
      case 10: // Success State
        return (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-8">
            <DialogTitle className="sr-only">Sucesso</DialogTitle>
            <div className="relative">
              <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              </div>
              <motion.div 
                className="absolute -inset-4 border-2 border-green-500/30 rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-foreground">Planejamento Criado com Sucesso.</h2>
            </div>
            
            <div className="bg-muted/30 p-5 rounded-2xl w-full max-w-sm text-left space-y-3 text-sm font-medium">
              <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-green-500" /> {selectedDisciplines.length} disciplinas</div>
              <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-green-500" /> {selectedDisciplines.length * 15} tópicos mapeados</div>
              <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-green-500" /> Ciclo criado</div>
              <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-green-500" /> Revisões programadas</div>
              <div className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-green-500" /> Meta semanal criada</div>
            </div>

            <Button onClick={() => {
              onSuccess()
              onOpenChange(false)
            }} className="bg-[#2563EB] hover:bg-[#1D4ED8] w-full max-w-sm h-12 text-sm font-bold shadow-lg">
              Abrir Planejamento
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  const isNextDisabled = () => {
    if (step === 1 && (!concurso || (concurso === "Outro" && !customConcurso.trim()))) return true
    if (step === 2 && !cargo.trim()) return true
    if (step === 5 && tipoDias === "semana" && diasDisponiveis.length === 0) return true
    return false
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (isGenerating) return // Block closing while generating
      onOpenChange(val)
    }}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden rounded-3xl border-0 shadow-2xl bg-background">
        <DialogTitle className="sr-only">Assistente de Planejamento com IA</DialogTitle>
        
        {isGenerating ? (
          <div className="h-[500px] flex flex-col items-center justify-center p-8 text-center space-y-8 bg-gradient-to-b from-background to-[#2563EB]/5">
            <div className="relative">
              <div className="absolute inset-0 bg-[#2563EB] blur-2xl opacity-20 rounded-full animate-pulse" />
              <Bot className="w-20 h-20 text-[#2563EB] relative z-10 animate-bounce" />
            </div>
            
            <div className="space-y-4 w-full max-w-sm">
              <h2 className="text-2xl font-black text-foreground">Gerando Planejamento...</h2>
              
              {/* Fake Progress Bar */}
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-[#2563EB]"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 8, ease: "linear" }}
                />
              </div>
              
              <div className="h-6 overflow-hidden flex justify-center">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={loadingTextIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="text-sm font-semibold text-[#2563EB]"
                  >
                    {LOADING_STEPS[loadingTextIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </div>
        ) : step < 9 ? (
          <div className="flex flex-col h-[600px]">
            {/* Header / Progress */}
            <div className="p-6 pb-2 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[#2563EB] font-bold text-sm bg-[#2563EB]/10 px-3 py-1.5 rounded-full">
                  <Sparkles className="w-4 h-4" /> Mentor IA
                </div>
                <div className="text-xs font-bold text-muted-foreground">
                  Etapa {step - 3} de 6
                </div>
              </div>
              {step < 10 && (
                <div className="flex gap-1.5 px-6 pb-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= step - 3 ? 'bg-[#2563EB]' : 'bg-muted'}`} />
                  ))}
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="h-full flex flex-col justify-center"
                >
                  {renderStepContent()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer / Navigation */}
            <div className="p-6 border-t bg-muted/10 shrink-0 flex items-center justify-between">
              {step > 4 && step < 10 && (
                <button onClick={handleBack} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4 inline-block mr-1" /> Voltar
                </button>
              )}
              <div className="flex-1" />

              {step < 8 ? (
                  <Button
                    onClick={handleNext} 
                    disabled={
                      (step === 5 && tipoDias === "semana" && diasDisponiveis.length === 0) || 
                      isNextDisabled()
                    }
                    className="bg-foreground text-background hover:bg-foreground/90 gap-2 min-w-[120px]"
                  >
                    Próximo <ArrowRight className="w-4 h-4" />
                  </Button>
              ) : step === 8 ? (
                <Button 
                  onClick={handleGenerate}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold gap-2 min-w-[150px] shadow-lg shadow-blue-500/20"
                >
                  Gerar Planejamento <Sparkles className="w-4 h-4" />
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          renderStepContent() // Success State
        )}
      </DialogContent>
    </Dialog>
  )
}
