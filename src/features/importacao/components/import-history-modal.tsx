"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FolderOpen,
  Info,
  Loader2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import {
  beginImportAction,
  importHistoryChunkAction,
  listDisciplinesForImportAction,
  previewImportAction,
} from "@/application/import-history/import-history.actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import type { OriginSource } from "@/domain/study-history/study-history.types"
import { IMPORT_FIELDS } from "@/features/importacao/lib/column-detector"
import {
  type RawSheet,
  fileToArrayBuffer,
  readWorkbook,
} from "@/features/importacao/lib/excel-reader"
import { type SubjectImportMap, toCompact } from "@/features/importacao/lib/import-contract"
import { parseFileSheets } from "@/features/importacao/lib/normalize"
import {
  type ImportOrigin,
  ORIGIN_OPTIONS,
  normalizeOrigin,
  originDisplayName,
} from "@/features/importacao/lib/origin"
import { detectStudyType } from "@/features/importacao/lib/study-map"
import { suggestDisciplines } from "@/features/importacao/lib/subject-matcher"
import {
  type DisciplineOption,
  IMPORT_FIELD_LABELS,
  type ImportField,
  type ImportPreviewResult,
  type ParseReport,
} from "@/features/importacao/lib/types"
import { formatDuration } from "@/features/importacao/lib/value-parsers"

type Step = "select" | "parsing" | "review" | "confirm" | "importing" | "done"

const CHUNK_SIZE = 400
const LARGE_FILE_WARNING = 10_000

const INTERNAL_TYPE_LABELS: Record<string, string> = {
  TEORIA: "Teoria",
  QUESTOES: "Questões",
  REVISAO: "Revisão",
  RESUMO: "Resumo",
  MAPA_MENTAL: "Mapa mental",
  FLASHCARDS: "Flashcards",
  VIDEOAULA: "Videoaula",
  AUDIO: "Áudio",
  AULA_VIVO: "Aula ao vivo",
  LEITURA: "Leitura",
  LEI_SECA: "Lei seca",
  JURISPRUDENCIA: "Jurisprudência",
  INFORMATIVOS: "Informativos",
  DOUTRINA: "Doutrina",
  SIMULADO: "Simulado",
  MONITORIA: "Monitoria",
  ESTUDO_IA: "Estudo com IA",
  DISCUSSAO: "Discussão",
  OUTRO: "Outro",
}

function buildImportableRecords(report: ParseReport) {
  const seen = new Set<string>()
  const result = []
  for (const record of report.records) {
    const key = [
      record.startAt ?? "",
      (record.subjectName ?? "").toLowerCase().trim(),
      record.durationSeconds ?? "",
      record.questions ?? "",
    ].join("|")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(record)
  }
  return result
}

