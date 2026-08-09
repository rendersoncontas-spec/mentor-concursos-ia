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

  let colSpanClass = "col-span-1"
  if (colSpan === 2) {
    colSpanClass = "col-span-1 md:col-span-2"
  } else if (colSpan === 3) {
    colSpanClass = "col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4"
  }
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-xl border bg-card shadow-xs transition-shadow flex flex-col h-full",
        isDragging && "shadow-xl opacity-80 ring-2 ring-[#2563EB] z-50",
        colSpanClass
      )}
    >
      {/* Drag handle */}
      <div 
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing z-20 transition-colors"
        title="Arraste para reorganizar"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      
      <div className="flex-1 w-full overflow-hidden pr-8">
        {children}
      </div>
    </div>
  )
}
