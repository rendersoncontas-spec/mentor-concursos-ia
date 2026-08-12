"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileUp,
  Heart,
  HeartOff,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { FlashcardType, ReviewItem } from "@/domain/reviews/models"
import { FLASHCARD_TYPE_LABEL, REVIEW_GRADE_LABEL } from "@/domain/reviews/models"
import {
  createFlashcardAction,
  deleteFlashcardAction,
  duplicateFlashcardAction,
  exportFlashcardsAction,
  generateFlashcardDraftsAction,
  getReviewFormOptionsAction,
  importFlashcardsAction,
  searchFlashcardsAction,
  setFlashcardFlagAction,
  updateFlashcardAction,
} from "@/application/review-engine/review.actions"
import { toast } from "sonner"

const STAGE_FILTERS: { value: ReviewItem["review_stage"] | "SUSPENDED" | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todos os estados" },
  { value: "NEW", label: "Novo" },
  { value: "LEARNING", label: "Aprendendo" },
  { value: "REVIEW", label: "Revisando" },
  { value: "MASTERED", label: "Dominado" },
  { value: "LAPSED", label: "Lapso" },
  { value: "SUSPENDED", label: "Suspenso" },
]

const STAGE_STYLE: Record<string, string> = {
  NEW: "bg-muted/60 border-border text-muted-foreground",
  LEARNING: "bg-blue-500/10 border-blue-500/40 text-blue-600",
  REVIEW: "bg-amber-500/10 border-amber-500/40 text-amber-600",
  MASTERED: "bg-green-500/10 border-green-500/40 text-green-600",
  LAPSED: "bg-red-500/10 border-red-500/40 text-red-600",
}

const CARD_TYPES: { value: FlashcardType; label: string }[] = [
  { value: "QA", label: "Pergunta → Resposta" },
  { value: "QUESTION", label: "Questão → Explicação" },
  { value: "TRUE_FALSE", label: "Verdadeiro ou Falso" },
  { value: "MULTIPLE_CHOICE", label: "Múltipla Escolha" },
  { value: "CLOZE", label: "Lacuna (Cloze)" },
  { value: "OPEN", label: "Pergunta Aberta" },
]

interface Options {
  disciplines: { id: string; name: string; area: string | null }[]
  topics: { id: string; disciplineId: string; name: string }[]
}

interface Draft {
  disciplineId: string
  topicId: string | null
  cardType: ReviewItem["card_type"]
  front: string
  back: string
  tags: string[]
  sourceQuestionId: string
}

