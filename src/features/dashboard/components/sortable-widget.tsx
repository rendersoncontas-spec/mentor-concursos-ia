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
        "group relative rounded-xl border bg-card shadow-xs transition-shadow flex flex-col h-full",
        isDragging && "shadow-xl opacity-80 ring-2 ring-[#2563EB] z-50",
        colSpanClass
      )}
    >
      {/* Drag handle */}
      <div 
        {...attributes}
        {...listeners}
        className="absolute top-2.5 right-2.5 p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/70 cursor-grab active:cursor-grabbing z-20 transition-all opacity-30 group-hover:opacity-100 focus-within:opacity-100"
        title="Arraste para reorganizar"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      
      <div className="flex-1 w-full h-full min-w-0">
        {children}
      </div>
    </div>
  )
}
