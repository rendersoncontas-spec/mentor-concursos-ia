"use client"

import { useEffect, useMemo, useState } from "react"

import { useRouter, useSearchParams } from "next/navigation"

import { Edit, Folder, Plus, ShieldCheck, Target, Trash2, Trophy } from "lucide-react"
import { toast } from "sonner"

import {
  addUserDisciplineAction,
  getDisciplineCatalogTopicsAction,
  getDisciplineDetailStatsAction,
  removeUserDisciplineAction,
} from "@/application/disciplines/discipline-actions"
import { type DisciplineDetailStats } from "@/application/disciplines/discipline-actions"
import { type DisciplinesPageData } from "@/application/disciplines/disciplines.service"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import { EditDisciplineModal } from "@/features/disciplines/components/edit-discipline-modal"
import { DisciplineDetailView } from "@/features/disciplines/components/estudei-discipline-detail-view"

export interface DisciplineCardData {
  id: string
  disciplineId?: string
  name: string
  topicsStudied: number
  topicsTotal: number
  questionsSolved: number
  color: string
  colorHex?: string | null
  accuracy?: number | null
  area?: string | null
  totalMinutes?: number
  status?: string
}

// Função auxiliar para determinar classificação
function getClassification(
  topicsStudied: number,
  topicsTotal: number,
  questionsSolved: number,
  accuracy: number | null,
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
  return (
    <span
      className={`${c.color} text-white font-black text-[9px] px-2 py-0.5 rounded-full tracking-widest`}
    >
      {c.label}
    </span>
  )
}

