"use client"

import { useEffect, useMemo, useState } from "react"

import { useRouter, useSearchParams } from "next/navigation"

import { Folder, Plus, Search, ShieldCheck, SquarePen, Target, Trash2, Trophy } from "lucide-react"
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
import { EmptyState } from "@/components/ui/empty-state"
import { Metric, MetricStrip } from "@/components/ui/metric"
import { Progress } from "@/components/ui/progress"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import { DisciplineDetailView } from "@/features/disciplines/components/discipline-detail-view"
import { EditDisciplineModal } from "@/features/disciplines/components/edit-discipline-modal"

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
  // Fase E — situação como ponto + texto (antes: pílula sólida colorida em
  // caixa alta, que competia com o nome da disciplina).
  const configs = {
    DOMINIO: { color: "bg-success", label: "Domínio" },
    ATENCAO: { color: "bg-warning", label: "Atenção" },
    PRIORIDADE: { color: "bg-destructive", label: "Prioridade" },
    SEM_DADOS: { color: "bg-muted-foreground/40", label: "Sem dados" },
  }
  const c = configs[status]
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${c.color}`} />
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
    <div className="space-y-5 pb-8">
      {/* BARRA DE CONTEXTO + AÇÕES — Fase E: o título está no cabeçalho fixo;
          aqui ficam o concurso atual, a busca e a ação principal numa só linha
          (antes: banner com H1 repetido + cartão só para o concurso). */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 truncate text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">{targetInfo.name}</span>
            <span> · Cargo: {targetInfo.role}</span>
          </p>
        </div>

        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative flex-1 md:w-64 md:flex-none">
            <Search aria-hidden className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Buscar disciplina"
              placeholder="Buscar disciplina…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
          <Button
            onClick={() => {
              setEditingDisc(null)
              setDisciplineNameInput("")
              setIsModalOpen(true)
            }}
            className="shrink-0"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Nova disciplina
          </Button>
        </div>
      </div>

      {/* RESUMO GERAL — uma faixa de métricas; o progresso do edital fica na
          própria faixa (antes era um terceiro bloco separado). */}
      <MetricStrip>
        <Metric label="Tempo de estudo" value={totalStats.studyTimeFormatted} />
        <Metric label="Questões" value={totalStats.totalQuestions} />
        <Metric label="Acerto" value={`${totalStats.accuracyPercentage}%`} />
        <Metric label="Disciplinas" value={disciplines.length} />
        <div className="col-span-2 min-w-0 space-y-1.5 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Progresso do edital</span>
            <span className="text-lg font-semibold tabular-nums text-foreground">{totalProgress}%</span>
          </div>
          <Progress value={totalProgress} aria-label="Progresso do edital" />
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {totalStudied} de {totalTopics} tópicos
          </p>
        </div>
      </MetricStrip>

      {/* PAINÉIS DE PRIORIDADE E DESEMPENHO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Target aria-hidden className="h-4 w-4 text-muted-foreground" />
              Próxima prioridade
            </span>
            {nextPriority && <StatusBadge status={nextPriority.classification} />}
          </div>
          {nextPriority ? (
            <div className="space-y-3">
              <h3 className="type-h2 text-foreground truncate" title={nextPriority.name}>
                {nextPriority.name}
              </h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="text-foreground">{Math.round(nextPriority.progress)}%</span>
                </div>
                <Progress value={nextPriority.progress} aria-label={`Progresso em ${nextPriority.name}`} />
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {nextPriority.topicsStudied} / {nextPriority.topicsTotal} tópicos ·{" "}
                  {nextPriority.questionsSolved} questões ·{" "}
                  {formatHours(nextPriority.totalMinutes || 0)} estudados
                </p>
              </div>
              <Button onClick={() => openDiscipline(nextPriority)} variant="outline" size="sm">
                Ver disciplina
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Nenhuma disciplina com prioridade no momento. Bons estudos!
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Trophy aria-hidden className="h-4 w-4 text-muted-foreground" />
            Melhor desempenho
          </span>
          {bestDiscipline ? (
            <div className="space-y-3">
              <h3
                className="type-h2 text-foreground truncate"
                title={bestDiscipline.name}
              >
                {bestDiscipline.name}
              </h3>
              <div className="flex items-end gap-6">
                <div>
                  <span className="text-2xl font-semibold tabular-nums text-foreground block leading-none">
                    {bestDiscipline.accuracy ?? 0}%
                  </span>
                  <span className="type-label">
                    Acerto
                  </span>
                </div>
                <div>
                  <span className="text-2xl font-semibold tabular-nums text-foreground block leading-none">
                    {bestDiscipline.questionsSolved}
                  </span>
                  <span className="type-label">
                    Questões
                  </span>
                </div>
              </div>
              <Button onClick={() => openDiscipline(bestDiscipline)} variant="outline" size="sm">
                Ver disciplina
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Responda pelo menos 5 questões em uma disciplina para revelar seu melhor desempenho.
            </p>
          )}
        </div>
      </div>

      {/* FILTROS — Fase E: segmented control + ordenação (a busca foi para a
          barra do topo e vale para todas as larguras de tela). */}
      <section aria-labelledby="lista-disciplinas" className="space-y-2.5">
        {/* Mobile: título + ordenação na 1ª linha e o filtro ocupando a 2ª
            linha inteira; desktop: tudo numa linha. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="lista-disciplinas" className="type-h3 mr-auto text-foreground">
            Todas as disciplinas
          </h2>
          <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
            <div
              role="group"
              aria-label="Filtrar por situação"
              className="no-scrollbar flex w-full items-center overflow-x-auto rounded-md bg-muted p-0.5 sm:inline-flex sm:w-auto"
            >
              {(
                [
                  ["todas", "Todas"],
                  ["dominio", "Domínio"],
                  ["atencao", "Atenção"],
                  ["prioridade", "Prioridade"],
                  ["sem_dados", "Sem dados"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilterStatus(value)}
                  aria-pressed={filterStatus === value}
                  className={`flex-1 whitespace-nowrap rounded-[5px] px-2 py-1 text-xs sm:flex-none sm:px-2.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    filterStatus === value
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Ordenar disciplinas"
              className="h-8 shrink-0 rounded-md border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="prioridade">Prioridade</option>
              <option value="progresso">Progresso</option>
              <option value="desempenho">Desempenho</option>
              <option value="tempo">Tempo</option>
              <option value="nome">Nome</option>
            </select>
        </div>

        {/* LISTA — tabela no desktop, linhas compactas no mobile (antes: grade
            de cards com ações que só apareciam no hover). */}
        {processedDisciplines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border">
            <EmptyState
              icon={Folder}
              title="Nenhuma disciplina encontrada"
              description="Adicione uma disciplina ou ajuste os filtros para ver as matérias do seu edital."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="type-label hidden grid-cols-[minmax(0,2.2fr)_110px_minmax(140px,1.2fr)_90px_90px_80px_120px_76px] gap-4 border-b border-border bg-muted/40 px-4 py-2 lg:grid">
              <span>Disciplina</span>
              <span>Situação</span>
              <span>Progresso</span>
              <span className="text-right">Questões</span>
              <span className="text-right">Acerto</span>
              <span className="text-right">Tempo</span>
              <span>Área</span>
              <span className="text-right">Ações</span>
            </div>
            <ul className="divide-y divide-border">
              {processedDisciplines.map((disc) => (
                <li
                  key={disc.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/30 lg:grid-cols-[minmax(0,2.2fr)_110px_minmax(140px,1.2fr)_90px_90px_80px_120px_76px]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: disc.color }}
                    />
                    <button
                      type="button"
                      onClick={() => openDiscipline(disc)}
                      className="min-w-0 truncate text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      title={disc.name}
                    >
                      {disc.name}
                    </button>
                  </div>
                  <div className="justify-self-end lg:justify-self-start">
                    <StatusBadge status={disc.classification} />
                  </div>
                  <div className="col-span-2 flex min-w-0 items-center gap-2.5 lg:col-span-1">
                    <Progress value={disc.progress} className="flex-1" aria-label={`Progresso em ${disc.name}`} />
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground lg:w-auto">
                      {Math.round(disc.progress)}% · {disc.topicsStudied}/{disc.topicsTotal}
                    </span>
                  </div>
                  <p className="min-w-0 text-xs tabular-nums text-muted-foreground lg:hidden">
                    {disc.questionsSolved} questões ·{" "}
                    {disc.accuracy !== null && disc.accuracy !== undefined ? `${disc.accuracy}% de acerto` : "sem acerto"} ·{" "}
                    {formatHours(disc.totalMinutes || 0)}
                  </p>
                  <span className="hidden text-right text-sm tabular-nums text-foreground lg:block">
                    {disc.questionsSolved}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-foreground lg:block">
                    {disc.accuracy !== null && disc.accuracy !== undefined ? `${disc.accuracy}%` : "—"}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-foreground lg:block">
                    {formatHours(disc.totalMinutes || 0)}
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground lg:block">
                    {disc.area || "Geral"}
                  </span>
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleOpenEdit(disc)}
                      title="Editar disciplina"
                      aria-label={`Editar ${disc.name}`}
                    >
                      <SquarePen aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveDiscipline(disc.id, disc.name)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Remover disciplina"
                      aria-label={`Remover ${disc.name}`}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Modal Criar / Editar Disciplina */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
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
