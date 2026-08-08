"use client"

import { useState } from "react"
import { SlidersHorizontal, Save, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface DisciplineWeightConfig {
  id: string
  name: string
  area: string | null
  weight: number // 1 a 5
  difficulty: number // 1 a 5
}

interface DisciplineWeightEditorProps {
  disciplines: DisciplineWeightConfig[]
  totalCycleHours: number
  onSave?: (updated: DisciplineWeightConfig[], totalHours: number) => void
  onCancel?: () => void
}

export function DisciplineWeightEditor({
  disciplines: initialDisciplines,
  totalCycleHours: initialHours,
  onSave,
  onCancel,
}: DisciplineWeightEditorProps) {
  const [disciplines, setDisciplines] = useState<DisciplineWeightConfig[]>(initialDisciplines)
  const [totalHours, setTotalHours] = useState<number>(initialHours || 20)
  const [saved, setSaved] = useState(false)

  const updateWeight = (id: string, weight: number) => {
    setDisciplines((prev) =>
      prev.map((d) => (d.id === id ? { ...d, weight } : d))
    )
  }

  const updateDifficulty = (id: string, difficulty: number) => {
    setDisciplines((prev) =>
      prev.map((d) => (d.id === id ? { ...d, difficulty } : d))
    )
  }

  const handleSave = () => {
    if (onSave) {
      onSave(disciplines, totalHours)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 md:p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Ajuste de Relevância e Dificuldade
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Defina os pesos do edital e a sua dificuldade pessoal para recalcular a carga horária do ciclo.
          </p>
        </div>

        {/* Total hours selector */}
        <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-lg border">
          <span className="text-xs font-semibold text-muted-foreground px-1">
            Horas do Ciclo:
          </span>
          {[10, 15, 20, 25, 30].map((h) => (
            <button
              key={h}
              onClick={() => setTotalHours(h)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                totalHours === h
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Disciplines table */}
      <div className="space-y-3">
        {disciplines.map((d) => (
          <div
            key={d.id}
            className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-lg border bg-muted/10 hover:bg-muted/20 transition-colors"
          >
            {/* Discipline name */}
            <div className="space-y-0.5">
              <span className="font-semibold text-sm text-foreground">{d.name}</span>
              {d.area && (
                <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">
                  {d.area}
                </p>
              )}
            </div>

            {/* Selectors */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Peso no edital */}
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground block">
                  Peso no Edital
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((w) => (
                    <button
                      key={w}
                      onClick={() => updateWeight(d.id, w)}
                      className={`w-7 h-7 rounded text-xs font-bold border transition-all ${
                        d.weight === w
                          ? "bg-primary text-white border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dificuldade pessoal */}
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground block">
                  Minha Dificuldade
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((diff) => (
                    <button
                      key={diff}
                      onClick={() => updateDifficulty(d.id, diff)}
                      className={`w-7 h-7 rounded text-xs font-bold border transition-all ${
                        d.difficulty === diff
                          ? "bg-amber-500 text-white border-amber-500"
                          : "border-border text-muted-foreground hover:border-amber-500/50"
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between border-t pt-4">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}

        <Button
          size="sm"
          onClick={handleSave}
          className="gap-2 font-semibold ml-auto"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" />
              <span>Salvo!</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Recalcular Ciclo</span>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
