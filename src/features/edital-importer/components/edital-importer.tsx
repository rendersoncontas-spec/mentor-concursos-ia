"use client"

import { useRef, useState } from "react"

import * as Dialog from "@radix-ui/react-dialog"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import {
  confirmEditalImportAction,
  parseEditalFileAction,
} from "@/features/edital-importer/actions"
import type {
  EditalImportResult,
  MatchedEdital,
} from "@/features/edital-importer/lib/types"

type EditTopic = { title: string; isNew: boolean; subtopics: { title: string }[] }
type EditDiscipline = { name: string; isNew: boolean; topics: EditTopic[] }

const MAX_BYTES = 10 * 1024 * 1024

function buildEditable(draft: MatchedEdital): EditDiscipline[] {
  return draft.disciplines.map((d) => ({
    name: d.name,
    isNew: d.isNew,
    topics: d.topics.map((t) => ({
      title: t.title,
      isNew: t.isNew,
      subtopics: t.subtopics.map((s) => ({ title: s.title })),
    })),
  }))
}

export function EditalImporter({ targetId }: { targetId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"extracting" | "importing" | null>(null)
  const [result, setResult] = useState<EditalImportResult | null>(null)
  const [draft, setDraft] = useState<MatchedEdital | null>(null)
  const [editable, setEditable] = useState<EditDiscipline[]>([])
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [editing, setEditing] = useState<{ disc: number; topic: number | null } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setResult(null)
    setDraft(null)
    setEditable([])
    setExpanded({})
    setEditing(null)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.error("O arquivo excede o limite de 10 MB.")
      return
    }
    reset()
    setBusy("extracting")
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await parseEditalFileAction(formData)
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Não foi possível analisar o arquivo.")
        return
      }
      setResult(res.data)
      setDraft(res.data.draft)
      setEditable(buildEditable(res.data.draft))
      setExpanded(res.data.draft.disciplines.slice(0, 3).reduce<Record<number, boolean>>((acc, _, i) => {
        acc[i] = true
        return acc
      }, {}))
      if (res.data.draft.lowConfidenceCount > 0) {
        toast.info(
          `${res.data.draft.lowConfidenceCount} item(ns) com confiança baixa — revise antes de importar.`,
        )
      }
    } catch {
      toast.error("Erro inesperado ao analisar o arquivo.")
    } finally {
      setBusy(null)
    }
  }

  const handleConfirm = async () => {
    if (!result || !draft) return
    const structure = editable.map((d) => ({
      name: d.name,
      topics: d.topics.map((t) => ({ title: t.title, subtopics: t.subtopics.map((s) => ({ title: s.title })) })),
    }))
    setBusy("importing")
    try {
      const res = await confirmEditalImportAction({
        fileName: result.fileName,
        fileHash: result.fileHash,
        targetId,
        metadata: draft.metadata,
        structure,
      })
      if (!res.success) {
        if (res.alreadyImported) {
          toast.info(res.error ?? "Este edital já foi importado.")
        } else {
          toast.error(res.error ?? "Erro ao importar o edital.")
        }
        return
      }
      toast.success(
        `Edital importado: ${res.stats?.disciplines ?? 0} disciplinas, ${res.stats?.topics ?? 0} tópicos.`,
      )
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error("Erro inesperado ao importar.")
    } finally {
      setBusy(null)
    }
  }

  const updateDisciplineName = (i: number, value: string) => {
    setEditable((prev) => prev.map((d, idx) => (idx === i ? { ...d, name: value } : d)))
  }
  const updateTopicTitle = (i: number, j: number, value: string) => {
    setEditable((prev) =>
      prev.map((d, idx) =>
        idx === i
          ? { ...d, topics: d.topics.map((t, tidx) => (tidx === j ? { ...t, title: value } : t)) }
          : d,
      ),
    )
  }
  const removeDiscipline = (i: number) => {
    setEditable((prev) => prev.filter((_, idx) => idx !== i))
  }
  const removeTopic = (i: number, j: number) => {
    setEditable((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, topics: d.topics.filter((_, tidx) => tidx !== j) } : d)),
    )
  }
  const addTopic = (i: number, title: string) => {
    const value = title.trim()
    if (!value) return
    setEditable((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, topics: [...d.topics, { title: value, isNew: true, subtopics: [] }] } : d)),
    )
  }

  const renderBody = () => {
    if (busy === "extracting") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground">
            Analisando o edital com o NomeIA…
          </p>
        </div>
      )
    }
    if (!result || !draft) {
      return (
        <div
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFile(e.dataTransfer.files[0])
          }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Arraste o arquivo do edital aqui</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, DOCX ou TXT · até 10 MB · nada é gravado antes da sua confirmação
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 inline-flex items-center gap-1.5 rounded-xl border bg-background px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" />
            Escolher arquivo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      )
    }
    return (
      <Preview
        draft={draft}
        editable={editable}
        expanded={expanded}
        editing={editing}
        onToggle={(i) => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
        onEdit={(i, j) => setEditing(j === null ? { disc: i, topic: null } : { disc: i, topic: j })}
        onRenameDiscipline={(i, v) => updateDisciplineName(i, v)}
        onRenameTopic={(i, j, v) => updateTopicTitle(i, j, v)}
        onRemoveDiscipline={(i) => removeDiscipline(i)}
        onRemoveTopic={(i, j) => removeTopic(i, j)}
        onAddTopic={(i, title) => addTopic(i, title)}
      />
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => {
      setOpen(o)
      if (!o) reset()
    }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-primary/90"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          Importar edital
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <Dialog.Title className="text-base font-black text-foreground">
                Importador Inteligente de Editais
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Envie o PDF, DOCX ou TXT do edital — o NomeIA extrai disciplinas, tópicos e subtópicos.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">{renderBody()}</div>

          {result && draft && busy !== "extracting" && (
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5">
              <p className="text-xs text-muted-foreground">
                {result.stats.lowConfidence > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {result.stats.lowConfidence} item(ns) com confiança baixa
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy === "importing" || editable.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === "importing" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Importando…
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Importar edital
                  </>
                )}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Preview({
  draft,
  editable,
  expanded,
  editing,
  onToggle,
  onEdit,
  onRenameDiscipline,
  onRenameTopic,
  onRemoveDiscipline,
  onRemoveTopic,
  onAddTopic,
}: {
  draft: MatchedEdital
  editable: EditDiscipline[]
  expanded: Record<number, boolean>
  editing: { disc: number; topic: number | null } | null
  onToggle: (i: number) => void
  onEdit: (i: number, j: number | null) => void
  onRenameDiscipline: (i: number, value: string) => void
  onRenameTopic: (i: number, j: number, value: string) => void
  onRemoveDiscipline: (i: number) => void
  onRemoveTopic: (i: number, j: number) => void
  onAddTopic: (i: number, title: string) => void
}) {
  const totals = {
    disciplines: editable.length,
    topics: editable.reduce((acc, d) => acc + d.topics.length, 0),
    subtopics: editable.reduce((acc, d) => acc + d.topics.reduce((a, t) => a + t.subtopics.length, 0), 0),
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Disciplinas" value={totals.disciplines} />
        <Stat label="Tópicos" value={totals.topics} />
        <Stat label="Subtópicos" value={totals.subtopics} />
        <Stat label="Confiança" value={`${Math.round(draft.overallConfidence * 100)}%`} />
      </div>

      {(draft.metadata.name || draft.metadata.organizer || draft.metadata.banca) && (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-xs space-y-1">
          {draft.metadata.name && (
            <p>
              <span className="font-bold text-foreground">Edital:</span>{" "}
              <span className="text-muted-foreground">{draft.metadata.name}</span>
            </p>
          )}
          {draft.metadata.organizer && (
            <p>
              <span className="font-bold text-foreground">Órgão:</span>{" "}
              <span className="text-muted-foreground">{draft.metadata.organizer}</span>
            </p>
          )}
          {draft.metadata.banca && (
            <p>
              <span className="font-bold text-foreground">Banca:</span>{" "}
              <span className="text-muted-foreground">{draft.metadata.banca}</span>
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {editable.map((d, i) => (
          <div key={i} className="overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
              <button type="button" onClick={() => onToggle(i)} className="text-muted-foreground hover:text-foreground">
                {expanded[i] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {editing?.disc === i && editing.topic === null ? (
                <input
                  autoFocus
                  defaultValue={d.name}
                  onBlur={(e) => {
                    onRenameDiscipline(i, e.target.value)
                    onEdit(i, null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRenameDiscipline(i, (e.target as HTMLInputElement).value)
                      onEdit(i, null)
                    }
                  }}
                  className="flex-1 rounded-lg border bg-background px-2 py-1 text-sm font-bold text-foreground"
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 truncate text-left text-sm font-bold text-foreground"
                  onClick={() => onToggle(i)}
                >
                  {d.name || "Sem nome"}
                </button>
              )}
              <Badge isNew={d.isNew} />
              <button
                type="button"
                onClick={() => onEdit(i, null)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Renomear"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveDiscipline(i)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Remover disciplina"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {expanded[i] && (
              <div className="px-3 py-2">
                {d.topics.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum tópico.</p>
                ) : (
                  d.topics.map((t, j) => (
                    <div key={j} className="group flex items-start gap-1.5 py-0.5">
                      {editing?.disc === i && editing.topic === j ? (
                        <input
                          autoFocus
                          defaultValue={t.title}
                          onBlur={(e) => {
                            onRenameTopic(i, j, e.target.value)
                            onEdit(i, null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onRenameTopic(i, j, (e.target as HTMLInputElement).value)
                              onEdit(i, null)
                            }
                          }}
                          className="flex-1 rounded-lg border bg-background px-2 py-0.5 text-sm text-foreground"
                        />
                      ) : (
                        <p className="flex-1 text-sm text-foreground">
                          {t.title}
                          {t.subtopics.length > 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({t.subtopics.length} sub)
                            </span>
                          )}
                        </p>
                      )}
                      <Badge isNew={t.isNew} />
                      <button
                        type="button"
                        onClick={() => onEdit(i, j)}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                        title="Renomear tópico"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTopic(i, j)}
                        className="rounded p-0.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                        title="Remover tópico"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
                <AddTopicInput onAdd={(title) => onAddTopic(i, title)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center">
      <p className="text-lg font-black text-foreground">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

function Badge({ isNew }: { isNew: boolean }) {
  return isNew ? (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
      novo
    </span>
  ) : (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600">
      existente
    </span>
  )
}

function AddTopicInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("")
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onAdd(value)
            setValue("")
          }
        }}
        placeholder="Adicionar tópico manualmente…"
        className="flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => {
          onAdd(value)
          setValue("")
        }}
        className="rounded-lg border px-2 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
