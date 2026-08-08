"use client"

import { useState } from "react"
import { Play, Plus, Clock, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"

export function ActiveSessionManager({ 
  items,
  disciplines 
}: { 
  items: StudyPlanItemWithDetails[],
  disciplines: any[] // Lista completa para estudo livre
}) {
  const router = useRouter()
  const [freeStudyModalOpen, setFreeStudyModalOpen] = useState(false)
  const [freeDisciplineId, setFreeDisciplineId] = useState("")

  function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }

  function handleStartPlanSession(item: StudyPlanItemWithDetails) {
    router.push(`/dashboard/study-session?planId=${item.id}`)
  }

  function handleStartFreeSession() {
    if (!freeDisciplineId) return
    router.push(`/dashboard/study-session?disciplineId=${freeDisciplineId}`)
  }

  const totalToday = items.reduce((s, i) => s + i.duration_minutes, 0)

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">{formatMinutes(totalToday)} planejados</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setFreeStudyModalOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Estudo Livre
          </Button>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-4 text-center gap-2 border border-dashed rounded-md">
               <p className="text-sm text-muted-foreground">Nenhuma sessão agendada para hoje.</p>
             </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{idx + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.discipline.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMinutes(item.duration_minutes)} • {item.recommended_sessions} sessão(ões)
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleStartPlanSession(item)}>
                  <Play className="h-3 w-3 mr-1" /> Iniciar
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="mt-auto pt-4">
          <Button asChild variant="ghost" size="sm" className="w-full text-xs gap-1">
            <Link href="/study-plan">
              Ver cronograma completo <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Free Study Modal */}
      <Dialog open={freeStudyModalOpen} onOpenChange={setFreeStudyModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estudo Livre</DialogTitle>
            <DialogDescription>Inicie uma sessão de estudo espontânea que não estava no cronograma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Selecione a Disciplina</Label>
              <Select value={freeDisciplineId} onValueChange={setFreeDisciplineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma disciplina..." />
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreeStudyModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleStartFreeSession} disabled={!freeDisciplineId}>Ir para Sessão Inteligente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
