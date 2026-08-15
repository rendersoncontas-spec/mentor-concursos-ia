"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { generateStudyPlanAction } from "@/application/study-plan/generate-study-plan.action"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  DAILY_STUDY_CAP_HOURS,
  DURATION_OPTIONS,
  LS_CUSTOM_SCALE,
  LS_FIRST_SHIFT,
  LS_MAX_MIN,
  LS_MIN_MIN,
  LS_SCALE,
  LS_STUDY_DAYS,
  LS_STYLE,
  LS_WEEKLY_HOURS,
  MAX_WEEKLY_HOURS,
  MIN_WEEKLY_HOURS,
  PRESETS,
  type PlanningMode,
  SCALES,
  type SessionStyle,
  buildPlanningPayload,
  formatMinutesLabel,
  isShiftDayForScale,
  planningReason,
  validatePlanningForm,
} from "@/features/planejamento/lib/planning-form"
import { cn } from "@/lib/utils"

import { type StudyCycleBlock } from "./planning-view"

export interface PlanningWizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modalTitle?: string
  /** "create" (estado default) ou "edit" (pré-preenchido com os dados existentes). */
  mode?: PlanningMode
  initialBlocks?: StudyCycleBlock[]
  onComplete?: () => void
}

type PrioritizedStudyCycleBlock = StudyCycleBlock & { priorityScore?: number }

const ALL_DISCIPLINES = [
  "Administração Financeira e Orçamentária (AFO)",
  "Administração Geral",
  "Administração Pública",
  "Arquivologia",
  "Auditoria Governamental",
  "Auditoria Privada",
  "Banco de Dados e Big Data",
  "Biologia",
  "Contabilidade de Custos",
  "Contabilidade Geral",
  "Contabilidade Pública",
  "Controle Externo",
  "Criminologia",
  "Direito Administrativo",
  "Direito Ambiental",
  "Direito Civil",
  "Direito Constitucional",
  "Direito do Consumidor",
  "Direito do Trabalho",
  "Direito Eleitoral",
  "Direito Empresarial",
  "Direito Financeiro",
  "Direito Internacional",
  "Direito Penal",
  "Direito Previdenciário",
  "Direito Processual Civil",
  "Direito Processual Penal",
  "Direito Tributário",
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
  "Raciocínio Lógico",
  "Raciocínio Lógico e Matemático",
  "Redação Oficial",
  "Redes de Computadores",
  "Segurança da Informação",
  "Sociologia",
  "Técnicas Bancárias",
]

const STEP_LABELS = ["Organização", "Disciplinas", "Relevância", "Horários"]

const WEEK_DAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const WEEK_DAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]
const SHORT_TO_FULL: Record<string, string> = {
  dom: "Domingo",
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
}

