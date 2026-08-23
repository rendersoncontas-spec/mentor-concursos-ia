"use client"

import { useCallback, useEffect, useState } from "react"

import { Plus, RefreshCcw, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import {
  getActiveCycleAction,
  getCyclesAction,
  activateCycleAction,
  pauseCycleAction,
  deleteCycleAction,
  concludeCycleAction,
} from "@/application/study-cycle/study-cycle.actions"
import { getDisciplinesForAutocomplete } from "@/application/study-session/get-disciplines.action"
import { ActiveCyclePanel } from "@/features/study-cycle/components/active-cycle-panel"
import { CycleCard } from "@/features/study-cycle/components/cycle-card"
import { CreateCycleModal } from "@/features/study-cycle/components/create-cycle-modal"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { StudyCycleWithItems } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"

type ViewMode = "list" | "detail"

interface DisciplineOption {
  id: string
  name: string
  area: string | null
  color_hex?: string | null
  fromPlan?: boolean
}

export function StudyCyclesView() {
  const [cycles, setCycles] = useState<StudyCycleWithItems[]>([])
  const [activeCycle, setActiveCycle] = useState<StudyCycleWithItems | null>(null)
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
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

  const handleActivate = useCallback(async (id: string) => {
    const result = await activateCycleAction(id)
    if (result.success) {
      toast.success("Ciclo ativado!")
      loadData()
    } else {
      toast.error(result.error || "Erro ao ativar ciclo.")
    }
  }, [loadData])

  const handlePause = useCallback(async (id: string) => {
    const result = await pauseCycleAction(id)
    if (result.success) {
      toast.success("Ciclo pausado.")
      loadData()
    }
  }, [loadData])

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await deleteCycleAction(id)
      if (result.success) {
        toast.success("Ciclo excluído.")
        if (selectedCycleId === id) setSelectedCycleId(null)
        loadData()
      } else {
        toast.error(result.error || "Erro ao excluir.")
      }
      setDeleteConfirmId(null)
    },
    [selectedCycleId, loadData]
  )

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) || null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full bg-background/50">
      <div className="flex-1 p-3.5 sm:p-5 space-y-3 sm:space-y-3.5 w-full pb-20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-[28px] font-black text-foreground tracking-tight leading-none">
              Ciclos de Estudo
            </h1>
            <p className="text-xs sm:text-[13px] font-semibold text-muted-foreground mt-1">
              Organize suas matérias em uma sequência contínua de estudos.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCcw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-3 h-8 shrink-0"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Criar ciclo
            </Button>
          </div>
        </div>

        {selectedCycleId && selectedCycle ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCycleId(null)}
                className="text-xs"
              >
                ← Voltar
              </Button>
              {selectedCycle.status === "CONCLUDED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleActivate(selectedCycle.id)}
                  className="text-xs text-emerald-600"
                >
                  Reativar
                </Button>
              )}
            </div>

            {activeCycle && activeCycle.id === selectedCycle.id && (
              <ActiveCyclePanel cycle={activeCycle} onRefresh={handleRefresh} />
            )}

            {!activeCycle || activeCycle.id !== selectedCycle.id ? (
              <Card className="p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{selectedCycle.name}</h2>
                    {(selectedCycle.contest_name || selectedCycle.edital_name) && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {selectedCycle.contest_name}
                        {selectedCycle.edital_name && ` — ${selectedCycle.edital_name}`}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      selectedCycle.status === "ACTIVE" &&
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                      selectedCycle.status === "PAUSED" &&
                        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                      selectedCycle.status === "CONCLUDED" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    )}
                  >
                    {selectedCycle.status === "ACTIVE"
                      ? "Ativo"
                      : selectedCycle.status === "PAUSED"
                      ? "Pausado"
                      : "Concluído"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-bold text-foreground">
                      {(() => {
                        const totalP = selectedCycle.items.reduce((s, i) => s + i.planned_minutes, 0)
                        const totalC = selectedCycle.items.reduce((s, i) => s + i.completed_minutes, 0)
                        return totalP > 0 ? Math.round((totalC / totalP) * 100) : 0
                      })()}
                      %
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                      style={{
                        width: `${(() => {
                          const totalP = selectedCycle.items.reduce((s, i) => s + i.planned_minutes, 0)
                          const totalC = selectedCycle.items.reduce((s, i) => s + i.completed_minutes, 0)
                          return totalP > 0 ? Math.round((totalC / totalP) * 100) : 0
                        })()}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Sequência ({selectedCycle.items.length} matérias)
                  </p>
                  <div className="space-y-1">
                    {selectedCycle.items.map((item, index) => (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                          item.status === "CONCLUIDO" && "bg-emerald-50 dark:bg-emerald-900/10",
                          item.status === "EM_ANDAMENTO" && "bg-[#2563EB]/5 border border-[#2563EB]/10",
                          item.status === "PENDENTE" && "bg-muted/30",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0",
                            item.status === "CONCLUIDO" && "bg-emerald-500 text-white",
                            item.status === "EM_ANDAMENTO" && "bg-[#2563EB] text-white",
                            item.status === "PENDENTE" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.status === "CONCLUIDO" ? "✓" : index + 1}
                        </span>
                        <span className="flex-1 truncate">{item.discipline?.name || "Matéria"}</span>
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            item.priority === "ALTA" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            item.priority === "MEDIA" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            item.priority === "BAIXA" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          )}
                        >
                          {item.priority}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {item.completed_minutes}/{item.planned_minutes}min
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {selectedCycle.status !== "ACTIVE" && selectedCycle.status !== "CONCLUDED" && (
                    <Button
                      onClick={() => handleActivate(selectedCycle.id)}
                      className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-8"
                    >
                      Iniciar ciclo
                    </Button>
                  )}
                  {selectedCycle.status === "ACTIVE" && (
                    <Button
                      onClick={() => handlePause(selectedCycle.id)}
                      variant="outline"
                      className="flex-1 text-xs h-8"
                    >
                      Pausar ciclo
                    </Button>
                  )}
                  {selectedCycle.status === "ACTIVE" && (
                    <Button
                      onClick={() => {
                        concludeCycleAction(selectedCycle.id).then(() => {
                          toast.success("Ciclo concluído!")
                          loadData()
                        })
                      }}
                      variant="outline"
                      className="text-xs h-8"
                    >
                      Concluir
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmId(selectedCycle.id)}
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        ) : (
          <>
            {activeCycle && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                  Ciclo Atual
                </p>
                <ActiveCyclePanel cycle={activeCycle} onRefresh={handleRefresh} />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                {activeCycle ? "Outros Ciclos" : "Meus Ciclos"}
              </p>
              {cycles.length === 0 ? (
                <Card className="p-8 text-center space-y-3">
                  <div className="text-4xl">🎯</div>
                  <h3 className="text-base font-bold text-foreground">Nenhum ciclo criado</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Crie seu primeiro ciclo de estudo para organizar as matérias em uma sequência contínua.
                  </p>
                  <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Criar primeiro ciclo
                  </Button>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cycles
                    .filter((c) => c.id !== activeCycle?.id)
                    .map((cycle) => (
                      <CycleCard
                        key={cycle.id}
                        cycle={cycle}
                        onActivate={handleActivate}
                        onPause={handlePause}
                        onDelete={(id) => setDeleteConfirmId(id)}
                        onSelect={setSelectedCycleId}
                      />
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <CreateCycleModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        availableDisciplines={availableDisciplines}
        onComplete={loadData}
      />

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground">Excluir ciclo?</h3>
            <p className="text-sm text-muted-foreground">
              Esta ação não pode ser desfeita. O ciclo e todos os seus dados serão excluídos
              permanentemente.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                Excluir
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
