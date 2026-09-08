"use client"

import { useCallback, useEffect, useState } from "react"

import { ArrowLeft, Layers, Plus, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import {
  activateCycleAction,
  deleteCycleAction,
  getActiveCycleAction,
  getCyclesAction,
  pauseCycleAction,
} from "@/application/study-cycle/study-cycle.actions"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"
import { ActiveCyclePanel } from "@/features/study-cycle/components/active-cycle-panel"
import { CreateCycleModal } from "@/features/study-cycle/components/create-cycle-modal"
import { CycleCard } from "@/features/study-cycle/components/cycle-card"
import { EditCycleModal } from "@/features/study-cycle/components/edit-cycle-modal"
import { cn } from "@/lib/utils"

interface DisciplineOption {
  id: string
  name: string
  area: string | null
}

export function StudyCyclesView() {
  const [cycles, setCycles] = useState<CycleOverview[]>([])
  const [activeCycle, setActiveCycle] = useState<CycleOverview | null>(null)
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingOverview, setEditingOverview] = useState<CycleOverview | null>(null)
  const [availableDisciplines, setAvailableDisciplines] = useState<DisciplineOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [cyclesData, activeData, disciplinesResult] = await Promise.all([
        getCyclesAction(),
        getActiveCycleAction(),
        getDisciplinesForAutocomplete(),
      ])
      setCycles(cyclesData)
      setActiveCycle(activeData)
      setAvailableDisciplines(disciplinesResult?.allDisciplines || [])
    } catch (err) {
      console.error("[StudyCyclesView] Erro ao carregar ciclos:", err)
      toast.error("Erro ao carregar ciclos de estudo.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    loadData()
  }, [loadData])

  const handleActivate = useCallback(
    async (id: string) => {
      const result = await activateCycleAction(id)
      if (result.success) {
        toast.success("Ciclo de estudos ativado com sucesso!")
        loadData()
      } else {
        toast.error(result.error || "Erro ao ativar ciclo.")
      }
    },
    [loadData]
  )

  const handlePause = useCallback(
    async (id: string) => {
      const result = await pauseCycleAction(id)
      if (result.success) {
        toast.success("Ciclo pausado.")
        loadData()
      } else {
        toast.error(result.error || "Erro ao pausar ciclo.")
      }
    },
    [loadData]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await deleteCycleAction(id)
      if (result.success) {
        toast.success("Ciclo excluído.")
        if (selectedCycleId === id) setSelectedCycleId(null)
        loadData()
      } else {
        toast.error(result.error || "Erro ao excluir ciclo.")
      }
      setDeleteConfirmId(null)
    },
    [selectedCycleId, loadData]
  )

  const selectedCycleOverview = cycles.find((c) => c.cycle.id === selectedCycleId) || null

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <RefreshCcw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Carregando seus ciclos de estudo...
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="flex-1 p-4 sm:p-6 md:p-8 space-y-8 max-w-6xl mx-auto w-full pb-28">
        {/* CABEÇALHO REQUISITADO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-5 w-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Ciclos de Estudo
              </h1>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Organize suas matérias em uma sequência contínua de estudos.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-10 w-10 shrink-0"
              title="Atualizar ciclos"
            >
              <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>

            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs h-10 px-4 shadow-sm gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Criar ciclo
            </Button>
          </div>
        </div>

        {/* VISUALIZAÇÃO: MODO DETALHE DE CICLO SELECIONADO OU MODO GERAL */}
        {selectedCycleId && selectedCycleOverview ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCycleId(null)}
                className="text-xs font-bold gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para todos os ciclos
              </Button>

              {selectedCycleOverview.cycle.status !== "ACTIVE" && (
                <Button
                  size="sm"
                  onClick={() => handleActivate(selectedCycleOverview.cycle.id)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black"
                >
                  Ativar este ciclo como principal
                </Button>
              )}
            </div>

            <ActiveCyclePanel
              overview={selectedCycleOverview}
              onRefresh={loadData}
              onSelectAnotherCycle={() => setSelectedCycleId(null)}
              onEditCycle={() => setEditingOverview(selectedCycleOverview)}
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* 1. DESTAQUE DO CICLO ATIVO */}
            {activeCycle && (
              <div className="space-y-3">
                <ActiveCyclePanel
                  overview={activeCycle}
                  onRefresh={loadData}
                  onSelectAnotherCycle={cycles.length > 1 ? () => {} : undefined}
                  onEditCycle={() => setEditingOverview(activeCycle)}
                />
              </div>
            )}

            {/* 2. LISTA DE TODOS OS CICLOS */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
                  {activeCycle ? "Todos os Ciclos Cadastrados" : "Meus Ciclos de Estudo"}
                </h3>
                <span className="text-xs font-bold text-muted-foreground">
                  {cycles.length} {cycles.length === 1 ? "ciclo" : "ciclos"}
                </span>
              </div>

              {cycles.length === 0 ? (
                <Card className="p-12 text-center space-y-4 border-2 border-dashed">
                  <div className="text-5xl">🎯</div>
                  <div className="space-y-1.5 max-w-md mx-auto">
                    <h3 className="text-lg font-black text-foreground">
                      Nenhum ciclo cadastrado ainda
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Crie seu primeiro ciclo de estudos para organizar suas matérias em uma
                      sequência rotativa contínua, sem se preocupar em prender disciplinas a dias fixos.
                    </p>
                  </div>
                  <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-primary text-primary-foreground font-black text-xs gap-1.5 shadow-md"
                  >
                    <Plus className="h-4 w-4" />
                    Criar primeiro ciclo
                  </Button>
                </Card>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {cycles.map((overview) => (
                    <CycleCard
                      key={overview.cycle.id}
                      overview={overview}
                      onActivate={handleActivate}
                      onPause={handlePause}
                      onDelete={(id) => setDeleteConfirmId(id)}
                      onSelect={(id) => setSelectedCycleId(id)}
                      onEdit={(ov) => setEditingOverview(ov)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO */}
      <CreateCycleModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        availableDisciplines={availableDisciplines}
        onComplete={loadData}
      />

      {/* MODAL DE EDIÇÃO */}
      <EditCycleModal
        open={Boolean(editingOverview)}
        onOpenChange={(open) => {
          if (!open) setEditingOverview(null)
        }}
        overview={editingOverview}
        availableDisciplines={availableDisciplines}
        onComplete={loadData}
      />

      {/* DIÁLOGO DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <Card className="max-w-sm w-full p-6 space-y-4 border shadow-2xl">
            <h3 className="text-base font-black text-foreground">Excluir ciclo de estudos?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Esta ação removerá a fila de matérias deste ciclo. O histórico de sessões já estudadas
              permanecerá preservado no seu relatório geral de horas e estatísticas.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deleteConfirmId)}
                className="font-black text-xs"
              >
                Excluir ciclo
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
