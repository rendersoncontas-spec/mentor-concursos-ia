"use client"

import { useState, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
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
  Target,
  Shield,
  Briefcase,
  Scale,
  Award,
  Flame,
  Sparkles,
  Landmark,
  Upload,
  Image as ImageIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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

// ─── Preset Icons ──────────────────────────────────────────────

export const PRESET_ICONS = [
  { id: "trophy", label: "Troféu", icon: Trophy },
  { id: "graduation-cap", label: "Formatura", icon: GraduationCap },
  { id: "target", label: "Alvo", icon: Target },
  { id: "shield", label: "Polícia / Escudo", icon: Shield },
  { id: "building", label: "Tribunal / Edifício", icon: Building2 },
  { id: "book", label: "Estudos", icon: BookOpen },
  { id: "briefcase", label: "Carreira", icon: Briefcase },
  { id: "scale", label: "Direito / Justiça", icon: Scale },
  { id: "award", label: "Medalha", icon: Award },
  { id: "flame", label: "Fogo / Foco", icon: Flame },
  { id: "sparkles", label: "Destaque", icon: Sparkles },
  { id: "star", label: "Estrela", icon: Star },
  { id: "landmark", label: "Fiscal / Governo", icon: Landmark },
]

export function RenderConcursoIcon({ iconKey, className = "h-5 w-5" }: { iconKey?: string | null | undefined; className?: string }) {
  if (!iconKey) return <Trophy className={className} />

  if (iconKey.startsWith("data:image/") || iconKey.startsWith("http://") || iconKey.startsWith("https://")) {
    // Wrapper com tamanho próprio: o `fill` do Next/Image preenche o ancestral
    // posicionado mais próximo — sem isso, dentro de popovers a imagem estoura
    // para o tamanho do container (bug da imagem gigante no seletor).
    // O tamanho acompanha o className pedido pelo chamador (h-4/h-5/h-7).
    const sizeClass = className.match(/h-\S+/)?.[0] ?? "h-5"
    const widthClass = className.match(/w-\S+/)?.[0] ?? "w-5"
    return (
      <span className={`relative block ${sizeClass} ${widthClass} shrink-0 overflow-hidden rounded`}>
        <Image src={iconKey} alt="Ícone do concurso" fill unoptimized className="object-cover" sizes="32px" />
      </span>
    )
  }

  const found = PRESET_ICONS.find(p => p.id === iconKey)
  if (found) {
    const IconComponent = found.icon
    return <IconComponent className={className} />
  }

  return <Trophy className={className} />
}

// ─── Types ───────────────────────────────────────────────────

interface ConcursosManagerViewProps {
  initialConcursos: ConcursoData[]
}

const PRE_REGISTERED_EXAMS = [
  "Polícia Federal - Agente",
  "Polícia Federal - Escrivão",
  "Polícia Rodoviária Federal (PRF)",
  "Receita Federal - Auditor Fiscal",
  "Receita Federal - Analista Tributário",
  "INSS - Técnico do Seguro Social",
  "Banco do Brasil - Escriturário",
  "Caixa Econômica Federal - Técnico Bancário",
  "Tribunal de Justiça (TJ-SP) - Escrevente",
  "Polícia Civil - Investigador",
  "Polícia Militar (PM-SP) - Soldado",
]

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
  const [icon, setIcon] = useState(initial?.icon || "trophy")

  // Reset form when modal opens
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevInitialId, setPrevInitialId] = useState(initial?.id)
  if (open !== prevOpen || initial?.id !== prevInitialId) {
    setPrevOpen(open)
    setPrevInitialId(initial?.id)
    if (open) {
      setName(initial?.name || "")
      setRole(initial?.role || "")
      setBanca(initial?.banca || "")
      setExamDate(initial?.exam_date || "")
      setExamTime(initial?.exam_time || "")
      setExamLocation(initial?.exam_location || "")
      setExamPdfUrl(initial?.exam_pdf_url || "")
      setIcon(initial?.icon || "trophy")
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      toast.error("A imagem deve ser menor que 3MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (dataUrl) {
        setIcon(dataUrl)
        toast.success("Imagem do curso importada com sucesso!")
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!name.trim()) {
        toast.error("O nome do concurso é obrigatório.")
        return
      }
      await onSave({
        name: name.trim(),
        icon,
        ...(role.trim() ? { role: role.trim() } : {}),
        ...(banca.trim() ? { banca: banca.trim() } : {}),
        ...(examDate ? { exam_date: examDate } : {}),
        ...(examTime ? { exam_time: examTime } : {}),
        ...(examLocation.trim() ? { exam_location: examLocation.trim() } : {}),
        ...(examPdfUrl.trim() ? { exam_pdf_url: examPdfUrl.trim() } : {}),
      })
    } catch (err) {
      toast.error("Erro fatal no modal: " + String(err))
    }
  }

  if (!open) return null

  let submitLabel = "Criar Concurso"
  if (isSaving) {
    submitLabel = "Salvando..."
  } else if (initial?.id) {
    submitLabel = "Salvar Alterações"
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-xl bg-card rounded-lg shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-foreground">
              {initial?.id ? "Editar concurso" : "Novo concurso"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Seção 1: Ícone / Logo do Curso ou Concurso */}
          <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/10">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-primary" />
                Ícone ou Imagem do Curso / Concurso
              </label>
              {icon && icon !== "trophy" && (
                <button
                  type="button"
                  onClick={() => setIcon("trophy")}
                  className="text-xs text-rose-500 hover:underline font-semibold"
                >
                  Restaurar padrão
                </button>
              )}
            </div>

            {/* Visualização Atual do Ícone */}
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center overflow-hidden shrink-0 shadow-sm group">
                <RenderConcursoIcon iconKey={icon} className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">
                  Escolha um ícone predefinido ou importe a logo do curso/concurso do seu dispositivo.
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    accept="image/*"
                    id="concurso-icon-file-input"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="concurso-icon-file-input"
                    className="cursor-pointer inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Importar Imagem
                  </label>

                  <span className="text-xs text-muted-foreground">ou</span>

                  <input
                    type="url"
                    placeholder="URL da imagem (http...)"
                    value={icon?.startsWith("http") ? icon : ""}
                    onChange={(e) => setIcon(e.target.value)}
                    className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Presets de Ícones */}
            <div className="pt-2 border-t border-border/60">
              <p className="text-[10px] font-semibold text-muted-foreground tracking-wider mb-2">
                Ícones Pré-definidos
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_ICONS.map((p) => {
                  const IconComp = p.icon
                  const isSelected = icon === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.label}
                      onClick={() => setIcon(p.id)}
                      className={cn(
                        "w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/15 text-primary ring-2 ring-primary/30 shadow-xs"
                          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <IconComp className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">
                Nome do Concurso / Curso *
              </label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  list="pre-registered-exams"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Receita Federal"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
                />
                <datalist id="pre-registered-exams">
                  {PRE_REGISTERED_EXAMS.map(exam => (
                    <option key={exam} value={exam} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Cargo */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">Cargo</label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="Ex: Analista Tributário"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
              />
            </div>

            {/* Banca */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">Banca</label>
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
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">Data da Prova</label>
              <input
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Horário */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">Horário</label>
              <input
                type="time"
                value={examTime}
                onChange={e => setExamTime(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Local */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">Local da Prova</label>
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
              <label className="text-[10px] font-semibold text-muted-foreground tracking-wider">Link do Edital (PDF)</label>
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
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {submitLabel}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm bg-card rounded-lg shadow-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-semibold text-base text-foreground">Excluir Concurso</h3>
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
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-destructive hover:bg-destructive/90 text-white font-semibold rounded-xl h-auto py-2.5 gap-2"
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

  let statusBadge: { label: string; className: string }
  if (concurso.is_active) {
    statusBadge = { label: "Ativo", className: "bg-primary" }
  } else if (concurso.is_archived) {
    statusBadge = { label: "Arquivado", className: "bg-muted-foreground/40" }
  } else {
    statusBadge = { label: "Inativo", className: "bg-muted-foreground/40" }
  }

  let daysStr = "Data não definida"
  if (concurso.days_remaining !== null) {
    if (concurso.days_remaining > 0) {
      daysStr = `Faltam ${concurso.days_remaining} dias`
    } else if (concurso.days_remaining === 0) {
      daysStr = "Prova hoje"
    } else {
      daysStr = "Prova realizada"
    }
  }

  // Redesign 2.0 — cada concurso é uma LINHA de uma lista de projetos
  // (nome, status, prova, banca, ações), não um card isolado.
  return (
    <div className={cn(
      "relative group grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_110px_170px_auto] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_110px_170px_150px] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/30",
      concurso.is_active && "border-l-2 border-l-primary",
      concurso.is_archived && "opacity-70"
    )}>
      {/* Nome + cargo/banca */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden border border-border bg-muted text-muted-foreground">
          <RenderConcursoIcon iconKey={concurso.icon} className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="font-medium text-sm text-foreground truncate">{concurso.name}</h3>
          <p className="text-xs text-muted-foreground truncate lg:hidden">
            {[concurso.role, concurso.banca].filter(Boolean).join(" · ") || "Cargo e banca não informados"}
          </p>
        </div>
      </div>

      {/* Cargo / banca em coluna própria no desktop largo */}
      <span className="hidden lg:block truncate text-xs text-muted-foreground">
        {[concurso.role, concurso.banca].filter(Boolean).join(" · ") || "Não informados"}
      </span>

      {/* Status */}
      <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", statusBadge.className)} />
        <span className={concurso.is_active ? "text-foreground font-medium" : undefined}>{statusBadge.label}</span>
      </span>

      {/* Data da prova */}
      <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        <Calendar aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{daysStr}</span>
      </span>

      {/* Ações */}
      <div className="flex items-center justify-end gap-1">
        {concurso.is_active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewEdital}
            className="hidden sm:inline-flex text-primary hover:text-primary hover:bg-primary/10"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Ver edital
          </Button>
        )}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={`Ações de ${concurso.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-0 top-9 z-50 w-48 bg-popover border border-border rounded-lg shadow-lg p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onEdit(concurso) }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Editar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDuplicate(concurso.id, concurso.name) }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Duplicar
                </button>
                {!concurso.is_active && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onActivate(concurso.id, concurso.name) }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground rounded-md hover:bg-muted transition-colors"
                  >
                    <Star className="h-3.5 w-3.5 text-muted-foreground" /> Definir como ativo
                  </button>
                )}
                {concurso.is_active && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onViewEdital() }}
                    className="sm:hidden w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground rounded-md hover:bg-muted transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" /> Ver edital
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onArchive(concurso.id, concurso.name) }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  <Archive className="h-3.5 w-3.5 text-muted-foreground" /> {concurso.is_archived ? "Desarquivar" : "Arquivar"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDelete(concurso.id, concurso.name) }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile: status + data em linha secundária */}
      <p className="md:hidden col-span-2 pl-11 text-xs text-muted-foreground tabular-nums">
        {statusBadge.label} · {daysStr}
      </p>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center space-y-2 rounded-lg border border-border bg-card">
      <GraduationCap aria-hidden className="h-5 w-5 text-muted-foreground/70" />
      <h2 className="text-sm font-medium text-foreground">Nenhum concurso cadastrado</h2>
      <p className="text-[13px] text-muted-foreground max-w-sm">
        Cadastre o concurso que você está preparando para organizar edital, datas e ciclo.
      </p>
      <Button onClick={onNew} size="sm" className="mt-2">
        <Plus className="h-4 w-4" />
        Adicionar concurso
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
      
      // Criar um helper de timeout para evitar travamentos infinitos
      const withTimeout = <T,>(promise: Promise<T>, ms: number = 10000) => {
        let timeoutId: NodeJS.Timeout
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Timeout de ${ms}ms excedido.`)), ms)
        })
        return Promise.race([
          promise.finally(() => clearTimeout(timeoutId)),
          timeoutPromise
        ])
      }

      if (editingConcurso?.id) {
        res = await withTimeout(updateConcursoAction(editingConcurso.id, data))
        if (res.success) toast.success("Concurso atualizado com sucesso!")
      } else {
        res = await withTimeout(createConcursoAction(data))
        if (res.success) toast.success("Concurso criado! Ele já está ativo.")
      }
      
      if (res.success) {
        setFormOpen(false)
        setEditingConcurso(undefined)
        refreshList()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao salvar concurso (Servidor).")
      }
    } catch (err) {
      toast.error("Erro inesperado (Client): " + String(err))
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
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="type-h3 text-foreground">Meus concursos</h2>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {concursos.length === 0
              ? "Nenhum concurso cadastrado ainda."
              : `${activeConcursos.length} concurso${activeConcursos.length !== 1 ? "s" : ""} • ${concursos.filter(c => c.is_active).length} ativo`
            }
          </p>
        </div>
        <Button
          onClick={() => { setEditingConcurso(undefined); setFormOpen(true) }}
          className="w-full sm:w-auto"
          disabled={isPending}
        >
          <Plus className="h-4 w-4" />
          Novo concurso
        </Button>
      </div>

      {/* Lista Vazia */}
      {activeConcursos.length === 0 && archivedConcursos.length === 0 && (
        <EmptyState onNew={() => { setEditingConcurso(undefined); setFormOpen(true) }} />
      )}

      {/* Grid de Concursos Ativos */}
      {activeConcursos.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            <div className="type-label hidden lg:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_110px_170px_150px] gap-x-4 bg-muted/40 px-4 py-2">
              <span>Concurso</span>
              <span>Cargo · banca</span>
              <span>Status</span>
              <span>Prova</span>
              <span className="text-right">Ações</span>
            </div>
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
            <h2 className="text-[13px] font-semibold text-foreground">
              Arquivados <span className="font-normal text-muted-foreground tabular-nums">· {archivedConcursos.length}</span>
            </h2>
          </div>
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
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
