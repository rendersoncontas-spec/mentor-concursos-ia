"use client"

import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react"
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
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"

interface DashboardDndContextProps {
  items: WidgetConfigItem[]
  onReorder: (newItems: WidgetConfigItem[]) => void
  children: React.ReactNode
}

// Distribui os widgets em N colunas independentes (round-robin pela ordem),
// de modo que cada coluna flui verticalmente sem compartilhar altura de linha.
// Dentro de cada coluna o DnD continua funcionando (lista vertical).
function splitIntoColumns<T>(list: T[], columnCount: number): T[][] {
  const cols: T[][] = Array.from({ length: columnCount }, () => [])
  list.forEach((item, index) => {
    const col = cols[index % columnCount]
    if (col) col.push(item)
  })
  return cols
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

  // Renderiza APENAS o breakpoint ativo — montar as 3 árvores
  // simultaneamente triplicava fetches, listeners e IDs no DnD.
  const [breakpoint, setBreakpoint] = useState<"mobile" | "tablet" | "desktop">("desktop")
  useEffect(() => {
    const mqTablet = window.matchMedia("(min-width: 768px)")
    const mqDesktop = window.matchMedia("(min-width: 1280px)")
    const update = () => {
      if (mqDesktop.matches) setBreakpoint("desktop")
      else if (mqTablet.matches) setBreakpoint("tablet")
      else setBreakpoint("mobile")
    }
    update()
    mqTablet.addEventListener("change", update)
    mqDesktop.addEventListener("change", update)
    return () => {
      mqTablet.removeEventListener("change", update)
      mqDesktop.removeEventListener("change", update)
    }
  }, [])

  const childArray = useMemo(() => React.Children.toArray(children), [children])
  const byId = useMemo(() => {
    const map = new Map<string, React.ReactNode>()
    items.forEach((item, index) => {
      const child = childArray[index]
      if (child) map.set(item.widget_id, child)
    })
    return map
  }, [items, childArray])

  // Colunas por breakpoint (mobile-first, sem scroll horizontal):
  // mobile: 1 coluna · md: 2 colunas · xl: 3 colunas.
  // Cada coluna é um fluxo vertical independente com altura natural.
  const mobileCols = useMemo(() => splitIntoColumns(items, 1), [items])
  const tabletCols = useMemo(() => splitIntoColumns(items, 2), [items])
  const desktopCols = useMemo(() => splitIntoColumns(items, 3), [items])

  const renderColumn = (colItems: WidgetConfigItem[], keyPrefix: string) => (
    <SortableContext
      key={keyPrefix}
      items={colItems.map((i) => i.widget_id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {colItems.map((item) => (
          <React.Fragment key={`${keyPrefix}-${item.widget_id}`}>
            {byId.get(item.widget_id)}
          </React.Fragment>
        ))}
      </div>
    </SortableContext>
  )

  const gridClass =
    "flex w-full max-w-none items-start gap-3"

  const activeCols =
    breakpoint === "mobile" ? mobileCols : breakpoint === "tablet" ? tabletCols : desktopCols
  const activePrefix = breakpoint === "mobile" ? "m" : breakpoint === "tablet" ? "t" : "d"

  const content = (
    <div className={gridClass}>
      {activeCols.map((col, i) => renderColumn(col, `${activePrefix}-${i}`))}
    </div>
  )

  if (!isMounted) {
    return content
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {content}
    </DndContext>
  )
}
