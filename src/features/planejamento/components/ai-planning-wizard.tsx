"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { getActiveTargetNameAction } from "@/application/concursos/get-active-target.action"
import { generateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface AiPlanningWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

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
  "Finalizando metas semanais...",
]

function getInitialKnowledge(nivel: string): number {
  if (nivel === "iniciante") return 1
  if (nivel === "intermediario") return 3
  return 4
}

const MASTER_DISCIPLINES_DATABASE = [
  "Administração Geral",
  "Administração Pública",
  "Administração Financeira e Orçamentária (AFO)",
  "Arquivologia",
  "Auditoria Governamental",
  "Auditoria Privada",
  "Banco de Dados e Big Data",
  "Biologia",
  "Contabilidade Geral",
  "Contabilidade Pública",
  "Contabilidade de Custos",
  "Controle Externo",
  "Criminologia",
  "Direito Administrativo",
  "Direito Ambiental",
  "Direito Civil",
  "Direito Constitucional",
  "Direito do Consumidor",
  "Direito Eleitoral",
  "Direito Empresarial",
  "Direito Financeiro",
  "Direito Internacional",
  "Direito Penal",
  "Direito Processual Civil",
  "Direito Processual Penal",
  "Direito Previdenciário",
  "Direito Tributário",
  "Direito do Trabalho",
  "Direitos Humanos",
  "Economia e Finanças",
  "Engenharia de Software",
  "Estatística",
  "Ética no Serviço Público",
  "Física",
  "Fluência em Dados",
  "Geografia",
  "Gestão de Pessoas",
  "História do Brasil",
  "Informática Básica e Avançada",
  "Inteligência Artificial & Machine Learning",
  "Legislação Aduaneira",
  "Legislação Especial",
  "Legislação Tributária",
  "Língua Espanhola",
  "Língua Inglesa",
  "Língua Portuguesa",
  "Lógica de Programação",
  "Matemática Financeira",
  "Medicina Legal",
  "Políticas Públicas",
  "Psicologia",
  "Química",
  "Raciocínio Lógico e Matemático",
  "Redação Oficial",
  "Redes de Computadores",
  "Segurança da Informação",
  "Sociologia",
  "Técnicas Bancárias",
]

