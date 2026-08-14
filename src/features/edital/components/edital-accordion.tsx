"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import { Check, ChevronDown, ChevronUp, Edit, ExternalLink, Plus } from "lucide-react"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  addCustomDisciplineAction,
  removeCustomTopicAction,
  removeDisciplineAction,
  saveCustomTopicsAction,
  searchDisciplinesAction,
} from "@/application/edital/edital.action"
import { createCustomTopicAction } from "@/application/topic-catalog/topic-catalog.actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
import { EditDisciplineModal } from "@/features/disciplines/components/edit-discipline-modal"
import { StudyRegisterModal } from "@/features/study-session/components/study-register-modal"
import {
  TopicAutocomplete,
  type TopicCommit,
} from "@/features/topic-catalog/components/topic-autocomplete"

export interface TopicItem {
  id: string
  number: number
  title: string
  correct: number
  wrong: number
  questions: number
  accuracy: number
  lastStudy: string | null
  studyCount: number
  link?: string | null
}

export interface DisciplineData {
  id: string
  name: string
  color: string
  topics: TopicItem[]
}

const DEFAULT_EDITAL_DATA: DisciplineData[] = []

export function EditalAccordion({
  initialDisciplines,
  activeTargetName,
  activeTargetId,
}: {
  initialDisciplines?: DisciplineData[]
  activeTargetName?: string
  activeTargetId?: string
}) {
  const router = useRouter()
  const [data, setData] = useState<DisciplineData[]>(initialDisciplines || DEFAULT_EDITAL_DATA)
  const [completedTopics, setCompletedTopics] = useState<Record<string, boolean>>({})
  const [openDisciplineId, setOpenDisciplineId] = useState<string | null>(
    data.length > 0 ? (data[0]?.id ?? null) : null,
  )
  const [linkModalTopic, setLinkModalTopic] = useState<TopicItem | null>(null)
  const [inputUrl, setInputUrl] = useState("")

  // Estados de criação
  const [isAddingDiscipline, setIsAddingDiscipline] = useState(false)
  const [newDisciplineName, setNewDisciplineName] = useState("")
  const [disciplineSuggestions, setDisciplineSuggestions] = useState<string[]>([])
  const [addingTopicDiscId, setAddingTopicDiscId] = useState<string | null>(null)
  const [newTopicName, setNewTopicName] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // Pesquisar disciplinas
  useEffect(() => {
    if (!newDisciplineName || newDisciplineName.length < 2) {
      const timer = setTimeout(() => setDisciplineSuggestions([]), 0)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(async () => {
      const res = await searchDisciplinesAction(newDisciplineName)
      if (res.success && res.data) {
        setDisciplineSuggestions(res.data)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [newDisciplineName])

  // Modais Registro de Estudo e Editar Disciplina
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [editingDiscipline, setEditingDiscipline] = useState<DisciplineData | null>(null)

  // Carregar do localStorage (escopado por concurso ativo)
  useEffect(() => {
    if (typeof window === "undefined") return
    // Remove legado não escopado com dados fake de teste para evitar que Raciocínio Lógico inicie em 14%
    const legacyKey = "mentor_edital_checked_topics"
    const legacyData = localStorage.getItem(legacyKey)
    if (legacyData && activeTargetId) {
      localStorage.removeItem(legacyKey)
    }

    const storageKey = activeTargetId ? `mentor_edital_checked_topics_${activeTargetId}` : legacyKey
    const savedChecked = localStorage.getItem(storageKey)
    if (savedChecked) {
      try {
        const parsedTopics = JSON.parse(savedChecked) as Record<string, boolean>
        setTimeout(() => setCompletedTopics(parsedTopics), 0)
      } catch {
        setTimeout(() => setCompletedTopics({}), 0)
      }
    } else {
      setTimeout(() => setCompletedTopics({}), 0)
    }
  }, [activeTargetId])

  const toggleCheck = (topicId: string) => {
    const updated = { ...completedTopics, [topicId]: !completedTopics[topicId] }
    setCompletedTopics(updated)
    const storageKey = activeTargetId
      ? `mentor_edital_checked_topics_${activeTargetId}`
      : "mentor_edital_checked_topics"
    localStorage.setItem(storageKey, JSON.stringify(updated))
  }

  const handleSaveLink = () => {
    if (!linkModalTopic) return
    const updatedData = data.map((disc) => ({
      ...disc,
      topics: disc.topics.map((t) =>
        t.id === linkModalTopic.id ? { ...t, link: inputUrl.trim() || null } : t,
      ),
    }))
    setData(updatedData)
    toast.success("Link do caderno de questões salvo!")
    setLinkModalTopic(null)
    setInputUrl("")
  }

  const totalTopicsCount = data.reduce((acc, d) => acc + d.topics.length, 0) || 0
  const completedTopicsCount = Object.values(completedTopics).filter(Boolean).length
  const overallProgressPercentage =
    totalTopicsCount > 0 ? Math.round((completedTopicsCount / totalTopicsCount) * 100) : 0

  const handleAddDiscipline = async () => {
    if (!newDisciplineName.trim()) return
    if (!activeTargetId) {
      toast.error("Nenhum concurso ativo.")
      return
    }
    setIsSaving(true)
    const res = await addCustomDisciplineAction(newDisciplineName, activeTargetId)
    if (res.success && res.data) {
      const addedDiscipline = res.data
      setData((prev) => [
        ...prev,
        {
          id: addedDiscipline.id,
          name: addedDiscipline.name,
          color: "#2563EB",
          topics: [],
        },
      ])
      setNewDisciplineName("")
      setIsAddingDiscipline(false)
      toast.success("Matéria adicionada com sucesso!")
    } else {
      toast.error(res.error || "Erro ao adicionar matéria")
    }
    setIsSaving(false)
  }

  const handleAddTopic = async (discId: string, name?: string, source?: TopicCommit["source"]) => {
    const topicName = (name ?? newTopicName).trim()
    if (!topicName || !activeTargetId) return
    setIsSaving(true)

    const disc = data.find((d) => d.id === discId)
    if (!disc) return setIsSaving(false)

    // Registra no catálogo de tópicos (dedupe-safe) quando o nome não veio do catálogo nem foi criado agora
    if (source !== "catalog" && source !== "custom") {
      void createCustomTopicAction(discId, topicName)
    }

    const newTopic: TopicItem = {
      id: `custom-${Date.now()}`,
      number: disc.topics.length + 1,
      title: topicName.toUpperCase(),
      correct: 0,
      wrong: 0,
      questions: 0,
      accuracy: 0,
      lastStudy: null,
      studyCount: 0,
      link: null,
    }

    const updatedTopics = [...disc.topics, newTopic]

    // Atualiza localmente
    setData((prev) => prev.map((d) => (d.id === discId ? { ...d, topics: updatedTopics } : d)))

    // Salva no backend
    const res = await saveCustomTopicsAction(activeTargetId, discId, updatedTopics)
    if (res.success) {
      setNewTopicName("")
      setAddingTopicDiscId(null)
      toast.success("Tópico adicionado!")
    } else {
      toast.error(res.error || "Erro ao salvar tópico")
    }
    setIsSaving(false)
  }

  const handleDeleteDiscipline = async (discId: string) => {
    if (
      !confirm(
        "Tem certeza que deseja excluir esta matéria? Ela também será removida do seu planejamento e estatísticas.",
      )
    )
      return
    setIsSaving(true)
    if (!activeTargetId) {
      toast.error("Nenhum concurso ativo.")
      return
    }
    const res = await removeDisciplineAction(discId, activeTargetId)
    if (res.success) {
      setData((prev) => prev.filter((d) => d.id !== discId))
      toast.success("Matéria removida!")
      router.refresh()
    } else {
      toast.error(res.error || "Erro ao remover matéria")
    }
    setIsSaving(false)
  }

  const handleDeleteTopic = async (discId: string, topicId: string) => {
    if (!activeTargetId) return
    if (!confirm("Excluir este tópico?")) return
    setIsSaving(true)
    const res = await removeCustomTopicAction(activeTargetId, discId, topicId)
    if (res.success) {
      setData((prev) =>
        prev.map((d) =>
          d.id === discId ? { ...d, topics: d.topics.filter((t) => t.id !== topicId) } : d,
        ),
      )
      toast.success("Tópico removido!")
      router.refresh()
    } else {
      toast.error(res.error || "Erro ao remover tópico")
    }
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Top Header Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Edital Verticalizado</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Acompanhe a cobertura completa e cadernos de questões por tópico
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={() => setIsRegisterModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
          >
            Adicionar Estudo
          </Button>

          <TargetSelectorDropdown initialActiveTargetName={activeTargetName ?? null} />
        </div>
      </div>

      {/* Card PROGRESSO NO EDITAL */}
      <div className="rounded-xl border bg-card p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
              PROGRESSO NO EDITAL
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {completedTopicsCount} de {totalTopicsCount} tópicos concluídos
            </span>
          </div>
          <span className="text-2xl font-black text-foreground">{overallProgressPercentage}%</span>
        </div>

        {/* Barra de Progresso em Verde-Água */}
        <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden">
          <div
            className="h-full bg-[#2563EB] transition-all duration-300 rounded-full"
            style={{ width: `${overallProgressPercentage}%` }}
          />
        </div>
      </div>

      {/* Lista de Disciplinas do Edital */}
      <div className="space-y-5">
        {data.map((disc) => {
          const isOpen = openDisciplineId === disc.id

          const totalCorrect = disc.topics.reduce((acc, t) => acc + t.correct, 0)
          const totalWrong = disc.topics.reduce((acc, t) => acc + t.wrong, 0)
          const totalQuestions = disc.topics.reduce((acc, t) => acc + t.questions, 0)
          const avgAccuracy =
            totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0

          const checkedCount = disc.topics.filter((t) => completedTopics[t.id]).length
          const progressPercentage =
            disc.topics.length > 0 ? Math.round((checkedCount / disc.topics.length) * 100) : 0

          return (
            <div
              key={disc.id}
              className="rounded-xl border bg-card shadow-sm overflow-hidden transition-all"
            >
              {/* Cabeçalho da Disciplina */}
              <div
                onClick={() => setOpenDisciplineId(isOpen ? null : disc.id)}
                className="group flex items-center justify-between p-4 bg-card hover:bg-muted/20 cursor-pointer border-b transition-colors"
              >
                {/* Esquerda: Barra de Cor + Nome da Disciplina */}
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: disc.color }} />
                  <h3 className="font-extrabold text-base text-foreground">{disc.name}</h3>
                </div>

                {/* Direita: Pílula de Métricas + Barra de Progresso da Matéria + Lápis Editar + Setinha */}
                <div className="flex items-center gap-4">
                  {/* Pílula de Métricas das Questões (Verde/Red/Gray/%) */}
                  <div className="hidden sm:flex items-center gap-4 px-4 py-1.5 rounded-full border border-[#2563EB]/40 bg-[#dbeafe]/30 font-mono text-xs font-bold shadow-2xs">
                    <span className="text-emerald-600 font-extrabold">{totalCorrect}</span>
                    <span className="text-rose-500 font-extrabold">{totalWrong}</span>
                    <span className="text-muted-foreground font-bold">{totalQuestions}</span>
                    <span className="text-foreground font-black">{avgAccuracy}</span>
                  </div>

                  {/* Barra de Progresso da Matéria (ex: 3% + Barra Verde-Água) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black font-mono text-foreground">
                      {progressPercentage}%
                    </span>
                    <div className="w-24 h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Ícones de Edição e Expansão */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingDiscipline(disc)
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                      title="Editar Disciplina"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDiscipline(disc.id)
                      }}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                      title="Excluir Disciplina"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button className="text-muted-foreground ml-2">
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Tabela do Edital Verticalizado */}
              {isOpen && (
                <div className="p-4 space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b bg-muted/20 text-muted-foreground font-semibold">
                          <th className="px-3 py-3 font-bold text-foreground">Tópicos</th>
                          <th
                            className="px-2 py-3 text-center text-emerald-600 font-bold"
                            title="Acertos"
                          >
                            ✔
                          </th>
                          <th
                            className="px-2 py-3 text-center text-rose-500 font-bold"
                            title="Erros"
                          >
                            ✖
                          </th>
                          <th
                            className="px-2 py-3 text-center text-blue-600 font-bold"
                            title="Total de questões"
                          >
                            📝
                          </th>
                          <th
                            className="px-2 py-3 text-center font-bold text-foreground"
                            title="Desempenho"
                          >
                            %
                          </th>
                          <th className="px-3 py-3 text-center" title="Data do último estudo">
                            📅
                          </th>
                          <th className="px-2 py-3 text-center" title="Quantidade de vezes estudou">
                            🧮
                          </th>
                          <th className="px-3 py-3 text-center">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {disc.topics.map((topic) => {
                          const isChecked = !!completedTopics[topic.id]

                          return (
                            <tr key={topic.id} className="hover:bg-muted/20 transition-colors">
                              {/* Checkbox + Tópico */}
                              <td className="px-3 py-3 font-medium text-muted-foreground leading-relaxed max-w-[450px]">
                                <div className="flex items-start gap-2.5 group/topic relative">
                                  <button
                                    onClick={() => toggleCheck(topic.id)}
                                    className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                                      isChecked
                                        ? "bg-[#2563EB] border-[#2563EB] text-white"
                                        : "border-muted-foreground/40 hover:border-[#2563EB] bg-background"
                                    }`}
                                  >
                                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                                  </button>

                                  <span
                                    className={
                                      isChecked
                                        ? "line-through opacity-70 text-foreground"
                                        : "text-foreground"
                                    }
                                  >
                                    {topic.number}. {topic.title}
                                  </span>

                                  {topic.id.startsWith("custom-") && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTopic(disc.id, topic.id)}
                                      className="opacity-0 group-hover/topic:opacity-100 absolute -right-6 top-0 p-1 text-muted-foreground hover:text-red-500 transition-colors"
                                      title="Excluir Tópico"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Stats */}
                              <td className="px-2 py-3 text-center font-mono font-bold text-emerald-600">
                                {topic.correct}
                              </td>
                              <td className="px-2 py-3 text-center font-mono font-bold text-rose-500">
                                {topic.wrong}
                              </td>
                              <td className="px-2 py-3 text-center font-mono text-blue-600 font-bold">
                                {topic.questions}
                              </td>
                              <td className="px-2 py-3 text-center font-mono font-extrabold text-foreground">
                                {topic.accuracy > 0 ? `${topic.accuracy}%` : "0"}
                              </td>
                              <td className="px-3 py-3 text-center font-mono text-muted-foreground">
                                {topic.lastStudy || "-"}
                              </td>
                              <td className="px-2 py-3 text-center font-mono text-muted-foreground">
                                {topic.studyCount}
                              </td>

                              {/* Link do Caderno de Questões */}
                              <td className="px-3 py-3 text-center">
                                {topic.link ? (
                                  <a
                                    href={topic.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-bold text-[#2563EB] hover:underline flex items-center justify-center gap-1"
                                  >
                                    <span>Abrir</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setLinkModalTopic(topic)
                                      setInputUrl("")
                                    }}
                                    className="text-xs font-semibold text-muted-foreground hover:text-[#2563EB] transition-colors"
                                  >
                                    Adicionar
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {addingTopicDiscId === disc.id && (
                          <tr className="bg-muted/10">
                            <td colSpan={8} className="p-3">
                              <div className="flex items-center gap-2 max-w-[450px]">
                                <TopicAutocomplete
                                  value={newTopicName}
                                  onChange={setNewTopicName}
                                  disciplineId={disc.id}
                                  autoFocus
                                  placeholder="Digite o nome do tópico..."
                                  className="flex-1"
                                  onCommit={(commit) => {
                                    void handleAddTopic(disc.id, commit.name, commit.source)
                                    setAddingTopicDiscId(null)
                                  }}
                                  onEnterFallback={() => {
                                    void handleAddTopic(disc.id)
                                  }}
                                  onEscapeFallback={() => setAddingTopicDiscId(null)}
                                />
                                <Button
                                  size="sm"
                                  className="h-8 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs px-3"
                                  onClick={() => handleAddTopic(disc.id)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Salvar"
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs px-3 text-muted-foreground"
                                  onClick={() => setAddingTopicDiscId(null)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {!addingTopicDiscId && (
                    <div className="flex justify-start">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#2563EB] hover:text-[#1D4ED8] hover:bg-[#2563EB]/10 text-xs font-semibold gap-1.5"
                        onClick={() => {
                          setAddingTopicDiscId(disc.id)
                          setNewTopicName("")
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar Tópico
                      </Button>
                    </div>
                  )}

                  {/* Rodapé da Tabela: TOTAL pill + PROGRESSO bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t">
                    {/* TOTAL pill */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black uppercase text-muted-foreground tracking-wider">
                        TOTAL
                      </span>
                      <div className="flex items-center gap-4 px-4 py-1.5 rounded-full border-2 border-[#2563EB] bg-[#2563EB]/5 text-xs font-mono font-bold text-foreground">
                        <span className="text-emerald-600">{totalCorrect}</span>
                        <span className="text-rose-500">{totalWrong}</span>
                        <span className="text-blue-600">{totalQuestions}</span>
                        <span className="text-foreground">{avgAccuracy}%</span>
                      </div>
                    </div>

                    {/* PROGRESSO bar */}
                    <div className="flex items-center gap-3 w-full sm:w-72">
                      <span className="text-xs font-black uppercase text-muted-foreground tracking-wider shrink-0">
                        PROGRESSO
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Adicionar Disciplina Section */}
      <div className="pt-2">
        {isAddingDiscipline ? (
          <div className="rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-2 relative">
            <div className="flex items-center gap-3">
              <input
                type="text"
                autoFocus
                value={newDisciplineName}
                onChange={(e) => setNewDisciplineName(e.target.value)}
                placeholder="Nome da matéria (ex: Direito Penal)..."
                className="flex-1 bg-background border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDiscipline()
                  if (e.key === "Escape") setIsAddingDiscipline(false)
                }}
              />
              <Button
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold"
                onClick={handleAddDiscipline}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Matéria
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setIsAddingDiscipline(false)}
              >
                Cancelar
              </Button>
            </div>
            {disciplineSuggestions.length > 0 && (
              <div className="absolute left-4 top-14 mt-1 w-[min(400px,calc(100vw-2rem))] bg-popover border rounded-md shadow-lg z-50 py-1">
                {disciplineSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    className="w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setNewDisciplineName(s)
                      setDisciplineSuggestions([])
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full border-dashed border-2 py-6 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors gap-2"
            onClick={() => setIsAddingDiscipline(true)}
          >
            <Plus className="h-5 w-5" />
            Nova Disciplina
          </Button>
        )}
      </div>

      {/* Modals */}
      <Dialog open={!!linkModalTopic} onOpenChange={() => setLinkModalTopic(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[#2563EB]">
              <ExternalLink className="h-4 w-4" />
              Adicionar Link do Caderno de Questões
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Insira o link (URL) do seu caderno de questões no QConcursos, TEC Concursos ou PDF
              para o tópico:
            </p>
            <p className="text-xs font-bold text-foreground bg-muted p-2 rounded">
              {linkModalTopic?.number}. {linkModalTopic?.title}
            </p>
            <Input
              placeholder="https://www.qconcursos.com/questoes/cadernos/..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setLinkModalTopic(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveLink}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold"
            >
              Salvar Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Registrar Estudo (Sua Foto 1) */}
      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />

      {/* Modal Editar Disciplina (Sua Foto 2) */}
      <EditDisciplineModal
        open={!!editingDiscipline}
        onOpenChange={(open: boolean) => !open && setEditingDiscipline(null)}
        disciplineName={editingDiscipline?.name || ""}
        disciplineColor={editingDiscipline?.color || "#fef08a"}
        badgeText="RFB"
        initialTopics={
          editingDiscipline?.topics.map((t) => ({
            id: t.id,
            title: t.title,
            badgeText: "RFB",
          })) || []
        }
      />
    </div>
  )
}
