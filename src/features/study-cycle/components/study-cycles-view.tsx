"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { ArrowLeft, CircleDot, Layers, Plus, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import {
  activateCycleAction,
  deleteCycleAction,
  getCyclesAction,
  pauseCycleAction,
} from "@/application/study-cycle/study-cycle.actions"
import { pickActiveCycleOverview } from "@/application/study-cycle/pick-active-cycle"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
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

/**
 * Fase F (performance): dados já carregados no servidor pela página
 * (`app/(protected)/ciclos/page.tsx`), em paralelo e na mesma renderização.
 * Antes, a tela montava vazia com "Carregando seus ciclos de estudo..." e só
 * então disparava 3 Server Actions — que o Next.js executa em fila, uma por
 * vez, cada uma repetindo a autenticação.
 */
export interface StudyCyclesInitialData {
  cycles: CycleOverview[]
  activeCycle: CycleOverview | null
  disciplines: DisciplineOption[]
  reconcileErrors: string[]
}

function notifyReconcileErrors(reconcileErrors: string[]) {
  if (reconcileErrors.length === 0) return
  const hasMigrationError = reconcileErrors.some(e =>
    e.includes("COLUNAS V2") || e.includes("does not exist")
  )
  if (hasMigrationError) {
    toast.error("Erro ao sincronizar estudos com o ciclo. Execute a migration V2 no painel do Supabase.", {
      duration: 10000,
    })
  } else {
    toast.warning(`Sincronização do ciclo com erros: ${reconcileErrors[0]}`, {
      duration: 8000,
    })
  }
}

