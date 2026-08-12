"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Layers,
  BookOpen,
  ListChecks,
  RotateCcw,
  Zap,
  Sparkles,
  SlidersHorizontal,
  GraduationCap,
  Clock,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type {
  DifficultyFilter,
  PlayerQuestion,
  SimuladoConfigData,
  SimuladoMode,
} from "@/domain/simulados/types"
import {
  createSimuladoAction,
  previewSimuladoAction,
} from "@/application/simulados/simulados.actions"

const MODES: { mode: SimuladoMode; label: string; icon: React.ElementType; hint: string }[] = [
  { mode: "COMPLETO", label: "Completo", icon: Layers, hint: "Todas as disciplinas" },
  { mode: "DISCIPLINA", label: "Por Disciplina", icon: BookOpen, hint: "Escolha as matérias" },
  { mode: "REVISAO", label: "Revisão", icon: RotateCcw, hint: "Prioriza erros anteriores" },
  { mode: "ERROS", label: "Meus Erros", icon: ListChecks, hint: "Somente questões erradas" },
  { mode: "RAPIDO", label: "Rápido", icon: Zap, hint: "10 questões" },
  { mode: "ADAPTATIVO", label: "Adaptativo", icon: Sparkles, hint: "Nível ajusta conforme você acerta" },
]

const DIFFICULTIES: { value: DifficultyFilter; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "FACIL", label: "Fácil" },
  { value: "MEDIA", label: "Média" },
  { value: "DIFICIL", label: "Difícil" },
]

const DURATIONS: { label: string; seconds: number | null }[] = [
  { label: "Sem limite", seconds: null },
  { label: "10 min", seconds: 600 },
  { label: "20 min", seconds: 1200 },
  { label: "30 min", seconds: 1800 },
  { label: "60 min", seconds: 3600 },
  { label: "90 min", seconds: 5400 },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: SimuladoConfigData
  onCreate: (data: { simuladoId: string; questions: PlayerQuestion[] }) => void
}

