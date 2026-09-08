"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
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

export interface DisciplineOption {
  id: string
  name: string
  area: string | null
  color_hex?: string | null
}

interface Props {
  disciplines: DisciplineOption[]
  onSelect: (disc: DisciplineOption) => void
  onAddCustom?: (name: string) => void
  excludedIds?: string[]
  placeholder?: string
  buttonLabel?: string
  buttonClassName?: string
}

export function DisciplineSelector({
  disciplines,
  onSelect,
  onAddCustom,
  excludedIds = [],
  placeholder = "Buscar disciplina...",
  buttonLabel = "Buscar disciplina...",
  buttonClassName,
}: Props) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filtered = React.useMemo(() => {
    const term = search.toLowerCase().trim()
    return disciplines.filter((d) => {
      if (excludedIds.includes(d.id)) return false
      if (!term) return true
      return (
        d.name.toLowerCase().includes(term) ||
        (d.area ? d.area.toLowerCase().includes(term) : false)
      )
    })
  }, [disciplines, search, excludedIds])

  const handleAddCustom = () => {
    if (!onAddCustom) return
    onAddCustom(search.trim())
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "w-full justify-between font-normal h-9 text-xs sm:text-sm rounded-xl border-border/70 hover:border-primary/40",
            buttonClassName,
          )}
        >
          <span className="truncate text-muted-foreground">{buttonLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(380px,calc(100vw-2rem))] p-0 z-[200] rounded-xl shadow-xl border-border/80"
        align="start"
        sideOffset={4}
        onWheel={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command className="w-full" shouldFilter={false}>
          <CommandInput
            placeholder="Buscar disciplina..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[250px] overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
            {filtered.length === 0 ? (
              <CommandEmpty className="py-4 px-3 text-xs">
                {onAddCustom && search.trim() ? (
                  <button
                    type="button"
                    onClick={handleAddCustom}
                    className="w-full text-left flex items-center gap-2 font-bold text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Não encontrou? Adicionar &ldquo;{search.trim()}&rdquo;
                    </span>
                  </button>
                ) : (
                  "Nenhuma disciplina encontrada."
                )}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={d.name}
                    onSelect={() => {
                      onSelect(d)
                      setOpen(false)
                      setSearch("")
                    }}
                    className="cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: d.color_hex || "#2563EB" }}
                      />
                      <span className="truncate text-xs font-medium">{d.name}</span>
                    </div>
                    {d.area && (
                      <span className="text-[10px] text-muted-foreground ml-auto pl-2 truncate max-w-[110px] shrink-0">
                        {d.area}
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