export function StudyCyclesView({ initialData }: { initialData?: StudyCyclesInitialData | undefined }) {
  const [cycles, setCycles] = useState<CycleOverview[]>(initialData?.cycles ?? [])
  const [activeCycle, setActiveCycle] = useState<CycleOverview | null>(initialData?.activeCycle ?? null)
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingOverview, setEditingOverview] = useState<CycleOverview | null>(null)
  const [availableDisciplines, setAvailableDisciplines] = useState<DisciplineOption[]>(
    initialData?.disciplines ?? [],
  )
  const [isLoading, setIsLoading] = useState(!initialData)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Fase F.2: quando a página é re-renderizada no servidor (ex.: um estudo
  // salvo nesta aba — a Server Action revalida /ciclos e devolve a página
  // nova), os dados novos chegam aqui como um NOVO `initialData`. Antes eles
  // eram ignorados depois da montagem e a lista ficava com os números antigos.
  // Padrão "valor da renderização anterior" do React (sem efeito).
  const [seenInitialData, setSeenInitialData] = useState(initialData)
  if (initialData && initialData !== seenInitialData) {
    setSeenInitialData(initialData)
    setCycles(initialData.cycles)
    setActiveCycle(initialData.activeCycle)
    setAvailableDisciplines(initialData.disciplines)
  }

  // `withDisciplines`: a lista de disciplinas só muda ao criar/editar um ciclo
  // (que pode cadastrar disciplinas novas). Ativar, pausar, excluir ou pular
  // etapa não a altera — nesses casos ela não é buscada de novo.
  const loadData = useCallback(async (options?: { withDisciplines?: boolean }) => {
    try {
      // Fase F.1: o ciclo ativo sai da própria lista (mesmo critério e mesmos
      // dados de getActiveCycleAction) — uma Server Action a menos na fila e
      // as sessões do ciclo ativo não são lidas duas vezes.
      const [cyclesResult, disciplinesResult] = await Promise.all([
        getCyclesAction(),
        options?.withDisciplines ? getDisciplinesForAutocomplete() : Promise.resolve(null),
      ])
      setCycles(cyclesResult.data)
      setActiveCycle(pickActiveCycleOverview(cyclesResult.data))
      if (disciplinesResult) {
        setAvailableDisciplines(disciplinesResult.allDisciplines || [])
      }
      notifyReconcileErrors(cyclesResult.reconcileErrors)
    } catch (err) {
      console.error("[StudyCyclesView] Erro ao carregar ciclos:", err)
      toast.error("Erro ao carregar ciclos de estudo.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  const reloadWithDisciplines = useCallback(() => loadData({ withDisciplines: true }), [loadData])

  const refreshCycles = useCallback(() => loadData(), [loadData])

  // initialData vale só para a montagem (vem do servidor); mudanças de
  // referência depois disso não devem disparar nova carga.
  const initialDataRef = useRef(initialData)
  useEffect(() => {
    const serverData = initialDataRef.current
    if (serverData) {
      // Os avisos de sincronização que vieram do servidor continuam aparecendo.
      notifyReconcileErrors(serverData.reconcileErrors)
      return
    }
    loadData({ withDisciplines: true })
  }, [loadData])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    loadData({ withDisciplines: true })
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
      <div className="flex flex-col min-h-full">
        <PageHeader
          icon={CircleDot}
          title="Ciclos de estudo"
          description="Suas matérias em uma sequência contínua, sem dias fixos"
        />
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-2">
          <RefreshCcw aria-hidden className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Carregando seus ciclos de estudo…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <PageHeader
        icon={CircleDot}
        title="Ciclos de estudo"
        description="Suas matérias em uma sequência contínua, sem dias fixos"
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Atualizar ciclos"
              aria-label="Atualizar ciclos"
            >
              <RefreshCcw aria-hidden className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus aria-hidden className="h-4 w-4" />
              Criar ciclo
            </Button>
          </>
        }
      />

      <div className="flex-1 page-container py-5 space-y-5">
        {/* VISUALIZAÇÃO: MODO DETALHE DE CICLO SELECIONADO OU MODO GERAL */}
        {selectedCycleId && selectedCycleOverview ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCycleId(null)}
                className="gap-1 -ml-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para todos os ciclos
              </Button>

              {selectedCycleOverview.cycle.status !== "ACTIVE" && (
                <Button
                  size="sm"
                  onClick={() => handleActivate(selectedCycleOverview.cycle.id)}
                >
                  Ativar como ciclo principal
                </Button>
              )}
            </div>

            <ActiveCyclePanel
              overview={selectedCycleOverview}
              onRefresh={refreshCycles}
              onSelectAnotherCycle={() => setSelectedCycleId(null)}
              onEditCycle={() => setEditingOverview(selectedCycleOverview)}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. DESTAQUE DO CICLO ATIVO */}
            {activeCycle && (
              <div>
                <ActiveCyclePanel
                  overview={activeCycle}
                  onRefresh={refreshCycles}
                  onSelectAnotherCycle={cycles.length > 1 ? () => {} : undefined}
                  onEditCycle={() => setEditingOverview(activeCycle)}
                />
              </div>
            )}

            {/* 2. LISTA DE TODOS OS CICLOS */}
            <div className="space-y-2.5">
              <div className="flex items-end justify-between">
                <h3 className="type-h3 text-foreground">
                  {activeCycle ? "Todos os ciclos" : "Meus ciclos de estudo"}
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {cycles.length} {cycles.length === 1 ? "ciclo" : "ciclos"}
                </span>
              </div>

              {cycles.length === 0 ? (
                <Card className="border-dashed">
                  <EmptyState
                    icon={Layers}
                    title="Nenhum ciclo cadastrado"
                    description="Crie um ciclo para organizar suas matérias em uma sequência rotativa, sem prender disciplinas a dias fixos."
                    action={
                      <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
                        <Plus className="h-4 w-4" />
                        Criar primeiro ciclo
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        onComplete={reloadWithDisciplines}
      />

      {/* MODAL DE EDIÇÃO */}
      <EditCycleModal
        open={Boolean(editingOverview)}
        onOpenChange={(open) => {
          if (!open) setEditingOverview(null)
        }}
        overview={editingOverview}
        availableDisciplines={availableDisciplines}
        onComplete={reloadWithDisciplines}
      />

      {/* DIÁLOGO DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-sm w-full p-5 space-y-3 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Excluir ciclo de estudos?</h3>
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
                className="font-semibold text-xs"
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