export function PlanningWizardModal({
  open,
  onOpenChange,
  modalTitle = "Criar planejamento",
  mode = "create",
  initialBlocks,
  onComplete,
}: PlanningWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)
  const [allDbDisciplines, setAllDbDisciplines] = useState<string[]>(ALL_DISCIPLINES)
  const [searchTerm, setSearchTerm] = useState("")
  const [showAutocomplete, setShowAutocomplete] = useState(false)

  // Step 1 State: Organização
  const [planningMode, setPlanningMode] = useState<"ciclo" | "semanal">("ciclo")
  const [weeklyHoursInput, setWeeklyHoursInput] = useState("25")
  const [dayConfigMode, setDayConfigMode] = useState<"semana" | "escala">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LS_SCALE)
      if (saved && saved !== "normal") return "escala"
    }
    return "semana"
  })
  const [escalaTrabalho, setEscalaTrabalho] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LS_SCALE)
      if (saved) return saved
    }
    return "24x72"
  })
  const [customWorkDays, setCustomWorkDays] = useState(3)
  const [customOffDays, setCustomOffDays] = useState(2)
  const [firstShiftDay, setFirstShiftDay] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LS_FIRST_SHIFT)
      if (saved) return parseInt(saved)
    }
    return 2
  })
  const [selectedDays, setSelectedDays] = useState<string[]>([...WEEK_DAY_FULL])

  // Step 4 State: Duração das sessões
  const [minMinutes, setMinMinutes] = useState(45)
  const [maxMinutes, setMaxMinutes] = useState(90)
  const [sessionStyle, setSessionStyle] = useState<SessionStyle>("equilibradas")

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
  const [importanceMap, setImportanceMap] = useState<Record<string, number>>({})
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, number>>({})

  // Pre-fill state when modal opens or initialBlocks change
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (typeof window !== "undefined") {
          const savedHours = localStorage.getItem(LS_WEEKLY_HOURS)
          const savedMin = localStorage.getItem(LS_MIN_MIN)
          const savedMax = localStorage.getItem(LS_MAX_MIN)
          const savedStyle = localStorage.getItem(LS_STYLE)

          // Edição: os dados do plano atual têm prioridade sobre o localStorage
          // (item 24: não sobrescrever valores existentes por defaults).
          // Criação: preferências salvas têm prioridade sobre os defaults.
          if (mode === "edit" && initialBlocks && initialBlocks.length > 0) {
            const totalMins = initialBlocks.reduce((acc, b) => acc + b.durationMinutes, 0)
            if (totalMins > 0) setWeeklyHoursInput(Math.round(totalMins / 60).toString())
          } else if (savedHours && Number.isFinite(Number(savedHours))) {
            setWeeklyHoursInput(
              String(Math.min(MAX_WEEKLY_HOURS, Math.max(MIN_WEEKLY_HOURS, Number(savedHours)))),
            )
          }

          const min = savedMin ? Number(savedMin) : NaN
          const max = savedMax ? Number(savedMax) : NaN
          if (Number.isFinite(min) && min >= 30 && min <= 180)
            setMinMinutes(Math.round(min / 5) * 5)
          if (Number.isFinite(max) && max >= 30 && max <= 180)
            setMaxMinutes(Math.round(max / 5) * 5)
          if (
            savedStyle &&
            (savedStyle === "curtas" ||
              savedStyle === "equilibradas" ||
              savedStyle === "longas" ||
              savedStyle === "personalizado")
          ) {
            setSessionStyle(savedStyle as SessionStyle)
          }

          const savedScale = localStorage.getItem(LS_SCALE)
          if (savedScale) {
            if (savedScale.startsWith("custom_")) {
              setEscalaTrabalho(savedScale)
              const m = /^custom_(\d+)x(\d+)$/.exec(savedScale)
              if (m) {
                setCustomWorkDays(Math.min(14, Math.max(1, parseInt(m[1] ?? "1", 10))))
                setCustomOffDays(Math.min(14, Math.max(1, parseInt(m[2] ?? "1", 10))))
              }
            } else {
              setEscalaTrabalho(savedScale)
            }
          }

          const savedDays = localStorage.getItem(LS_STUDY_DAYS)
          if (savedDays) {
            try {
              const arr = JSON.parse(savedDays) as string[]
              if (Array.isArray(arr) && arr.length > 0) {
                setSelectedDays(arr.map((s) => SHORT_TO_FULL[s] || s).filter(Boolean))
              }
            } catch {
              /* ignore */
            }
          }
        }

        if (initialBlocks && initialBlocks.length > 0) {
          const uniqueNames = Array.from(new Set(initialBlocks.map((b) => b.disciplineName)))
          setSelectedDisciplines(uniqueNames)

          const impMap: Record<string, number> = {}
          const knowMap: Record<string, number> = {}

          initialBlocks.forEach((b) => {
            if (!impMap[b.disciplineName]) {
              const priorityScore = (b as PrioritizedStudyCycleBlock).priorityScore ?? 3
              impMap[b.disciplineName] = Math.min(5, Math.max(1, Math.round(priorityScore)))
              knowMap[b.disciplineName] = 2.5
            }
          })

          setImportanceMap(impMap)
          setKnowledgeMap(knowMap)
        }

        getDisciplinesForAutocomplete()
          .then((res) => {
            if (res?.allDisciplines && res.allDisciplines.length > 0) {
              const dbNames = res.allDisciplines.map((d) => d.name)
              setAllDbDisciplines(Array.from(new Set([...dbNames, ...ALL_DISCIPLINES])))
            }
          })
          .catch(() => {})
      }, 0)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open, initialBlocks, mode])

  const weeklyHoursNum = Math.min(
    MAX_WEEKLY_HOURS,
    Math.max(MIN_WEEKLY_HOURS, parseInt(weeklyHoursInput, 10) || MIN_WEEKLY_HOURS),
  )

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

    setSelectedDisciplines((prev) => [trimmed, ...prev])
    setImportanceMap((prev) => ({ ...prev, [trimmed]: 2.5 }))
    setKnowledgeMap((prev) => ({ ...prev, [trimmed]: 2.5 }))
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

  // ─── Disponibilidade real (espelha a lógica do cliente/replan) ───────────
  const effectiveScale = dayConfigMode === "escala" ? escalaTrabalho : "normal"

  const isDayAvailable = useCallback(
    (date: Date) => {
      const full = WEEK_DAY_FULL[date.getDay()] ?? ""
      if (!selectedDays.includes(full)) return false
      if (dayConfigMode === "semana") return true
      return !isShiftDayForScale(date.getDate(), firstShiftDay, effectiveScale)
    },
    [selectedDays, dayConfigMode, firstShiftDay, effectiveScale],
  )

  const { daysPerWeek, preview } = useMemo(() => {
    const today = new Date()
    let count = 0
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      if (isDayAvailable(d)) count++
    }
    const daysPerWeek = Math.max(1, Math.round(count / 2))

    const base = Math.floor(weeklyHoursNum / daysPerWeek)
    let remainder = weeklyHoursNum - base * daysPerWeek
    const preview = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const available = isDayAvailable(d)
      if (!available) return { label: WEEK_DAY_SHORT[d.getDay()], hours: 0, available: false }
      let hours = base
      if (remainder > 0) {
        hours += 1
        remainder--
      }
      return { label: WEEK_DAY_SHORT[d.getDay()], hours, available: true }
    })
    return { daysPerWeek, preview }
  }, [isDayAvailable, weeklyHoursNum])

  const capacityHours = daysPerWeek * DAILY_STUDY_CAP_HOURS
  const loadOk = weeklyHoursNum <= capacityHours
  const loadDiff = weeklyHoursNum - capacityHours

  const isCustomScale = /^custom_(\d+)x(\d+)$/.test(escalaTrabalho)
  let escalaLabel = escalaTrabalho
  if (dayConfigMode === "semana") {
    escalaLabel = "Dias da semana"
  } else if (isCustomScale) {
    escalaLabel = `Personalizada (${escalaTrabalho.replace("custom_", "")})`
  }

  const scalePhrase =
    dayConfigMode === "escala" && effectiveScale !== "normal"
      ? `Na sua escala ${escalaLabel}, o Nomeia aproveitará principalmente seus dias de folga.`
      : "Seu planejamento foi distribuído respeitando seu plantão e seus dias disponíveis."

  // Validação da duração
  const durationInvalid = minMinutes > maxMinutes

  const canProceed = currentStep === 4 ? !durationInvalid : selectedDisciplines.length > 0

  const handlePrevStep = () => {
    if (currentStep === 2) setCurrentStep(1)
    else if (currentStep === 3) setCurrentStep(2)
    else if (currentStep === 4) setCurrentStep(3)
  }

  const handleSelectPreset = (style: SessionStyle) => {
    setSessionStyle(style)
    if (style !== "personalizado") {
      const preset = PRESETS[style]
      setMinMinutes(preset.min)
      setMaxMinutes(preset.max)
    }
  }

  const handleSave = async () => {
    try {
      // Mesma validação usada pelo servidor (planning-form.ts)
      const validation = validatePlanningForm({
        mode: planningMode,
        weeklyHours: weeklyHoursNum,
        dayConfigMode,
        scale: escalaTrabalho,
        customWorkDays,
        customOffDays,
        firstShiftDay,
        studyDays: selectedDays,
        minMinutes,
        maxMinutes,
        sessionStyle,
        selectedDisciplines,
        importanceMap,
        knowledgeMap,
      })
      if (!validation.ok) {
        toast.error(validation.errors[0] || "Verifique os dados do planejamento.")
        return
      }

      if (typeof window !== "undefined") {
        if (dayConfigMode === "escala") {
          localStorage.setItem(LS_SCALE, escalaTrabalho)
          localStorage.setItem(LS_FIRST_SHIFT, firstShiftDay.toString())
          if (isCustomScale) {
            localStorage.setItem(
              LS_CUSTOM_SCALE,
              JSON.stringify({ work: customWorkDays, off: customOffDays }),
            )
          }
        } else {
          localStorage.setItem(LS_SCALE, "normal")
        }

        const dayMapShort: Record<string, string> = {
          Domingo: "dom",
          Segunda: "seg",
          Terça: "ter",
          Quarta: "qua",
          Quinta: "qui",
          Sexta: "sex",
          Sábado: "sab",
        }
        const shortDays = selectedDays.map((d) => dayMapShort[d] || d.toLowerCase().slice(0, 3))
        localStorage.setItem(LS_STUDY_DAYS, JSON.stringify(shortDays))

        localStorage.setItem(LS_WEEKLY_HOURS, weeklyHoursNum.toString())
        localStorage.setItem(LS_MIN_MIN, minMinutes.toString())
        localStorage.setItem(LS_MAX_MIN, maxMinutes.toString())
        localStorage.setItem(LS_STYLE, sessionStyle)

        window.dispatchEvent(new Event("mentor_scale_updated"))
      }

      const res = await generateStudyPlanAction(
        planningReason(mode),
        buildPlanningPayload({
          mode: planningMode,
          weeklyHours: weeklyHoursNum,
          dayConfigMode,
          scale: escalaTrabalho,
          customWorkDays,
          customOffDays,
          firstShiftDay,
          studyDays: selectedDays,
          minMinutes,
          maxMinutes,
          sessionStyle,
          selectedDisciplines,
          importanceMap,
          knowledgeMap,
        }),
      )

      if (res.success) {
        toast.success(
          mode === "edit"
            ? "Planejamento atualizado com sucesso!"
            : "Planejamento criado com sucesso!",
        )
        if (onComplete) onComplete()
        onOpenChange(false)
        setCurrentStep(1)
      } else {
        toast.error(
          res.error ||
            (mode === "edit"
              ? "Erro ao atualizar o planejamento."
              : "Erro ao criar o planejamento."),
        )
      }
    } catch {
      toast.error(
        mode === "edit"
          ? "Erro interno ao atualizar o planejamento."
          : "Erro interno ao criar o planejamento.",
      )
    }
  }

  const handleNextStep = async () => {
    if (currentStep === 1) setCurrentStep(2)
    else if (currentStep === 2) setCurrentStep(3)
    else if (currentStep === 3) setCurrentStep(4)
    else if (currentStep === 4) await handleSave()
  }

  const calculateDisciplineScore = useCallback(
    (disc: string) => {
      const imp = importanceMap[disc] ?? 2.5
      const know = knowledgeMap[disc] ?? 2.5
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

  const presetColors: Record<SessionStyle, string> = {
    curtas: "border-sky-300 bg-sky-500/10 text-sky-700",
    equilibradas: "border-[#2563EB]/40 bg-[#2563EB]/8 text-[#2563EB]",
    longas: "border-violet-300 bg-violet-500/10 text-violet-700",
    personalizado: "border-amber-300 bg-amber-500/10 text-amber-700",
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mobile: tela inteira, scroll natural do viewport (sem scroll interno).
          Desktop: altura ajustada ao conteúdo, sem scroll. */}
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0 border-0 max-w-none",
          "fixed inset-0 h-[100dvh] w-full overflow-y-auto sm:overflow-hidden",
          "rounded-none sm:rounded-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:right-auto",
          "sm:translate-x-0 sm:translate-y-0 sm:translate-x-[-50%] sm:translate-y-[-50%]",
          "sm:w-[min(900px,94vw)] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:border",
        )}
      >
        {/* ─────────────── HEADER (compacto) ─────────────── */}
        <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b bg-card">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground">
                {modalTitle}
              </h2>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium mt-0.5">
                Vamos ajustar sua rotina para criar um cronograma que realmente caiba no seu dia.
              </p>
            </div>
          </div>

          {/* Stepper Desktop (compacto) */}
          <div className="hidden sm:flex items-center justify-between relative max-w-xl mx-auto mt-4">
            <div className="absolute top-3.5 left-8 right-8 h-0.5 bg-muted">
              <div
                className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
              />
            </div>
            {STEP_LABELS.map((label, idx) => {
              const step = (idx + 1) as 1 | 2 | 3 | 4
              const done = currentStep > step
              const active = currentStep === step
              return (
                <div key={label} className="flex flex-col items-center gap-1 relative z-10">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-extrabold transition-all",
                      done || active
                        ? "bg-[#2563EB] border-[#2563EB] text-white"
                        : "bg-card border-muted text-muted-foreground",
                      active && "ring-4 ring-[#2563EB]/15 scale-105",
                    )}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : `0${step}`}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-extrabold uppercase tracking-wide",
                      active ? "text-[#2563EB]" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Stepper Mobile */}
          <div className="sm:hidden flex items-center gap-3 mt-3">
            <span className="text-[11px] font-extrabold uppercase text-muted-foreground shrink-0">
              Etapa {currentStep} de 4
            </span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* ─────────────── BODY (sem scroll interno) ─────────────── */}
        <div className="flex-1 px-4 sm:px-6 py-4">
          <div
            key={currentStep}
            className="space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            {/* ═══════════════ PASSO 1 · Organização ═══════════════ */}
            {currentStep === 1 && (
              <>
                {/* Modo + Carga semanal + Resumo em duas colunas no desktop */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
                  <div className="md:col-span-3 space-y-3.5">
                    {/* Modo */}
                    <div>
                      <label className="text-xs font-extrabold text-foreground block">
                        Como você prefere visualizar seu planejamento?
                      </label>
                      <div className="grid grid-cols-2 gap-2.5 mt-2">
                        {[
                          {
                            key: "ciclo" as const,
                            icon: RotateCcw,
                            title: "Ciclo de Estudos",
                            desc: "Ordem rotativa e flexível",
                          },
                          {
                            key: "semanal" as const,
                            icon: Calendar,
                            title: "Planejamento Semanal",
                            desc: "Matérias fixas por dia",
                          },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setPlanningMode(opt.key)}
                            aria-pressed={planningMode === opt.key}
                            className={cn(
                              "rounded-xl border-2 p-3 cursor-pointer transition-all flex items-center gap-2.5 text-left",
                              planningMode === opt.key
                                ? "border-[#2563EB] bg-[#dbeafe]/20 shadow-md"
                                : "border-muted bg-card hover:border-[#2563EB]/50",
                            )}
                          >
                            <div
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                planningMode === opt.key
                                  ? "text-[#2563EB] bg-[#2563EB]/10"
                                  : "text-muted-foreground bg-muted",
                              )}
                            >
                              <opt.icon className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="font-extrabold text-xs text-foreground">
                                {opt.title}
                              </h3>
                              <p className="text-[10px] text-muted-foreground font-medium mt-0.5 hidden sm:block">
                                {opt.desc}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Carga semanal */}
                    <div className="rounded-xl border bg-card p-3 space-y-3">
                      <div>
                        <label className="text-xs font-extrabold text-foreground block">
                          Quanto tempo você consegue estudar por semana?
                        </label>
                        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                          Deslize ou use os botões para definir sua carga ideal.
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            setWeeklyHoursInput(
                              String(Math.max(MIN_WEEKLY_HOURS, weeklyHoursNum - 1)),
                            )
                          }
                          className="w-8 h-8 rounded-lg cursor-pointer"
                          aria-label="Diminuir horas semanais"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <div className="text-center min-w-[80px] shrink-0">
                          <div className="text-2xl font-black font-mono text-[#2563EB] tabular-nums leading-none">
                            {weeklyHoursNum}
                            <span className="text-base text-muted-foreground">h</span>
                          </div>
                          <div className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground mt-0.5">
                            / semana
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            setWeeklyHoursInput(
                              String(Math.min(MAX_WEEKLY_HOURS, weeklyHoursNum + 1)),
                            )
                          }
                          className="w-8 h-8 rounded-lg cursor-pointer"
                          aria-label="Aumentar horas semanais"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>

                        <div className="flex-1">
                          <Slider
                            value={[weeklyHoursNum]}
                            min={MIN_WEEKLY_HOURS}
                            max={MAX_WEEKLY_HOURS}
                            step={1}
                            onValueChange={(v) =>
                              setWeeklyHoursInput(String(v[0] ?? weeklyHoursNum))
                            }
                            aria-label="Horas semanais"
                          />
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {MIN_WEEKLY_HOURS}h
                            </span>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={MIN_WEEKLY_HOURS}
                              max={MAX_WEEKLY_HOURS}
                              value={weeklyHoursInput}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^\d]/g, "")
                                setWeeklyHoursInput(v)
                              }}
                              onBlur={() => setWeeklyHoursInput(String(weeklyHoursNum))}
                              className="w-16 h-7 text-center font-mono font-black text-xs rounded-lg"
                              aria-label="Horas semanais (valor numérico)"
                            />
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {MAX_WEEKLY_HOURS}h
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resumo dinâmico da carga */}
                  <div
                    className={cn(
                      "md:col-span-2 rounded-xl border p-3 space-y-2.5 self-start",
                      loadOk
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-amber-500/5 border-amber-500/25",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        Carga semanal
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px] font-extrabold",
                          loadOk ? "text-emerald-600" : "text-amber-600",
                        )}
                      >
                        {loadOk ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        {loadOk ? "Compatível" : "Ajuste necessário"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                          Desejada
                        </div>
                        <div className="text-base font-black tabular-nums">{weeklyHoursNum}h</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                          Disponível
                        </div>
                        <div className="text-base font-black tabular-nums text-[#2563EB]">
                          {capacityHours}h
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                          Dias/semana
                        </div>
                        <div className="text-base font-black tabular-nums">{daysPerWeek}</div>
                      </div>
                    </div>

                    <div className="border-t pt-2">
                      {loadOk ? (
                        <p className="text-[11px] font-semibold text-emerald-700">
                          Sua carga cabe na sua disponibilidade estimada.
                        </p>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-amber-700">
                            Desejada ultrapassa a disponibilidade em {loadDiff}h.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setWeeklyHoursInput(String(Math.max(MIN_WEEKLY_HOURS, capacityHours)))
                            }
                            className="border-amber-300 text-amber-700 hover:bg-amber-500/10 font-bold text-[11px] h-8 rounded-lg cursor-pointer"
                          >
                            Reduzir para {Math.max(MIN_WEEKLY_HOURS, capacityHours)}h
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Como organiza os dias */}
                <div className="rounded-xl border bg-card p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <label className="text-xs font-extrabold text-foreground block">
                        Como você organiza seus dias de estudo?
                      </label>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        Isso ajuda o Nomeia a calcular seus dias disponíveis.
                      </p>
                    </div>
                    <div className="flex p-1 bg-muted rounded-xl gap-1 border w-fit">
                      <button
                        type="button"
                        onClick={() => setDayConfigMode("semana")}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer",
                          dayConfigMode === "semana"
                            ? "bg-[#2563EB] text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Dias da Semana
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayConfigMode("escala")}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer",
                          dayConfigMode === "escala"
                            ? "bg-[#2563EB] text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Escala de Trabalho / Plantão
                      </button>
                    </div>
                  </div>

                  {dayConfigMode === "semana" ? (
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {WEEK_DAY_FULL.map((day) => {
                        const isSelected = selectedDays.includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDaySelection(day)}
                            aria-pressed={isSelected}
                            className={cn(
                              "px-3.5 py-2 rounded-lg border-2 text-xs font-extrabold transition-all cursor-pointer",
                              isSelected
                                ? "border-[#2563EB] bg-[#2563EB] text-white shadow-xs"
                                : "border-muted bg-card text-muted-foreground hover:border-[#2563EB]/60",
                            )}
                          >
                            {day}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {SCALES.map((esc) => {
                          const selected = escalaTrabalho === esc.id && !isCustomScale
                          return (
                            <button
                              key={esc.id}
                              type="button"
                              onClick={() => setEscalaTrabalho(esc.id)}
                              aria-pressed={selected}
                              className={cn(
                                "relative rounded-lg border-2 p-2.5 text-left transition-all cursor-pointer",
                                selected
                                  ? "border-[#2563EB] bg-[#2563EB]/10"
                                  : "border-muted bg-card hover:border-[#2563EB]/40",
                              )}
                            >
                              {selected && (
                                <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-[#2563EB] text-white flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5" />
                                </span>
                              )}
                              <div className="font-extrabold text-xs text-foreground">
                                {esc.label}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                {esc.desc}
                              </div>
                            </button>
                          )
                        })}

                        {/* Personalizada */}
                        <button
                          type="button"
                          onClick={() =>
                            setEscalaTrabalho(`custom_${customWorkDays}x${customOffDays}`)
                          }
                          aria-pressed={isCustomScale}
                          className={cn(
                            "relative rounded-lg border-2 p-2.5 text-left transition-all cursor-pointer",
                            isCustomScale
                              ? "border-amber-400 bg-amber-500/10"
                              : "border-muted bg-card hover:border-amber-400/50",
                          )}
                        >
                          {isCustomScale && (
                            <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                          <div className="font-extrabold text-xs text-foreground">
                            Personalizada
                          </div>
                          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                            Defina seu próprio ciclo
                          </div>
                        </button>
                      </div>

                      {isCustomScale && (
                        <div className="rounded-lg border border-amber-300/40 bg-amber-500/5 p-2.5 space-y-2">
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                                Trabalha (dias)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={14}
                                value={customWorkDays}
                                onChange={(e) => {
                                  const v = Math.min(14, Math.max(1, Number(e.target.value) || 1))
                                  setCustomWorkDays(v)
                                  setEscalaTrabalho(`custom_${v}x${customOffDays}`)
                                }}
                                className="h-8 text-center font-mono font-black rounded-lg"
                                aria-label="Dias trabalhados por ciclo"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                                Folga (dias)
                              </label>
                              <Input
                                type="number"
                                min={1}
                                max={14}
                                value={customOffDays}
                                onChange={(e) => {
                                  const v = Math.min(14, Math.max(1, Number(e.target.value) || 1))
                                  setCustomOffDays(v)
                                  setEscalaTrabalho(`custom_${customWorkDays}x${v}`)
                                }}
                                className="h-8 text-center font-mono font-black rounded-lg"
                                aria-label="Dias de folga por ciclo"
                              />
                            </div>
                          </div>
                          <p className="text-[11px] font-semibold text-amber-700">
                            Padrão: {customWorkDays}d de trabalho · {customOffDays}d de folga ·
                            ciclo de {customWorkDays + customOffDays} dias.
                          </p>
                        </div>
                      )}

                      {/* Dia do primeiro plantão */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-[11px] font-extrabold text-muted-foreground shrink-0">
                          Em qual dia cai seu 1º plantão?
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, idx) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setFirstShiftDay(idx)}
                              aria-pressed={firstShiftDay === idx}
                              className={cn(
                                "px-3 py-1.5 rounded-lg border-2 text-[11px] font-extrabold transition-all cursor-pointer",
                                firstShiftDay === idx
                                  ? "bg-[#2563EB] text-white border-[#2563EB]"
                                  : "bg-card text-muted-foreground border-muted hover:border-[#2563EB]/60",
                              )}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══════════════ PASSO 2 · Disciplinas ═══════════════ */}
            {currentStep === 2 && (
              <>
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Selecione quais das{" "}
                    <strong className="text-foreground">suas disciplinas</strong> você deseja
                    colocar no seu <strong className="text-foreground">planejamento</strong>.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Você poderá adicionar outras disciplinas a qualquer momento.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-[#2563EB]/25 bg-gradient-to-br from-[#2563EB]/5 via-background to-muted/20 space-y-2 shadow-2xs">
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

                    {showAutocomplete && searchTerm.trim().length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto divide-y divide-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                          <span>Resultado da busca ({filteredDbDisciplines.length})</span>
                        </div>

                        {filteredDbDisciplines.length === 0 ? (
                          <div className="p-3 text-xs text-muted-foreground text-center">
                            Nenhuma matéria exata no banco. Pressione <strong>+ Adicionar</strong>{" "}
                            para criar &quot;{searchTerm}&quot;!
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

                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {Array.from(new Set([...selectedDisciplines, ...allDbDisciplines])).map(
                    (disc) => {
                      const isSelected = selectedDisciplines.includes(disc)
                      return (
                        <button
                          key={disc}
                          type="button"
                          onClick={() => toggleDisciplineSelection(disc)}
                          aria-pressed={isSelected}
                          className={`p-2.5 rounded-lg border text-xs font-bold transition-all text-center ${
                            isSelected
                              ? "border-[#2563EB] bg-[#dbeafe]/30 text-[#2563EB] shadow-xs"
                              : "border-muted bg-card text-muted-foreground hover:border-[#2563EB]"
                          }`}
                        >
                          {disc}
                        </button>
                      )
                    },
                  )}
                </div>
              </>
            )}

            {/* ═══════════════ PASSO 3 · Relevância ═══════════════ */}
            {currentStep === 3 && (
              <>
                <p className="text-xs font-semibold text-center text-muted-foreground">
                  Para cada disciplina, selecione a{" "}
                  <strong className="text-foreground">importância</strong> (ou peso) para sua prova
                  e seu <strong className="text-foreground">grau de conhecimento</strong>:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selectedDisciplines.map((disc) => {
                    const pct = getDisciplinePercentage(disc)
                    return (
                      <div key={disc} className="rounded-lg border p-2.5 space-y-2 bg-card">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-extrabold text-xs text-foreground truncate">
                            {disc}
                          </h4>
                          <span className="shrink-0 text-[10px] font-black font-mono text-[#2563EB] bg-[#2563EB]/10 px-1.5 py-0.5 rounded-md">
                            {pct}%
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[10px] font-bold">
                          <div className="space-y-1">
                            <div className="flex justify-between text-muted-foreground">
                              <span>IMPORTÂNCIA</span>
                              <span className="text-foreground font-black">
                                {importanceMap[disc] ?? 2.5}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              step="0.5"
                              value={importanceMap[disc] ?? 2.5}
                              onChange={(e) =>
                                setImportanceMap({
                                  ...importanceMap,
                                  [disc]: parseFloat(e.target.value),
                                })
                              }
                              className="w-full accent-[#2563EB]"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-muted-foreground">
                              <span>CONHECIMENTO</span>
                              <span className="text-foreground font-black">
                                {knowledgeMap[disc] ?? 2.5}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              step="0.5"
                              value={knowledgeMap[disc] ?? 2.5}
                              onChange={(e) =>
                                setKnowledgeMap({
                                  ...knowledgeMap,
                                  [disc]: parseFloat(e.target.value),
                                })
                              }
                              className="w-full accent-[#2563EB]"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ═══════════════ PASSO 4 · Horários ═══════════════ */}
            {currentStep === 4 && (
              <>
                {/* Presets de duração */}
                <div>
                  <label className="text-xs font-extrabold text-foreground block">
                    Como você prefere estudar?
                  </label>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                    Escolha um estilo de sessão — você pode ajustar os valores depois.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
                    {[
                      { id: "curtas" as const, label: "Sessões curtas", range: "30–60 min" },
                      { id: "equilibradas" as const, label: "Equilibradas", range: "45–90 min" },
                      { id: "longas" as const, label: "Longas", range: "60–120 min" },
                      {
                        id: "personalizado" as const,
                        label: "Personalizado",
                        range: "você escolhe",
                      },
                    ].map((preset) => {
                      const selected = sessionStyle === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset.id)}
                          aria-pressed={selected}
                          className={cn(
                            "rounded-lg border-2 p-2.5 text-center transition-all cursor-pointer",
                            selected
                              ? presetColors[preset.id]
                              : "border-muted bg-card text-muted-foreground hover:border-[#2563EB]/50",
                          )}
                        >
                          <div className="text-xs font-extrabold">{preset.label}</div>
                          <div className="text-[10px] font-mono font-bold mt-0.5 opacity-80">
                            {preset.range}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Duração mínima e máxima + Previsão/Resumo em duas colunas no desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="rounded-xl border bg-card p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-foreground block">
                        Duração de cada sessão
                      </label>
                      <Clock className="w-4 h-4 text-[#2563EB]" />
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                          Duração mínima
                        </label>
                        <Select
                          value={String(minMinutes)}
                          onValueChange={(v) => {
                            setMinMinutes(parseInt(v, 10))
                            setSessionStyle("personalizado")
                          }}
                        >
                          <SelectTrigger
                            className="h-10 rounded-xl font-bold text-xs bg-card border-border"
                            aria-label="Duração mínima"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DURATION_OPTIONS.map((o) => (
                              <SelectItem key={o} value={String(o)} className="font-bold text-xs">
                                {formatMinutesLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <span className="text-muted-foreground font-black text-sm mt-6">—</span>

                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                          Duração máxima
                        </label>
                        <Select
                          value={String(maxMinutes)}
                          onValueChange={(v) => {
                            setMaxMinutes(parseInt(v, 10))
                            setSessionStyle("personalizado")
                          }}
                        >
                          <SelectTrigger
                            className="h-10 rounded-xl font-bold text-xs bg-card border-border"
                            aria-label="Duração máxima"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DURATION_OPTIONS.map((o) => (
                              <SelectItem key={o} value={String(o)} className="font-bold text-xs">
                                {formatMinutesLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {durationInvalid && (
                      <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />A duração mínima não pode ser maior
                        que a máxima.
                      </p>
                    )}
                    {!durationInvalid && sessionStyle === "personalizado" && (
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        Sessões de {formatMinutesLabel(minMinutes)} a{" "}
                        {formatMinutesLabel(maxMinutes)}.
                      </p>
                    )}
                  </div>

                  {/* Previsão da semana */}
                  <div className="rounded-xl border bg-card p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        O Nomeia distribuirá aproximadamente
                      </span>
                      <Sparkles className="w-4 h-4 text-[#2563EB]" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {preview.map((p) => (
                        <div
                          key={p.label}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-center",
                            p.available ? "bg-[#2563EB]/8" : "bg-muted/40",
                          )}
                        >
                          <div className="text-[10px] font-extrabold uppercase text-muted-foreground">
                            {p.label}
                          </div>
                          <div
                            className={cn(
                              "text-sm font-black font-mono tabular-nums",
                              p.available ? "text-[#2563EB]" : "text-muted-foreground/50",
                            )}
                          >
                            {p.hours > 0 ? `${p.hours}h` : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] font-semibold text-muted-foreground border-t pt-2">
                      {scalePhrase}
                    </p>
                  </div>
                </div>

                {/* Resumo */}
                <div className="rounded-xl border border-[#2563EB]/25 bg-gradient-to-br from-[#2563EB]/8 to-background p-3 space-y-2.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#2563EB]">
                    Seu planejamento
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1.5 text-xs">
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:justify-start gap-0.5">
                      <span className="text-muted-foreground font-medium">Carga</span>
                      <span className="font-black tabular-nums">{weeklyHoursNum}h / semana</span>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:justify-start gap-0.5">
                      <span className="text-muted-foreground font-medium">Escala</span>
                      <span className="font-black">{escalaLabel}</span>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:justify-start gap-0.5">
                      <span className="text-muted-foreground font-medium">Dias disponíveis</span>
                      <span className="font-black tabular-nums">{daysPerWeek}</span>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:justify-start gap-0.5">
                      <span className="text-muted-foreground font-medium">Disciplinas</span>
                      <span className="font-black tabular-nums">{selectedDisciplines.length}</span>
                    </div>
                    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:justify-start gap-0.5">
                      <span className="text-muted-foreground font-medium">Sessões</span>
                      <span className="font-black">
                        {formatMinutesLabel(minMinutes)} – {formatMinutesLabel(maxMinutes)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-600 border-t border-[#2563EB]/15 pt-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configuração válida
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─────────────── FOOTER (sempre visível) ─────────────── */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-t bg-card flex items-center justify-between gap-3 sticky bottom-0">
          {currentStep > 1 ? (
            <Button
              variant="outline"
              onClick={handlePrevStep}
              className="border-[#2563EB] text-[#2563EB] font-bold text-xs px-6 h-9 rounded-xl cursor-pointer"
            >
              Voltar
            </Button>
          ) : (
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Etapa 1 de 4
            </span>
          )}

          <Button
            onClick={() => void handleNextStep()}
            disabled={!canProceed}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-9 rounded-xl shadow-xs cursor-pointer"
          >
            {currentStep === 4 ? "Salvar planejamento" : "Próximo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
