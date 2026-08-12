"use client"

import { useState } from "react"
import {
  Library,
  ChevronDown,
  ExternalLink,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"

export interface MaterialItem {
  id: string
  title: string
  disciplineName: string
  type: "PDF" | "Resumo" | "Link" | "Vídeo"
  url: string
  dateAdded: string
}

const DEFAULT_MATERIALS: MaterialItem[] = [
  {
    id: "m1",
    title: "Vade Mecum Direito Constitucional 2026",
    disciplineName: "Direito Constitucional",
    type: "PDF",
    url: "https://planalto.gov.br",
    dateAdded: "01/08/2026",
  },
  {
    id: "m2",
    title: "Resumo Esquetematizado - Contabilidade Geral",
    disciplineName: "Contabilidade Geral",
    type: "Resumo",
    url: "https://drive.google.com",
    dateAdded: "03/08/2026",
  },
  {
    id: "m3",
    title: "Caderno de Questões - RLM Completo",
    disciplineName: "Raciocínio Lógico",
    type: "Link",
    url: "https://qconcursos.com",
    dateAdded: "05/08/2026",
  },
]

export function EstudeiBibliotecaView() {
  const [materials, setMaterials] = useState<MaterialItem[]>(DEFAULT_MATERIALS)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form State
  const [titleInput, setTitleInput] = useState("")
  const [disciplineInput, setDisciplineInput] = useState("")
  const [typeInput, setTypeInput] = useState<"PDF" | "Resumo" | "Link" | "Vídeo">("PDF")
  const [urlInput, setUrlInput] = useState("")

  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titleInput.trim()) return

    const newMaterial: MaterialItem = {
      id: `mat-${Date.now()}`,
      title: titleInput.trim(),
      disciplineName: disciplineInput.trim() || "Geral",
      type: typeInput,
      url: urlInput.trim() || "#",
      dateAdded: new Date().toLocaleDateString("pt-BR"),
    }

    const updated = [newMaterial, ...materials]
    setMaterials(updated)
    toast.success("Material adicionado à biblioteca!")

    setTitleInput("")
    setDisciplineInput("")
    setUrlInput("")
    setIsModalOpen(false)
  }

  const handleRemoveMaterial = (id: string) => {
    setMaterials(materials.filter((m) => m.id !== id))
    toast.success("Material removido com sucesso.")
  }

  return (
    <div className="space-y-6">
      {/* Header Actions — 100% Estudei */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-foreground">Biblioteca</h1>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
          >
            Adicionar Material
          </Button>

          <Button variant="outline" className="border-[#2563EB] text-[#2563EB] font-bold text-xs gap-2">
            Analista Tributário
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
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
      {materials.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-5 my-6">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <Library className="h-16 w-16 text-[#2563EB]" />
          </div>

          <div className="space-y-1.5 max-w-md">
            <h3 className="text-lg font-bold text-foreground">
              Você ainda não possui materiais cadastrados na biblioteca
            </h3>
            <p className="text-xs text-muted-foreground font-medium">Vamos adicionar?</p>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 shadow-xs"
          >
            Adicionar Material
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {materials.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px] font-bold bg-[#2563EB]/10 text-[#2563EB]">
                    {item.type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{item.dateAdded}</span>
                </div>

                <h3 className="font-bold text-sm text-foreground line-clamp-2">{item.title}</h3>
                <p className="text-xs text-muted-foreground font-medium">{item.disciplineName}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1.5"
                >
                  <span>Acessar Material</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>

                <button
                  onClick={() => handleRemoveMaterial(item.id)}
                  className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Adicionar Material */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#2563EB]">
              Adicionar Material de Estudo
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddMaterial} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Título do Material *</label>
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
                onChange={(e) => setTypeInput(e.target.value as MaterialItem["type"])}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-2xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="PDF">PDF / Apostila</option>
                <option value="Resumo">Resumo / Mapa Mental</option>
                <option value="Link">Link de Questões</option>
                <option value="Vídeo">Vídeo / Videoaula</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Link (URL ou Drive)</label>
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
              <Button type="submit" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold">
                Salvar Material
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