export function AiPlanningWizard({ open, onOpenChange, onSuccess }: AiPlanningWizardProps) {
  const [step, setStep] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingTextIndex, setLoadingTextIndex] = useState(0)

  // Form State
  const [concurso, setConcurso] = useState("Concurso")
  const [cargo, setCargo] = useState("")
  const [horasSemana, setHorasSemana] = useState([25])
  const [tipoDias, setTipoDias] = useState<"semana" | "escala">("semana")
  const [diasDisponiveis, setDiasDisponiveis] = useState<string[]>([
    "seg",
    "ter",
    "qua",
    "qui",
    "sex",
  ])
  const [escalaTrabalho, setEscalaTrabalho] = useState("24x72")
  const [metodo, setMetodo] = useState("ciclo")
  const [nivel, setNivel] = useState("iniciante")

  // Ajuste Fino State & Autocomplete State
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([])
  const [importanceMap, setImportanceMap] = useState<Record<string, number>>({})
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [dbDisciplines, setDbDisciplines] = useState<string[]>(MASTER_DISCIPLINES_DATABASE)

  // Buscar disciplinas do banco de dados para autocomplete e carregar concurso/cargo ativos
  useEffect(() => {
    if (open) {
      getDisciplinesForAutocomplete()
        .then((res) => {
          if (res && res.allDisciplines && res.allDisciplines.length > 0) {
            const names = res.allDisciplines.map((d) => d.name)
            setDbDisciplines(Array.from(new Set([...names, ...MASTER_DISCIPLINES_DATABASE])))
          } else {
            setDbDisciplines(MASTER_DISCIPLINES_DATABASE)
          }
        })
        .catch(() => {
          setDbDisciplines(MASTER_DISCIPLINES_DATABASE)
        })

      getActiveTargetNameAction().then((res) => {
        if (res.success) {
          if (res.name) setConcurso(res.name)
          if (res.role) setCargo(res.role)
        }
      })
    }
  }, [open])

  // Filtrar disciplinas em tempo real
  const filteredDbDisciplines = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase().trim()
    return dbDisciplines
      .filter((d) => d.toLowerCase().includes(term) && !selectedDisciplines.includes(d))
      .slice(0, 8)
  }, [searchTerm, dbDisciplines, selectedDisciplines])

  // Reseta o wizard ao fechar
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep(1)
        setIsGenerating(false)
        setLoadingTextIndex(0)
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open])

  // Animação de textos de loading
  useEffect(() => {
    if (isGenerating && loadingTextIndex < LOADING_STEPS.length - 1) {
      const timer = setTimeout(() => {
        setLoadingTextIndex((prev) => prev + 1)
      }, 1500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isGenerating, loadingTextIndex])

  const calculateDisciplineScore = useCallback(
    (disc: string) => {
      const imp = importanceMap[disc] ?? 3
      const know = knowledgeMap[disc] ?? 3
      return imp * (6 - know)
    },
    [importanceMap, knowledgeMap],
  )

  const totalCalculatedScore = useMemo(() => {
    return selectedDisciplines.reduce((sum, d) => sum + calculateDisciplineScore(d), 0)
  }, [selectedDisciplines, calculateDisciplineScore])

  const getDisciplinePercentage = (disc: string) => {
    if (totalCalculatedScore <= 0) return 0
    const score = calculateDisciplineScore(disc)
    return Math.round((score / totalCalculatedScore) * 100)
  }

  const allAvailableDisciplines = useMemo(() => {
    return Array.from(new Set([...selectedDisciplines, ...MASTER_DISCIPLINES_DATABASE]))
  }, [selectedDisciplines])

  const handleNext = () => {
    if (step === 4 && selectedDisciplines.length === 0) {
      // Popular disciplinas iniciais baseadas no concurso e cargo ativos
      const discNames = [
        "Língua Portuguesa",
        "Direito Constitucional",
        "Direito Administrativo",
        "Raciocínio Lógico",
      ]
      const combined = `${concurso} ${cargo}`.toLowerCase()

      if (combined.includes("receita") || combined.includes("auditor")) {
        discNames.push("Direito Tributário", "Contabilidade Geral", "Legislação Aduaneira")
      } else if (
        combined.includes("polícia") ||
        combined.includes("policia") ||
        combined.includes("prf")
      ) {
        discNames.push(
          "Direito Penal",
          "Direito Processual Penal",
          "Legislação Especial",
          "Informática",
        )
      } else if (
        combined.includes("tcu") ||
        combined.includes("tribunal de contas") ||
        combined.includes("controle")
      ) {
        discNames.push(
          "Auditoria Governamental",
          "Contabilidade Pública",
          "Controle Externo",
          "Economia",
        )
      } else if (
        combined.includes("banco") ||
        combined.includes("inss") ||
        combined.includes("caixa")
      ) {
        discNames.push("Conhecimentos Bancários", "Direito Previdenciário", "Informática")
      } else {
        discNames.push("Informática", "Estatística")
      }
      setSelectedDisciplines(discNames)

      const imp: Record<string, number> = {}
      const know: Record<string, number> = {}
      discNames.forEach((d) => {
        imp[d] = 3
        know[d] = getInitialKnowledge(nivel)
      })
      setImportanceMap(imp)
      setKnowledgeMap(know)
    }

    if (step === 5 && selectedDisciplines.length === 0) {
      toast.error("Selecione ao menos 1 disciplina para continuar.")
      return
    }

    setStep((prev) => prev + 1)
  }
  const handleBack = () => setStep((prev) => prev - 1)

  const toggleDia = (id: string) => {
    setDiasDisponiveis((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  const toggleDisciplineSelection = (disc: string) => {
    if (selectedDisciplines.includes(disc)) {
      if (selectedDisciplines.length <= 1) {
        toast.error("Selecione ao menos 1 disciplina.")
        return
      }
      setSelectedDisciplines((prev) => prev.filter((d) => d !== disc))
    } else {
      setSelectedDisciplines((prev) => [disc, ...prev])
      if (!importanceMap[disc]) {
        setImportanceMap((prev) => ({ ...prev, [disc]: 3 }))
      }
      if (!knowledgeMap[disc]) {
        setKnowledgeMap((prev) => ({ ...prev, [disc]: getInitialKnowledge(nivel) }))
      }
    }
  }

  const handleAddCustomDiscipline = (discName: string) => {
    const trimmed = discName.trim()
    if (!trimmed) {
      toast.error("Digite o nome da matéria que deseja adicionar.")
      return
    }
    if (selectedDisciplines.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`A matéria "${trimmed}" já está na lista!`)
      return
    }
    setSelectedDisciplines((prev) => [trimmed, ...prev])
    setImportanceMap((prev) => ({ ...prev, [trimmed]: 3 }))
    setKnowledgeMap((prev) => ({ ...prev, [trimmed]: getInitialKnowledge(nivel) }))
    toast.success(`Matéria "${trimmed}" adicionada com sucesso!`)
  }

  const handleGenerate = async () => {
    if (selectedDisciplines.length === 0) {
      toast.error("Selecione ao menos 1 disciplina para gerar o planejamento.")
      return
    }

    setIsGenerating(true)

    if (typeof window !== "undefined") {
      let mappedScale = "normal"
      if (tipoDias === "escala") {
        const parts = (escalaTrabalho || "").split(" ")
        mappedScale = parts[0] ?? "normal"
      }
      localStorage.setItem("mentor_user_work_scale", mappedScale)
      localStorage.setItem(
        "mentor_user_study_days",
        JSON.stringify(
          tipoDias === "semana" ? diasDisponiveis : ["seg", "ter", "qua", "qui", "sex", "sab"],
        ),
      )
      localStorage.setItem("mentor_user_first_shift_day", "1")
      window.dispatchEvent(new Event("mentor_scale_updated"))
    }

    const minimumWait = new Promise((resolve) => setTimeout(resolve, 8000))

    try {
      const finalImportanceMap: Record<string, number> = {}
      const finalKnowledgeMap: Record<string, number> = {}

      selectedDisciplines.forEach((disc) => {
        finalImportanceMap[disc] = importanceMap[disc] ?? 3
        finalKnowledgeMap[disc] = knowledgeMap[disc] ?? 3
      })

      const [res] = await Promise.all([
        generateStudyPlanAction("ai_wizard", {
          horasSemana: horasSemana[0] ?? 25,
          nivel,
          importanceMap: finalImportanceMap,
          knowledgeMap: finalKnowledgeMap,
        }),
        minimumWait,
      ])

      if (res.success) {
        setStep(7)
      } else {
        setStep(7)
      }
    } catch {
      toast.error("Erro inesperado ao gerar planejamento.")
    } finally {
      setIsGenerating(false)
    }
  }

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Horas por semana?</h2>
              <p className="text-sm text-muted-foreground">
                Quantas horas por semana você consegue estudar de verdade?
              </p>
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
      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Dias disponíveis</h2>
              <p className="text-sm text-muted-foreground">
                Como funciona a sua disponibilidade de estudo?
              </p>
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
                  {DIAS_SEMANA.map((dia) => {
                    const isSelected = diasDisponiveis.includes(dia.id)
                    return (
                      <button
                        key={dia.id}
                        onClick={() => toggleDia(dia.id)}
                        className={`px-6 py-3 rounded-full border-2 text-sm font-bold transition-all ${isSelected ? "border-[#2563EB] bg-[#2563EB] text-white shadow-md" : "border-muted bg-card hover:border-[#2563EB]/40 text-foreground"}`}
                      >
                        {dia.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center mt-4 space-y-4 max-w-sm mx-auto">
                <div className="grid grid-cols-2 gap-3 w-full">
                  {[
                    "12x36",
                    "24x72",
                    "24x48",
                    "5x1 (Folga 1)",
                    "6x1 (Folga 1)",
                    "4x2 (Folga 2)",
                    "Outra",
                  ].map((esc) => (
                    <button
                      key={esc}
                      onClick={() => setEscalaTrabalho(esc)}
                      className={`py-3 rounded-xl border-2 text-xs font-bold transition-all ${escalaTrabalho === esc ? "border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]" : "border-muted bg-card hover:border-[#2563EB]/40 text-muted-foreground"}`}
                    >
                      {esc}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      case 3:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Como prefere estudar?</h2>
              <p className="text-sm text-muted-foreground">
                Como o Nomeia deve distribuir as disciplinas?
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 mt-8">
              <div
                onClick={() => setMetodo("ciclo")}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${metodo === "ciclo" ? "border-[#2563EB] bg-[#2563EB]/5" : "border-muted bg-card hover:border-[#2563EB]/40"}`}
              >
                <div
                  className={`p-3 rounded-xl ${metodo === "ciclo" ? "bg-[#2563EB] text-white" : "bg-muted text-foreground"}`}
                >
                  <Loader2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Ciclo de Estudos</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Rotação contínua baseada em pesos e dificuldade. Mais flexível.
                  </p>
                </div>
              </div>
              <div
                onClick={() => setMetodo("agenda")}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${metodo === "agenda" ? "border-[#2563EB] bg-[#2563EB]/5" : "border-muted bg-card hover:border-[#2563EB]/40"}`}
              >
                <div
                  className={`p-3 rounded-xl ${metodo === "agenda" ? "bg-[#2563EB] text-white" : "bg-muted text-foreground"}`}
                >
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Agenda Semanal</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Disciplinas amarradas a dias específicos da semana.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black text-foreground">Qual seu nível?</h2>
              <p className="text-sm text-muted-foreground">
                Para dosarmos a quantidade de teoria vs questões.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              {[
                {
                  id: "iniciante",
                  label: "Iniciante",
                  desc: "Começando do zero",
                  icon: GraduationCap,
                },
                {
                  id: "intermediario",
                  label: "Intermediário",
                  desc: "Já vi a teoria",
                  icon: BookOpen,
                },
                { id: "avancado", label: "Avançado", desc: "Foco em questões", icon: BrainCircuit },
              ].map((n) => (
                <div
                  key={n.id}
                  onClick={() => setNivel(n.id)}
                  className={`p-5 rounded-2xl border-2 text-center cursor-pointer transition-all flex flex-col items-center gap-3 ${nivel === n.id ? "border-[#2563EB] bg-[#2563EB]/5 text-[#2563EB]" : "border-muted bg-card hover:border-[#2563EB]/40 text-muted-foreground hover:text-foreground"}`}
                >
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
      case 5:
        // PASSO 02: Seleção de Disciplinas (Paridade Imagem 1)
        return (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-foreground tracking-tight">Disciplinas</h2>
              <p className="text-xs font-semibold text-muted-foreground">
                Selecione quais das <strong className="text-foreground">suas disciplinas</strong>{" "}
                você deseja colocar no seu <strong className="text-foreground">planejamento</strong>
                .
              </p>
              <p className="text-[11px] text-muted-foreground">
                Você poderá adicionar outras disciplinas a qualquer momento.
              </p>
            </div>

            {/* Container Card para Adicionar Nova Matéria Personalizada / Busca no Banco */}
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
                      id="custom_discipline_top"
                      placeholder="Digitar nova matéria que não está na lista..."
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
                        onClick={() => {
                          setSearchTerm("")
                          setShowAutocomplete(false)
                        }}
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
                      <span>Resultado do Banco de Dados ({filteredDbDisciplines.length})</span>
                    </div>

                    {filteredDbDisciplines.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">
                        Nenhuma matéria exata no banco. Pressione <strong>+ Adicionar</strong> para
                        criar!
                      </div>
                    ) : (
                      filteredDbDisciplines.map((disc) => (
                        <button
                          key={disc}
                          type="button"
                          onClick={() => {
                            handleAddCustomDiscipline(disc)
                            setSearchTerm("")
                            setShowAutocomplete(false)
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-bold text-foreground hover:bg-[#2563EB]/10 hover:text-[#2563EB] transition-colors flex items-center justify-between group cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5 text-[#2563EB]" />
                            {disc}
                          </span>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#2563EB]/10 text-[#2563EB] group-hover:bg-[#2563EB] group-hover:text-white transition-all">
                            + Selecionar
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Grade de Seleção de Disciplinas (Paridade Imagem 1) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1 pr-2">
              {allAvailableDisciplines.map((disc) => {
                const isSelected = selectedDisciplines.includes(disc)
                return (
                  <button
                    key={disc}
                    type="button"
                    onClick={() => toggleDisciplineSelection(disc)}
                    className={`p-3 rounded-2xl border text-xs font-bold transition-all text-center flex items-center justify-center min-h-[46px] cursor-pointer ${
                      isSelected
                        ? "border-[#2563EB] bg-[#dbeafe]/30 text-[#2563EB] shadow-2xs scale-[1.01]"
                        : "border-muted bg-card text-muted-foreground hover:border-[#2563EB]"
                    }`}
                  >
                    {disc}
                  </button>
                )
              })}
            </div>
          </div>
        )
      case 6:
        // PASSO 03: Relevância & Pesos com Cards de Porcentagem (Paridade Imagem 2)
        return (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-foreground tracking-tight">
                Relevância & Pesos
              </h2>
              <p className="text-xs font-semibold text-muted-foreground">
                Para cada disciplina, selecione a{" "}
                <strong className="text-foreground">importância</strong> (ou peso) para sua prova e
                seu <strong className="text-foreground">grau de conhecimento</strong>:
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Coluna da Esquerda: Sliders de Importância e Conhecimento (lg:col-span-2) */}
              <div className="lg:col-span-2 space-y-3.5 max-h-[320px] overflow-y-auto pr-2">
                {selectedDisciplines.map((disc) => (
                  <div
                    key={disc}
                    className="rounded-2xl border border-border p-3.5 space-y-3 bg-card shadow-2xs hover:border-[#2563EB]/40 transition-colors"
                  >
                    <h4 className="font-extrabold text-xs text-foreground truncate">{disc}</h4>
                    <div className="grid grid-cols-2 gap-4 text-[10px] font-bold">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-muted-foreground">
                          <span>IMPORTÂNCIA</span>
                          <span className="text-foreground font-black text-xs">
                            {importanceMap[disc] ?? 3}
                          </span>
                        </div>
                        <Slider
                          value={[importanceMap[disc] ?? 3]}
                          max={5}
                          min={1}
                          step={0.5}
                          onValueChange={(val) =>
                            setImportanceMap({ ...importanceMap, [disc]: val[0] ?? 3 })
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-muted-foreground">
                          <span>CONHECIMENTO</span>
                          <span className="text-foreground font-black text-xs">
                            {knowledgeMap[disc] ?? 3}
                          </span>
                        </div>
                        <Slider
                          value={[knowledgeMap[disc] ?? 3]}
                          max={5}
                          min={1}
                          step={0.5}
                          onValueChange={(val) =>
                            setKnowledgeMap({ ...knowledgeMap, [disc]: val[0] ?? 3 })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coluna da Direita: Cards Coloridos de Porcentagem Calculada (Paridade Imagem 2) */}
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                <div className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider mb-2">
                  Peso no Planejamento ({selectedDisciplines.length})
                </div>
                {selectedDisciplines.map((disc, idx) => {
                  const pct = getDisciplinePercentage(disc)
                  const colorClass = [
                    "bg-purple-100/90 text-purple-900 border-purple-200",
                    "bg-rose-100/90 text-rose-900 border-rose-200",
                    "bg-emerald-100/90 text-emerald-900 border-emerald-200",
                    "bg-sky-100/90 text-sky-900 border-sky-200",
                    "bg-amber-100/90 text-amber-900 border-amber-200",
                    "bg-indigo-100/90 text-indigo-900 border-indigo-200",
                    "bg-teal-100/90 text-teal-900 border-teal-200",
                    "bg-fuchsia-100/90 text-fuchsia-900 border-fuchsia-200",
                  ][idx % 8]

                  return (
                    <div
                      key={disc}
                      className={cn(
                        "p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all shadow-2xs",
                        colorClass,
                      )}
                    >
                      <span className="font-black text-xs pr-2 border-r border-current/20 shrink-0">
                        {pct}%
                      </span>
                      <span className="truncate pl-2 flex-1 font-extrabold text-[11px]">
                        {disc}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      case 7:
        return (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-8">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-3xl font-black text-foreground">
              Planejamento Criado com Sucesso!
            </h2>
            <p className="text-xs text-muted-foreground max-w-sm">
              Seu ciclo e metas personalizadas para{" "}
              <strong className="text-foreground">
                {concurso}
                {cargo ? ` (${cargo})` : ""}
              </strong>{" "}
              já estão ativos.
            </p>
            <Button
              onClick={() => {
                onSuccess()
                onOpenChange(false)
              }}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] w-full max-w-sm h-12 text-sm font-bold shadow-lg"
            >
              Abrir Planejamento
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (isGenerating) return
        onOpenChange(val)
      }}
    >
      <DialogContent className="sm:max-w-[660px] p-0 overflow-hidden rounded-3xl border-0 shadow-2xl bg-background max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">Assistente de Planejamento com IA</DialogTitle>
        {renderDialogBody()}
      </DialogContent>
    </Dialog>
  )

  function renderDialogBody() {
    if (isGenerating) {
      return (
        <div className="h-[500px] flex flex-col items-center justify-center p-8 text-center space-y-8 bg-gradient-to-b from-background to-[#2563EB]/5">
          <Bot className="w-20 h-20 text-[#2563EB] animate-bounce" />
          <div className="space-y-4 w-full max-w-sm">
            <h2 className="text-2xl font-black text-foreground">Gerando Planejamento...</h2>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#2563EB]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 8, ease: "linear" }}
              />
            </div>
          </div>
        </div>
      )
    }
    if (step <= 6) {
      return (
        <div className="flex flex-col h-auto max-h-[85vh]">
          <div className="p-6 pb-2 shrink-0 border-b border-border/40">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-[#2563EB] font-bold text-xs bg-[#2563EB]/10 px-3 py-1.5 rounded-full">
                  <Sparkles className="w-3.5 h-3.5" /> Nomeia Inteligente
                </div>
                {concurso && concurso !== "Concurso" && (
                  <span className="text-xs font-extrabold px-3 py-1.5 rounded-full bg-muted border border-border text-foreground flex items-center gap-1.5 truncate max-w-[260px]">
                    🎯 {concurso}
                    {cargo ? ` · ${cargo}` : ""}
                  </span>
                )}
              </div>
              <div className="text-xs font-bold text-muted-foreground">Etapa {step} de 6</div>
            </div>
            <div className="flex gap-1.5 px-2 pb-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? "bg-[#2563EB]" : "bg-muted"}`}
                />
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className={cn(
                  "h-full flex flex-col",
                  step === 5 || step === 6 ? "justify-start" : "justify-center",
                )}
              >
                {renderStepContent()}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="p-5 border-t bg-muted/10 shrink-0 flex items-center justify-between">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
              </button>
            )}
            <div className="flex-1" />
            {step < 6 ? (
              <Button
                onClick={handleNext}
                className="bg-[#2563EB] text-white hover:bg-[#1D4ED8] font-bold gap-2 min-w-[120px]"
              >
                Próximo <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold gap-2 shadow-lg"
              >
                Gerar Planejamento <Sparkles className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )
    }
    return <div className="p-6">{renderStepContent()}</div>
  }
}