export function FlashcardLibrary() {
  const [cards, setCards] = useState<ReviewItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [disciplineFilter, setDisciplineFilter] = useState<string>("ALL")
  const [stageFilter, setStageFilter] = useState<string>("ALL")
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState<Options>({ disciplines: [], topics: [] })
  const [busyId, setBusyId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ReviewItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReviewItem | null>(null)
  const [iaOpen, setIaOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const pageSize = 15

  const load = useCallback(
    async (p = page, search = q, disc = disciplineFilter, stage = stageFilter) => {
      setLoading(true)
      const res = await searchFlashcardsAction({
        q: search || null,
        disciplineId: disc === "ALL" ? null : disc,
        stage: (stage as ReviewItem["review_stage"] | "SUSPENDED" | "ALL") as never,
        page: p,
        pageSize,
      })
      setLoading(false)
      if (res.data) {
        setCards(res.data.cards)
        setTotal(res.data.total)
        setPage(p)
      } else {
        toast.error(res.error ?? "Erro ao buscar cartões.")
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cardsRes, optsRes] = await Promise.all([searchFlashcardsAction({ page: 1, pageSize }), getReviewFormOptionsAction()])
      if (cancelled) return
      setLoading(false)
      if (cardsRes.data) {
        setCards(cardsRes.data.cards)
        setTotal(cardsRes.data.total)
      }
      if (optsRes.data) setOptions(optsRes.data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const applySearch = () => {
    void load(1, q, disciplineFilter, stageFilter)
  }

  const refresh = () => {
    void load(page, q, disciplineFilter, stageFilter)
  }

  const handleFlag = async (id: string, field: "is_favorite" | "is_suspended", value: boolean) => {
    setBusyId(id)
    const res = await setFlashcardFlagAction(id, field, value)
    setBusyId(null)
    if (!res.error) refresh()
    else toast.error(res.error)
  }

  const handleDuplicate = async (id: string) => {
    setBusyId(id)
    const res = await duplicateFlashcardAction(id)
    setBusyId(null)
    if (res.data) {
      toast.success("Cartão duplicado.")
      refresh()
    } else toast.error(res.error ?? "Erro ao duplicar.")
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    const res = await deleteFlashcardAction(id)
    setBusyId(null)
    setDeleteTarget(null)
    if (!res.error) {
      toast.success("Cartão excluído (histórico preservado).")
      refresh()
    } else toast.error(res.error)
  }

  const handleExport = async () => {
    const res = await exportFlashcardsAction()
    if (res.error || !res.data) {
      toast.error(res.error ?? "Erro ao exportar.")
      return
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "meus-flashcards.json"
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${res.data.length} cartões exportados.`)
  }

  const hasFilters = q.trim() !== "" || disciplineFilter !== "ALL" || stageFilter !== "ALL"

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por perguntas, respostas ou tags…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch()
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={disciplineFilter} onValueChange={(v) => setDisciplineFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Disciplina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as disciplinas</SelectItem>
              {options.disciplines.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={(v) => setStageFilter(v)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={applySearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ("")
                setDisciplineFilter("ALL")
                setStageFilter("ALL")
                void load(1, "", "ALL", "ALL")
              }}
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Ações principais */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo cartão
        </Button>
        <Button variant="outline" onClick={() => setIaOpen(true)}>
          <Sparkles className="h-4 w-4 text-violet-500" />
          Gerar com IA
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <FileUp className="h-4 w-4" />
          Importar
        </Button>
        <Button variant="outline" onClick={() => void handleExport()}>
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      {cards.length === 0 && !loading ? (
        <div className="rounded-xl border bg-card p-10 text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto text-primary/40" />
          <p className="font-semibold">Nenhum flashcard encontrado</p>
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "Ajuste os filtros ou a busca para encontrar cartões."
              : "Crie seu primeiro cartão, gere com IA a partir das questões do app ou importe um arquivo."}
          </p>
          {!hasFilters && (
            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Criar cartão
              </Button>
              <Button variant="outline" onClick={() => setIaOpen(true)}>
                <Sparkles className="h-4 w-4" />
                Gerar com IA
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {(loading ? ([] as ReviewItem[]) : cards).map((card) => (
              <CardRow
                key={card.id}
                card={card}
                busy={busyId === card.id}
                onFavorite={() => void handleFlag(card.id, "is_favorite", !card.is_favorite)}
                onSuspend={() => void handleFlag(card.id, "is_suspended", !card.is_suspended)}
                onEdit={() => setEditTarget(card)}
                onDuplicate={() => void handleDuplicate(card.id)}
                onDelete={() => setDeleteTarget(card)}
              />
            ))}
            {loading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {total > pageSize && (
            <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
              <span>
                Página {page} de {Math.max(1, Math.ceil(total / pageSize))} ({total} cartões)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page * pageSize >= total || loading} onClick={() => void load(page + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Criar cartão */}
      <CreateCardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        options={options}
        onSaved={() => {
          setCreateOpen(false)
          setQ("")
          setDisciplineFilter("ALL")
          setStageFilter("ALL")
          void load(1, "", "ALL", "ALL")
        }}
      />

      {/* Editar cartão */}
      {editTarget && (
        <CreateCardDialog
          open
          onOpenChange={(open) => !open && setEditTarget(null)}
          options={options}
          initial={editTarget}
          onSaved={() => {
            setEditTarget(null)
            refresh()
          }}
        />
      )}

      {/* Excluir (soft delete) */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir cartão?</DialogTitle>
            <DialogDescription>
              O cartão será removido das revisões, mas o histórico de estudos será preservado. Isso não pode ser desfeito na interface.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm max-h-28 overflow-y-auto">{deleteTarget.card_front}</div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="outline" className="text-red-600 border-red-500/40" onClick={() => deleteTarget && void handleDelete(deleteTarget.id)}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gerar com IA (heurística de questões cadastradas) */}
      <IaGenerateDialog open={iaOpen} onOpenChange={setIaOpen} options={options} onSaved={() => refresh()} />

      {/* Importar */}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onSaved={() => refresh()} />
    </div>
  )
}

// ─── Linha do cartão ─────────────────────────────────────────────────────────

interface CardRowProps {
  card: ReviewItem
  busy: boolean
  onFavorite: () => void
  onSuspend: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function truncate(text: string, max = 90): string {
  return text.length > max ? text.slice(0, max) + "…" : text
}

function CardRow({ card, busy, onFavorite, onSuspend, onEdit, onDuplicate, onDelete }: CardRowProps) {
  const preview = card.card_front ? truncate(card.card_front) : FLASHCARD_TYPE_LABEL[card.card_type]

  return (
    <div className={cn("rounded-xl border bg-card p-4 flex flex-col sm:flex-row gap-3", card.is_suspended && "opacity-60")}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant="outline" className={STAGE_STYLE[card.review_stage]}>
            {STAGE_FILTERS.find((s) => s.value === card.review_stage)?.label ?? card.review_stage}
          </Badge>
          <Badge variant="outline">{FLASHCARD_TYPE_LABEL[card.card_type]}</Badge>
          {card.is_favorite && (
            <Badge variant="outline" className="bg-red-500/10 border-red-500/40 text-red-600">
              Favorito
            </Badge>
          )}
          {card.lapses_count > 0 && (
            <Badge variant="outline" className="bg-orange-500/10 border-orange-500/40 text-orange-600">
              {card.lapses_count} falha(s)
            </Badge>
          )}
          {card.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
              #{tag}
            </span>
          ))}
        </div>
        <p className="text-sm font-medium whitespace-pre-wrap break-words">{preview}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {card.review_count} revisões · próxima: {card.next_review_at ? new Date(card.next_review_at).toLocaleDateString("pt-BR") : "—"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="icon" onClick={onFavorite} disabled={busy} title={card.is_favorite ? "Remover favorito" : "Favoritar"}>
          {card.is_favorite ? <Heart className="h-4 w-4 text-red-500" /> : <HeartOff className="h-4 w-4 text-muted-foreground" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onSuspend} disabled={busy} title={card.is_suspended ? "Reativar" : "Suspender"}>
          {card.is_suspended ? <PlayCircle className="h-4 w-4 text-green-600" /> : <PauseCircle className="h-4 w-4 text-muted-foreground" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} disabled={busy} title="Editar">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDuplicate} disabled={busy} title="Duplicar">
          <Copy className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={busy} title="Excluir">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  )
}

// ─── Criar / editar ──────────────────────────────────────────────────────────

interface CreateProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: Options
  initial?: ReviewItem | null
  onSaved: () => void
  suggestions?: Draft[] | null
  onSaveAll?: (drafts: Draft[]) => Promise<void>
}

function CreateCardDialog({ open, onOpenChange, options, initial, onSaved, suggestions, onSaveAll }: CreateProps) {
  const [front, setFront] = useState(initial?.card_front ?? "")
  const [back, setBack] = useState(initial?.card_back ?? "")
  const [cardType, setCardType] = useState<FlashcardType>(initial?.card_type ?? "QA")
  const [disciplineId, setDisciplineId] = useState(initial?.discipline_id ?? options.disciplines[0]?.id ?? "")
  const [topicId, setTopicId] = useState(initial?.topic_id ?? "")
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "")
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (next && !suggestions) {
      setFront(initial?.card_front ?? "")
      setBack(initial?.card_back ?? "")
      setCardType(initial?.card_type ?? "QA")
      setDisciplineId(initial?.discipline_id ?? options.disciplines[0]?.id ?? "")
      setTopicId(initial?.topic_id ?? "")
      setTags(initial?.tags.join(", ") ?? "")
    }
    onOpenChange(next)
  }

  const topics = useMemo(() => options.topics.filter((t) => t.disciplineId === disciplineId), [options.topics, disciplineId])

  const saveOne = async (drafFront: string, drafBack: string) => {
    if (!disciplineId) return
    await createFlashcardAction({
      disciplineId,
      topicId: topicId || null,
      cardType,
      front: drafFront,
      back: drafBack,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    })
  }

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      toast.error("Preencha pergunta e resposta.")
      return
    }
    setSaving(true)
    if (initial) {
      const res = await updateFlashcardAction(initial.id, {
        front,
        back,
        cardType,
        disciplineId,
        topicId: topicId || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      })
      setSaving(false)
      if (res.data) {
        toast.success("Cartão atualizado.")
        onSaved()
      } else toast.error(res.error ?? "Erro ao atualizar.")
      return
    }
    const res = await createFlashcardAction({
      disciplineId,
      topicId: topicId || null,
      cardType,
      front,
      back,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    })
    setSaving(false)
    if (res.data) {
      toast.success("Cartão criado.")
      onSaved()
    } else toast.error(res.error ?? "Erro ao criar.")
  }

  let title: string
  if (suggestions) title = "Revisar cartões gerados"
  else if (initial) title = "Editar cartão"
  else title = "Novo flashcard"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {suggestions && (
            <DialogDescription>
              Cartões gerados a partir das suas questões cadastradas — revise e edite antes de salvar.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Disciplina</Label>
              <Select value={disciplineId} onValueChange={(v) => setDisciplineId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {options.disciplines.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tópico</Label>
              <Select value={topicId} onValueChange={(v) => setTopicId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem tópico</SelectItem>
                  {topics.slice(0, 300).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={cardType} onValueChange={(v) => setCardType(v as FlashcardType)} disabled={!!suggestions}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de cartão" />
              </SelectTrigger>
              <SelectContent>
                {CARD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Pergunta (frente)</Label>
            <Textarea className="min-h-24" value={suggestions ? suggestions[0]?.front ?? "" : front} onChange={(e) => !suggestions && setFront(e.target.value)} />
          </div>
          <div>
            <Label>Resposta (verso)</Label>
            <Textarea className="min-h-24" value={suggestions ? suggestions[0]?.back ?? "" : back} onChange={(e) => !suggestions && setBack(e.target.value)} />
          </div>
          <div>
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} disabled={!!suggestions} placeholder="direito, constituição" />
          </div>
        </div>

        {suggestions ? (
          <div className="space-y-3 pt-2">
            {suggestions.map((d, idx) => (
              <div key={d.sourceQuestionId + idx} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{FLASHCARD_TYPE_LABEL[d.cardType]}</Badge>
                  <span className="text-xs text-muted-foreground">{idx + 1} de {suggestions.length}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap font-medium max-h-40 overflow-y-auto">{d.front}</p>
                <p className="text-xs whitespace-pre-wrap text-muted-foreground max-h-40 overflow-y-auto">{d.back}</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!disciplineId}
                  onClick={() => {
                    setSaving(true)
                    void saveOne(d.front, d.back).then(() => {
                      setSaving(false)
                      toast.success("Cartão salvo.")
                    })
                  }}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Adicionar
                </Button>
              </div>
            ))}
            {onSaveAll && (
              <Button
                className="w-full"
                disabled={!disciplineId || saving}
                onClick={() => {
                  setSaving(true)
                  void onSaveAll(suggestions).finally(() => setSaving(false))
                }}
              >
                <Check className="h-4 w-4" />
                Salvar todos
              </Button>
            )}
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Salvar alterações" : "Criar cartão"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Gerar com IA ────────────────────────────────────────────────────────────

function IaGenerateDialog({ open, onOpenChange, options, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; options: Options; onSaved: () => void }) {
  const [disciplineId, setDisciplineId] = useState("")
  const [topicId, setTopicId] = useState("")
  const [count, setCount] = useState(5)
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [loading, setLoading] = useState(false)

  const topics = useMemo(() => options.topics.filter((t) => t.disciplineId === disciplineId), [options.topics, disciplineId])

  const generate = async () => {
    if (!disciplineId) {
      toast.error("Selecione uma disciplina.")
      return
    }
    setLoading(true)
    const res = await generateFlashcardDraftsAction(disciplineId, topicId || null, count)
    setLoading(false)
    if (res.data) {
      setDrafts(res.data)
    } else {
      toast.error(res.error ?? "Erro ao gerar cartões.")
    }
  }

  const saveAll = async (all: Draft[]) => {
    let ok = 0
    for (const d of all) {
      const res = await createFlashcardAction({
        disciplineId: d.disciplineId,
        topicId: d.topicId,
        cardType: d.cardType,
        front: d.front,
        back: d.back,
        tags: d.tags,
      })
      if (res.data) ok++
    }
    toast.success(`${ok} de ${all.length} cartões salvos.`)
    setDrafts(null)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o)
      if (!o) setDrafts(null)
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Gerar cartões com IA
          </DialogTitle>
          <DialogDescription>
            Gera cartões a partir das questões cadastradas no app (sem provedor LLM conectado, a geração usa o conteúdo real das suas questões). Revise antes de salvar.
          </DialogDescription>
        </DialogHeader>

        {!drafts && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Disciplina</Label>
                <Select value={disciplineId} onValueChange={(v) => setDisciplineId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.disciplines.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tópico</Label>
                <Select value={topicId} onValueChange={(v) => setTopicId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todos os tópicos</SelectItem>
                    {topics.slice(0, 300).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void generate()} disabled={loading || !disciplineId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar rascunhos
              </Button>
            </div>
          </div>
        )}

        {drafts && (
          <CreateCardDialog
            open
            onOpenChange={(o) => {
              if (!o) {
                setDrafts(null)
                onOpenChange(false)
              }
            }}
            options={options}
            suggestions={drafts}
            onSaved={onSaved}
            onSaveAll={saveAll}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Importar ────────────────────────────────────────────────────────────────

function ImportDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [text, setText] = useState("")
  const [importing, setImporting] = useState(false)

  const parse = (): { front: string; back: string; disciplineName?: string | null; tags?: string[] }[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim())
        const front = parts[0] ?? ""
        const back = parts[1] ?? ""
        const disciplineName = parts[2] || null
        const tags = (parts[3] ?? "").split(",").map((t) => t.trim()).filter(Boolean)
        return { front, back, disciplineName, tags }
      })
      .filter((row) => row.front && row.back)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar flashcards</DialogTitle>
          <DialogDescription>
            Cole uma linha por cartão no formato: <code className="text-xs bg-muted px-1 rounded">pergunta|resposta|disciplina|tags</code>. Linhas sem disciplina usam a primeira do app.
          </DialogDescription>
        </DialogHeader>
        <Textarea className="min-h-40 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={"O que é o CRFB/88?\nConstituição Federal de 1988|Constituição Federal|CF,1988"} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={importing || parse().length === 0}
            onClick={async () => {
              setImporting(true)
              const res = await importFlashcardsAction(parse())
              setImporting(false)
              if (res.data) {
                toast.success(
                  `${res.data.imported} importado(s)${res.data.skipped > 0 ? `, ${res.data.skipped} ignorado(s)${res.data.message ? ` (${res.data.message})` : ""}` : ""}.`
                )
                setText("")
                onOpenChange(false)
                onSaved()
              } else toast.error(res.error ?? "Erro ao importar.")
            }}
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Importar {parse().length > 0 ? `(${parse().length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { REVIEW_GRADE_LABEL }