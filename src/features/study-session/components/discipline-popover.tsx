"use client"

import { useMemo, useState } from "react"

import { Check, ChevronsUpDown, Play, Search } from "lucide-react"

import {
  type DisciplineOption,
  type DisciplineSuggestion,
} from "@/application/study-session/get-disciplines.action"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { disciplineColorHex } from "@/domain/disciplines/discipline-colors"
import { useDisciplineData } from "@/features/study-session/hooks/use-discipline-data"
import { cn } from "@/lib/utils"

function difficultyLabel(difficulty?: string): string {
  const upper = (difficulty || "").toUpperCase().trim()
  if (upper === "FACIL" || upper === "FÁCIL" || upper === "EASY" || upper === "BAIXA")
    return "Fácil"
  if (upper === "DIFICIL" || upper === "DIFÍCIL" || upper === "HARD" || upper === "ALTA")
    return "Difícil"
  return "Média"
}

interface DisciplinePopoverProps {
  value: string
  onSelect: (name: string, id: string) => void
  placeholder?: string
  className?: string
}

export function DisciplinePopover({
  value,
  onSelect,
  placeholder = "Escolha uma matéria",
  className,
}: DisciplinePopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const { data: disciplineData, loading } = useDisciplineData()

  const planDisciplines = disciplineData?.planDisciplines ?? []
  const allDisciplines = disciplineData?.allDisciplines ?? []
  const suggestions = disciplineData?.suggestions ?? []
  const suggestionsSource = disciplineData?.suggestionsSource ?? "NONE"

  const suggestionsHeading = useMemo(() => {
    switch (suggestionsSource) {
      case "PLAN":
        return "Sugestões do Planejamento"
      case "CYCLE":
        return "Sugestões do Ciclo"
      case "HISTORY":
        return "Baseado nas últimas atividades"
      default:
        return "Sugestões"
    }
  }, [suggestionsSource])

  const planIds = useMemo(() => new Set(planDisciplines.map((d) => d.id)), [planDisciplines])

  const otherDisciplines = useMemo(
    () =>
      allDisciplines
        .filter((d) => !planIds.has(d.id))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    [allDisciplines, planIds],
  )

  const selectedId = useMemo(() => {
    if (!value) return null
    return (
      allDisciplines.find((d) => d.name === value)?.id ||
      planDisciplines.find((d) => d.name === value)?.id ||
      null
    )
  }, [allDisciplines, planDisciplines, value])

  const selectedColor = useMemo(() => {
    if (!selectedId) return "#2563EB"
    const disc =
      allDisciplines.find((d) => d.id === selectedId) ||
      planDisciplines.find((d) => d.id === selectedId)
    return disciplineColorHex(selectedId, disc?.color_hex)
  }, [selectedId, allDisciplines, planDisciplines])

  const handleSelect = (disc: DisciplineOption) => {
    onSelect(disc.name, disc.id)
    setOpen(false)
    setSearch("")
  }

  const handleSelectSuggestion = (sug: DisciplineSuggestion) => {
    onSelect(sug.name, sug.id)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center justify-between gap-2 h-9 px-3 rounded-lg border text-sm font-bold transition-colors",
            "bg-background hover:bg-accent/50",
            value ? "border-primary/30 text-foreground" : "border-border text-muted-foreground",
            className,
          )}
        >
          {value ? (
            <span className="flex items-center gap-2 min-w-0 truncate">
              {selectedId && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedColor }}
                />
              )}
              <span className="truncate">{value}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Search className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              <span className="truncate">{placeholder}</span>
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(400px,calc(100vw-2rem))] p-0 z-[200] rounded-xl shadow-xl border-border/80"
        align="start"
        sideOffset={4}
      >
        <Command className="w-full max-h-[350px]" shouldFilter={true}>
          <CommandInput
            placeholder="Buscar disciplina..."
            value={search}
            onValueChange={(next) => {
              setSearch(next)
              const found = allDisciplines.find((d) => d.name.toLowerCase() === next.toLowerCase())
              if (found) {
                onSelect(found.name, found.id)
              }
            }}
          />
          <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain">
            <CommandEmpty>Nenhuma disciplina encontrada.</CommandEmpty>

            <CommandGroup heading={suggestionsHeading}>
              {suggestions.length > 0 ? (
                suggestions.map((sug) => (
                  <CommandItem
                    key={`${sug.from}-${sug.id}`}
                    value={sug.name}
                    onSelect={() => handleSelectSuggestion(sug)}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0 text-primary",
                          value === sug.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: disciplineColorHex(sug.id, sug.color_hex),
                        }}
                      />
                      <span className="truncate font-medium flex items-center gap-1 min-w-0">
                        {sug.metadata?.isCurrentInCycle && (
                          <Play className="h-3 w-3 fill-current text-primary shrink-0" />
                        )}
                        <span className="truncate">{sug.name}</span>
                      </span>
                      {sug.from === "CYCLE" && sug.metadata?.plannedMinutes != null && (
                        <span
                          className={cn(
                            "text-[10px] shrink-0 tabular-nums font-bold",
                            sug.metadata.isCurrentInCycle
                              ? "text-primary"
                              : "text-muted-foreground",
                          )}
                        >
                          {sug.metadata.studiedMinutes ?? 0}/{sug.metadata.plannedMinutes} min
                        </span>
                      )}
                    </div>
                    {sug.metadata?.difficulty && (
                      <span className="text-[10px] text-muted-foreground ml-auto pl-2 shrink-0">
                        {difficultyLabel(sug.metadata.difficulty)}
                      </span>
                    )}
                  </CommandItem>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                  Nenhuma sugestão disponível.
                </div>
              )}
            </CommandGroup>

            {otherDisciplines.length > 0 && (
              <CommandGroup heading="Todas as Disciplinas">
                {otherDisciplines.map((disc) => (
                  <CommandItem
                    key={`all-${disc.id}`}
                    value={disc.name}
                    onSelect={() => handleSelect(disc)}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0 text-primary",
                          value === disc.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: disciplineColorHex(disc.id, disc.color_hex),
                        }}
                      />
                      <span className="truncate">{disc.name}</span>
                    </div>
                    {disc.area && (
                      <span className="text-[10px] text-muted-foreground ml-auto pl-2 truncate max-w-[120px]">
                        {disc.area}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
