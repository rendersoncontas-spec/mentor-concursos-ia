"use client"

import React from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

interface SortableWidgetProps {
  id: string
  colSpan: 1 | 2 | 3
  children: React.ReactNode
}

export function SortableWidget({ id, colSpan, children }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  }

  // Em colunas independentes cada card ocupa 100% da coluna
  // com altura natural — sem linhas compartilhadas.
  // colSpan largo apenas garante largura mínima confortável.
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border border-border bg-card transition-shadow flex flex-col h-auto w-full min-w-0",
        isDragging && "shadow-lg opacity-90 ring-1 ring-primary/40 z-50",
        colSpan >= 2 && "w-full",
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2.5 right-2.5 p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/70 cursor-grab active:cursor-grabbing z-20 transition-all opacity-30 group-hover:opacity-100 focus-within:opacity-100"
        title="Arraste para reorganizar"
        aria-label="Arraste para reorganizar"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      <div className="w-full min-w-0">
        {children}
      </div>
    </div>
  )
}
