"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  createCustomTopicAction,
  getTopicSuggestionsAction,
} from "@/application/topic-catalog/topic-catalog.actions"
import { type TopicSuggestion } from "@/domain/topic-catalog/topic-catalog.types"
import {
  searchTopicCandidates,
  type TopicSuggestionCandidate,
  type TopicSource,
} from "../lib/topic-search"

export interface TopicCommit {
  name: string
  source: TopicSource
}

interface TopicAutocompleteProps {
  value: string
  onChange: (value: string) => void
  disciplineId?: string | null | undefined
  placeholder?: string
  autoFocus?: boolean
  showToasts?: boolean
  onCommit?: (commit: TopicCommit) => void
  onEnterFallback?: () => void
  onEscapeFallback?: () => void
  className?: string
}

export function TopicAutocomplete({
  value,
  onChange,
  disciplineId,
  placeholder,
  autoFocus,
  showToasts = true,
  onCommit,
  onEnterFallback,
  onEscapeFallback,
  className,
}: TopicAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedDisciplineId, setLoadedDisciplineId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const loadSuggestions = useCallback(async (discId: string) => {
    setLoading(true)
    try {
      const res = await getTopicSuggestionsAction(discId)
      setSuggestions(res.success ? res.topics : [])
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega tópicos 1x por disciplina (filtro local)
  useEffect(() => {
    if (!disciplineId) return
    if (loadedDisciplineId === disciplineId) return

    const timeoutId = window.setTimeout(() => {
      setLoadedDisciplineId(disciplineId)
      setSuggestions([])
      setOpen(false)
      void loadSuggestions(disciplineId)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [disciplineId, loadedDisciplineId, loadSuggestions])

  const { candidates, exactMatchExists } = useMemo(
    () => searchTopicCandidates(value, suggestions),
    [value, suggestions]
  )

  const createRowVisible = !!value.trim() && !exactMatchExists && !!disciplineId
  const totalRows = candidates.length + (createRowVisible ? 1 : 0)
  const showDropdown = open && (loading || totalRows > 0)

  const commitCandidate = (candidate: TopicSuggestionCandidate) => {
    onChange(candidate.label)
    setOpen(false)
    onCommit?.({ name: candidate.label, source: candidate.source })
  }

  const handleCreate = async () => {
    if (!disciplineId) return
    const res = await createCustomTopicAction(disciplineId, value)
    if (!res.success || !res.topic) {
      if (showToasts) toast.error(res.error || "Erro ao criar tópico.")
      return
    }
    onChange(res.topic.name)
    const created = res.topic
    setSuggestions((prev) =>
      prev.some((t) => t.id === created.id) ? prev : [created, ...prev]
    )
    setOpen(false)
    if (showToasts) toast.success("Tópico criado com sucesso.")
    onCommit?.({
      name: res.topic.name,
      source: res.existed ? "catalog" : "custom",
    })
  }

  const handlePick = (index: number) => {
    if (index < 0 || index >= totalRows) return
    if (index < candidates.length) {
      const candidate = candidates[index]
      if (!candidate) return
      commitCandidate(candidate)
    } else if (createRowVisible) {
      void handleCreate()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setHighlightIndex(0)
      } else {
        setHighlightIndex((prev) => (prev + 1 >= totalRows ? 0 : prev + 1))
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (open) {
        setHighlightIndex((prev) => (prev - 1 < 0 ? Math.max(totalRows - 1, 0) : prev - 1))
      }
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        handlePick(highlightIndex)
      } else {
        onEnterFallback?.()
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault()
        setOpen(false)
      } else {
        onEscapeFallback?.()
      }
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value)
          setHighlightIndex(0)
          setOpen(true)
        }}
        onFocus={() => {
          setHighlightIndex(0)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[200] bg-popover border rounded-md shadow-lg overflow-hidden">
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando tópicos...
            </div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto py-1">
              <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {value.trim() ? "SUGESTÕES" : "TÓPICOS SUGERIDOS"}
              </p>
              {candidates.map((candidate, index) => (
                <button
                  key={candidate.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePick(index)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm transition-colors",
                    index === highlightIndex ? "bg-accent text-accent-foreground" : "text-popover-foreground"
                  )}
                >
                  {candidate.isSubTopic ? (
                    <span className="flex flex-col">
                      <span>{candidate.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Subtópico de {candidate.parentName}
                      </span>
                    </span>
                  ) : (
                    candidate.label
                  )}
                </button>
              ))}
              {createRowVisible && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleCreate()}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary font-medium transition-colors border-t mt-1",
                    highlightIndex >= candidates.length && "bg-accent"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Criar &quot;{value.trim()}&quot;
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
