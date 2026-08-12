"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  RotateCcw,
  CalendarDays,
  Layers,
  GripVertical,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanFormat = "cycle" | "weekly"

interface DisciplineConfig {
  id: string
  name: string
  color: string
  selected: boolean
  weight: 1 | 2 | 3
  difficulty: 1 | 2 | 3
  hoursPerDay: number
}

// ─── Catálogo Padrão de Disciplinas ──────────────────────────────────────────

const DEFAULT_DISCIPLINES_CATALOG: Omit<DisciplineConfig, "selected" | "weight" | "difficulty" | "hoursPerDay">[] = [
  { id: "dir-const", name: "Direito Constitucional", color: "#3b9edd" },
  { id: "dir-adm", name: "Direito Administrativo", color: "#22c55e" },
  { id: "port", name: "Língua Portuguesa", color: "#a855f7" },
  { id: "rag", name: "Raciocínio Lógico", color: "#f59e0b" },
  { id: "info", name: "Informática", color: "#ec4899" },
  { id: "mat-fin", name: "Matemática Financeira", color: "#06b6d4" },
  { id: "dir-pen", name: "Direito Penal", color: "#ef4444" },
  { id: "dir-proc", name: "Direito Processual", color: "#8b5cf6" },
]

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { label: "Formato", icon: Layers },
  { label: "Disciplinas", icon: CheckCircle2 },
  { label: "Relevância", icon: GripVertical },
  { label: "Carga Horária", icon: Clock },
]

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ disciplines }: { disciplines: DisciplineConfig[] }) {
  const selected = disciplines.filter((d) => d.selected)
  const totalWeight = selected.reduce((s, d) => s + d.weight, 0)

  if (selected.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Selecione disciplinas para ver o gráfico
      </div>
    )
  }

  const radius = 70
  const cx = 100
  const cy = 100
  const innerRadius = 42

  const slices = selected.map((d, idx) => {
    const previousWeight = selected.slice(0, idx).reduce((acc, item) => acc + item.weight, 0)
    const startAngle = (previousWeight / (totalWeight || 1)) * 360
    const fraction = d.weight / (totalWeight || 1)
    const angle = fraction * 360

    const toRad = (deg: number) => (deg * Math.PI) / 180
    const x1 = cx + radius * Math.cos(toRad(startAngle - 90))
    const y1 = cy + radius * Math.sin(toRad(startAngle - 90))
    const x2 = cx + radius * Math.cos(toRad(startAngle + angle - 90))
    const y2 = cy + radius * Math.sin(toRad(startAngle + angle - 90))
    const xi1 = cx + innerRadius * Math.cos(toRad(startAngle - 90))
    const yi1 = cy + innerRadius * Math.sin(toRad(startAngle - 90))
    const xi2 = cx + innerRadius * Math.cos(toRad(startAngle + angle - 90))
    const yi2 = cy + innerRadius * Math.sin(toRad(startAngle + angle - 90))
    const largeArc = angle > 180 ? 1 : 0

    return { d: d, path: `M ${xi1} ${yi1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${xi2} ${yi2} L ${x2} ${y2} A ${radius} ${radius} 0 ${largeArc} 0 ${x1} ${y1} Z`, fraction }
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-48 h-48">
        {slices.map(({ d, path }) => (
          <path key={d.id} d={path} fill={d.color} className="transition-all duration-300 hover:opacity-80" />
        ))}
        <text x="100" y="95" textAnchor="middle" className="text-xs" fontSize="11" fill="currentColor">
          Ciclo
        </text>
        <text x="100" y="110" textAnchor="middle" fontSize="11" fill="currentColor">
          Total
        </text>
      </svg>

      <div className="flex flex-wrap gap-2 justify-center">
        {selected.map((d) => (
          <div key={d.id} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.name.split(" ")[0]}</span>
            <span className="font-semibold">{Math.round((d.weight / totalWeight) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Weekly Calendar Preview ──────────────────────────────────────────────────

function WeeklyCalendar({ disciplines }: { disciplines: DisciplineConfig[] }) {
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
  const selected = disciplines.filter((d) => d.selected)

  // Simple distribution: cycle through disciplines per day
  const dayAssignments = days.map((day, i) => {
    const disc = selected[i % selected.length]
    return { day, disc }
  })

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {dayAssignments.map(({ day, disc }) => (
        <div key={day} className="flex flex-col gap-1">
          <p className="text-xs text-center text-muted-foreground font-medium">{day}</p>
          {disc ? (
            <div
              className="rounded-lg p-2 text-center text-xs font-semibold text-white"
              style={{ backgroundColor: disc.color, minHeight: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {disc.name.split(" ").slice(0, 2).join(" ")}
            </div>
          ) : (
            <div className="rounded-lg bg-muted min-h-[60px] flex items-center justify-center text-xs text-muted-foreground">
              —
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step components ──────────────────────────────────────────────────────────

function Step1Format({ format, setFormat }: { format: PlanFormat; setFormat: (f: PlanFormat) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Escolha o Formato do Plano</h2>
      <p className="text-sm text-muted-foreground">
        Defina como você prefere organizar seus estudos ao longo do tempo.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <button
          onClick={() => setFormat("cycle")}
          className={cn(
            "flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all",
            format === "cycle"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
        >
          <div className="flex items-center gap-2">
            <RotateCcw className={cn("h-5 w-5", format === "cycle" ? "text-primary" : "text-muted-foreground")} />
            <span className="font-semibold">Ciclo de Estudos</span>
            {format === "cycle" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Você estuda cada disciplina sequencialmente, completando um ciclo antes de repetir. Ideal para equilibrar todas as matérias.
          </p>
        </button>

        <button
          onClick={() => setFormat("weekly")}
          className={cn(
            "flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all",
            format === "weekly"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
          )}
        >
          <div className="flex items-center gap-2">
            <CalendarDays className={cn("h-5 w-5", format === "weekly" ? "text-primary" : "text-muted-foreground")} />
            <span className="font-semibold">Quadro Semanal</span>
            {format === "weekly" && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cada dia da semana tem disciplinas fixas pré-definidas. Mais previsível e fácil de seguir.
          </p>
        </button>
      </div>
    </div>
  )
}

function Step2Disciplines({
  disciplines,
  setDisciplines,
}: {
  disciplines: DisciplineConfig[]
  setDisciplines: React.Dispatch<React.SetStateAction<DisciplineConfig[]>>
}) {
  const toggle = (id: string) =>
    setDisciplines((prev) => prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)))

  const selected = disciplines.filter((d) => d.selected).length

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Selecione as Disciplinas</h2>
        <p className="text-sm text-muted-foreground">{selected} de {disciplines.length} selecionadas</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {disciplines.map((d) => (
          <button
            key={d.id}
            onClick={() => toggle(d.id)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all",
              d.selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-sm font-medium flex-1">{d.name}</span>
            {d.selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function ScaleButtons({
  value,
  onChange,
  labels,
}: {
  value: number
  onChange: (v: number) => void
  labels: [string, string, string]
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map((v) => (
        <button
          key={v}
          onClick={() => onChange(v as 1 | 2 | 3)}
          className={cn(
            "flex-1 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all",
            value === v
              ? "bg-primary text-white border-primary"
              : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          {labels[v - 1]}
        </button>
      ))}
    </div>
  )
}

function Step3Relevance({
  disciplines,
  setDisciplines,
}: {
  disciplines: DisciplineConfig[]
  setDisciplines: React.Dispatch<React.SetStateAction<DisciplineConfig[]>>
}) {
  const selected = disciplines.filter((d) => d.selected)

  const update = (id: string, key: "weight" | "difficulty", val: number) =>
    setDisciplines((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [key]: val } : d)),
    )

  if (selected.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Volte ao passo anterior e selecione ao menos uma disciplina.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Peso e Dificuldade</h2>
        <p className="text-sm text-muted-foreground">
          Defina a relevância e sua dificuldade em cada disciplina.
        </p>
      </div>
      <div className="space-y-4">
        {selected.map((d) => (
          <div key={d.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="font-semibold text-sm">{d.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Peso no Edital</p>
                <ScaleButtons
                  value={d.weight}
                  onChange={(v) => update(d.id, "weight", v)}
                  labels={["Baixo", "Médio", "Alto"]}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Minha Dificuldade</p>
                <ScaleButtons
                  value={d.difficulty}
                  onChange={(v) => update(d.id, "difficulty", v)}
                  labels={["Fácil", "Médio", "Difícil"]}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step4Hours({
  disciplines,
  format,
}: {
  disciplines: DisciplineConfig[]
  format: PlanFormat
}) {
  const selected = disciplines.filter((d) => d.selected)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Distribuição de Carga Horária</h2>
        <p className="text-sm text-muted-foreground">
          Visualização do seu ciclo completo de estudos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Donut chart */}
        <div className="rounded-xl border p-5 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Distribuição por Peso
          </p>
          <DonutChart disciplines={disciplines} />
        </div>

        {/* Weekly calendar */}
        <div className="rounded-xl border p-5 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            {format === "cycle" ? "Ciclo (Prévia)" : "Semana Típica"}
          </p>
          <WeeklyCalendar disciplines={disciplines} />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="rounded-xl border p-5 bg-primary/5 border-primary/20 text-center space-y-1">
          <p className="text-sm text-muted-foreground">Ciclo completo estimado</p>
          <p className="text-2xl font-bold">
            {selected.reduce((s, d) => s + d.weight, 0)} blocos
          </p>
          <p className="text-xs text-muted-foreground">
            = {selected.reduce((s, d) => s + d.weight * 2, 0)}h estimadas por ciclo
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface PlanningWizardProps {
  initialDisciplines?: { id: string; name: string; area?: string | null; color?: string }[]
  onCompletePlan?: (config: {
    format: PlanFormat
    totalCycleHours: number
    disciplines: { id: string; name: string; weight: number; difficulty: number }[]
  }) => Promise<void> | void
}

export function PlanningWizard({ initialDisciplines, onCompletePlan }: PlanningWizardProps) {
  const [step, setStep] = useState(0)
  const [format, setFormat] = useState<PlanFormat>("cycle")
  const [loading, setLoading] = useState(false)

  const pool = initialDisciplines && initialDisciplines.length > 0
    ? initialDisciplines.map((d, idx) => ({
        id: d.id,
        name: d.name,
        color: d.color || DEFAULT_DISCIPLINES_CATALOG[idx % DEFAULT_DISCIPLINES_CATALOG.length]?.color || "#3b82f6"
      }))
    : DEFAULT_DISCIPLINES_CATALOG

  const [disciplines, setDisciplines] = useState<DisciplineConfig[]>(
    pool.map((d) => ({ ...d, selected: true, weight: 2, difficulty: 2, hoursPerDay: 2 })),
  )
  const [completed, setCompleted] = useState(false)

  const handleFinish = async () => {
    setLoading(true)
    try {
      const selected = disciplines.filter((d) => d.selected)
      const totalHours = selected.reduce((s, d) => s + d.weight, 0) * 2 // estimativa de horas por ciclo

      if (onCompletePlan) {
        await onCompletePlan({
          format,
          totalCycleHours: totalHours || 20,
          disciplines: selected.map((d) => ({
            id: d.id,
            name: d.name,
            weight: d.weight,
            difficulty: d.difficulty,
          })),
        })
      }
      setCompleted(true)
    } catch (e) {
      console.error("Erro ao salvar ciclo:", e)
    } finally {
      setLoading(false)
    }
  }

  const isStepValid = () => {
    if (step === 1) return disciplines.some((d) => d.selected)
    return true
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <h3 className="text-xl font-bold">Plano Criado com Sucesso!</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Seu ciclo rotativo de estudos foi configurado e salvo com sucesso.
        </p>
        <Button onClick={() => { setCompleted(false); setStep(0) }} variant="outline">
          Criar novo plano
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = i === step
          const isDone = i < step

          let stepClass = "bg-muted text-muted-foreground"
          if (isActive) stepClass = "bg-primary text-white"
          else if (isDone) stepClass = "bg-green-500 text-white"

          return (
            <div key={s.label} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all",
                    stepClass,
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", isActive ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("flex-1 h-px", i < step ? "bg-green-500" : "bg-border")} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="min-h-[360px]">
        {step === 0 && <Step1Format format={format} setFormat={setFormat} />}
        {step === 1 && <Step2Disciplines disciplines={disciplines} setDisciplines={setDisciplines} />}
        {step === 2 && <Step3Relevance disciplines={disciplines} setDisciplines={setDisciplines} />}
        {step === 3 && <Step4Hours disciplines={disciplines} format={format} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0 || loading}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!isStepValid() || loading}
            className="gap-2"
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            disabled={loading}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            {loading ? "Salvando..." : "Criar Plano"}
          </Button>
        )}
      </div>
    </div>
  )
}

