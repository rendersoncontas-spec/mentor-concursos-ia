"use client"

import { useState, useEffect } from "react"
import {
  X,
  Plus,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Edit2,
  Trash2,
  Check,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export interface DisciplineTopicItem {
  id: string
  title: string
  badgeText?: string
}

export interface EditDisciplineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  disciplineName: string
  disciplineColor?: string
  badgeText?: string
  initialTopics?: DisciplineTopicItem[]
  onSave?: (data: { name: string; color: string; topics: DisciplineTopicItem[] }) => void
  onRemove?: () => void
}

const COLOR_OPTIONS = [
  { name: "Amarelo", value: "#fef08a" },
  { name: "Azul Claro", value: "#e0f2fe" },
  { name: "Roxo Claro", value: "#f3e8ff" },
  { name: "Laranja Claro", value: "#ffedd5" },
  { name: "Azul", value: "#dbeafe" },
  { name: "Verde Claro", value: "#dcfce7" },
  { name: "Rosa", value: "#fce7f3" },
  { name: "Verde Água", value: "#dbeafe" },
]

const DEFAULT_TOPICS_LIST: DisciplineTopicItem[] = [
  { id: "t1", title: "1. Teoria da administração e das organizações.", badgeText: "RFB" },
  { id: "t2", title: "2. O processo administrativo.", badgeText: "RFB" },
  { id: "t3", title: "3. Funções de administração: planejamento, organização, direção e controle.", badgeText: "RFB" },
  { id: "t4", title: "4. Papéis e habilidades do administrador.", badgeText: "RFB" },
  { id: "t5", title: "5. Planejamento estratégico: conceitos, princípios, etapas, níveis, métodos e ferramentas.", badgeText: "RFB" },
  { id: "t6", title: "6. Planejamento tático.", badgeText: "RFB" },
  { id: "t7", title: "7. Planejamento operacional.", badgeText: "RFB" },
  { id: "t8", title: "8. Administração por objetivos.", badgeText: "RFB" },
]

export function EditDisciplineModal({
  open,
  onOpenChange,
  disciplineName,
  disciplineColor = "#fef08a",
  badgeText = "RFB",
  initialTopics,
  onSave,
  onRemove,
}: EditDisciplineModalProps) {
  const [name, setName] = useState(disciplineName)
  const [color, setColor] = useState(disciplineColor)
  const [topics, setTopics] = useState<DisciplineTopicItem[]>(initialTopics || DEFAULT_TOPICS_LIST)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editingTopicText, setEditingTopicText] = useState("")
  const [newTopicText, setNewTopicText] = useState("")
  const [showAddTopicInput, setShowAddTopicInput] = useState(false)

  useEffect(() => {
    setName(disciplineName)
    setColor(disciplineColor)
    setTopics(initialTopics && initialTopics.length > 0 ? initialTopics : DEFAULT_TOPICS_LIST)
  }, [disciplineName, disciplineColor, initialTopics, open])

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Informe o nome da disciplina.")
      return
    }
    if (onSave) {
      onSave({ name: name.trim(), color, topics })
    } else {
      toast.success(`Disciplina "${name}" salva com sucesso!`)
    }
    onOpenChange(false)
  }

  const handleRemoveDiscipline = () => {
    if (onRemove) {
      onRemove()
    } else {
      toast.success(`Disciplina "${name}" removida.`)
    }
    onOpenChange(false)
  }

  const handleAddTopic = () => {
    if (!newTopicText.trim()) return
    const newTopic: DisciplineTopicItem = {
      id: `topic-${Date.now()}`,
      title: `${topics.length + 1}. ${newTopicText.trim()}`,
      badgeText: badgeText || "RFB",
    }
    setTopics([...topics, newTopic])
    setNewTopicText("")
    setShowAddTopicInput(false)
    toast.success("Novo tópico adicionado!")
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const updated = [...topics]
    const temp = updated[index - 1]!
    updated[index - 1] = updated[index]!
    updated[index] = temp
    setTopics(updated)
  }

  const handleMoveDown = (index: number) => {
    if (index === topics.length - 1) return
    const updated = [...topics]
    const temp = updated[index + 1]!
    updated[index + 1] = updated[index]!
    updated[index] = temp
    setTopics(updated)
  }

  const handleRemoveTopic = (id: string) => {
    setTopics(topics.filter((t) => t.id !== id))
  }

  const handleSaveEditTopic = (id: string) => {
    setTopics(topics.map((t) => (t.id === id ? { ...t, title: editingTopicText } : t)))
    setEditingTopicId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-6 rounded-2xl">
        <div className="space-y-5">
          {/* Header com Título da Disciplina */}
          <h2 className="text-xl font-black text-foreground tracking-tight">{name || "Editar Disciplina"}</h2>

          {/* Formulário de Nome & Cor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                NOME
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground py-1.5 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-1 space-y-1">
              <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                COR
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-xs border shrink-0"
                  style={{ backgroundColor: color }}
                />
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full h-8 bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                >
                  {COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Cabeçalho da Seção de Tópicos (ORDENAR TÓPICOS + NOVO TÓPICO) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
                TÓPICOS
              </span>

              <div className="flex items-center gap-3 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => toast.info("Arraste os botões de seta para reordenar os tópicos.")}
                  className="flex items-center gap-1 text-[#2563EB] hover:underline"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span>ORDENAR TÓPICOS</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddTopicInput(true)}
                  className="flex items-center gap-1 text-[#2563EB] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>NOVO TÓPICO</span>
                </button>
              </div>
            </div>

            {/* Input Adicionar Tópico */}
            {showAddTopicInput && (
              <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                <Input
                  placeholder="Nome do novo tópico..."
                  value={newTopicText}
                  onChange={(e) => setNewTopicText(e.target.value)}
                  className="h-8 text-xs flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={handleAddTopic} className="h-8 bg-[#2563EB] text-white font-bold text-xs">
                  Adicionar
                </Button>
                <button onClick={() => setShowAddTopicInput(false)} className="text-muted-foreground p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Lista Scrollável de Tópicos (100% Paridade Estudei) */}
            <div className="border rounded-xl max-h-64 overflow-y-auto divide-y bg-card">
              {topics.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 hover:bg-muted/20 transition-colors text-xs font-semibold text-foreground group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#2563EB] text-white font-extrabold text-[9px] shrink-0">
                      {t.badgeText || badgeText}
                    </span>

                    {editingTopicId === t.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          value={editingTopicText}
                          onChange={(e) => setEditingTopicText(e.target.value)}
                          className="h-7 text-xs flex-1"
                        />
                        <button
                          onClick={() => handleSaveEditTopic(t.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate">{t.title}</span>
                    )}
                  </div>

                  {/* Ações de Reordenação, Edição e Exclusão */}
                  <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      className="p-1 hover:text-foreground disabled:opacity-30"
                      title="Mover para cima"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === topics.length - 1}
                      className="p-1 hover:text-foreground disabled:opacity-30"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingTopicId(t.id)
                        setEditingTopicText(t.title)
                      }}
                      className="p-1 hover:text-[#2563EB]"
                      title="Editar tópico"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(t.id)}
                      className="p-1 hover:text-rose-500"
                      title="Excluir tópico"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé do Modal (Remover & Salvar 100% Estudei) */}
          <div className="flex items-center justify-between pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleRemoveDiscipline}
              className="border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB]/10 font-bold text-xs px-6 h-9 rounded-xl"
            >
              Remover
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-7 h-9 rounded-xl shadow-xs"
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

