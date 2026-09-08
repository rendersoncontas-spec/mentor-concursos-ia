"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Timer,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  getSimuladoFormDisciplinesAction,
  saveSimuladoRecordAction,
} from "@/application/simulados/simulado-records.actions"
import {
  accuracyOf,
  aggregateSubjects,
  computeNetScore,
  netAccuracyOf,
  SIMULADO_SOURCES,
  wrongsOf,
} from "@/application/simulados/simulado-stats.service"
import type { SimuladoRecord, SimuladoRecordInput, SimuladoRecordSource } from "@/domain/simulados/types"
import { DisciplineSelector } from "@/components/shared/discipline-selector"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type EntryMode = "GERAL" | "DETALHADO"

interface SubjectRow {
  key: string
  disciplineId: string | null
  disciplineName: string
  questionsCount: number
  correctCount: number
  blankCount: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: SimuladoRecord | null
  onSaved: () => void
}

function parseDurationToSeconds(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const parts = t.split(":").map((p) => p.trim())
  if (parts.some((p) => p !== "" && !/^\d+$/.test(p))) return null
  if (parts.length === 3) {
    const h = Number(parts[0] ?? 0)
    const m = Number(parts[1] ?? 0)
    const s = Number(parts[2] ?? 0)
    return h * 3600 + m * 60 + s
  }
  if (parts.length === 2) {
    const m = Number(parts[0] ?? 0)
    const s = Number(parts[1] ?? 0)
    return m * 60 + s
  }
  const only = Number(parts[0] ?? 0)
  return only * 60
}

