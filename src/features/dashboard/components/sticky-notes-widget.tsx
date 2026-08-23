"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Plus,
  X,
  Minus,
  Pin,
  Trash2,
  List as ListIcon,
  Bold,
  Italic,
  Underline,
  ListOrdered,
  ListFilter,
  Highlighter,
  RotateCcw,
  RotateCw,
  CheckSquare,
  Search,
  BookOpen,
  Tag,
  Loader2,
  Check,
  ChevronLeft,
  SquarePen,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getUserNotesAction,
  saveUserNoteAction,
  deleteUserNoteAction,
  type UserNote,
} from "@/application/notes/notes.actions"
import { toast } from "sonner"

export const NOTE_THEMES = [
  {
    id: "yellow",
    name: "Amarelo",
    bg: "bg-[#fef9c3] dark:bg-[#2e2612]",
    border: "border-amber-300/80 dark:border-amber-700/60",
    header: "bg-amber-400/20 border-amber-900/10 dark:border-amber-100/10 text-amber-950 dark:text-amber-100",
    toolbar: "bg-amber-400/15 border-amber-900/10 dark:border-amber-100/10 text-amber-950 dark:text-amber-100",
    dot: "bg-amber-400",
    text: "text-amber-950 dark:text-amber-50",
  },
  {
    id: "green",
    name: "Verde",
    bg: "bg-[#dcfce7] dark:bg-[#132a1b]",
    border: "border-emerald-300/80 dark:border-emerald-700/60",
    header: "bg-emerald-400/20 border-emerald-900/10 dark:border-emerald-100/10 text-emerald-950 dark:text-emerald-100",
    toolbar: "bg-emerald-400/15 border-emerald-900/10 dark:border-emerald-100/10 text-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-400",
    text: "text-emerald-950 dark:text-emerald-50",
  },
  {
    id: "blue",
    name: "Azul",
    bg: "bg-[#e0f2fe] dark:bg-[#102436]",
    border: "border-sky-300/80 dark:border-sky-700/60",
    header: "bg-sky-400/20 border-sky-900/10 dark:border-sky-100/10 text-sky-950 dark:text-sky-100",
    toolbar: "bg-sky-400/15 border-sky-900/10 dark:border-sky-100/10 text-sky-950 dark:text-sky-100",
    dot: "bg-sky-400",
    text: "text-sky-950 dark:text-sky-50",
  },
  {
    id: "pink",
    name: "Rosa",
    bg: "bg-[#fce7f3] dark:bg-[#321424]",
    border: "border-pink-300/80 dark:border-pink-700/60",
    header: "bg-pink-400/20 border-pink-900/10 dark:border-pink-100/10 text-pink-950 dark:text-pink-100",
    toolbar: "bg-pink-400/15 border-pink-900/10 dark:border-pink-100/10 text-pink-950 dark:text-pink-100",
    dot: "bg-pink-400",
    text: "text-pink-950 dark:text-pink-50",
  },
  {
    id: "purple",
    name: "Roxo",
    bg: "bg-[#f3e8ff] dark:bg-[#251538]",
    border: "border-purple-300/80 dark:border-purple-700/60",
    header: "bg-purple-400/20 border-purple-900/10 dark:border-purple-100/10 text-purple-950 dark:text-purple-100",
    toolbar: "bg-purple-400/15 border-purple-900/10 dark:border-purple-100/10 text-purple-950 dark:text-purple-100",
    dot: "bg-purple-400",
    text: "text-purple-950 dark:text-purple-50",
  },
]

interface StickyNotesWidgetProps {
  isOpen: boolean
  onClose: () => void
}

type ViewMode = "EDITOR" | "LIST"
type SaveStatus = "saved" | "saving" | "error"

function cleanNoteContent(html: string): string {
  const stripped = html.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim()
  if (stripped === "Anote conceitos-chave, resumos ou dúvidas aqui..." || stripped === "") {
    return ""
  }
  return html
}

const LOCAL_STORAGE_CACHE_KEY = "mentor_quick_notes_list_cache"
const LOCAL_STORAGE_ACTIVE_ID = "mentor_quick_notes_active_id"