function formatHours(min: number): string {
  if (min <= 0) return "0h"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`
}

interface DisciplinesViewProps {
  initialData?: DisciplinesPageData | null
}

export function DisciplinesView({ initialData }: DisciplinesViewProps) {
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
    disciplinesCount: 0,
    topicsTotal: 0,
    topicsConcluded: 0,
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
        disciplines.map((d) => (d.id === editingDisc.id ? { ...d, name: nameClean } : d)),
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
  const [sortBy, setSortBy] = useState<
    "prioridade" | "progresso" | "desempenho" | "tempo" | "nome"
  >("prioridade")
  const [filterStatus, setFilterStatus] = useState<
    "todas" | "dominio" | "atencao" | "prioridade" | "sem_dados"
  >("todas")

  // Ordenação e Filtros
  const enriched = useMemo(() => {
    return disciplines.map((d) => {
      const accuracy = d.accuracy ?? null
      const progress = d.topicsTotal > 0 ? (d.topicsStudied / d.topicsTotal) * 100 : 0
      const classification = getClassification(
        d.topicsStudied,
        d.topicsTotal,
        d.questionsSolved,
        accuracy,
      )
      return { ...d, progress, classification }
    })
  }, [disciplines])

  const processedDisciplines = useMemo(() => {
    let list = enriched

    // Buscar
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || (d.area && d.area.toLowerCase().includes(q)),
      )
    }

    // Filtrar
    if (filterStatus !== "todas") {
      list = list.filter((d) => d.classification.toLowerCase() === filterStatus)
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
  }, [enriched, searchQuery, sortBy, filterStatus])

  // PRÓXIMA PRIORIDADE: primeira com classificação PRIORIDADE, senão ATENCAO,
  // senão a de menor progresso. Amostra mínima de questões é regra do getClassification.
  const nextPriority = useMemo(() => {
    const sorted = [...enriched].sort((a, b) => {
      const priorityOrder = { PRIORIDADE: 0, ATENCAO: 1, DOMINIO: 2, SEM_DADOS: 3 }
      if (priorityOrder[a.classification] !== priorityOrder[b.classification]) {
        return priorityOrder[a.classification] - priorityOrder[b.classification]
      }
      return a.progress - b.progress
    })
    return sorted[0] || null
  }, [enriched])

  // MELHOR DESEMPENHO: maior acerto entre disciplinas com amostra mínima de 5 questões
  const bestDiscipline = useMemo(() => {
    const candidates = enriched.filter(
      (d) => d.questionsSolved >= 5 && d.accuracy !== null && d.accuracy !== undefined,
    )
    if (candidates.length === 0) return null
    return [...candidates].sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0] || null
  }, [enriched])

  const totalTopics = disciplines.reduce((acc, d) => acc + d.topicsTotal, 0)
  const totalStudied = disciplines.reduce((acc, d) => acc + d.topicsStudied, 0)
  const totalProgress = totalTopics > 0 ? Math.round((totalStudied / totalTopics) * 100) : 0

  if (viewingDiscipline) {
    const targetRole = initialData?.target ? targetInfo.role : undefined
    return (
      <DisciplineDetailView
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/5 dark:bg-slate-100/5 p-4 sm:p-5 rounded-2xl border">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-black text-foreground tracking-tight">Disciplinas</h1>
          <p className="text-xs text-muted-foreground font-medium max-w-lg">
            Visão geral do seu progresso por matéria.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative hidden md:block">
            <Input
              placeholder="Buscar disciplina..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 w-64 text-xs rounded-xl bg-card"
            />
            <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
          <Button
            onClick={() => {
              setEditingDisc(null)
              setDisciplineNameInput("")
              setIsModalOpen(true)
            }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs px-4 h-9 rounded-xl shadow-md shadow-emerald-500/20 flex items-center gap-2 w-full md:w-auto justify-center"
          >
            <Plus className="h-4 w-4" />
            Nova Disciplina
          </Button>
        </div>
      </div>

      {/* CONTEXTO ATUAL (CONCURSO/EDITAL) */}
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border flex items-center justify-center text-white shrink-0 shadow-xs">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Concurso / Edital Atual
            </span>
            <h2 className="text-lg font-black text-foreground tracking-tight truncate">
              {targetInfo.name}
            </h2>
            <p className="text-xs text-muted-foreground font-medium truncate">
              Edital Próprio · Cargo: {targetInfo.role}
            </p>
          </div>
        </div>
      </div>

      {/* RESUMO GERAL */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Tempo de Estudo
          </span>
          <span className="text-base font-black text-foreground block">
            {totalStats.studyTimeFormatted}
          </span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Questões
          </span>
          <span className="text-base font-black text-[#2563EB] block">
            {totalStats.totalQuestions}
          </span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Acerto
          </span>
          <span className="text-base font-black text-emerald-500 block">
            {totalStats.accuracyPercentage}%
          </span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Disciplinas
          </span>
          <span className="text-base font-black text-foreground block">{disciplines.length}</span>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Progresso Edital
          </span>
          <span className="text-base font-black text-amber-500 block">{totalProgress}%</span>
        </div>
      </div>

      {/* BARRA DE PROGRESSO DA PREPARAÇÃO */}
      <div className="bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
            Progresso da Preparação
          </span>
          <span className="text-xs font-black">
            {totalStudied} / {totalTopics} tópicos
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 dark:bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        <p className="text-xs font-bold opacity-90">{totalProgress}% do conteúdo concluído</p>
      </div>

      {/* PAINÉIS DE PRIORIDADE E DESEMPENHO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-rose-500" />
              Próxima Prioridade
            </span>
            {nextPriority && <StatusBadge status={nextPriority.classification} />}
          </div>
          {nextPriority ? (
            <div className="space-y-3">
              <h3 className="font-black text-lg text-foreground truncate" title={nextPriority.name}>
                {nextPriority.name}
              </h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="text-foreground">{Math.round(nextPriority.progress)}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 transition-all"
                    style={{ width: `${nextPriority.progress}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-muted-foreground">
                  {nextPriority.topicsStudied} / {nextPriority.topicsTotal} tópicos ·{" "}
                  {nextPriority.questionsSolved} questões ·{" "}
                  {formatHours(nextPriority.totalMinutes || 0)} estudados
                </p>
              </div>
              <Button
                onClick={() => openDiscipline(nextPriority)}
                variant="outline"
                className="w-full h-9 text-xs font-bold rounded-xl"
              >
                Ver Disciplina
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-medium">
              Nenhuma disciplina com prioridade no momento. Bons estudos!
            </p>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Melhor Desempenho
          </span>
          {bestDiscipline ? (
            <div className="space-y-3">
              <h3
                className="font-black text-lg text-foreground truncate"
                title={bestDiscipline.name}
              >
                {bestDiscipline.name}
              </h3>
              <div className="flex items-end gap-6">
                <div>
                  <span className="text-3xl font-black text-emerald-500 block leading-none">
                    {bestDiscipline.accuracy ?? 0}%
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    Acerto
                  </span>
                </div>
                <div>
                  <span className="text-3xl font-black text-foreground block leading-none">
                    {bestDiscipline.questionsSolved}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    Questões
                  </span>
                </div>
              </div>
              <Button
                onClick={() => openDiscipline(bestDiscipline)}
                variant="outline"
                className="w-full h-9 text-xs font-bold rounded-xl"
              >
                Ver Disciplina
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-medium">
              Responda pelo menos 5 questões em uma disciplina para revelar seu melhor desempenho.
            </p>
          )}
        </div>
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
        {(
          [
            ["todas", "Todas"],
            ["dominio", "Domínio"],
            ["atencao", "Atenção"],
            ["prioridade", "Prioridade"],
            ["sem_dados", "Sem Dados"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilterStatus(value)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all ${
              filterStatus === value
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
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
          <option value="desempenho">Desempenho</option>
          <option value="tempo">Tempo</option>
          <option value="nome">Nome</option>
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
                    <div
                      className="h-full bg-foreground transition-all"
                      style={{ width: `${disc.progress}%` }}
                    />
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground text-right">
                    {disc.topicsStudied} / {disc.topicsTotal} tópicos
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                  <div>
                    <span className="text-sm font-black text-foreground block">
                      {disc.questionsSolved}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      Questões
                    </span>
                  </div>
                  <div className="border-l pl-3">
                    <span className="text-sm font-black text-foreground block">
                      {disc.accuracy !== null && disc.accuracy !== undefined
                        ? `${disc.accuracy}%`
                        : "—"}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      Desempenho
                    </span>
                  </div>
                  <div className="border-l pl-3">
                    <span className="text-sm font-black text-foreground block">
                      {formatHours(disc.totalMinutes || 0)}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      Tempo
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase truncate">
                    {disc.area || "Geral"}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenEdit(disc)
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar disciplina"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveDiscipline(disc.id, disc.name)
                      }}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                      title="Remover disciplina"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
              <Button
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
              >
                Salvar Disciplina
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Disciplina */}
      <EditDisciplineModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        disciplineName={editingDisc?.name || ""}
        disciplineColor={editingDisc?.color || "#fef08a"}
        disciplineId={editingDisc?.disciplineId ?? null}
        storedColorHex={editingDisc?.colorHex ?? null}
        onSave={(data) => {
          if (editingDisc) {
            setDisciplines(
              disciplines.map((d) =>
                d.id === editingDisc.id ? { ...d, name: data.name, color: data.color } : d,
              ),
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

export { DisciplinesView as EstudeiDisciplinesView }
