"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Folder,
  Edit3,
  Trash2,
  Plus,
  Archive,
  Edit,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

import { EstudeiDisciplineDetailView } from "@/features/disciplines/components/estudei-discipline-detail-view"
import { EditDisciplineModal } from "@/features/disciplines/components/edit-discipline-modal"
import { addUserDisciplineAction, removeUserDisciplineAction, getDisciplineCatalogTopicsAction, getDisciplineDetailStatsAction } from "@/application/disciplines/discipline-actions"
import { type DisciplineDetailStats } from "@/application/disciplines/discipline-actions"
import { type DisciplinesPageData } from "@/application/disciplines/disciplines.service"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"

export interface DisciplineCardData {
  id: string
  name: string
  topicsStudied: number
  topicsTotal: number
  questionsSolved: number
  color: string
}

// Removido DEFAULT_DISCIPLINES (não deve exibir mock data em produção)

interface EstudeiDisciplinesViewProps {
  initialData?: DisciplinesPageData | null
}

export function EstudeiDisciplinesView({ initialData }: EstudeiDisciplinesViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nameParam = searchParams.get("name")

  const [disciplines, setDisciplines] = useState<DisciplineCardData[]>(() => {
    return initialData?.disciplines || []
  })

  useEffect(() => {
    if (initialData?.disciplines && initialData.disciplines.length > 0) {
      const timer = setTimeout(() => setDisciplines(initialData.disciplines), 0)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [initialData])

  const targetInfo = initialData?.target || {
    name: "Nenhum Concurso Ativo",
    editalName: "N/A",
    role: "N/A",
    observations: "Selecione ou crie um concurso para começar",
  }

  const totalStats = initialData?.totalStats || {
    studyTimeFormatted: "0h00min",
    totalQuestions: 0,
    accuracyPercentage: 0,
  }

  const [viewingDiscipline, setViewingDiscipline] = useState<DisciplineCardData | null>(null)
  const [catalogTopics, setCatalogTopics] = useState<CatalogTopicWithSubTopics[]>([])
  const [disciplineStats, setDisciplineStats] = useState<DisciplineDetailStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingDisc, setEditingDisc] = useState<DisciplineCardData | null>(null)
  const [disciplineNameInput, setDisciplineNameInput] = useState("")

  const openDiscipline = async (disc: DisciplineCardData) => {
    setViewingDiscipline(disc)
    setCatalogTopics([])
    setDisciplineStats(null)
    const [catalogRes, statsRes] = await Promise.all([
      getDisciplineCatalogTopicsAction(disc.name),
      getDisciplineDetailStatsAction(disc.name),
    ])
    if (catalogRes.success) setCatalogTopics(catalogRes.topics)
    if (statsRes.success) setDisciplineStats(statsRes.data)
  }

  useEffect(() => {
    if (!nameParam) return
    const found = disciplines.find((d) => d.name.toLowerCase() === nameParam.toLowerCase())
    const discipline = found ?? {
      id: "custom",
      name: nameParam,
      topicsStudied: 0,
      topicsTotal: 0,
      questionsSolved: 0,
      color: "#fef08a",
    }
    let cancelled = false
    ;(async () => {
      const [catalogRes, statsRes] = await Promise.all([
        getDisciplineCatalogTopicsAction(discipline.name),
        getDisciplineDetailStatsAction(discipline.name),
      ])
      if (cancelled) return
      setViewingDiscipline(discipline)
      setCatalogTopics(catalogRes.success ? catalogRes.topics : [])
      setDisciplineStats(statsRes.success ? statsRes.data : null)
    })()
    return () => {
      cancelled = true
    }
  }, [nameParam, disciplines])

  const handleAddOrEditDiscipline = async (e: React.FormEvent) => {
    e.preventDefault()
    const nameClean = disciplineNameInput.trim()
    if (!nameClean) return

    if (editingDisc) {
      setDisciplines(
        disciplines.map((d) => (d.id === editingDisc.id ? { ...d, name: nameClean } : d))
      )
      toast.success("Disciplina atualizada com sucesso!")
    } else {
      const newDisc: DisciplineCardData = {
        id: `disc-${Date.now()}`,
        name: nameClean,
        topicsStudied: 0,
        topicsTotal: 0,
        questionsSolved: 0,
        color: "#fef08a",
      }
      setDisciplines([...disciplines, newDisc])
      
      const res = await addUserDisciplineAction(nameClean)
      if (res.success) {
        toast.success("Nova disciplina adicionada no banco de dados!")
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao salvar disciplina.")
      }
    }

    setDisciplineNameInput("")
    setEditingDisc(null)
    setIsModalOpen(false)
  }

  const handleRemoveDiscipline = async (id: string, name: string) => {
    setDisciplines(disciplines.filter((d) => d.id !== id))
    toast.success(`Disciplina "${name}" removida!`)
    if (!id.startsWith("d") && !id.startsWith("disc-")) {
      await removeUserDisciplineAction(id)
      router.refresh()
    }
  }

  const handleOpenEdit = (disc: DisciplineCardData) => {
    setEditingDisc(disc)
    setIsEditModalOpen(true)
  }

  const totalTopics = disciplines.reduce((acc, d) => acc + d.topicsTotal, 0)

  if (viewingDiscipline) {
    const targetRole = initialData?.target ? targetInfo.role : undefined
    return (
      <EstudeiDisciplineDetailView
        disciplineName={viewingDiscipline.name}
        topicsTotal={viewingDiscipline.topicsTotal}
        catalogTopics={catalogTopics}
        stats={disciplineStats}
        {...(targetRole ? { targetName: targetRole } : {})}
        onBack={() => {
          setCatalogTopics([])
          setDisciplineStats(null)
          setViewingDiscipline(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Plan Header Card — Paridade 100% com o Estudei */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-slate-900 border flex items-center justify-center text-white shrink-0 shadow-sm">
              <ShieldCheck className="h-10 w-10 text-emerald-400" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-emerald-500 tracking-tight">
                  {targetInfo.name}
                </h2>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <button className="p-1 hover:text-foreground transition-colors" title="Arquivar">
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 hover:text-foreground transition-colors" title="Editar">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 hover:text-rose-500 transition-colors" title="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
                <p><strong className="text-foreground">Editais:</strong> {targetInfo.editalName}</p>
                <p><strong className="text-foreground">Cargos:</strong> {targetInfo.role}</p>
                <p>
                  <strong className="text-foreground">Disciplinas:</strong> {disciplines.length} &nbsp;&nbsp;&nbsp;&nbsp;
                  <strong className="text-foreground">Tópicos:</strong> {totalTopics}
                </p>
                <p><strong className="text-foreground">Observações:</strong> {targetInfo.observations}</p>
              </div>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => {
                setEditingDisc(null)
                setDisciplineNameInput("")
                setIsModalOpen(true)
              }}
              className="w-full sm:w-auto border-emerald-500 text-emerald-600 hover:bg-emerald-500/10 font-bold text-xs px-5 h-9"
            >
              Nova Disciplina
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="space-y-1 mb-4">
            <span className="text-2xl font-black text-foreground">{totalStats.studyTimeFormatted}</span>
            <span className="text-[11px] text-muted-foreground font-semibold block">Horas de Estudo</span>
          </div>

          <div className="w-full grid grid-cols-2 gap-4 border-t pt-3">
            <div>
              <span className="text-lg font-bold text-emerald-500 block">{totalStats.totalQuestions}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Questões</span>
            </div>
            <div className="border-l">
              <span className="text-lg font-bold text-emerald-500 block">{totalStats.accuracyPercentage}%</span>
              <span className="text-[10px] text-muted-foreground font-medium">Desempenho</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grade de Cards de Disciplinas */}
      {disciplines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-xl border border-dashed bg-card/50">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Folder className="h-8 w-8 text-emerald-500/60" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-lg text-foreground">Nenhuma disciplina cadastrada</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Você ainda não adicionou disciplinas ao seu concurso. Clique em &quot;Nova Disciplina&quot; para começar.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingDisc(null)
              setDisciplineNameInput("")
              setIsModalOpen(true)
            }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold gap-2 rounded-xl mt-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar Disciplina
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {disciplines.map((disc) => (
            <div
              key={disc.id}
              className="group rounded-xl border bg-card p-5 shadow-sm transition-all duration-300 relative overflow-hidden h-[130px] flex flex-col justify-between"
            >
              {/* Top Color Line */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5 transition-colors"
                style={{ backgroundColor: disc.color }}
              />

              {/* Conteúdo Normal (Visível por padrão) */}
              <div className="pt-1 transition-opacity duration-200 group-hover:opacity-0">
                <h3 className="font-bold text-sm text-foreground truncate" title={disc.name}>
                  {disc.name}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2 pb-1 transition-opacity duration-200 group-hover:opacity-0">
                <div>
                  <span className="text-xl font-extrabold text-foreground block leading-none">
                    {disc.topicsStudied}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block mt-1 leading-tight">
                    Tópicos Estudados
                  </span>
                </div>

                <div>
                  <span className="text-xl font-extrabold text-foreground block leading-none">
                    {disc.topicsTotal}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block mt-1 leading-tight">
                    Tópicos Totais
                  </span>
                </div>

                <div>
                  <span className="text-xl font-extrabold text-foreground block leading-none">
                    {disc.questionsSolved}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium block mt-1 leading-tight">
                    Questões Resolvidas
                  </span>
                </div>
              </div>

              {/* Overlay de Ações no HOVER — 100% de Paridade com o Estudei */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-around p-4 z-10"
                style={{ backgroundColor: disc.color }}
              >
                {/* Botão 1: Visualizar */}
                <button
                  onClick={() => openDiscipline(disc)}
                  className="flex flex-col items-center gap-1 text-slate-800 hover:scale-110 active:scale-95 transition-all font-bold group/btn"
                  title="Visualizar disciplina"
                >
                  <Folder className="h-6 w-6 stroke-[2.2]" />
                  <span className="text-xs">Visualizar</span>
                </button>

                {/* Botão 2: Editar */}
                <button
                  onClick={() => handleOpenEdit(disc)}
                  className="flex flex-col items-center gap-1 text-slate-800 hover:scale-110 active:scale-95 transition-all font-bold group/btn"
                  title="Editar disciplina"
                >
                  <Edit3 className="h-6 w-6 stroke-[2.2]" />
                  <span className="text-xs">Editar</span>
                </button>

                {/* Botão 3: Remover */}
                <button
                  onClick={() => handleRemoveDiscipline(disc.id, disc.name)}
                  className="flex flex-col items-center gap-1 text-slate-800 hover:scale-110 active:scale-95 hover:text-rose-700 transition-all font-bold group/btn"
                  title="Remover disciplina"
                >
                  <Trash2 className="h-6 w-6 stroke-[2.2]" />
                  <span className="text-xs">Remover</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar / Editar Disciplina */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-emerald-600">
              <Plus className="h-4 w-4" />
              {editingDisc ? "Editar Disciplina" : "Adicionar Nova Disciplina"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddOrEditDiscipline} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Nome da Disciplina *
              </label>
              <Input
                placeholder="Ex: Direito Financeiro, Auditoria..."
                value={disciplineNameInput}
                onChange={(e) => setDisciplineNameInput(e.target.value)}
                autoFocus
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
                Salvar Disciplina
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Disciplina (100% Paridade Estudei com Tópicos, Cor e Reordenação) */}
      <EditDisciplineModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        disciplineName={editingDisc?.name || ""}
        disciplineColor={editingDisc?.color || "#fef08a"}
        onSave={(data) => {
          if (editingDisc) {
            setDisciplines(
              disciplines.map((d) =>
                d.id === editingDisc.id ? { ...d, name: data.name, color: data.color } : d
              )
            )
            toast.success(`Disciplina "${data.name}" atualizada!`)
          }
        }}
        onRemove={() => {
          if (editingDisc) {
            handleRemoveDiscipline(editingDisc.id, editingDisc.name)
          }
        }}
      />
    </div>
  )
}

