"use client"

import { useState, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Trophy,
  Calendar,
  BookOpen,
  MoreVertical,
  Pencil,
  Copy,
  Star,
  Archive,
  Trash2,
  CheckCircle2,
  Loader2,
  GraduationCap,
  Building2,
  MapPin,
  Link2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getConcursosAction,
  createConcursoAction,
  updateConcursoAction,
  duplicateConcursoAction,
  setActiveConcursoAction,
  archiveConcursoAction,
  deleteConcursoAction,
  type ConcursoData,
  type CreateConcursoInput,
} from "@/application/concursos/concurso.action"

// ─── Types ───────────────────────────────────────────────────

interface ConcursosManagerViewProps {
  initialConcursos: ConcursoData[]
}

// ─── Concurso Form Modal ──────────────────────────────────────

interface ConcursoFormModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: CreateConcursoInput) => Promise<void>
  initial?: Partial<ConcursoData>
  isSaving: boolean
}

function ConcursoFormModal({ open, onClose, onSave, initial, isSaving }: ConcursoFormModalProps) {
  const [name, setName] = useState(initial?.name || "")
  const [role, setRole] = useState(initial?.role || "")
  const [banca, setBanca] = useState(initial?.banca || "")
  const [examDate, setExamDate] = useState(initial?.exam_date || "")
  const [examTime, setExamTime] = useState(initial?.exam_time || "")
  const [examLocation, setExamLocation] = useState(initial?.exam_location || "")
  const [examPdfUrl, setExamPdfUrl] = useState(initial?.exam_pdf_url || "")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("O nome do concurso é obrigatório.")
      return
    }
    await onSave({
      name: name.trim(),
      ...(role.trim() ? { role: role.trim() } : {}),
      ...(banca.trim() ? { banca: banca.trim() } : {}),
      ...(examDate ? { exam_date: examDate } : {}),
      ...(examTime ? { exam_time: examTime } : {}),
      ...(examLocation.trim() ? { exam_location: examLocation.trim() } : {}),
      ...(examPdfUrl.trim() ? { exam_pdf_url: examPdfUrl.trim() } : {}),
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-base font-black text-foreground">
              {initial?.id ? "Editar Concurso" : "Novo Concurso"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
                Nome do Concurso *
              </label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Receita Federal"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            </div>

            {/* Cargo */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Cargo</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="Ex: Analista Tributário"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
              />
            </div>

            {/* Banca */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Banca</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={banca}
                  onChange={e => setBanca(e.target.value)}
                  placeholder="Ex: ESAF, CEBRASPE, FCC"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            </div>

            {/* Data da Prova */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Data da Prova</label>
              <input
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Horário */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Horário</label>
              <input
                type="time"
                value={examTime}
                onChange={e => setExamTime(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Local */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Local da Prova</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={examLocation}
                  onChange={e => setExamLocation(e.target.value)}
                  placeholder="Ex: São Paulo - SP"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            </div>

            {/* Edital PDF */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Link do Edital (PDF)</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={examPdfUrl}
                  onChange={e => setExamPdfUrl(e.target.value)}
                  placeholder="https://www.edital.gov.br/..."
                  type="url"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl py-2.5 h-auto gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving ? "Salvando..." : (initial?.id ? "Salvar Alterações" : "Criar Concurso")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────

interface DeleteConfirmModalProps {
  open: boolean
  name: string
  onConfirm: () => Promise<void>
  onCancel: () => void
  isLoading: boolean
}

function DeleteConfirmModal({ open, name, onConfirm, onCancel, isLoading }: DeleteConfirmModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-black text-base text-foreground">Excluir Concurso</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Esta ação não pode ser desfeita.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir o concurso{" "}
          <strong className="text-foreground">{name}</strong>?
          Os planos de estudo relacionados também serão removidos.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-destructive hover:bg-destructive/90 text-white font-bold rounded-xl h-auto py-2.5 gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isLoading ? "Excluindo..." : "Excluir"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Concurso Card ────────────────────────────────────────────

interface ConcursoCardProps {
  concurso: ConcursoData
  onEdit: (c: ConcursoData) => void
  onDuplicate: (id: string, name: string) => void
  onActivate: (id: string, name: string) => void
  onArchive: (id: string, name: string) => void
  onDelete: (id: string, name: string) => void
  onViewEdital: () => void
}

function ConcursoCard({ concurso, onEdit, onDuplicate, onActivate, onArchive, onDelete, onViewEdital }: ConcursoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const statusBadge = concurso.is_active
    ? { label: "Ativo", className: "bg-primary text-white" }
    : concurso.is_archived
      ? { label: "Arquivado", className: "bg-muted text-muted-foreground" }
      : { label: "Inativo", className: "bg-muted text-muted-foreground/70" }

  const daysStr = concurso.days_remaining !== null
    ? concurso.days_remaining > 0
      ? `Faltam ${concurso.days_remaining} dias`
      : concurso.days_remaining === 0
        ? "Hoje é o dia! 🎯"
        : `Prova realizada`
    : "Data não definida"

  return (
    <div className={cn(
      "relative group rounded-2xl border bg-card p-5 flex flex-col gap-4 shadow-xs transition-all duration-200",
      concurso.is_active
        ? "border-primary/40 ring-2 ring-primary/15 shadow-md"
        : "border-border hover:border-border/80 hover:shadow-sm",
      concurso.is_archived && "opacity-60"
    )}>
      {/* Header do Card */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            concurso.is_active ? "bg-primary/10" : "bg-muted"
          )}>
            <Trophy className={cn("h-5 w-5", concurso.is_active ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm text-foreground truncate">{concurso.name}</h3>
              <span className={cn("text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider", statusBadge.className)}>
                {statusBadge.label}
              </span>
            </div>
            {(concurso.role || concurso.banca) && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {[concurso.role, concurso.banca].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* Menu de Ações */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 w-48 bg-popover border border-border rounded-xl shadow-xl py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => { setMenuOpen(false); onEdit(concurso) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Editar
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDuplicate(concurso.id, concurso.name) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Duplicar
                </button>
                {!concurso.is_active && (
                  <button
                    onClick={() => { setMenuOpen(false); onActivate(concurso.id, concurso.name) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" /> Definir como Ativo
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { setMenuOpen(false); onArchive(concurso.id, concurso.name) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Archive className="h-3.5 w-3.5" /> {concurso.is_archived ? "Desarquivar" : "Arquivar"}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(concurso.id, concurso.name) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metadados */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span className="truncate">{daysStr}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span>Edital do concurso</span>
        </div>
        {concurso.banca && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground col-span-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <span className="truncate">Banca: {concurso.banca}</span>
          </div>
        )}
      </div>

      {/* Ações do Card */}
      {concurso.is_active && (
        <div className="pt-1 border-t border-border">
          <button
            onClick={onViewEdital}
            className="w-full text-xs font-bold text-primary hover:text-primary/80 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Ver Edital Verticalizado
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
        <GraduationCap className="h-10 w-10 text-primary/60" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-black text-foreground">Nenhum concurso cadastrado</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Adicione seu primeiro concurso para começar a organizar seus estudos de forma inteligente.
        </p>
      </div>
      <Button
        onClick={onNew}
        className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 px-6 rounded-xl"
      >
        <Plus className="h-4 w-4" />
        Adicionar Primeiro Concurso
      </Button>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────

export function ConcursosManagerView({ initialConcursos }: ConcursosManagerViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [concursos, setConcursos] = useState<ConcursoData[]>(initialConcursos)

  // Form Modal
  const [formOpen, setFormOpen] = useState(false)
  const [editingConcurso, setEditingConcurso] = useState<ConcursoData | undefined>()
  const [isSaving, setIsSaving] = useState(false)

  // Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Recarregar lista do servidor
  const refreshList = useCallback(() => {
    startTransition(async () => {
      const res = await getConcursosAction()
      if (res.success && res.concursos) {
        setConcursos(res.concursos)
      }
    })
  }, [])

  // Criar/Editar
  const handleSave = async (data: CreateConcursoInput) => {
    setIsSaving(true)
    try {
      let res
      if (editingConcurso?.id) {
        res = await updateConcursoAction(editingConcurso.id, data)
        if (res.success) toast.success("Concurso atualizado com sucesso!")
      } else {
        res = await createConcursoAction(data)
        if (res.success) toast.success("Concurso criado! Ele já está ativo.")
      }
      if (res.success) {
        setFormOpen(false)
        setEditingConcurso(undefined)
        refreshList()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao salvar concurso.")
      }
    } catch {
      toast.error("Erro inesperado ao salvar.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (c: ConcursoData) => {
    setEditingConcurso(c)
    setFormOpen(true)
  }

  const handleDuplicate = async (id: string, name: string) => {
    const res = await duplicateConcursoAction(id)
    if (res.success) {
      toast.success(`"${name}" duplicado com sucesso!`)
      refreshList()
    } else {
      toast.error(res.error || "Erro ao duplicar.")
    }
  }

  const handleActivate = async (id: string, name: string) => {
    const res = await setActiveConcursoAction(id)
    if (res.success) {
      toast.success(`"${name}" definido como concurso ativo!`)
      refreshList()
      router.refresh()
    } else {
      toast.error(res.error || "Erro ao ativar concurso.")
    }
  }

  const handleArchive = async (id: string, name: string) => {
    const res = await archiveConcursoAction(id)
    if (res.success) {
      toast.success(`"${name}" arquivado.`)
      refreshList()
    } else {
      toast.error(res.error || "Erro ao arquivar.")
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await deleteConcursoAction(deleteTarget.id)
      if (res.success) {
        toast.success(`"${deleteTarget.name}" excluído.`)
        setDeleteTarget(null)
        refreshList()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao excluir.")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const activeConcursos = concursos.filter(c => !c.is_archived)
  const archivedConcursos = concursos.filter(c => c.is_archived)

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Meus Concursos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {concursos.length === 0
              ? "Nenhum concurso cadastrado ainda."
              : `${activeConcursos.length} concurso${activeConcursos.length !== 1 ? "s" : ""} • ${concursos.filter(c => c.is_active).length} ativo`
            }
          </p>
        </div>
        <Button
          onClick={() => { setEditingConcurso(undefined); setFormOpen(true) }}
          className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 rounded-xl shadow-sm w-full sm:w-auto"
          disabled={isPending}
        >
          <Plus className="h-4 w-4" />
          Novo Concurso
        </Button>
      </div>

      {/* Lista Vazia */}
      {activeConcursos.length === 0 && archivedConcursos.length === 0 && (
        <EmptyState onNew={() => { setEditingConcurso(undefined); setFormOpen(true) }} />
      )}

      {/* Grid de Concursos Ativos */}
      {activeConcursos.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeConcursos.map(c => (
              <ConcursoCard
                key={c.id}
                concurso={c}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onActivate={handleActivate}
                onArchive={handleArchive}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
                onViewEdital={() => router.push("/edital")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Arquivados */}
      {archivedConcursos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
              Arquivados ({archivedConcursos.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {archivedConcursos.map(c => (
              <ConcursoCard
                key={c.id}
                concurso={c}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onActivate={handleActivate}
                onArchive={handleArchive}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
                onViewEdital={() => router.push("/edital")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Badge de loading */}
      {isPending && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando...
        </div>
      )}

      {/* Modais */}
      <ConcursoFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingConcurso(undefined) }}
        onSave={handleSave}
        initial={editingConcurso ?? {}}
        isSaving={isSaving}
      />

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        name={deleteTarget?.name || ""}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        isLoading={isDeleting}
      />
    </div>
  )
}
