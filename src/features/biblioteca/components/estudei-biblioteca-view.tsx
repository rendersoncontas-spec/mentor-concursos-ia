"use client"

import { useCallback, useEffect, useState } from "react"

import { Download, ExternalLink, Library, Loader2, Search, Trash2 } from "lucide-react"
import { Import } from "lucide-react"
import { toast } from "sonner"

import {
  type LibraryMaterialItem,
  createLibraryMaterialAction,
  deleteLibraryMaterialAction,
  listLibraryMaterialsAction,
} from "@/application/library/library.action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ImportHistoryModal } from "@/features/importacao/components/import-history-modal"

export function BibliotecaView() {
  const [materials, setMaterials] = useState<LibraryMaterialItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
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

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

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
        <div className="rounded-xl border bg-card p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-5 my-6">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
          <p className="text-xs text-muted-foreground font-medium">Carregando sua biblioteca...</p>
        </div>
      )
    }

    if (loadError) {
      return (
        <div className="rounded-xl border bg-card p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-5 my-6">
          <h3 className="text-lg font-bold text-foreground">
            Não foi possível carregar a biblioteca
          </h3>
          <p className="text-xs text-muted-foreground font-medium">{loadError}</p>
          <Button
            onClick={loadMaterials}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 shadow-xs"
          >
            Tentar novamente
          </Button>
        </div>
      )
    }

    if (filteredMaterials.length === 0) {
      return (
        <div className="rounded-xl border bg-card p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-5 my-6">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <Library className="h-16 w-16 text-[#2563EB]" />
          </div>

          <div className="space-y-1.5 max-w-md">
            <h3 className="text-lg font-bold text-foreground">
              {normalizedSearch
                ? "Nenhum material encontrado para essa busca"
                : "Você ainda não possui materiais cadastrados na biblioteca"}
            </h3>
            <p className="text-xs text-muted-foreground font-medium">
              {normalizedSearch ? "Tente buscar por outro termo." : "Vamos adicionar?"}
            </p>
          </div>

          {!normalizedSearch && (
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 shadow-xs"
            >
              Adicionar Material
            </Button>
          )}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredMaterials.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge
                  variant="secondary"
                  className="text-[10px] font-bold bg-[#2563EB]/10 text-[#2563EB]"
                >
                  {item.type}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {item.dateAdded}
                </span>
              </div>

              <h3 className="font-bold text-sm text-foreground line-clamp-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground font-medium">{item.disciplineName}</p>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1.5"
                >
                  <span>Acessar Material</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground font-medium">
                  Sem link cadastrado
                </span>
              )}

              <div className="flex items-center gap-1">
                {item.url && (
                  <a
                    href={item.url}
                    download={item.type === "PDF" || item.type === "Resumo"}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-muted-foreground hover:text-[#2563EB] transition-colors"
                    title="Baixar"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => handleRemoveMaterial(item.id)}
                  disabled={removingId === item.id}
                  className="p-1 text-muted-foreground hover:text-rose-500 transition-colors disabled:opacity-40"
                  title="Remover"
                >
                  {removingId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-foreground">Biblioteca</h1>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
        >
          Adicionar Material
        </Button>
      </div>

      {/* Importar dados */}
      <div className="rounded-xl border-2 border-dashed border-[#2563EB]/30 bg-[#2563EB]/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-[#2563EB]">
            Importar dados
          </h3>
          <p className="text-sm font-extrabold text-foreground">
            Traga seu histórico de estudos para o Nomeia.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Compatível com arquivos Excel (.xlsx).
          </p>
        </div>
        <Button
          onClick={() => setIsImportOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs gap-2 shrink-0"
        >
          <Import className="h-4 w-4" />
          Importar histórico
        </Button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar materiais..."
          className="pl-9"
        />
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            MATERIAIS CADASTRADOS
          </span>
          <span className="text-3xl font-black text-foreground block pt-1">{materials.length}</span>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            PDFs & RESUMOS
          </span>
          <span className="text-3xl font-black text-[#2563EB] block pt-1">
            {materials.filter((m) => m.type === "PDF" || m.type === "Resumo").length}
          </span>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
            LINKS & CADERNOS
          </span>
          <span className="text-3xl font-black text-sky-500 block pt-1">
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
            <DialogTitle className="text-base font-bold text-[#2563EB]">
              Adicionar Material de Estudo
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
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-ring"
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
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Material"
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

export { BibliotecaView as EstudeiBibliotecaView }