export function SimuladoConfigDialog({ open, onOpenChange, config, onCreate }: Props) {
  const [name, setName] = useState("")
  const [examName, setExamName] = useState<string | null>(() => initialExam(config))
  const [roleName, setRoleName] = useState<string | null>(() => initialRole(config))
  const [mode, setMode] = useState<SimuladoMode>("COMPLETO")
  const [total, setTotal] = useState(40)
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("TODAS")
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const [onlyWrong, setOnlyWrong] = useState(false)
  const [prioritizeWrong, setPrioritizeWrong] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(config.disciplines.filter((d) => d.availableCount > 0).map((d) => d.id)))
  const [preview, setPreview] = useState<{ ok: boolean; available: number; message: string | null } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const disciplineList = config.disciplines.filter((d) => d.availableCount > 0)

  const handleModeChange = (m: SimuladoMode) => {
    setMode(m)
    if (m === "ERROS") {
      setOnlyWrong(true)
      setSelected(new Set(disciplineList.map((d) => d.id)))
    } else if (m === "RAPIDO") {
      setTotal(10)
    } else if (m === "ADAPTATIVO") {
      setDifficulty("ADAPTATIVO")
    } else if (m === "REVISAO") {
      setPrioritizeWrong(true)
    } else if (m === "COMPLETO") {
      setSelected(new Set(disciplineList.map((d) => d.id)))
    }
  }

  const toggleDiscipline = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const runPreview = useCallback(async () => {
    if (selected.size === 0) {
      setPreview({ ok: false, available: 0, message: "Selecione ao menos uma disciplina." })
      return
    }
    setPreviewing(true)
    const res = await previewSimuladoAction({
      name: name || "Simulado",
      examName,
      roleName,
      mode,
      total,
      disciplineIds: [...selected],
      distribution: {},
      topicIds: [],
      difficulty,
      onlyWrong,
      prioritizeWrong,
      allTopics: true,
      onlyStudiedTopics: false,
      onlyPendingTopics: false,
      durationLimitSeconds: durationSeconds,
    })
    setPreviewing(false)
    if (res.error) {
      setPreview({ ok: false, available: 0, message: res.error })
      return
    }
    setPreview({ ok: res.data?.ok ?? false, available: res.data?.available ?? 0, message: res.data?.message ?? null })
  }, [selected, name, examName, roleName, mode, total, difficulty, onlyWrong, prioritizeWrong, durationSeconds])

  useEffect(() => {
    const t = setTimeout(() => {
      runPreview()
    }, 350)
    return () => clearTimeout(t)
  }, [runPreview])

  const handleCreate = async () => {
    if (!preview?.ok) return
    setSubmitting(true)
    const res = await createSimuladoAction({
      name: name.trim() || modeLabel(mode),
      examName,
      roleName,
      mode,
      total,
      disciplineIds: [...selected],
      distribution: {},
      topicIds: [],
      difficulty,
      onlyWrong,
      prioritizeWrong,
      allTopics: true,
      onlyStudiedTopics: false,
      onlyPendingTopics: false,
      durationLimitSeconds: durationSeconds,
    })
    setSubmitting(false)
    if (res.error || !res.data) {
      toast.error(res.error ?? "Erro ao criar simulado.")
      return
    }
    toast.success("Simulado criado — boa prova!")
    onOpenChange(false)
    onCreate({ simuladoId: res.data.simuladoId, questions: res.data.questions })
  }

  const countSum = [...selected].reduce((acc, id) => acc + (disciplineList.find((d) => d.id === id)?.availableCount ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight">Novo Simulado</DialogTitle>
          <DialogDescription>Monte sua prova: matérias, quantidade e dificuldade.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Nome + Concurso */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Nome</Label>
              <Input placeholder="Simulado Completo" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Concurso / Cargo</Label>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {config.concursos.length === 0 && (
                    <Badge variant="outline" className="text-[10px]">Sem concurso cadastrado</Badge>
                  )}
                  {config.concursos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setExamName(c.targetExam)
                        setRoleName(c.targetRole)
                      }}
                      className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors",
                        examName === c.targetExam
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-input text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {c.targetExam}{c.targetRole ? ` · ${c.targetRole}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Modos */}
          <div className="space-y-2">
            <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Modalidade</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => handleModeChange(m.mode)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    mode === m.mode
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-input hover:border-primary/40"
                  )}
                >
                  <m.icon className={cn("h-4 w-4 mb-1.5", mode === m.mode ? "text-primary" : "text-muted-foreground")} />
                  <span className="block text-xs font-extrabold leading-tight">{m.label}</span>
                  <span className="block text-[10px] text-muted-foreground font-medium mt-0.5">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quantidade + Dificuldade + Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Quantidade: <span className="text-foreground font-mono">{total}</span>
              </Label>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                <span>5</span><span>200</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Dificuldade</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDifficulty(d.value)}
                    className={cn(
                      "text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors",
                      difficulty === d.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Tempo limite</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDurationSeconds(d.seconds)}
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-1 rounded-md border transition-colors flex items-center justify-center gap-1",
                      durationSeconds === d.seconds
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Disciplinas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Disciplinas ({selected.size}) — {countSum} questões disponíveis
              </Label>
              <button
                type="button"
                onClick={() => setSelected(new Set(disciplineList.map((d) => d.id)))}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                Selecionar todas
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto border rounded-xl divide-y">
              {disciplineList.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleDiscipline(d.id)}
                      className="accent-primary h-3.5 w-3.5"
                    />
                    {d.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">{d.availableCount} questões</Badge>
                </label>
              ))}
              {disciplineList.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground font-semibold">
                  Nenhuma disciplina com questões cadastradas. Cadastre disciplinas no perfil e importe questões.
                </div>
              )}
            </div>
          </div>

          {/* Opções */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOnlyWrong(!onlyWrong)}
              className={cn(
                "text-[11px] font-bold px-3 py-1.5 rounded-md border transition-colors",
                onlyWrong ? "bg-destructive/10 text-destructive border-destructive/40" : "border-input text-muted-foreground hover:text-foreground"
              )}
            >
              Somente erradas anteriormente
            </button>
            <button
              type="button"
              onClick={() => setPrioritizeWrong(!prioritizeWrong)}
              className={cn(
                "text-[11px] font-bold px-3 py-1.5 rounded-md border transition-colors",
                prioritizeWrong ? "bg-amber-500/10 text-amber-600 border-amber-500/40" : "border-input text-muted-foreground hover:text-foreground"
              )}
            >
              Priorizar erros dentro das disciplinas
            </button>
          </div>

          {/* Preview */}
          <div
            className={cn(
              "rounded-xl border p-3 text-xs font-semibold flex items-center gap-2",
              preview?.ok === false
                ? "bg-destructive/5 border-destructive/30 text-destructive"
                : "bg-muted/40 border-border text-muted-foreground"
            )}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span>
              {previewMessage(previewing, preview)}
            </span>
          </div>

          {!config.hasQuestions && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Nenhuma questão ativa encontrada na base. Importe questões antes de criar simulados.
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="font-bold text-xs px-6 h-9 rounded-xl">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!preview?.ok || previewing || submitting || selected.size === 0}
              className="font-bold text-xs px-6 h-9 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8]"
            >
              {submitting ? "Criando…" : `Criar Simulado (${total} questões)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function modeLabel(mode: SimuladoMode): string {
  const found = MODES.find((m) => m.mode === mode)
  return found ? `${found.label} - ${new Date().toLocaleDateString("pt-BR")}` : "Simulado"
}

function initialExam(config: SimuladoConfigData): string | null {
  if (config.concursos.length === 0) return null
  const active = config.concursos.find((c) => c.isActive) ?? config.concursos[0]
  return active?.targetExam ?? null
}

function initialRole(config: SimuladoConfigData): string | null {
  if (config.concursos.length === 0) return null
  const active = config.concursos.find((c) => c.isActive) ?? config.concursos[0]
  return active?.targetRole ?? null
}

function previewMessage(previewing: boolean, preview: { ok: boolean; available: number; message: string | null } | null): string {
  if (previewing) return "Verificando disponibilidade…"
  if (!preview) return "Aguardando…"
  if (preview.ok) return preview.message ?? "Disponível para criar."
  return preview.message ?? "Ajuste os filtros."
}