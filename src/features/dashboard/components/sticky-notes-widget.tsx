"use client"

import { useState, useEffect, useRef } from "react"
import {
  Plus,
  X,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Highlighter,
  GripHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NOTE_COLORS = [
  { id: "yellow", bg: "bg-[#fff6c5]", border: "border-amber-200", dot: "bg-amber-300" },
  { id: "green", bg: "bg-[#e2f9e5]", border: "border-emerald-200", dot: "bg-emerald-300" },
  { id: "blue", bg: "bg-[#e0f2fe]", border: "border-sky-200", dot: "bg-sky-300" },
  { id: "pink", bg: "bg-[#fce7f3]", border: "border-pink-200", dot: "bg-pink-300" },
]

interface StickyNotesWidgetProps {
  isOpen: boolean
  onClose: () => void
}

export function StickyNotesWidget({ isOpen, onClose }: StickyNotesWidgetProps) {
  const [colorIndex, setColorIndex] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)

  // Carregar anotação do localStorage ao iniciar
  useEffect(() => {
    const saved = localStorage.getItem("mentor_sticky_note")
    if (saved && editorRef.current) {
      editorRef.current.innerHTML = saved
    }
  }, [])

  // Salvar no localStorage a cada alteração
  const handleContentChange = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      localStorage.setItem("mentor_sticky_note", html)
    }
  }

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value)
    if (editorRef.current) {
      editorRef.current.focus()
      handleContentChange()
    }
  }

  const currentColor = NOTE_COLORS[colorIndex] || NOTE_COLORS[0] || { id: "yellow", bg: "bg-[#fff6c5]", border: "border-amber-200", dot: "bg-amber-300" }

  if (!isOpen) return null

  return (
    <div
      className={cn(
        "fixed bottom-24 right-6 z-50 w-80 sm:w-96 rounded-2xl border shadow-2xl transition-all duration-200 flex flex-col overflow-hidden text-amber-950",
        currentColor.bg,
        currentColor.border
      )}
      style={{ minHeight: "320px" }}
    >
      {/* Top Bar / Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-900/10 cursor-move select-none">
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-amber-900/40" />

          {/* Bolinha para trocar a cor do post-it */}
          <button
            onClick={() => setColorIndex((prev) => (prev + 1) % NOTE_COLORS.length)}
            className={cn("w-4 h-4 rounded-full border border-amber-900/20 transition-transform hover:scale-110", currentColor.dot)}
            title="Trocar cor do Post-it"
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.innerHTML = ""
                handleContentChange()
              }
            }}
            className="p-1 rounded hover:bg-amber-900/10 text-amber-900/60 hover:text-amber-900 transition-colors"
            title="Limpar anotações"
          >
            <Plus className="h-4 w-4 rotate-45" />
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-amber-900/10 text-amber-900/60 hover:text-amber-900 transition-colors"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Area do Texto (Editable DIV para suporte a formatação) */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleContentChange}
        data-placeholder="Escreva suas anotações aqui..."
        className="flex-1 p-4 text-sm font-medium focus:outline-none overflow-y-auto leading-relaxed min-h-[200px]"
        style={{ color: "#2d281a" }}
      />

      {/* Barra de Ferramentas / Formatação Inferior */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-amber-900/10 bg-amber-900/5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => execCommand("bold")}
            className="p-1.5 rounded hover:bg-amber-900/15 font-bold text-xs text-amber-950 transition-colors"
            title="Negrito"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => execCommand("italic")}
            className="p-1.5 rounded hover:bg-amber-900/15 text-amber-950 transition-colors"
            title="Itálico"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => execCommand("underline")}
            className="p-1.5 rounded hover:bg-amber-900/15 text-amber-950 transition-colors"
            title="Sublinhado"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-amber-900/20 mx-1" />

          <button
            onClick={() => execCommand("insertUnorderedList")}
            className="p-1.5 rounded hover:bg-amber-900/15 text-amber-950 transition-colors"
            title="Lista com Marcadores"
          >
            <List className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => execCommand("insertOrderedList")}
            className="p-1.5 rounded hover:bg-amber-900/15 text-amber-950 transition-colors"
            title="Lista Numerada"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={() => execCommand("hiliteColor", "#fef08a")}
          className="p-1.5 rounded hover:bg-amber-900/15 text-amber-950 transition-colors"
          title="Marcar Texto"
        >
          <Highlighter className="h-3.5 w-3.5 text-amber-700" />
        </button>
      </div>
    </div>
  )
}
