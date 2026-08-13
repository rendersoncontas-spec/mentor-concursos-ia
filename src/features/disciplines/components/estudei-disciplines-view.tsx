"use client"

import { useState, useEffect, useMemo } from "react"
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
  accuracy?: number | null
  area?: string | null
  totalMinutes?: number
}

// Função auxiliar para determinar classificação
function getClassification(
  topicsStudied: number,
  topicsTotal: number,
  questionsSolved: number,
  accuracy: number | null
): "DOMINIO" | "ATENCAO" | "PRIORIDADE" | "SEM_DADOS" {
  if (topicsTotal === 0 && questionsSolved === 0) return "SEM_DADOS"
  const progresso = topicsTotal > 0 ? topicsStudied / topicsTotal : 0
  const acc = accuracy ?? 0
  // Exige amostra mínima de questões para classificar como DOMINIO
  if (questionsSolved >= 5 && progresso >= 0.8 && acc >= 80) return "DOMINIO"
  if (progresso < 0.3 || (questionsSolved >= 3 && acc < 60)) return "PRIORIDADE"
  return "ATENCAO"
}

function StatusBadge({ status }: { status: "DOMINIO" | "ATENCAO" | "PRIORIDADE" | "SEM_DADOS" }) {
  const configs = {
    DOMINIO: { color: "bg-emerald-500", label: "DOMÍNIO" },
    ATENCAO: { color: "bg-amber-500", label: "ATENÇÃO" },
    PRIORIDADE: { color: "bg-rose-500", label: "PRIORIDADE" },
    SEM_DADOS: { color: "bg-slate-400", label: "SEM DADOS" },
  }
  const c = configs[status]
  return <span className={`${c.color} text-white font-black text-[9px] px-2 py-0.5 rounded-full tracking-widest`}>{c.label}</span>
}