function secondsToDuration(total: number | null): string {
  if (total === null || !Number.isFinite(total)) return ""
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function SimuladoRecordModal({ open, onOpenChange, editing, onSaved }: Props) {
  const [name, setName] = useState("")
  const [examName, setExamName] = useState("")
  const [roleName, setRoleName] = useState("")
  const [simuladoDate, setSimuladoDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [source, setSource] = useState<SimuladoRecordSource>("TEC")
  const [sourceCustom, setSourceCustom] = useState("")
  const [timeText, setTimeText] = useState("")
  const [notes, setNotes] = useState("")
  const [scoringRule, setScoringRule] = useState<"PERCENTUAL" | "CEBRASPE" | "PENALIZACAO" | "PERSONALIZADO">("PERCENTUAL")
  const [penaltyScore, setPenaltyScore] = useState("")
  const [penaltyPerWrong, setPenaltyPerWrong] = useState("1")
  const [examBoard, setExamBoard] = useState<string>("CEBRASPE")
  const [examBoardCustom, setExamBoardCustom] = useState("")

  // MODO DE ENTRADA DO RESULTADO
  const [entryMode, setEntryMode] = useState<EntryMode>("GERAL")

  // MODO GERAL: lançamento direto dos totais
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalBlank, setTotalBlank] = useState(0)

  // MODO DETALHADO: resultados por matéria (fonte principal)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [disciplines, setDisciplines] = useState<{ id: string; name: string; area: string | null }[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setExamName(editing.examName || "")
      setRoleName(editing.roleName || "")
      setSimuladoDate(editing.simuladoDate || new Date().toISOString().slice(0, 10))
      setSource(editing.source)
      setSourceCustom(editing.sourceCustom || "")
      setExamBoard(editing.exam_board || "CEBRASPE")
      setExamBoardCustom(editing.exam_board_custom || "")
      setTimeText(secondsToDuration(editing.timeSpentSeconds))
      setNotes(editing.notes || "")
      setScoringRule(editing.scoringRule)
      setPenaltyScore(editing.penaltyScore !== null ? String(editing.penaltyScore) : "")
      setPenaltyPerWrong(editing.penaltyPerWrong !== null && editing.penaltyPerWrong !== undefined ? String(editing.penaltyPerWrong) : "1")
      setEntryMode(editing.subjects.length > 0 ? "DETALHADO" : "GERAL")
      setTotalQuestions(editing.totalQuestions)
      setTotalCorrect(editing.totalCorrect)
      setTotalBlank(editing.totalBlank)
      setSubjects(
        editing.subjects.map((s, i) => ({
          key: `s-${i}-${s.disciplineName}`,
          disciplineId: s.disciplineId,
          disciplineName: s.disciplineName,
          questionsCount: s.questionsCount,
          correctCount: s.correctCount,
          blankCount: s.blankCount,
        }))
      )
    } else {
      setName("")
      setExamName("")
      setRoleName("")
      setSimuladoDate(new Date().toISOString().slice(0, 10))
      setSource("TEC")
      setSourceCustom("")
      setTimeText("")
      setNotes("")
      setScoringRule("PERCENTUAL")
      setPenaltyScore("")
      setPenaltyPerWrong("1")
      setEntryMode("GERAL")
      setTotalQuestions(0)
      setTotalCorrect(0)
      setTotalBlank(0)
      setSubjects([])
    }
  }, [open, editing])

  useEffect(() => {
    if (!open) return
    getSimuladoFormDisciplinesAction().then((res) => {
      if (res.data) setDisciplines(res.data)
    })
  }, [open])

  // ▸ RESULTADO CALCULADO DINAMICAMENTE (fonte única de verdade na UI) ------
  // No modo DETALHADO: derivado das matérias.
  // No modo GERAL: lançado diretamente (erros derivados).
  // Inclui pontuação líquida quando a regra CEBRASPE está ativa.
  const computed = useMemo(() => {
    let base
    if (entryMode === "DETALHADO") {
      base = aggregateSubjects(
        subjects.map((s) => ({
          questionsCount: s.questionsCount,
          correctCount: s.correctCount,
          wrongCount: 0, // erros por matéria derivados abaixo
          blankCount: s.blankCount,
        }))
      )
    } else {
      const wrong = wrongsOf(totalQuestions, totalCorrect, totalBlank)
      base = {
        totalQuestions,
        totalCorrect,
        totalWrong: wrong,
        totalBlank,
        accuracy: accuracyOf(totalCorrect, totalQuestions),
      }
    }
    // Corrige erros no modo detalhado (agregados de cada matéria)
    if (entryMode === "DETALHADO") {
      base = {
        ...base,
        totalWrong: subjects.reduce(
          (acc, s) => acc + Math.max(0, s.questionsCount - s.correctCount - s.blankCount),
          0
        ),
      }
    }
    // Pontuação líquida (CEBRASPE)
    const isCebraspe = scoringRule === "CEBRASPE"
    const netScore = isCebraspe
      ? computeNetScore({
          totalCorrect: base.totalCorrect,
          totalWrong: base.totalWrong,
          scoringRule,
          penaltyPerWrong: Number(penaltyPerWrong) || 1,
        })
      : null
    const netAccuracy = netScore !== null ? netAccuracyOf(netScore, base.totalQuestions) : null
    return { ...base, netScore, netAccuracy }
  }, [entryMode, subjects, totalQuestions, totalCorrect, totalBlank, scoringRule, penaltyPerWrong])

  // IDs de disciplinas já adicionadas (evita duplicação no seletor)
  const excludedDisciplineIds = useMemo(
    () => subjects.map((s) => s.disciplineId).filter((id): id is string => id !== null),
    [subjects]
  )

  const addSubject = useCallback(
    (disc: { id: string | null; name: string }) => {
      const disciplineName = disc.name.trim()
      if (!disciplineName) return
      if (subjects.some((s) => s.disciplineName.toLowerCase() === disciplineName.toLowerCase())) {
        toast.error("Esta matéria já foi adicionada.")
        return
      }
      setSubjects((prev) => [
        ...prev,
        {
          key: `s-${Date.now()}-${disciplineName}`,
          disciplineId: disc.id,
          disciplineName,
          questionsCount: 0,
          correctCount: 0,
          blankCount: 0,
        },
      ])
    },
    [subjects]
  )

  const updateSubject = useCallback((key: string, patch: Partial<SubjectRow>) => {
    setSubjects((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }, [])

  const removeSubject = useCallback((key: string) => {
    setSubjects((prev) => prev.filter((s) => s.key !== key))
  }, [])

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do simulado.")
      return
    }
    if (!simuladoDate) {
      toast.error("Informe a data do simulado.")
      return
    }

    const useMode = entryMode
    let finalTotals = computed

    if (useMode === "DETALHADO") {
      if (subjects.length === 0) {
        toast.error("Adicione pelo menos uma matéria ou use o modo resultado geral.")
        return
      }
      if (finalTotals.totalQuestions <= 0) {
        toast.error("Informe as questões das matérias.")
        return
      }
      const badSubject = subjects.find(
        (s) =>
          s.questionsCount > 0 &&
          (s.correctCount + s.blankCount > s.questionsCount || s.correctCount < 0 || s.blankCount < 0)
      )
      if (badSubject) {
        toast.error(
          `A matéria "${badSubject.disciplineName}" tem acertos + brancos maior que o total de questões.`
        )
        return
      }
      const zeroSubject = subjects.find((s) => s.questionsCount === 0)
      if (zeroSubject) {
        toast.error(`A matéria "${zeroSubject.disciplineName}" está com 0 questões.`)
        return
      }
    } else {
      if (finalTotals.totalQuestions <= 0) {
        toast.error("O simulado precisa ter pelo menos 1 questão.")
        return
      }
      if (finalTotals.totalCorrect + finalTotals.totalWrong + finalTotals.totalBlank !== finalTotals.totalQuestions) {
        toast.error("Acertos + erros + brancos deve ser igual ao total de questões.")
        return
      }
    }

    const timeSpentSeconds = parseDurationToSeconds(timeText)
    if (timeText.trim() && timeSpentSeconds === null) {
      toast.error("Tempo gasto inválido. Use o formato HH:MM:SS.")
      return
    }

    setSubmitting(true)
    try {
      const input: SimuladoRecordInput = {
        id: editing ? editing.id : undefined,
        name: name.trim(),
        examName: examName.trim(),
        roleName: roleName.trim(),
        simuladoDate,
        source,
        sourceCustom: source === "OUTRO" ? sourceCustom : undefined,
        exam_board: examBoard === "OUTRO" ? examBoardCustom : examBoard,
        exam_board_custom: examBoard === "OUTRO" ? examBoardCustom : null,
        totalQuestions: finalTotals.totalQuestions,
        totalCorrect: finalTotals.totalCorrect,
        totalWrong: finalTotals.totalWrong,
        totalBlank: finalTotals.totalBlank,
        timeSpentSeconds,
        notes: notes.trim() || null,
        scoringRule,
        penaltyPerWrong: scoringRule === "CEBRASPE" ? Number(penaltyPerWrong) || 1 : null,
        penaltyScore:
          (scoringRule === "PENALIZACAO" || scoringRule === "PERSONALIZADO") && penaltyScore.trim() !== ""
            ? Number(penaltyScore)
            : null,
        subjects:
          useMode === "DETALHADO"
            ? subjects.map((s) => ({
                disciplineId: s.disciplineId,
                disciplineName: s.disciplineName,
                questionsCount: s.questionsCount,
                correctCount: s.correctCount,
                wrongCount: Math.max(0, s.questionsCount - s.correctCount - s.blankCount),
                blankCount: s.blankCount,
              }))
            : [],
      }
      const res = await saveSimuladoRecordAction(input)
      if (res.error || !res.data) {
        toast.error(res.error ?? "Erro ao salvar simulado.")
        return
      }
      toast.success(editing ? "Simulado atualizado!" : "Simulado registrado com sucesso!")
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error("Erro inesperado ao salvar simulado.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* CABEÇALHO */}
        <div className="p-5 border-b bg-muted/20">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {editing ? "Editar Simulado" : "Registrar Simulado"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-1">
            Registre o resultado de um simulado que você fez fora do NomeIA.
          </p>
        </div>

        {/* CORPO */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ── DADOS DO SIMULADO ─────────────────────────────────────── */}
          <div className="space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-foreground block">
              Dados do Simulado
            </span>
            <div>
              <Label htmlFor="sim-name" className="text-xs font-bold">
                Nome do Simulado *
              </Label>
              <Input
                id="sim-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: 2º Simulado Receita Federal"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="sim-exam" className="text-xs font-bold">
                  Concurso
                </Label>
                <Input
                  id="sim-exam"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Ex: Receita Federal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="sim-role" className="text-xs font-bold">
                  Cargo
                </Label>
                <Input
                  id="sim-role"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="Ex: Auditor Fiscal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="sim-date" className="text-xs font-bold">
                  Data *
                </Label>
                <Input
                  id="sim-date"
                  type="date"
                  value={simuladoDate}
                  onChange={(e) => setSimuladoDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Fonte</Label>
                <Select value={source} onValueChange={(v) => setSource(v as SimuladoRecordSource)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a fonte" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIMULADO_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
{source === "OUTRO" && (
                <div>
                  <Label htmlFor="sim-source-custom" className="text-xs font-bold">
                    Qual fonte?
                  </Label>
                  <Input
                    id="sim-source-custom"
                    value={sourceCustom}
                    onChange={(e) => setSourceCustom(e.target.value)}
                    placeholder="Ex: Curso Preparatório X"
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="sim-banca" className="text-xs font-bold">Banca</Label>
                <Select value={examBoard} onValueChange={(v) => setExamBoard(v as string)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione a banca" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      { value: "CEBRASPE", label: "CEBRASPE" },
                      { value: "FCC", label: "FCC" },
                      { value: "FGV", label: "FGV" },
                      { value: "VUNESP", label: "VUNESP" },
                      { value: "FUMARC", label: "FUMARC" },
                      { value: "FUNDEP", label: "FUNDEP" },
                      { value: "IBFC", label: "IBFC" },
                      { value: "Instituto AOCP", label: "Instituto AOCP" },
                      { value: "CETAP", label: "CETAP" },
                      { value: "Consulplan", label: "Consulplan" },
                      { value: "OUTRO", label: "Outra banca..." },
                    ].map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {examBoard === "OUTRO" && (
                <div>
                  <Label htmlFor="sim-banca-custom" className="text-xs font-bold">
                    Qual banca?
                  </Label>
                  <Input
                    id="sim-banca-custom"
                    value={examBoardCustom}
                    onChange={(e) => setExamBoardCustom(e.target.value)}
                    placeholder="Ex: Outra banca"
                    className="mt-1"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sim-time" className="text-xs font-bold">
                  Tempo gasto (opcional)
                </Label>
                <div className="relative mt-1">
                  <Timer className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="sim-time"
                    value={timeText}
                    onChange={(e) => setTimeText(e.target.value)}
                    placeholder="HH:MM:SS — ex: 02:15:30"
                    className="pl-9 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── RESULTADO ─────────────────────────────────────────────── */}
          <div className="space-y-4 pt-3 border-t">
            <span className="text-xs font-black uppercase tracking-wider text-foreground block">
              Resultado
            </span>

            {/* ESCOLHA DO MODO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntryMode("GERAL")}
                className={cn(
                  "text-left p-3 rounded-xl border transition-all",
                  entryMode === "GERAL"
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-input hover:border-primary/40"
                )}
              >
                <span className="text-xs font-black flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5" /> Resultado geral
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Lance apenas os números finais da prova.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEntryMode("DETALHADO")}
                className={cn(
                  "text-left p-3 rounded-xl border transition-all",
                  entryMode === "DETALHADO"
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-input hover:border-primary/40"
                )}
              >
                <span className="text-xs font-black flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" /> Detalhar por matéria
                </span>
                <span className="text-[10px] text-muted-foreground block mt-0.5">
                  Estatísticas mais completas por matéria.
                </span>
              </button>
            </div>

            {/* MODO GERAL: lançamento direto */}
            {entryMode === "GERAL" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label htmlFor="sim-questions" className="text-xs font-bold">
                      Questões *
                    </Label>
                    <Input
                      id="sim-questions"
                      type="number"
                      min={1}
                      value={totalQuestions || ""}
                      onChange={(e) => setTotalQuestions(Number(e.target.value) || 0)}
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sim-correct" className="text-xs font-bold">
                      Acertos
                    </Label>
                    <Input
                      id="sim-correct"
                      type="number"
                      min={0}
                      value={totalCorrect || ""}
                      onChange={(e) => {
                        const correct = Number(e.target.value) || 0
                        setTotalCorrect(correct)
                      }}
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sim-blank" className="text-xs font-bold">
                      Em branco
                    </Label>
                    <Input
                      id="sim-blank"
                      type="number"
                      min={0}
                      value={totalBlank || ""}
                      onChange={(e) => setTotalBlank(Number(e.target.value) || 0)}
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground">Erros (auto)</Label>
                    <div className="mt-1 h-9 flex items-center px-3 rounded-lg border bg-muted/40 font-mono text-sm font-black">
                      {computed.totalWrong}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Erros são calculados automaticamente: questões − acertos − em branco.
                </p>
              </div>
            )}

            {/* MODO DETALHADO: matérias como fonte principal */}
            {entryMode === "DETALHADO" && (
              <div className="space-y-3">
                <DisciplineSelector
                  disciplines={disciplines}
                  excludedIds={excludedDisciplineIds}
                  buttonLabel="+ Adicionar matéria"
                  placeholder="Buscar matéria..."
                  onSelect={(disc) => addSubject({ id: disc.id, name: disc.name })}
                  onAddCustom={(name) => addSubject({ id: null, name })}
                />

                {subjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Adicione os resultados das matérias para calcular seu desempenho.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden sm:grid grid-cols-[1fr_repeat(3,90px)_40px] gap-2 px-2 text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
                      <span>Matéria</span>
                      <span className="text-center">Questões</span>
                      <span className="text-center">Acertos</span>
                      <span className="text-center">Brancos</span>
                      <span />
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                      {subjects.map((s) => {
                        const subAcc = accuracyOf(s.correctCount, s.questionsCount)
                        const subWrong = Math.max(0, s.questionsCount - s.correctCount - s.blankCount)
                        return (
                          <div
                            key={s.key}
                            className="grid grid-cols-2 sm:grid-cols-[1fr_repeat(3,90px)_40px] gap-2 items-center p-2 rounded-lg border bg-card/60"
                          >
                            <div className="col-span-2 sm:col-span-1 min-w-0 flex items-center gap-2">
                              <span className="text-xs font-bold truncate">{s.disciplineName}</span>
                              {!s.disciplineId && (
                                <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                                  Personalizada
                                </span>
                              )}
                              <span className="text-[10px] font-black text-muted-foreground ml-auto shrink-0 hidden sm:block">
                                {subAcc === null ? "—" : `${subAcc}% · ${subWrong}✖`}
                              </span>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              value={s.questionsCount || ""}
                              onChange={(e) =>
                                updateSubject(s.key, { questionsCount: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-xs font-mono text-center"
                              placeholder="Qtd"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={s.correctCount || ""}
                              onChange={(e) =>
                                updateSubject(s.key, { correctCount: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-xs font-mono text-center"
                              placeholder="Acert"
                            />
                            <Input
                              type="number"
                              min={0}
                              value={s.blankCount || ""}
                              onChange={(e) =>
                                updateSubject(s.key, { blankCount: Number(e.target.value) || 0 })
                              }
                              className="h-8 text-xs font-mono text-center"
                              placeholder="Bran"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-500 hover:text-rose-600"
                              onClick={() => removeSubject(s.key)}
                              title="Remover matéria"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CARD RESULTADO ATUAL — atualiza em tempo real */}
            <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-primary/5 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary block">
                    Resultado Atual
                  </span>
                  {computed.totalQuestions > 0 ? (
                    <span className="text-3xl font-black font-mono text-foreground">
                      {computed.accuracy === null ? "—" : `${Math.round(computed.accuracy)}%`}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic font-medium block mt-1 max-w-xs">
                      Adicione os resultados das matérias para calcular seu desempenho.
                    </span>
                  )}
                </div>
                {computed.totalQuestions > 0 && (
                  <div className="flex gap-4 text-xs font-mono font-bold text-right">
                    <div>
                      <span className="block text-[9px] uppercase text-muted-foreground">Questões</span>
                      <span className="text-foreground text-sm font-black">{computed.totalQuestions}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase text-emerald-600">Acertos</span>
                      <span className="text-emerald-600 text-sm font-black">{computed.totalCorrect}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase text-rose-600">Erros</span>
                      <span className="text-rose-600 text-sm font-black">{computed.totalWrong}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase text-sky-600">Brancos</span>
                      <span className="text-sky-600 text-sm font-black">{computed.totalBlank}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* REGRA DE PONTUAÇÃO */}
            <div className="space-y-2">
              <Label className="text-xs font-bold">Regra de pontuação</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "PERCENTUAL", label: "Apenas percentual de acertos", hint: "Bruto: acertos ÷ questões" },
                  { value: "CEBRASPE", label: "CEBRASPE / CESPE", hint: "Erros descontam pontos" },
                  { value: "PENALIZACAO", label: "Com penalização", hint: "Informe o percentual final" },
                  { value: "PERSONALIZADO", label: "Personalizada", hint: "Regra própria" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScoringRule(opt.value as typeof scoringRule)}
                    className={cn(
                      "text-left px-3 py-2 rounded-lg border transition-colors",
                      scoringRule === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-xs font-black block">{opt.label}</span>
                    <span className={cn(
                      "text-[10px] block",
                      scoringRule === opt.value ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>

              {/* Configuração CEBRASPE: penalização por erro */}
              {scoringRule === "CEBRASPE" && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Questões erradas descontam pontos das questões certas. Em branco não alteram a pontuação.
                  </p>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="sim-penalty-wrong" className="text-xs font-bold shrink-0">
                      Cada erro desconta:
                    </Label>
                    <Select value={penaltyPerWrong} onValueChange={setPenaltyPerWrong}>
                      <SelectTrigger className="w-[140px] h-8 text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.5">0,5 ponto</SelectItem>
                        <SelectItem value="1">1 ponto</SelectItem>
                        <SelectItem value="2">2 pontos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {computed.totalQuestions > 0 && (
                    <div className="text-xs font-mono font-bold pt-1 flex flex-wrap gap-x-6 gap-y-1">
                      <span className="text-muted-foreground">
                        Acerto bruto:{" "}
                        <span className="text-foreground">
                          {computed.accuracy === null ? "—" : `${Math.round(computed.accuracy)}%`}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        Pontuação líquida:{" "}
                        <span className="text-primary">{computed.netScore} pontos</span>
                      </span>
                      <span className="text-muted-foreground">
                        Aproveitamento líquido:{" "}
                        <span className="text-primary">
                          {computed.netAccuracy === null ? "—" : `${Math.round(computed.netAccuracy)}%`}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* PENALIZACAO/PERSONALIZADO: percentual manual */}
              {(scoringRule === "PENALIZACAO" || scoringRule === "PERSONALIZADO") && (
                <div>
                  <Label htmlFor="sim-penalty" className="text-xs font-bold">
                    Percentual final considerando a regra (%)
                  </Label>
                  <Input
                    id="sim-penalty"
                    type="number"
                    min={0}
                    max={100}
                    value={penaltyScore}
                    onChange={(e) => setPenaltyScore(e.target.value)}
                    placeholder="Ex: 72.5"
                    className="mt-1 font-mono max-w-[200px]"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    O percentual bruto de acertos ({computed.accuracy === null ? "—" : `${Math.round(computed.accuracy)}%`}) continua salvo.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── OBSERVAÇÕES ────────────────────────────────────────────── */}
          <div className="pt-3 border-t">
            <Label htmlFor="sim-notes" className="text-xs font-bold">
              Observações (opcional)
            </Label>
            <Textarea
              id="sim-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Prova estava mais difícil que o normal. Errei bastante Direito Tributário."
              className="mt-1 text-xs min-h-[70px]"
            />
          </div>
        </div>

        {/* RODAPÉ */}
        <div className="p-4 border-t bg-muted/20 flex items-center justify-between gap-3">
          <div className="text-[10px] text-muted-foreground font-semibold truncate">
            {entryMode === "DETALHADO" && subjects.length > 0
              ? `${subjects.length} matérias • ${computed.totalQuestions} questões • ${computed.totalCorrect} acertos`
              : computed.totalQuestions > 0
                ? `${computed.totalQuestions} questões • ${computed.totalCorrect} acertos`
                : "Nenhum resultado informado"}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="font-bold text-xs">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs gap-1.5"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Salvar simulado"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