export function StickyNotesWidget({ isOpen, onClose }: StickyNotesWidgetProps) {
  const [notes, setNotes] = useState<UserNote[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("EDITOR")
  const [isMinimized, setIsMinimized] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
  const [lastSavedText, setLastSavedText] = useState<string>("Salvo agora")
  const [searchQuery, setSearchQuery] = useState("")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  // Campos da nota ativa em edição
  const [noteTitle, setNoteTitle] = useState("")
  const [noteDiscipline, setNoteDiscipline] = useState("")
  const [noteTagsText, setNoteTagsText] = useState("")
  const [noteColor, setNoteColor] = useState("yellow")

  const editorRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isInitialLoadRef = useRef(true)

  // 1. Carregar notas do cache e depois sincronizar com o banco
  useEffect(() => {
    if (!isOpen) return

    // Carregar cache local primeiro para exibição instantânea
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY)
      if (cached) {
        const parsed: UserNote[] = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.map((n) => ({ ...n, content: cleanNoteContent(n.content || "") }))
          setNotes(cleaned)
          const savedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID)
          const matched = cleaned.find((n) => n.id === savedActiveId) || cleaned[0]
          if (matched) {
            setActiveNoteId(matched.id)
            setNoteTitle(matched.title || "")
            setNoteDiscipline(matched.discipline_name || "")
            setNoteTagsText(matched.tags ? matched.tags.join(" ") : "")
            setNoteColor(matched.color || "yellow")
            setIsPinned(Boolean(matched.is_pinned))
          }
        }
      }
    } catch {}

    // Buscar dados atualizados do servidor
    getUserNotesAction().then((res) => {
      if (res.success && res.data) {
        const serverNotes = res.data.map((n) => ({
          ...n,
          content: cleanNoteContent(n.content || ""),
        }))

        if (serverNotes.length === 0) {
          // Se não há nenhuma nota, cria uma nota inicial vazia
          const initialNote: UserNote = {
            id: crypto.randomUUID(),
            title: "Nota Rápida",
            content: "",
            color: "yellow",
            is_pinned: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          setNotes([initialNote])
          setActiveNoteId(initialNote.id)
          setNoteTitle(initialNote.title || "")
          setNoteColor(initialNote.color || "yellow")
          if (editorRef.current) {
            editorRef.current.innerHTML = ""
          }
          void saveUserNoteAction(initialNote)
        } else {
          setNotes(serverNotes)
          try {
            localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(serverNotes))
          } catch {}

          const savedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID)
          const currentActive =
            serverNotes.find((n) => n.id === savedActiveId) || serverNotes[0]

          if (currentActive) {
            setActiveNoteId(currentActive.id)
            setNoteTitle(currentActive.title || "")
            setNoteDiscipline(currentActive.discipline_name || "")
            setNoteTagsText(currentActive.tags ? currentActive.tags.join(" ") : "")
            setNoteColor(currentActive.color || "yellow")
            setIsPinned(Boolean(currentActive.is_pinned))
            if (editorRef.current) {
              editorRef.current.innerHTML = cleanNoteContent(currentActive.content || "")
            }
          }
        }
      }
      isInitialLoadRef.current = false
    })
  }, [isOpen])

  // Sincronizar editor quando a nota ativa mudar
  const activeNote = notes.find((n) => n.id === activeNoteId) || notes[0]

  useEffect(() => {
    if (!activeNote) return
    setNoteTitle(activeNote.title || "")
    setNoteDiscipline(activeNote.discipline_name || "")
    setNoteTagsText(activeNote.tags ? activeNote.tags.join(" ") : "")
    setNoteColor(activeNote.color || "yellow")
    setIsPinned(Boolean(activeNote.is_pinned))
    const cleanedContent = cleanNoteContent(activeNote.content || "")
    if (editorRef.current && editorRef.current.innerHTML !== cleanedContent) {
      editorRef.current.innerHTML = cleanedContent
    }
  }, [activeNoteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Formatar horário de salvamento
  const updateSavedTimestamp = useCallback(() => {
    const timeStr = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date())
    setLastSavedText(`Salvo às ${timeStr}`)
    setSaveStatus("saved")
  }, [])

  // Auto-save com debounce de 800ms
  const triggerAutoSave = useCallback(
    (overrides?: Partial<UserNote>) => {
      if (!activeNoteId) return

      setSaveStatus("saving")
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(async () => {
        const contentHtml = editorRef.current ? editorRef.current.innerHTML : ""
        const tags = noteTagsText
          .split(/[\s,]+/)
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .map((t) => (t.startsWith("#") ? t : `#${t}`))

        const updatedNotePayload: UserNote = {
          id: activeNoteId,
          title: (overrides?.title !== undefined ? overrides.title : noteTitle).trim(),
          content: overrides?.content !== undefined ? overrides.content : contentHtml,
          discipline_name:
            overrides?.discipline_name !== undefined
              ? overrides.discipline_name
              : noteDiscipline.trim() || null,
          tags: overrides?.tags !== undefined ? overrides.tags : tags,
          color: overrides?.color !== undefined ? overrides.color : noteColor,
          is_pinned: overrides?.is_pinned !== undefined ? overrides.is_pinned : isPinned,
          updated_at: new Date().toISOString(),
        }

        // Atualização otimista no estado local e cache
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.id !== activeNoteId)
          const next = [updatedNotePayload, ...filtered]
          try {
            localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(next))
          } catch {}
          return next
        })

        // Enviar para o banco de dados
        const res = await saveUserNoteAction(updatedNotePayload)
        if (res.success) {
          updateSavedTimestamp()
        } else {
          setSaveStatus("error")
          setLastSavedText("Salvo localmente")
        }
      }, 800)
    },
    [activeNoteId, noteTitle, noteDiscipline, noteTagsText, noteColor, isPinned, updateSavedTimestamp]
  )

  // Manipuladores de edição
  const handleContentInput = () => {
    triggerAutoSave()
  }

  const handleTitleChange = (newTitle: string) => {
    setNoteTitle(newTitle)
    triggerAutoSave({ title: newTitle })
  }

  const handleColorChange = (newColor: string) => {
    setNoteColor(newColor)
    triggerAutoSave({ color: newColor })
  }

  const handleTogglePin = () => {
    const nextPinned = !isPinned
    setIsPinned(nextPinned)
    triggerAutoSave({ is_pinned: nextPinned })
    toast.success(nextPinned ? "Nota fixada no topo!" : "Nota desfixada.")
  }

  const handleCreateNewNote = () => {
    const newId = crypto.randomUUID()
    const newNote: UserNote = {
      id: newId,
      title: "Nova Anotação",
      content: "",
      color: noteColor,
      is_pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setNotes((prev) => [newNote, ...prev])
    setActiveNoteId(newId)
    setNoteTitle(newNote.title)
    setNoteDiscipline("")
    setNoteTagsText("")
    setIsPinned(false)
    setViewMode("EDITOR")
    if (editorRef.current) {
      editorRef.current.innerHTML = ""
      editorRef.current.focus()
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID, newId)
    } catch {}
    void saveUserNoteAction(newNote)
    toast.success("Nova nota criada!")
  }

  const handleDeleteNote = async () => {
    if (!activeNoteId) return
    const idToDelete = activeNoteId
    setIsDeleteDialogOpen(false)

    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== idToDelete)
      try {
        localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(filtered))
      } catch {}
      return filtered
    })

    const remaining = notes.filter((n) => n.id !== idToDelete)
    if (remaining.length > 0) {
      const nextNote = remaining[0]
      if (nextNote) {
        setActiveNoteId(nextNote.id)
        setNoteTitle(nextNote.title || "")
        setNoteColor(nextNote.color || "yellow")
        if (editorRef.current) {
          editorRef.current.innerHTML = nextNote.content || ""
        }
      }
    } else {
      handleCreateNewNote()
    }

    await deleteUserNoteAction(idToDelete)
    toast.success("Nota excluída com sucesso.")
  }

  // Executar comandos de formatação com document.execCommand
  const execFormat = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value)
    if (editorRef.current) {
      editorRef.current.focus()
      triggerAutoSave()
    }
  }

  // Inserir item de checklist interativo
  const insertChecklistItem = () => {
    if (!editorRef.current) return
    document.execCommand(
      "insertHTML",
      false,
      `<div class="checklist-item flex items-center gap-2 my-1"><input type="checkbox" class="mentor-note-checkbox h-4 w-4 rounded accent-primary cursor-pointer" /> <span>Item da lista</span></div>`
    )
    editorRef.current.focus()
    triggerAutoSave()
  }

  const currentTheme =
    NOTE_THEMES.find((t) => t.id === noteColor) || NOTE_THEMES[0] || {
      id: "yellow",
      name: "Amarelo",
      bg: "bg-[#fef9c3] dark:bg-[#2e2612]",
      border: "border-amber-300/80 dark:border-amber-700/60",
      header: "bg-amber-400/20 border-amber-900/10 text-amber-950 dark:text-amber-100",
      toolbar: "bg-amber-400/15 border-amber-900/10 text-amber-950 dark:text-amber-100",
      dot: "bg-amber-400",
      text: "text-amber-950 dark:text-amber-50",
    }

  // Filtragem de notas para a visualização de lista
  const filteredNotes = notes.filter((n) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const matchTitle = (n.title || "").toLowerCase().includes(q)
    const matchContent = (n.content || "").toLowerCase().includes(q)
    const matchDiscipline = (n.discipline_name || "").toLowerCase().includes(q)
    const matchTags = (n.tags || []).some((t) => t.toLowerCase().includes(q))
    return matchTitle || matchContent || matchDiscipline || matchTags
  })

  if (!isOpen) return null

  // Modo Minimizado (Pill compacto discreto)
  if (isMinimized) {
    return (
      <div
        className={cn(
          "fixed bottom-24 right-4 sm:right-6 z-50 rounded-full border shadow-2xl transition-all duration-200 flex items-center gap-2 px-4 py-2 cursor-pointer hover:scale-105 select-none backdrop-blur-md",
          currentTheme.bg,
          currentTheme.border,
          currentTheme.text
        )}
        onClick={() => setIsMinimized(false)}
        title="Clique para restaurar o Bloco de Notas"
      >
        <SquarePen className="h-4 w-4" />
        <span className="text-xs font-bold truncate max-w-[160px]">
          {noteTitle || "Nota Rápida"}
        </span>
        <span className="text-[10px] opacity-70 font-semibold">• {lastSavedText}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsMinimized(false)
          }}
          className="p-1 rounded-full hover:bg-black/10 transition-colors"
        >
          <Minus className="h-3 w-3 rotate-90" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "fixed bottom-24 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-96 md:w-[410px] rounded-3xl border shadow-2xl transition-all duration-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95",
        currentTheme.bg,
        currentTheme.border,
        currentTheme.text
      )}
      style={{ maxHeight: "calc(100vh - 140px)", minHeight: "360px" }}
    >
      {/* ── CABEÇALHO DO BLOCO DE NOTAS ────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center justify-between px-3.5 py-2.5 border-b select-none transition-colors",
          currentTheme.header
        )}
      >
        {/* Lado Esquerdo: Alternar Lista/Editor ou Seletor de Cores */}
        <div className="flex items-center gap-2">
          {viewMode === "LIST" ? (
            <button
              onClick={() => setViewMode("EDITOR")}
              className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg hover:bg-black/10 transition-colors"
              title="Voltar ao editor"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Editor</span>
            </button>
          ) : (
            <>
              {/* Botão para ver a lista de todas as notas */}
              <button
                onClick={() => setViewMode("LIST")}
                className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                title="Minhas Notas"
              >
                <ListIcon className="h-4 w-4" />
              </button>

              {/* Botão Nova Nota */}
              <button
                onClick={handleCreateNewNote}
                className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                title="Criar Nova Nota"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Paleta de Cores Post-it */}
              <div className="flex items-center gap-1 pl-1">
                {NOTE_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleColorChange(theme.id)}
                    className={cn(
                      "w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 border border-black/10",
                      theme.dot,
                      noteColor === theme.id && "ring-2 ring-primary ring-offset-1 scale-110"
                    )}
                    title={`Cor ${theme.name}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Lado Direito: Ações (Fixar, Minimizar, Excluir, Fechar) */}
        <div className="flex items-center gap-0.5">
          {viewMode === "EDITOR" && (
            <>
              {/* Fixar */}
              <button
                onClick={handleTogglePin}
                className={cn(
                  "p-1.5 rounded-lg hover:bg-black/10 transition-colors",
                  isPinned && "bg-primary/20 text-primary font-bold"
                )}
                title={isPinned ? "Desfixar nota" : "Fixar nota no topo"}
              >
                <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
              </button>

              {/* Detalhes (Disciplina e Tags) */}
              <button
                onClick={() => setIsDetailsOpen((prev) => !prev)}
                className={cn(
                  "p-1.5 rounded-lg hover:bg-black/10 transition-colors",
                  (noteDiscipline || noteTagsText || isDetailsOpen) && "bg-black/10 font-bold"
                )}
                title="Vincular Disciplina & Tags"
              >
                <Tag className="h-3.5 w-3.5" />
              </button>

              {/* Excluir */}
              <button
                onClick={() => setIsDeleteDialogOpen(true)}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-600 transition-colors"
                title="Excluir esta nota"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {/* Minimizar */}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title="Minimizar janela"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          {/* Fechar (apenas esconde, NUNCA apaga) */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
            title="Fechar (conteúdo permanece salvo)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── CONTEÚDO PRINCIPAL: MODO LISTA OU MODO EDITOR ──────────────────────── */}
      {viewMode === "LIST" ? (
        /* MODO LISTA DE NOTAS */
        <div className="flex-1 flex flex-col p-3 overflow-hidden space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 opacity-50" />
              <input
                type="text"
                placeholder="Buscar anotações ou tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-black/5 border border-black/10 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleCreateNewNote}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Nova
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredNotes.length === 0 ? (
              <div className="py-12 text-center text-xs opacity-60">
                Nenhuma anotação encontrada.
              </div>
            ) : (
              filteredNotes.map((note) => {
                const noteTheme =
                  NOTE_THEMES.find((t) => t.id === note.color) || NOTE_THEMES[0]
                const isCurrent = note.id === activeNoteId

                // Extrair texto limpo para preview
                const cleanContent = (note.content || "")
                  .replace(/<[^>]*>?/gm, " ")
                  .trim()

                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      setActiveNoteId(note.id)
                      setViewMode("EDITOR")
                      try {
                        localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID, note.id)
                      } catch {}
                    }}
                    className={cn(
                      "p-3 rounded-2xl border transition-all cursor-pointer select-none space-y-1 hover:shadow-md",
                      noteTheme?.bg,
                      noteTheme?.border,
                      noteTheme?.text,
                      isCurrent && "ring-2 ring-primary shadow-xs"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-xs truncate flex-1 flex items-center gap-1.5">
                        {note.is_pinned && <Pin className="h-3 w-3 fill-current text-primary shrink-0" />}
                        <span>{note.title || "Sem título"}</span>
                      </h4>
                      {note.discipline_name && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-black/10 truncate max-w-[120px]">
                          {note.discipline_name}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] opacity-75 line-clamp-2 leading-relaxed">
                      {cleanContent || "Nota vazia..."}
                    </p>

                    {note.tags && note.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {note.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-semibold opacity-70 bg-black/5 px-1 py-0.2 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : (
        /* MODO EDITOR */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Título da Nota */}
          <div className="px-4 pt-3 pb-1">
            <input
              type="text"
              placeholder="Título da anotação..."
              value={noteTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full bg-transparent font-black text-base border-none focus:outline-none placeholder:opacity-40 leading-tight"
            />
          </div>

          {/* Painel Expansível de Disciplina & Tags */}
          {isDetailsOpen && (
            <div className="px-4 py-2 mx-3 mb-2 rounded-2xl bg-black/5 border border-black/10 space-y-2 text-xs animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 opacity-60 shrink-0" />
                <input
                  type="text"
                  placeholder="Disciplina relacionada (ex: Direito Constitucional)"
                  value={noteDiscipline}
                  onChange={(e) => {
                    setNoteDiscipline(e.target.value)
                    triggerAutoSave({ discipline_name: e.target.value.trim() || null })
                  }}
                  className="w-full bg-transparent focus:outline-none placeholder:opacity-50 text-xs font-semibold"
                />
              </div>
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 opacity-60 shrink-0" />
                <input
                  type="text"
                  placeholder="Tags separadas por espaço (ex: #atos #controle)"
                  value={noteTagsText}
                  onChange={(e) => {
                    setNoteTagsText(e.target.value)
                    const tags = e.target.value
                      .split(/[\s,]+/)
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((t) => (t.startsWith("#") ? t : `#${t}`))
                    triggerAutoSave({ tags })
                  }}
                  className="w-full bg-transparent focus:outline-none placeholder:opacity-50 text-xs"
                />
              </div>
            </div>
          )}

          {/* Área de Texto Formatável (contentEditable) */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleContentInput}
            onFocus={() => {
              if (editorRef.current) {
                const text = editorRef.current.innerText.trim()
                if (text === "Anote conceitos-chave, resumos ou dúvidas aqui...") {
                  editorRef.current.innerHTML = ""
                  triggerAutoSave({ content: "" })
                }
              }
            }}
            data-placeholder="Escreva suas anotações, resumos e dúvidas aqui..."
            className="flex-1 px-4 py-2 text-sm font-medium focus:outline-none overflow-y-auto leading-relaxed min-h-[160px] relative empty:before:content-[attr(data-placeholder)] empty:before:opacity-40 empty:before:pointer-events-none select-text"
          />

          {/* ── BARRA DE FERRAMENTAS COMPACTA INFERIOR ─────────────────────────── */}
          <div
            className={cn(
              "flex items-center justify-between px-3 py-1.5 border-t text-xs select-none transition-colors",
              currentTheme.toolbar
            )}
          >
            {/* Ferramentas de Formatação */}
            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
              {/* Negrito */}
              <button
                type="button"
                onClick={() => execFormat("bold")}
                className="p-1 rounded hover:bg-black/10 font-bold transition-colors"
                title="Negrito (Ctrl+B)"
              >
                <Bold className="h-3.5 w-3.5" />
              </button>

              {/* Itálico */}
              <button
                type="button"
                onClick={() => execFormat("italic")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Itálico (Ctrl+I)"
              >
                <Italic className="h-3.5 w-3.5" />
              </button>

              {/* Sublinhado */}
              <button
                type="button"
                onClick={() => execFormat("underline")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Sublinhado (Ctrl+U)"
              >
                <Underline className="h-3.5 w-3.5" />
              </button>

              {/* Marca-texto */}
              <button
                type="button"
                onClick={() => execFormat("hiliteColor", "#fef08a")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Destacar texto"
              >
                <Highlighter className="h-3.5 w-3.5" />
              </button>

              <div className="w-px h-3.5 bg-black/15 mx-1 shrink-0" />

              {/* Lista Marcadores */}
              <button
                type="button"
                onClick={() => execFormat("insertUnorderedList")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Lista com marcadores"
              >
                <ListFilter className="h-3.5 w-3.5" />
              </button>

              {/* Lista Numerada */}
              <button
                type="button"
                onClick={() => execFormat("insertOrderedList")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Lista numerada"
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </button>

              {/* Checklist */}
              <button
                type="button"
                onClick={insertChecklistItem}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Inserir item de checklist"
              >
                <CheckSquare className="h-3.5 w-3.5" />
              </button>

              <div className="w-px h-3.5 bg-black/15 mx-1 shrink-0" />

              {/* Desfazer & Refazer */}
              <button
                type="button"
                onClick={() => execFormat("undo")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Desfazer"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => execFormat("redo")}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                title="Refazer"
              >
                <RotateCw className="h-3 w-3" />
              </button>
            </div>

            {/* Status Discreto de Salvamento */}
            <div className="flex items-center gap-1 text-[10px] font-semibold opacity-70 shrink-0 pl-2">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>Salvando...</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>{lastSavedText}</span>
                </>
              )}
              {saveStatus === "error" && (
                <span className="text-amber-600 font-bold">{lastSavedText}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE CONFIRMAÇÃO DE EXCLUSÃO ──────────────────────────────────── */}
      {isDeleteDialogOpen && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card text-foreground rounded-2xl p-5 border shadow-xl max-w-xs space-y-4 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black">Excluir esta anotação?</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Esta ação removerá a nota permanentemente e não poderá ser desfeita.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => setIsDeleteDialogOpen(false)}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteNote}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
