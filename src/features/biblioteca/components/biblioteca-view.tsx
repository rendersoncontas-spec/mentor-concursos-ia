"use client"

import { useCallback, useEffect, useState } from "react"

import { Download, ExternalLink, Library, Loader2, Search, Trash2 } from "lucide-react"
import { Import } from "lucide-react"
import dynamic from "next/dynamic"
import { toast } from "sonner"

import {
  type LibraryMaterialItem,
  createLibraryMaterialAction,
  deleteLibraryMaterialAction,
  listLibraryMaterialsAction,
} from "@/application/library/library.action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// Carregado sob demanda (Fase 6, auditoria de bundle): ImportHistoryModal
// importa estaticamente a biblioteca xlsx (pesada) via excel-reader.ts. Como
// antes era um import estático no topo do arquivo, o JS do xlsx era baixado
// sempre que a página Biblioteca carregava, mesmo que o usuário nunca abrisse
// o modal de importação. Com next/dynamic, esse JS só é buscado quando o
// modal é de fato aberto (isImportOpen vira true).
const ImportHistoryModal = dynamic(
  () =>
    import("@/features/importacao/components/import-history-modal").then(
      (mod) => mod.ImportHistoryModal,
    ),
  { ssr: false },
)

export function BibliotecaView({ initialMaterials }: { initialMaterials?: LibraryMaterialItem[] | null } = {}) {
  // Fase F (performance): com a lista vinda do servidor, a tela nasce pronta
  // (sem spinner e sem a Server Action pós-hidratação).
  const [materials, setMaterials] = useState<LibraryMaterialItem[]>(initialMaterials ?? [])
  const [isLoading, setIsLoading] = useState(!initialMaterials)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Form State
  const [titleInput, setTitleInput] = useState("")
  const [disciplineInput, setDisciplineInput] = useState("")
  const [typeInput, setTypeInput] = useState<LibraryMaterialItem["type"]>("PDF")
  const [urlInput, setUrlInput] = useState("")

  const loadMaterials = useCallback(() => {
    void (async () => {
      await Promise.resolve()
      setIsLoading(true)
      setLoadError(null)
      const res = await listLibraryMaterialsAction()
      if (res.success && res.data) {
        setMaterials(res.data)
      } else {
        setLoadError(res.error || "Erro ao carregar biblioteca.")
      }
      setIsLoading(false)
    })()
  }, [])

  const hasInitialMaterials = Boolean(initialMaterials)
  useEffect(() => {
    if (hasInitialMaterials) return
    loadMaterials()
  }, [loadMaterials, hasInitialMaterials])

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titleInput.trim()) {
      toast.error("Informe o título do material.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await createLibraryMaterialAction({
        title: titleInput,
        disciplineName: disciplineInput,
        type: typeInput,
        url: urlInput,
      })

      if (!res.success) {
        toast.error(res.error || "Erro ao adicionar material.")
        return
      }

      toast.success("Material adicionado à biblioteca!")
      setTitleInput("")
      setDisciplineInput("")
      setUrlInput("")
      setIsModalOpen(false)
      loadMaterials()
    } catch {
      toast.error("Erro inesperado ao adicionar material.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveMaterial = async (id: string) => {
    setRemovingId(id)
    try {
      const res = await deleteLibraryMaterialAction(id)
      if (!res.success) {
        toast.error(res.error || "Erro ao remover material.")
        return
      }
      setMaterials((prev) => prev.filter((m) => m.id !== id))
      toast.success("Material removido com sucesso.")
    } catch {
      toast.error("Erro inesperado ao remover material.")
    } finally {
      setRemovingId(null)
    }
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredMaterials = materials.filter((m) => {
    if (!normalizedSearch) return true
    return (
      m.title.toLowerCase().includes(normalizedSearch) ||
      m.disciplineName.toLowerCase().includes(normalizedSearch)
    )
  })

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="rounded-lg border border-border bg-card divide-y divide-border" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-3.5 w-1/3 rounded bg-muted animate-skeleton" />
              <div className="h-3 w-20 rounded bg-muted animate-skeleton" />
              <div className="ml-auto h-3 w-16 rounded bg-muted animate-skeleton" />
            </div>
          ))}
          <span className="sr-only">Carregando sua biblioteca…</span>
        </div>
      )
    }

    if (loadError) {
      return (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            title="Não foi possível carregar a biblioteca"
            description={loadError}
            action={
              <Button onClick={loadMaterials} size="sm" variant="outline">
                Tentar novamente
              </Button>
            }
          />
        </div>
      )
    }

    if (filteredMaterials.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Library}
            title={normalizedSearch ? "Nenhum material encontrado" : "Nenhum material cadastrado"}
            description={
              normalizedSearch
                ? "Tente buscar por outro termo."
                : "Guarde apostilas, resumos, links de questões e videoaulas por disciplina."
            }
            action={
              !normalizedSearch ? (
                <Button onClick={() => setIsModalOpen(true)} size="sm">
                  Adicionar material
                </Button>
              ) : undefined
            }
          />
        </div>
      )
    }

    // Redesign 2.0 — gerenciamento de documentos: tabela (título,
    // disciplina, tipo, data, ações) em vez de um card por material.
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="type-label hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_96px] gap-4 border-b border-border bg-muted/40 px-4 py-2 tracking-[0.02em]">
          <span>Título</span>
          <span>Disciplina</span>
          <span>Tipo</span>
          <span>Adicionado</span>
          <span className="text-right">Ações</span>
        </div>
        <ul className="divide-y divide-border">
          {filteredMaterials.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_100px_96px] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-foreground hover:text-primary hover:underline underline-offset-2 line-clamp-1"
                  >
                    {item.title}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-foreground line-clamp-1">{item.title}</span>
                )}
                <p className="md:hidden text-xs text-muted-foreground truncate">
                  {[item.disciplineName, item.type, item.dateAdded].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="hidden md:block text-[13px] text-muted-foreground truncate">
                {item.disciplineName || "—"}
              </span>
              <span className="hidden md:block">
                <Badge variant="secondary">{item.type}</Badge>
              </span>
              <span className="hidden md:block text-xs text-muted-foreground tabular-nums">
                {item.dateAdded}
              </span>

              <div className="flex items-center justify-end gap-0.5">
                {item.url ? (
                  <>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Abrir material"
                      aria-label={`Abrir ${item.title}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href={item.url}
                      download={item.type === "PDF" || item.type === "Resumo"}
                      target="_blank"
                      rel="noreferrer"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Baixar"
                      aria-label={`Baixar ${item.title}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground mr-1">Sem link</span>
                )}
                <button
                  onClick={() => handleRemoveMaterial(item.id)}
                  disabled={removingId === item.id}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  title="Remover"
                  aria-label={`Remover ${item.title}`}
                >
                  {removingId === item.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      {/* Barra de ferramentas: busca + ações (o título está no cabeçalho fixo da página) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por título ou disciplina"
            aria-label="Pesquisar materiais"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2">
            <Import className="h-4 w-4" />
            Importar histórico
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            Adicionar material
          </Button>
        </div>
      </div>

      {/* Resumo da biblioteca: uma única superfície com divisórias (não 3 cards repetidos) */}
      <div className="grid grid-cols-3 border-y border-border divide-x divide-border">
        <div className="px-4 py-2.5 space-y-0.5">
          <span className="text-xs text-muted-foreground block">
            Materiais
          </span>
          <span className="text-lg font-semibold text-foreground tabular-nums block">{materials.length}</span>
        </div>

        <div className="px-4 py-2.5 space-y-0.5">
          <span className="text-xs text-muted-foreground block">
            PDFs e resumos
          </span>
          <span className="text-lg font-semibold text-foreground tabular-nums block">
            {materials.filter((m) => m.type === "PDF" || m.type === "Resumo").length}
          </span>
        </div>

        <div className="px-4 py-2.5 space-y-0.5">
          <span className="text-xs text-muted-foreground block">
            Links e vídeos
          </span>
          <span className="text-lg font-semibold text-foreground tabular-nums block">
            {materials.filter((m) => m.type === "Link" || m.type === "Vídeo").length}
          </span>
        </div>
      </div>

      {/* Materials Cards Grid */}
      {renderContent()}

      {/* Modal Adicionar Material */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        {" "}
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Adicionar material de estudo
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddMaterial} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Título do Material *
              </label>
              <Input
                placeholder="Ex: Apostila Resumida de Direito Tributário..."
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Disciplina</label>
              <Input
                placeholder="Ex: Direito Tributário, RLM..."
                value={disciplineInput}
                onChange={(e) => setDisciplineInput(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Tipo</label>
              <select
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value as LibraryMaterialItem["type"])}
                className="w-full h-9 rounded-md border border-input bg-card px-3 py-1 text-sm focus:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              >
                <option value="PDF">PDF / Apostila</option>
                <option value="Resumo">Resumo / Mapa Mental</option>
                <option value="Link">Link de Questões</option>
                <option value="Vídeo">Vídeo / Videoaula</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Link (URL ou Drive)
              </label>
              <Input
                placeholder="https://drive.google.com/file/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar material"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImportHistoryModal open={isImportOpen} onOpenChange={setIsImportOpen} />
    </div>
  )
}