function formatHours(min: number): string {
  if (min <= 0) return "0h"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`
}

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

  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"prioridade" | "progresso" | "desempenho" | "tempo" | "nome">("prioridade")
  const [filterStatus, setFilterStatus] = useState<"todas" | "dominio" | "atencao" | "prioridade">("todas")

  // Ordenação e Filtros
  const processedDisciplines = useMemo(() => {
    const enriched = disciplines.map(d => {
      const accuracy = d.accuracy ?? null
      const progress = d.topicsTotal > 0 ? (d.topicsStudied / d.topicsTotal) * 100 : 0
      const classification = getClassification(d.topicsStudied, d.topicsTotal, d.questionsSolved, accuracy)
      return { ...d, progress, classification }
    })

    let list = enriched

    // Buscar
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.area && d.area.toLowerCase().includes(q))
      )
    }

    // Filtrar
    if (filterStatus !== "todas") {
      list = list.filter(d => d.classification.toLowerCase() === filterStatus)
    }

    // Ordenar
    return [...list].sort((a, b) => {
      if (sortBy === "progresso") return b.progress - a.progress
      if (sortBy === "desempenho") {
        const accA = a.accuracy ?? -1
        const accB = b.accuracy ?? -1
        return accB - accA
      }
      if (sortBy === "tempo") return (b.totalMinutes || 0) - (a.totalMinutes || 0)
      if (sortBy === "nome") return a.name.localeCompare(b.name)
      // Padrão: prioridade
      const priorityOrder = { PRIORIDADE: 0, ATENCAO: 1, DOMINIO: 2, SEM_DADOS: 3 }
      return priorityOrder[a.classification] - priorityOrder[b.classification]
    })
  }, [disciplines, searchQuery, sortBy, filterStatus])

  const totalTopics = disciplines.reduce((acc, d) => acc + d.topicsTotal, 0)
  const totalStudied = disciplines.reduce((acc, d) => acc + d.topicsStudied, 0)
  const totalProgress = totalTopics > 0 ? Math.round((totalStudied / totalTopics) * 100) : 0

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
    <div className="space-y-6 pb-12">
      {/* HEADER PROFISSIONAL */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-slate-900/5 dark:bg-slate-100/5 p-6 rounded-3xl border">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-foreground tracking-tight">Disciplinas</h1>
          <p className="text-xs text-muted-foreground font-medium max-w-lg">
            Visão geral do seu progresso por matéria.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Input
              placeholder="Buscar disciplina..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 w-64 text-xs rounded-xl bg-card"
            />
            <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
          <Button
            onClick={() => {
              setEditingDisc(null)
              setDisciplineNameInput("")
              setIsModalOpen(true)
            }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs px-5 h-10 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nova Disciplina
          </Button>
        </div>
      </div>

      {/* CONTEXTO ATUAL (CONCURSO/EDITAL) */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border flex items-center justify-center text-white shrink-0 shadow-sm">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Concurso / Edital Atual
            </span>
            <h2 className="text-xl font-black text-foreground tracking-tight">
              {targetInfo.name}
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Edital Próprio · Cargo: {targetInfo.role}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <button className="p-2 hover:text-foreground transition-colors" title="Arquivar">
            <Archive className="h-4 w-4" />
          </button>
          <button className="p-2 hover:text-foreground transition-colors" title="Editar">
            <Edit className="h-4 w-4" />
          </button>
          <button className="p-2 hover:text-rose-500 transition-colors" title="Excluir">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* RESUMO GERAL */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Tempo de Estudo</span>
          <span className="text-base font-black text-foreground block">{totalStats.studyTimeFormatted}</span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Questões</span>
          <span className="text-base font-black text-[#2563EB] block">{totalStats.totalQuestions}</span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Acerto</span>
          <span className="text-base font-black text-emerald-500 block">{totalStats.accuracyPercentage}%</span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Disciplinas</span>
          <span className="text-base font-black text-foreground block">{disciplines.length}</span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Progresso Edital</span>
          <span className="text-base font-black text-amber-500 block">{totalProgress}%</span>
        </div>
      </div>

      {/* BARRA DE PROGRESSO DA PREPARAÇÃO */}
      <div className="bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
            Progresso da Preparação
          </span>
          <span className="text-xs font-black">{totalStudied} / {totalTopics} tópicos</span>
        </div>
        <div className="w-full h-2 bg-slate-800 dark:bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${totalProgress}%` }} />
        </div>
        <p className="text-xs font-bold opacity-90">{totalProgress}% do conteúdo concluído</p>
      </div>

      {/* FILTROS E BUSCA MOBILE */}
      <div className="relative md:hidden">
        <Input
          placeholder="Buscar disciplina..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10 text-xs rounded-xl bg-card"
        />
        <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(["todas", "dominio", "atencao", "prioridade"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all ${
              filterStatus === s
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="flex-1" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="text-[11px] font-bold uppercase tracking-wider bg-card border rounded-full px-3 py-1.5 h-8"
        >
          <option value="prioridade">Prioridade</option>
          <option value="progresso">Progresso</option>
        </select>
      </div>

      {/* GRADE DE CARDS DE DISCIPLINAS REFORMULADA */}
      {processedDisciplines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-xl border border-dashed bg-card/50">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Folder className="h-8 w-8 text-emerald-500/60" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-lg text-foreground">Nenhuma disciplina encontrada</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Adicione ou ajuste os filtros para visualizar as matérias do seu edital.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {processedDisciplines.map((disc) => (
            <div
              key={disc.id}
              onClick={() => openDiscipline(disc)}
              className="group rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md hover:border-emerald-500/50 cursor-pointer transition-all relative overflow-hidden"
            >
              {/* Top Status Line */}
              <div
                className="absolute top-0 left-0 right-0 h-1 transition-colors"
                style={{ backgroundColor: disc.color }}
              />

              <div className="space-y-4 pt-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-black text-base text-foreground truncate" title={disc.name}>
                    {disc.name}
                  </h3>
                  <StatusBadge status={disc.classification} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="text-foreground">{Math.round(disc.progress)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-foreground transition-all" style={{ width: `${disc.progress}%` }} />
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground text-right">
                    {disc.topicsStudied} / {disc.topicsTotal} tópicos
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                  <div>
                    <span className="text-sm font-black text-foreground block">{disc.questionsSolved}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Questões</span>
                  </div>
                  <div className="border-l pl-3">
                    <span className="text-sm font-black text-foreground block">—</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Desempenho</span>
                  </div>
                </div>
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

