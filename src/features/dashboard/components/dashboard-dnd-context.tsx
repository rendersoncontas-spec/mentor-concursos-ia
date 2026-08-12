"use client"

import React, { useSyncExternalStore } from "react"
import type {
  DragEndEvent
} from "@dnd-kit/core";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from "@dnd-kit/sortable"
import { type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"

interface DashboardDndContextProps {
  items: WidgetConfigItem[]
  onReorder: (newItems: WidgetConfigItem[]) => void
  children: React.ReactNode
}

export function DashboardDndContext({ items, onReorder, children }: DashboardDndContextProps) {
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.widget_id === active.id)
      const newIndex = items.findIndex((i) => i.widget_id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = [...items]
        const movedItem = newItems.splice(oldIndex, 1)[0]
        if (movedItem) {
          newItems.splice(newIndex, 0, movedItem)

          // Update position_order
          const updatedItems = newItems.map((item, index) => ({
            ...item,
            position_order: index + 1
          }))
          
          onReorder(updatedItems)
        }
      }
    }
  }

  if (!isMounted) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min w-full">
        {children}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={items.map(i => i.widget_id)} 
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min w-full max-w-none">
          {children}
        </div>
      </SortableContext>
    </DndContext>
  )
}
