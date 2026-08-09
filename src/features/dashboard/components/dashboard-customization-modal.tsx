"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"
import { WIDGET_REGISTRY } from "./dashboard-widget-catalog"

interface DashboardCustomizationModalProps {
  isOpen: boolean
  onClose: () => void
  layout: WidgetConfigItem[]
  onSave: (newLayout: WidgetConfigItem[]) => void
  onRestoreDefault: () => void
}

export function DashboardCustomizationModal({
  isOpen,
  onClose,
  layout,
  onSave,
  onRestoreDefault,
}: DashboardCustomizationModalProps) {
  const [editedLayout, setEditedLayout] = useState<WidgetConfigItem[]>(layout)

  React.useEffect(() => {
    if (isOpen) {
      setEditedLayout(layout)
    }
  }, [isOpen, layout])

  const handleToggleVisibility = (widgetId: string, visible: boolean) => {
    setEditedLayout((prev) =>
      prev.map((item) => (item.widget_id === widgetId ? { ...item, visible } : item))
    )
  }

  const handleColSpanChange = (widgetId: string, colSpan: 1 | 2 | 3) => {
    setEditedLayout((prev) =>
      prev.map((item) => (item.widget_id === widgetId ? { ...item, col_span: colSpan } : item))
    )
  }

  const handleSave = () => {
    onSave(editedLayout)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Personalizar Home</DialogTitle>
          <DialogDescription>
            Ative ou desative widgets e ajuste o tamanho de cada um para moldar a página de acordo com a sua preferência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          {editedLayout
            .sort((a, b) => a.position_order - b.position_order)
            .map((item) => {
              const widgetInfo = WIDGET_REGISTRY[item.widget_id]
              if (!widgetInfo) return null

              return (
                <div key={item.widget_id} className="flex items-center justify-between p-3 border rounded-xl bg-muted/10">
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-foreground">{widgetInfo.name}</h4>
                    <p className="text-xs text-muted-foreground">{widgetInfo.description}</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Size Selector */}
                    <div className="hidden sm:flex items-center gap-1 bg-muted p-1 rounded-lg">
                      <button
                        onClick={() => handleColSpanChange(item.widget_id, 1)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${item.col_span === 1 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        P
                      </button>
                      <button
                        onClick={() => handleColSpanChange(item.widget_id, 2)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${item.col_span === 2 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleColSpanChange(item.widget_id, 3)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${item.col_span === 3 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        G
                      </button>
                    </div>

                      <input
                        type="checkbox"
                        checked={item.visible}
                        onChange={(e) => handleToggleVisibility(item.widget_id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                      />
                  </div>
                </div>
              )
            })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
          <Button variant="ghost" onClick={() => { onRestoreDefault(); onClose() }} className="text-muted-foreground w-full sm:w-auto">
            Restaurar Padrão
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSave} className="bg-[#2563EB] text-white hover:bg-[#1D4ED8] w-full sm:w-auto">Salvar Alterações</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