interface ImportHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export function ImportHistoryModal({ open, onOpenChange, onImported }: ImportHistoryModalProps) {
  const [step, setStep] = useState<Step>("select")
  const [fileInputKey, setFileInputKey] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<RawSheet[] | null>(null)
  const [disciplines, setDisciplines] = useState<DisciplineOption[]>([])
  const [overrides, setOverrides] = useState<Record<number, ImportField | null>>({})
  const [subjectMap, setSubjectMap] = useState<SubjectImportMap>({})
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importing, setImporting] = useState(false)
  const [originSlug, setOriginSlug] = useState<OriginSource>("aprovado")
  const [customOriginName, setCustomOriginName] = useState("")
  const [finalSummary, setFinalSummary] = useState<{
    imported: number
    duplicates: number
    errors: number
    createdSubjects: string[]
    errorDetails: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importedRef = useRef(false)

  const parsedReport = useMemo(() => {
    if (!sheets) return null
    return parseFileSheets(sheets, fileName ?? "arquivo", overrides)
  }, [sheets, fileName, overrides])

  const suggestions = useMemo(() => {
    if (!parsedReport || disciplines.length === 0) return {}
    return suggestDisciplines(
      parsedReport.subjects.map((s) => s.name),
      disciplines,
    )
  }, [parsedReport, disciplines])

  const effectiveSubjectMap = useMemo<SubjectImportMap>(() => {
    const defaults: SubjectImportMap = {}
    for (const subject of parsedReport?.subjects ?? []) {
      const best = suggestions[subject.name]?.[0]
      if (best?.auto && best.disciplineId) {
        defaults[subject.name] = { mode: "existing", disciplineId: best.disciplineId }
      } else {
        defaults[subject.name] = { mode: "create" }
      }
    }
    return { ...defaults, ...subjectMap }
  }, [parsedReport, suggestions, subjectMap])

  const importableRecords = useMemo(
    () => (parsedReport ? buildImportableRecords(parsedReport) : []),
    [parsedReport],
  )

  const distinctTypes = useMemo(() => {
    if (!parsedReport) return []
    const seen = new Map<string, string>()
    for (const record of parsedReport.records) {
      if (!record.studyType) continue
      const internal = detectStudyType(record.studyType) ?? "OUTRO"
      seen.set(record.studyType, INTERNAL_TYPE_LABELS[internal] ?? "Outro")
    }
    return [...seen.entries()]
  }, [parsedReport])

  const importOrigin = useMemo<ImportOrigin | null>(() => {
    try {
      return normalizeOrigin(originSlug, customOriginName)
    } catch {
      return null
    }
  }, [originSlug, customOriginName])

  const reset = useCallback(() => {
    setStep("select")
    setSheets(null)
    setOverrides({})
    setSubjectMap({})
    setPreview(null)
    setProgress({ done: 0, total: 0 })
    setFinalSummary(null)
    setFileName(null)
    setOriginSlug("aprovado")
    setCustomOriginName("")
    setFileInputKey((k) => k + 1)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && step === "importing") return
      onOpenChange(next)
      if (!next) {
        if (step === "done" && importedRef.current) {
          importedRef.current = false
          onImported?.()
        }
        reset()
      }
    },
    [onOpenChange, step, reset, onImported],
  )

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    setFileName(file.name)
    setStep("parsing")
    setPreview(null)
    try {
      const buffer = await fileToArrayBuffer(file)
      const parsedSheets = readWorkbook(buffer)
      setSheets(parsedSheets)
      const { data, error } = await listDisciplinesForImportAction()
      if (error) throw new Error(error)
      setDisciplines(data ?? [])
      setStep("review")
    } catch (err) {
      toast.error("Não foi possível analisar o arquivo: " + (err as { message?: string }).message)
      setStep("select")
    }
  }, [])

  const handleColumnChange = useCallback((index: number, field: string) => {
    setOverrides((prev) => ({ ...prev, [index]: field === "" ? null : (field as ImportField) }))
    setPreview(null)
  }, [])

  const handleSubjectChange = useCallback((subjectName: string, value: string) => {
    if (value === "create" || value === "ignore") {
      setSubjectMap((prev) => ({ ...prev, [subjectName]: { mode: value } }))
    } else if (value.startsWith("existing:")) {
      setSubjectMap((prev) => ({
        ...prev,
        [subjectName]: { mode: "existing", disciplineId: value.slice("existing:".length) },
      }))
    }
    setPreview(null)
  }, [])

  const handlePreview = useCallback(async () => {
    if (!parsedReport || importableRecords.length === 0 || !importOrigin) return
    setPreviewing(true)
    try {
      const { success, result, error } = await previewImportAction(
        toCompact(importableRecords),
        effectiveSubjectMap,
        importOrigin,
      )
      if (!success || !result) {
        toast.error(error ?? "Erro ao analisar registros.")
        return
      }
      setPreview(result)
      setStep("confirm")
    } catch (err) {
      toast.error("Erro inesperado: " + (err as { message?: string }).message)
    } finally {
      setPreviewing(false)
    }
  }, [parsedReport, importableRecords, effectiveSubjectMap, importOrigin])

  const handleImport = useCallback(async () => {
    if (!parsedReport || !preview || !importOrigin) return
    setImporting(true)
    setStep("importing")

    const {
      success: began,
      importId,
      error: beginError,
    } = await beginImportAction(importOrigin, fileName, importableRecords.length)
    if (!began || !importId) {
      toast.error(beginError ?? "Não foi possível registrar a plataforma de origem.")
      setImporting(false)
      setStep("confirm")
      return
    }

    const total = importableRecords.length
    setProgress({ done: 0, total })
    let imported = 0
    let duplicates = 0
    let errors = 0
    const createdSubjects: string[] = []
    const errorDetails: string[] = []
    let failed = false

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = importableRecords.slice(i, i + CHUNK_SIZE)
      const { success, result, error } = await importHistoryChunkAction(
        toCompact(chunk),
        effectiveSubjectMap,
        importId,
      )
      if (!success || !result) {
        toast.error(error ?? "Falha ao importar lote.")
        failed = true
        break
      }
      imported += result.imported
      duplicates += result.duplicates
      errors += result.errors
      createdSubjects.push(...result.createdSubjects)
      errorDetails.push(...result.errorDetails)
      setProgress({ done: Math.min(i + chunk.length, total), total })
    }

    setFinalSummary({ imported, duplicates, errors, createdSubjects, errorDetails })
    setStep("done")
    setImporting(false)
    if (!failed && imported > 0) {
      importedRef.current = true
      onImported?.()
      toast.success(
        `${imported} registro${imported !== 1 ? "s" : ""} importado${imported !== 1 ? "s" : ""}!`,
      )
    }
  }, [
    parsedReport,
    preview,
    importableRecords,
    effectiveSubjectMap,
    importOrigin,
    fileName,
    onImported,
  ])

  const progressPercent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto bg-background p-0 gap-0">
        <DialogTitle className="sr-only">Importar histórico de estudos</DialogTitle>
        <DialogDescription className="sr-only">
          Importa o histórico de estudos exportado de outra plataforma de estudos.
        </DialogDescription>

        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background px-6 py-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[#2563EB]" />
            <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
              Importar histórico de estudos
            </h2>
          </div>
          {step !== "select" && step !== "parsing" && step !== "importing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (step === "confirm" || step === "review") setStep("review")
                else reset()
              }}
              className="text-xs font-bold gap-1 h-7"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Button>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {step === "select" && (
            <div className="space-y-5">
              <p className="text-sm font-extrabold text-foreground">
                Traga seu histórico de estudos de outra plataforma para o Nomeia.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Envie o arquivo exportado pela sua conta. O Nomeia analisará o arquivo, identificará
                as informações disponíveis e mostrará uma prévia antes de importar.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Formatos aceitos: <span className="font-bold text-foreground">.xlsx</span>,{" "}
                <span className="font-bold text-foreground">.xls</span> ou{" "}
                <span className="font-bold text-foreground">.csv</span> — funciona com qualquer
                histórico exportado, independentemente das disciplinas ou do número de registros.
              </p>

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    De qual plataforma você está importando?
                  </label>
                  <select
                    value={originSlug}
                    onChange={(e) => setOriginSlug(e.target.value as OriginSource)}
                    className="w-full h-9 px-3 text-xs border rounded-lg bg-background"
                  >
                    {ORIGIN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {originSlug === "outra" && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Nome da plataforma
                    </label>
                    <input
                      type="text"
                      value={customOriginName}
                      onChange={(e) => setCustomOriginName(e.target.value)}
                      maxLength={60}
                      placeholder="Ex.: Gran, TEC Concursos, Qconcursos"
                      className="w-full h-9 px-3 text-xs border rounded-lg bg-background"
                    />
                  </div>
                )}

                {importOrigin && (
                  <p className="text-[11px] text-muted-foreground">
                    Origem registrada:{" "}
                    <span className="font-bold text-[#2563EB]">
                      {originDisplayName(importOrigin.source, importOrigin.sourceName)}
                    </span>
                  </p>
                )}
              </div>

              <input
                key={fileInputKey}
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  e.target.value = ""
                  void handleFile(file)
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!importOrigin}
                className="w-full rounded-xl border-2 border-dashed border-[#2563EB]/40 bg-[#2563EB]/5 hover:bg-[#2563EB]/10 hover:border-[#2563EB] transition-colors py-12 flex flex-col items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="h-12 w-12 rounded-full bg-[#2563EB]/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-[#2563EB]" />
                </div>
                <div className="text-sm font-extrabold text-[#2563EB]">Selecionar arquivo</div>
                <div className="text-[11px] text-muted-foreground">.xlsx, .xls ou .csv</div>
              </button>

              {!importOrigin && (
                <p className="text-[11px] text-amber-600 font-bold -mt-2">
                  Informe o nome da plataforma para continuar.
                </p>
              )}

              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  O arquivo é processado no seu navegador. Nada é enviado antes de você confirmar a
                  importação. Registros repetidos são ignorados automaticamente.
                </p>
              </div>
            </div>
          )}

          {step === "parsing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
              <p className="text-sm font-bold text-foreground">Analisando arquivo...</p>
              <p className="text-xs text-muted-foreground">{fileName}</p>
            </div>
          )}

          {step === "review" && parsedReport && (
            <div className="space-y-5">
              {parsedReport.totalRows === 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  Nenhum registro encontrado no arquivo. Verifique se o arquivo contém linhas de
                  dados abaixo do cabeçalho.
                </div>
              )}

              {/* Resumo */}
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Análise do arquivo
                </h3>
                <ul className="space-y-1.5 text-[11px]">
                  <CheckRow label={`${parsedReport.totalRows} registros encontrados`} />
                  <CheckRow label={`${parsedReport.subjects.length} matérias identificadas`} />
                  <CheckRow
                    label={`${formatDuration(parsedReport.totalDurationSeconds)} de estudo`}
                  />
                  <CheckRow label={`${parsedReport.withQuestions} registros com questões`} />
                  <CheckRow label={`${parsedReport.withCorrect} registros com acertos`} />
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card p-4 space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Qualidade do arquivo
                  </h3>
                  <ul className="space-y-1 text-[11px]">
                    <QualityRow
                      ok={parsedReport.quality.noDate === 0}
                      label={`Registros sem data: ${parsedReport.quality.noDate}`}
                    />
                    <QualityRow
                      ok={parsedReport.quality.noSubject === 0}
                      label={`Registros sem disciplina: ${parsedReport.quality.noSubject}`}
                    />
                    <QualityRow
                      ok={parsedReport.quality.noDuration === 0}
                      label={`Registros sem duração: ${parsedReport.quality.noDuration}`}
                    />
                    <QualityRow
                      ok={parsedReport.quality.duplicatesInFile === 0}
                      label={`Duplicados no arquivo: ${parsedReport.quality.duplicatesInFile} (serão ignorados)`}
                    />
                  </ul>
                </div>

                <div className="rounded-xl border bg-card p-4 space-y-2">
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Tipos de estudo detectados
                  </h3>
                  {distinctTypes.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Nenhum tipo detectado — registros entram como &quot;Outro&quot;.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-[11px]">
                      {distinctTypes.map(([raw, label]) => (
                        <li key={raw} className="flex items-center justify-between gap-2">
                          <span className="font-bold text-foreground truncate">{raw}</span>
                          <span className="text-muted-foreground shrink-0">→ {label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Colunas */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Colunas identificadas
                </h3>
                {parsedReport.columns.some(
                  (c) => (overrides[c.index] !== undefined ? overrides[c.index] : c.field) === null,
                ) && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      Precisamos confirmar algumas colunas. Para cada coluna não reconhecida,
                      escolha o que ela representa abaixo antes de importar.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {parsedReport.columns.map((column) => {
                    const override = overrides[column.index]
                    const field: ImportField | null =
                      override !== undefined ? override : column.field
                    const isRecognized = field !== null
                    const usedElsewhere = new Set(
                      parsedReport.columns
                        .filter((c) => c.index !== column.index)
                        .map((c): ImportField | null => {
                          const otherOverride = overrides[c.index]
                          return otherOverride !== undefined ? otherOverride : c.field
                        })
                        .filter((f): f is ImportField => f !== null),
                    )
                    return (
                      <div key={column.index} className="flex items-center gap-2 min-w-0">
                        {isRecognized ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        <span className="text-[11px] font-bold text-foreground truncate min-w-0 flex-1">
                          {column.header || `Coluna ${column.index + 1}`}
                        </span>
                        {isRecognized ? (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {IMPORT_FIELD_LABELS[field]}
                            {column.sample?.[0] !== undefined && (
                              <span className="text-muted-foreground/60">
                                {" "}
                                · {column.sample[0]}
                              </span>
                            )}
                          </span>
                        ) : (
                          <select
                            value=""
                            onChange={(e) => handleColumnChange(column.index, e.target.value)}
                            className="text-[10px] h-7 border rounded-md bg-background px-2 max-w-[150px]"
                          >
                            <option value="">Não reconhecida — atribuir...</option>
                            {IMPORT_FIELDS.filter((f) => !usedElsewhere.has(f)).map((f) => (
                              <option key={f} value={f}>
                                {IMPORT_FIELD_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Colunas não reconhecidas podem ser atribuídas manualmente. Se tudo parecer
                  correto, prossiga.
                </p>
              </div>

              {/* Disciplinas */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Disciplinas — conferir vínculo ({parsedReport.subjects.length})
                </h3>
                {parsedReport.subjects.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhuma disciplina detectada — os registros serão importados como &quot;Estudo
                    Livre&quot; se alguma coluna for atribuída manualmente.
                  </p>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {parsedReport.subjects.map((subject) => {
                    const config = effectiveSubjectMap[subject.name]
                    let value = "create"
                    if (config?.mode === "existing") {
                      value = `existing:${config.disciplineId}`
                    } else if (config?.mode === "ignore") {
                      value = "ignore"
                    }
                    const suggested = suggestions[subject.name] ?? []
                    const otherDisciplines = disciplines.filter(
                      (d) => !suggested.some((s) => s.disciplineId === d.id),
                    )
                    return (
                      <div key={subject.name} className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-foreground truncate min-w-0 flex-1">
                          {subject.name}
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            ({subject.count})
                          </span>
                        </span>
                        <select
                          value={value}
                          onChange={(e) => handleSubjectChange(subject.name, e.target.value)}
                          className="text-[11px] h-8 border rounded-md bg-background px-2 max-w-[240px]"
                        >
                          <optgroup label="Ações">
                            <option value="create">Criar nova disciplina</option>
                            <option value="ignore">Ignorar</option>
                          </optgroup>
                          {suggested.length > 0 && (
                            <optgroup label="Sugestões">
                              {suggested.map((s) => (
                                <option key={s.disciplineId} value={`existing:${s.disciplineId}`}>
                                  {s.disciplineId
                                    ? (disciplines.find((d) => d.id === s.disciplineId)?.name ??
                                      s.disciplineId)
                                    : s.disciplineId}
                                  {s.auto ? " (sugerida)" : ` (${Math.round(s.score * 100)}%)`}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherDisciplines.length > 0 && (
                            <optgroup label="Todas as disciplinas">
                              {otherDisciplines.map((d) => (
                                <option key={d.id} value={`existing:${d.id}`}>
                                  {d.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>

              {parsedReport.totalRows > LARGE_FILE_WARNING && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    Arquivo muito grande ({parsedReport.totalRows} registros). A importação pode
                    demorar alguns minutos — não feche esta janela.
                  </p>
                </div>
              )}

              <Button
                onClick={() => void handlePreview()}
                disabled={previewing || importableRecords.length === 0}
                className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10"
              >
                {previewing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analisando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Continuar ({importableRecords.length} registros)
                  </>
                )}
              </Button>
            </div>
          )}

          {step === "confirm" && preview && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard value={String(preview.newCount)} label="Novos registros" tone="blue" />
                <SummaryCard
                  value={String(preview.duplicateCount)}
                  label="Já existentes"
                  tone="muted"
                />
                <SummaryCard value={String(preview.ignoredCount)} label="Ignoradas" tone="muted" />
                <SummaryCard
                  value={String(preview.errorCount)}
                  label="Com problemas"
                  tone="amber"
                />
              </div>

              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 max-h-32 overflow-y-auto space-y-1">
                  <p className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">
                    Avisos
                  </p>
                  {preview.errors.slice(0, 5).map((e, i) => (
                    <p
                      key={i}
                      className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed"
                    >
                      • {e}
                    </p>
                  ))}
                  {preview.errors.length > 5 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      ... e mais {preview.errors.length - 5}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                {preview.newCount} registro{preview.newCount !== 1 ? "s" : ""} será
                {preview.newCount !== 1 ? "o" : ""} adicionado
                {preview.newCount !== 1 ? "s" : ""} ao seu histórico
                {preview.duplicateCount > 0 &&
                  ` e ${preview.duplicateCount} já existente${preview.duplicateCount !== 1 ? "s" : ""} serão ignorado${preview.duplicateCount !== 1 ? "s" : ""}`}
                {preview.ignoredCount > 0 &&
                  `; ${preview.ignoredCount} registro${preview.ignoredCount !== 1 ? "s" : ""} de disciplina${preview.ignoredCount !== 1 ? "s" : ""} marcada${preview.ignoredCount !== 1 ? "s" : ""} para ignorar não entram`}
                .
              </p>

              <div className="rounded-xl border bg-[#2563EB]/5 border-[#2563EB]/30 p-4 space-y-2">
                <h3 className="text-sm font-black text-[#2563EB]">Pronto para importar</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Serão adicionados {preview.newCount} novo{preview.newCount !== 1 ? "s" : ""}{" "}
                  registro
                  {preview.newCount !== 1 ? "s" : ""} ao seu histórico.
                </p>
                {importOrigin && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Origem registrada:{" "}
                    <span className="font-bold text-foreground">
                      {originDisplayName(importOrigin.source, importOrigin.sourceName)}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("review")}
                  disabled={importing}
                  className="flex-1 text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleImport()}
                  disabled={preview.newCount === 0 || importing}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10"
                >
                  <Download className="h-4 w-4" />
                  {preview.newCount === 0
                    ? "Nada a importar"
                    : `Importar ${preview.newCount} registro${preview.newCount !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="space-y-5 py-6">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-[#2563EB] mx-auto" />
                <p className="text-sm font-extrabold text-foreground">Importando histórico...</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {progress.done.toLocaleString("pt-BR")} / {progress.total.toLocaleString("pt-BR")}
                </p>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {step === "done" && finalSummary && (
            <div className="space-y-5">
              <div className="flex items-center justify-center flex-col gap-2 py-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-black uppercase tracking-wider text-foreground">
                  Importação concluída
                </p>
                {importOrigin && (
                  <span className="inline-flex items-center rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-3 py-1 text-[10px] font-bold text-[#2563EB]">
                    Importado · {originDisplayName(importOrigin.source, importOrigin.sourceName)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <SummaryCard value={String(finalSummary.imported)} label="Importados" tone="blue" />
                <SummaryCard
                  value={String(finalSummary.duplicates)}
                  label="Já existentes"
                  tone="muted"
                />
                <SummaryCard
                  value={String(finalSummary.errors)}
                  label="Com problemas"
                  tone="amber"
                />
              </div>

              {finalSummary.createdSubjects.length > 0 && (
                <div className="rounded-lg border bg-card p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Disciplinas criadas ({finalSummary.createdSubjects.length})
                  </p>
                  <p className="text-[11px] text-foreground leading-relaxed">
                    {finalSummary.createdSubjects.slice(0, 8).join(", ")}
                    {finalSummary.createdSubjects.length > 8 &&
                      ` e mais ${finalSummary.createdSubjects.length - 8}`}
                  </p>
                </div>
              )}

              {finalSummary.errorDetails.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
                  <p className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">
                    Problemas ({finalSummary.errorDetails.length})
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    {finalSummary.errorDetails.slice(0, 5).join(" · ")}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} className="flex-1 text-xs font-bold">
                  Importar outro arquivo
                </Button>
                <Button
                  onClick={() => handleOpenChange(false)}
                  className="flex-1 text-xs font-bold bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                >
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "blue" | "muted" | "amber"
}) {
  let toneClass = "text-foreground"
  if (tone === "blue") toneClass = "text-[#2563EB]"
  else if (tone === "amber") toneClass = "text-amber-600"
  else if (tone === "muted") toneClass = "text-muted-foreground"
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col justify-between gap-2 min-h-[72px]">
      <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground block">
        {label}
      </span>
      <span className={`text-lg font-black font-mono ${toneClass}`}>{value}</span>
    </div>
  )
}

function QualityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      )}
      <span className={ok ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}>
        {label}
      </span>
    </li>
  )
}

function CheckRow({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      <span className="text-muted-foreground">{label}</span>
    </li>
  )
}
