"use client"

import { useState } from "react"
import {
  Plus,
  ShieldCheck,
  Calendar,
  ArrowLeft,
  Archive,
  Edit,
  Trash2,
  Folder,
  Edit3,
  HelpCircle,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { EstudeiDisciplineDetailView } from "@/features/disciplines/components/estudei-discipline-detail-view"
import { EditDisciplineModal } from "@/features/disciplines/components/edit-discipline-modal"

export interface StudyPlanSummary {
  id: string
  title: string
  cargosCount: number
  disciplinesCount: number
  topicsCount: number
  dateCreated: string
  editalName: string
  color: string
}

export interface DisciplineCardData {
  id: string
  name: string
  topicsStudied: number
  topicsTotal: number
  questionsSolved: number
  color: string
}

const DEFAULT_PLANS: StudyPlanSummary[] = [
  {
    id: "plan-analista",
    title: "Analista Tributário",
    cargosCount: 1,
    disciplinesCount: 14,
    topicsCount: 275,
    dateCreated: "06/08/2026",
    editalName: "Receita Federal",
    color: "#2563EB",
  },
]

const DEFAULT_DISCIPLINES: DisciplineCardData[] = [
  { id: "d1", name: "Administração Geral", topicsStudied: 1, topicsTotal: 34, questionsSolved: 0, color: "#fef08a" },
  { id: "d2", name: "Administração Pública", topicsStudied: 0, topicsTotal: 28, questionsSolved: 0, color: "#e0f2fe" },
  { id: "d3", name: "Contabilidade Geral", topicsStudied: 0, topicsTotal: 21, questionsSolved: 0, color: "#f3e8ff" },
  { id: "d4", name: "Direito Administrativo", topicsStudied: 0, topicsTotal: 20, questionsSolved: 0, color: "#ffedd5" },
  { id: "d5", name: "Direito Constitucional", topicsStudied: 0, topicsTotal: 23, questionsSolved: 0, color: "#dbeafe" },
  { id: "d6", name: "Direito Previdenciário", topicsStudied: 0, topicsTotal: 14, questionsSolved: 0, color: "#dcfce7" },
  { id: "d7", name: "Direito Tributário", topicsStudied: 0, topicsTotal: 25, questionsSolved: 0, color: "#ede9fe" },
  { id: "d8", name: "Estatística", topicsStudied: 0, topicsTotal: 18, questionsSolved: 0, color: "#fce7f3" },
  { id: "d9", name: "Fluência em Dados", topicsStudied: 0, topicsTotal: 16, questionsSolved: 0, color: "#dbeafe" },
]

export function EstudeiPlanosView() {
  const router = useRouter()
  const [activePlans, setActivePlans] = useState<StudyPlanSummary[]>(DEFAULT_PLANS)
  const [archivedPlans, setArchivedPlans] = useState<StudyPlanSummary[]>([])
  const [selectedPlan, setSelectedPlan] = useState<StudyPlanSummary | null>(null)
  const [disciplines, setDisciplines] = useState<DisciplineCardData[]>(DEFAULT_DISCIPLINES)
  const [viewingDiscipline, setViewingDiscipline] = useState<DisciplineCardData | null>(null)

  // Modal Arquivar Plano (Sua Foto 2)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [planToArchive, setPlanToArchive] = useState<StudyPlanSummary | null>(null)

  // Modais de Criação / Edição
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false)
  const [isNewDiscModalOpen, setIsNewDiscModalOpen] = useState(false)

  // Form State
  const [newPlanTitle, setNewPlanTitle] = useState("")
  const [newPlanEdital, setNewPlanEdital] = useState("")
  const [discNameInput, setDiscNameInput] = useState("")

  const handleOpenArchiveModal = (plan: StudyPlanSummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setPlanToArchive(plan)
    setIsArchiveModalOpen(true)
  }

  const handleConfirmArchive = () => {
    if (!planToArchive) return
    setActivePlans(activePlans.filter((p) => p.id !== planToArchive.id))
    setArchivedPlans([...archivedPlans, planToArchive])
    if (selectedPlan?.id === planToArchive.id) {
      setSelectedPlan(null)
    }
    toast.success(`Plano "${planToArchive.title}" arquivado com sucesso!`)
    setIsArchiveModalOpen(false)
    setPlanToArchive(null)
  }

  const handleUnarchivePlan = (plan: StudyPlanSummary) => {
    setArchivedPlans(archivedPlans.filter((p) => p.id !== plan.id))
    setActivePlans([...activePlans, plan])
    toast.success(`Plano "${plan.title}" desarquivado!`)
  }

  const handleCreateNewPlan = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlanTitle.trim()) return

    const newPlan: StudyPlanSummary = {
      id: `plan-${Date.now()}`,
      title: newPlanTitle.trim(),
      cargosCount: 1,
      disciplinesCount: 0,
      topicsCount: 0,
      dateCreated: new Date().toLocaleDateString("pt-BR"),
      editalName: newPlanEdital.trim() || "Geral",
      color: "#2563EB",
    }

    setActivePlans([...activePlans, newPlan])
    toast.success("Novo plano criado!")
    setNewPlanTitle("")
    setNewPlanEdital("")
    setIsNewPlanModalOpen(false)
  }

  const handleCreateDiscipline = (e: React.FormEvent) => {
    e.preventDefault()
    if (!discNameInput.trim()) return

    const newDisc: DisciplineCardData = {
      id: `disc-${Date.now()}`,
      name: discNameInput.trim(),
      topicsStudied: 0,
      topicsTotal: 15,
      questionsSolved: 0,
      color: "#fef08a",
    }
    setDisciplines([...disciplines, newDisc])
    toast.success("Nova disciplina adicionada ao plano!")
    setDiscNameInput("")
    setIsNewDiscModalOpen(false)
  }

  const totalTopics = disciplines.reduce((acc, d) => acc + d.topicsTotal, 0)

  if (viewingDiscipline) {
    return (
      <EstudeiDisciplineDetailView
        disciplineName={viewingDiscipline.name}
        topicsTotal={viewingDiscipline.topicsTotal}
        onBack={() => setViewingDiscipline(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* VISTA 1: Lista de Planos (Ativos + Arquivados - Imagem 3 100% Estudei) */}
      {!selectedPlan ? (
        <div className="space-y-8">
          <h1 className="text-2xl font-black text-foreground">Planos</h1>

          {/* ESTADO DE PLANOS ATIVOS */}
          {activePlans.length === 0 ? (
            /* Card Estado Vazio Sem Planos Ativos (Sua Foto 3 100% Estudei) */
            <div className="rounded-2xl border bg-card p-10 shadow-xs flex flex-col md:flex-row items-center justify-between gap-8 my-4">
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                  <div className="w-24 h-28 bg-muted/40 border-2 border-muted rounded-xl transform -rotate-6 flex flex-col p-3" />
                  <div className="w-24 h-28 bg-card border-2 border-[#2563EB] rounded-xl shadow-md absolute transform rotate-6 flex flex-col p-3" />
                </div>

                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl font-extrabold text-foreground">
                    Ops, parece que você ainda não tem um plano ativo
                  </h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    O plano serve para você agrupar disciplinas e tópicos, vamos criar um?
                  </p>
                </div>
              </div>

              <Button
                onClick={() => setIsNewPlanModalOpen(true)}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs shrink-0"
              >
                Vamos lá!
              </Button>
            </div>
          ) : (
            /* Grid de Cards dos Planos Ativos */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card Criar Novo Plano */}
              <div
                onClick={() => setIsNewPlanModalOpen(true)}
                className="rounded-2xl border border-muted bg-card p-6 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-5 group"
              >
                <div className="w-16 h-16 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Plus className="h-8 w-8 stroke-[2.5]" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-foreground">Criar Novo Plano</h3>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                    Crie um novo plano para adicionar disciplinas a partir ou não de um edital.
                  </p>
                </div>
              </div>

              {/* Cards dos Planos Existentes */}
              {activePlans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className="rounded-2xl border bg-card p-6 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4 group relative"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs border group-hover:scale-105 transition-transform">
                      <ShieldCheck className="h-9 w-9 text-[#2563EB]" />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-base text-[#2563EB] truncate" title={plan.title}>
                          {plan.title}
                        </h3>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
                        <p>Cargos: {plan.cargosCount}</p>
                        <p>Disciplinas: {disciplines.length}</p>
                        <p>Tópicos: {totalTopics}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between h-full space-y-4">
                    {/* Botões de Ação do Card: Arquivar, Editar, Excluir (Foto 1) */}
                    <div className="flex items-center gap-1.5 text-muted-foreground/60">
                      <button
                        type="button"
                        onClick={(e) => handleOpenArchiveModal(plan, e)}
                        className="p-1 hover:text-foreground transition-colors"
                        title="Arquivar"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toast.info("Editar plano")
                        }}
                        className="p-1 hover:text-foreground transition-colors"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-[#2563EB]" />
                      <span>{plan.dateCreated}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SEÇÃO PLANOS ARQUIVADOS (Sua Foto 3 100% Estudei) */}
          {archivedPlans.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                PLANOS ARQUIVADOS
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {archivedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-2xl border bg-card p-5 shadow-xs flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 border">
                        <ShieldCheck className="h-8 w-8 text-[#2563EB]" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <h3 className="font-extrabold text-sm text-foreground truncate">{plan.title}</h3>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>Cargos: {plan.cargosCount}</p>
                          <p>Disciplinas: {disciplines.length}</p>
                          <p>Tópicos: {totalTopics}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full space-y-3">
                      <button
                        type="button"
                        onClick={() => handleUnarchivePlan(plan)}
                        className="p-1 text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                        title="Desarquivar Plano"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>

                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-[#2563EB]" />
                        <span>{plan.dateCreated}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VISTA 2: Detalhes do Plano Selecionado */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedPlan(null)}
              className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-[#2563EB] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar para Todos os Planos</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-slate-900 border flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ShieldCheck className="h-10 w-10 text-[#2563EB]" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-[#2563EB] tracking-tight">
                      {selectedPlan.title}
                    </h2>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <button
                        onClick={() => handleOpenArchiveModal(selectedPlan)}
                        className="p-1 hover:text-foreground transition-colors"
                        title="Arquivar"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button className="p-1 hover:text-foreground transition-colors" title="Editar">
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
                    <p><strong className="text-foreground">Editais:</strong> {selectedPlan.editalName}</p>
                    <p><strong className="text-foreground">Cargos:</strong> {selectedPlan.title}</p>
                    <p>
                      <strong className="text-foreground">Disciplinas:</strong> {disciplines.length} &nbsp;&nbsp;&nbsp;&nbsp;
                      <strong className="text-foreground">Tópicos:</strong> {totalTopics}
                    </p>
                    <p><strong className="text-foreground">Observações:</strong> Sem informações extras</p>
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => setIsNewDiscModalOpen(true)}
                  className="w-full sm:w-auto border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-5 h-9"
                >
                  Nova Disciplina
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="space-y-1 mb-4">
                <span className="text-2xl font-black text-foreground">0h00min</span>
                <span className="text-[11px] text-muted-foreground font-semibold block">Horas de Estudo</span>
              </div>

              <div className="w-full grid grid-cols-2 gap-4 border-t pt-3">
                <div>
                  <span className="text-lg font-bold text-[#2563EB] block">0</span>
                  <span className="text-[10px] text-muted-foreground font-medium">Questões</span>
                </div>
                <div className="border-l">
                  <span className="text-lg font-bold text-[#2563EB] block">0%</span>
                  <span className="text-[10px] text-muted-foreground font-medium">Desempenho</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cards das Disciplinas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {disciplines.map((disc) => (
              <div
                key={disc.id}
                onClick={() => setViewingDiscipline(disc)}
                className="rounded-2xl border bg-card p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: disc.color }} />
                    <h3 className="font-extrabold text-sm text-foreground truncate">{disc.name}</h3>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center border-t pt-3">
                  <div>
                    <span className="text-sm font-black text-foreground block">{disc.topicsStudied}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold block">Tópicos Estudados</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-foreground block">{disc.topicsTotal}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold block">Tópicos Totais</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-foreground block">{disc.questionsSolved}</span>
                    <span className="text-[9px] text-muted-foreground font-semibold block">Questões Resolvidas</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Arquivar Plano? (Sua Foto 2 100% Estudei) */}
      <Dialog open={isArchiveModalOpen} onOpenChange={setIsArchiveModalOpen}>
        <DialogContent className="sm:max-w-md p-6 rounded-2xl text-center space-y-6">
          {/* Ícone Grande do Ponto de Interrogação Em Verde-Água (Foto 2) */}
          <div className="flex justify-center pt-2">
            <div className="w-20 h-20 rounded-full bg-[#dbeafe] text-[#2563EB] flex items-center justify-center text-4xl font-black shadow-xs">
              ?
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-foreground">Arquivar Plano?</h2>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Tem certeza que deseja arquivar o plano &apos;{planToArchive?.title}&apos;? Todas as informações do plano poderão ser visualizadas, mas você não poderá adicionar ou editar conteúdos até o plano ser desarquivado.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsArchiveModalOpen(false)}
              className="border-muted-foreground/40 text-foreground font-bold text-xs px-8 h-10 rounded-xl"
            >
              Cancelar
            </Button>

            <Button
              onClick={handleConfirmArchive}
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs px-8 h-10 rounded-xl shadow-xs"
            >
              Sim
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Modal Criar Novo Plano */}
      <Dialog open={isNewPlanModalOpen} onOpenChange={setIsNewPlanModalOpen}>
        <DialogContent className="sm:max-w-lg p-6 rounded-2xl">
          <form onSubmit={handleCreateNewPlan} className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-foreground tracking-tight">Criar Novo Plano</h2>
              <p className="text-xs text-muted-foreground font-semibold">
                Preencha os dados do plano de estudos para seu concurso:
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  NOME DO PLANO*
                </label>
                <input
                  type="text"
                  placeholder="Ex: Auditar Fiscal da Receita Federal"
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  required
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                  EDITAL / CARGO
                </label>
                <input
                  type="text"
                  placeholder="Ex: Receita Federal - Analista Tributário"
                  value={newPlanEdital}
                  onChange={(e) => setNewPlanEdital(e.target.value)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground pb-1 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewPlanModalOpen(false)}
                className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-6 h-9 rounded-xl"
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 h-9 rounded-xl transition-all shadow-xs"
              >
                Criar Plano
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

