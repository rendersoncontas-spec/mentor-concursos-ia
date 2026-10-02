"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import { Check, ChevronDown, ChevronUp, ExternalLink, Plus } from "lucide-react"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  addCustomDisciplineAction,
  removeCustomTopicAction,
  removeDisciplineAction,
  saveCustomTopicsAction,
  searchDisciplinesAction,
} from "@/application/edital/edital.action"
import {
  deleteEditalTopicProgressAction,
  getEditalTopicProgressAction,
  importEditalTopicProgressAction,
  setEditalTopicProgressAction,
} from "@/application/edital/edital-topic-progress.actions"
import { isSafeHref } from "@/domain/library/library-url"
import { createCustomTopicAction } from "@/application/topic-catalog/topic-catalog.actions"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TargetSelectorDropdown } from "@/features/dashboard/components/target-selector-dropdown"
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
  const [linkModalDiscId, setLinkModalDiscId] = useState<string | null>(null)
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

  // G1.1 (G-29): fonte de verdade é o SERVIDOR (`edital_topic_progress`).
  // localStorage serve SOMENTE para a migração única de dados legados.
  const storageKeyFor = (targetId?: string) =>
    targetId ? `mentor_edital_checked_topics_${targetId}` : "mentor_edital_checked_topics"

  const readLegacyChecked = (targetId?: string): Record<string, boolean> | null => {
    try {
      const raw = localStorage.getItem(storageKeyFor(targetId))
      if (!raw) return null
      const parsed = JSON.parse(raw) as Record<string, boolean>
      if (!parsed || typeof parsed !== "object") return null
      return parsed
    } catch {
      return null
    }
  }

  const removeLegacyChecked = (targetId?: string) => {
    try {
      localStorage.removeItem(storageKeyFor(targetId))
      // Chave legada não-escopada (pré-G1.1): nunca mais usada como fonte.
      localStorage.removeItem("mentor_edital_checked_topics")
    } catch {
      // Modo privado/cota: segue sem cache local.
    }
  }

  // Carregar progresso: servidor primeiro; legado só como fallback/migração.
  useEffect(() => {
    if (typeof window === "undefined") return
    let cancelled = false

    // Remove legado não escopado com dados fake de teste para evitar que Raciocínio Lógico inicie em 14%
    const legacyKey = "mentor_edital_checked_topics"
    const legacyData = localStorage.getItem(legacyKey)
    if (legacyData && activeTargetId) {
      localStorage.removeItem(legacyKey)
    }

    if (!activeTargetId) {
      const savedChecked = readLegacyChecked(undefined)
      setTimeout(() => !cancelled && setCompletedTopics(savedChecked ?? {}), 0)
      return
    }

    void (async () => {
      const res = await getEditalTopicProgressAction(activeTargetId)
      if (cancelled) return
      if (!res.success && res.storageUnavailable) {
        // Banco sem a tabela G1.1: comportamento legado até a migration.
        setServerUnavailable(true)
        const savedChecked = readLegacyChecked(activeTargetId)
        setTimeout(() => !cancelled && setCompletedTopics(savedChecked ?? {}), 0)
        return
      }
      if (!res.success) {
        setTimeout(() => !cancelled && setCompletedTopics({}), 0)
        return
      }
      const serverChecked = res.checked ?? {}
      // Lazy migration única: LS com dados + servidor vazio → importa e limpa.
      const legacy = readLegacyChecked(activeTargetId)
      if (legacy && Object.keys(legacy).length > 0 && Object.keys(serverChecked).length === 0) {
        const imported = await importEditalTopicProgressAction(activeTargetId, legacy)
        if (cancelled) return
        if (imported.success) {
          removeLegacyChecked(activeTargetId)
          const trues: Record<string, boolean> = {}
          for (const [k, v] of Object.entries(legacy)) if (v === true) trues[k] = true
          setTimeout(() => !cancelled && setCompletedTopics(trues), 0)
          return
        }
      } else if (legacy && Object.keys(serverChecked).length > 0) {
        // Servidor venceu: descarta o cache local para não ressuscitar stale.
        removeLegacyChecked(activeTargetId)
      }
      setTimeout(() => !cancelled && setCompletedTopics(serverChecked), 0)
    })()

    return () => {
      cancelled = true
    }
  }, [activeTargetId])

  const [serverUnavailable, setServerUnavailable] = useState(false)

  const toggleCheck = (topicId: string) => {
    const updated = { ...completedTopics, [topicId]: !completedTopics[topicId] }
    setCompletedTopics(updated)
    if (!activeTargetId) {
      try {
        localStorage.setItem(storageKeyFor(undefined), JSON.stringify(updated))
      } catch {
        // Sem target não há escopo de servidor: mantém só em memória.
      }
      return
    }
    if (serverUnavailable) {
      try {
        localStorage.setItem(storageKeyFor(activeTargetId), JSON.stringify(updated))
      } catch {
        // Modo privado/cota: segue sem cache local.
      }
      return
    }
    // Otimista com reversão honesta em falha (servidor é a verdade).
    void (async () => {
      const res = await setEditalTopicProgressAction(activeTargetId, topicId, updated[topicId] === true)
      if (!res.success) {
        if (res.storageUnavailable) {
          setServerUnavailable(true)
          try {
            localStorage.setItem(storageKeyFor(activeTargetId), JSON.stringify(updated))
          } catch {
            // Segue sem cache local.
          }
          return
        }
        setCompletedTopics(completedTopics)
        toast.error(res.error || "Não foi possível salvar o progresso.")
      }
    })()
  }

  // G1.14 — o link PERSISTE no backend (saveCustomTopicsAction), como
  // tópico novo/edição. Antes: só setData + toast de sucesso, reload perdia.
  // URLs fora de http(s) são rejeitadas com erro honesto (mesma regra da
  // Biblioteca) e nunca viram <a href> (defesa em profundidade na leitura).
  const handleSaveLink = () => {
    if (!linkModalTopic || !linkModalDiscId || !activeTargetId) return
    const trimmed = inputUrl.trim()
    if (trimmed !== "" && !isSafeHref(trimmed)) {
      toast.error("URL inválida. Use um link http(s) completo.")
      return
    }
    const discId = linkModalDiscId
    const topicId = linkModalTopic.id
    const previousData = data
    const updatedData = data.map((disc) => ({
      ...disc,
      topics: disc.topics.map((t) =>
        t.id === topicId ? { ...t, link: trimmed || null } : t,
      ),
    }))
    setData(updatedData)
    setLinkModalTopic(null)
    setLinkModalDiscId(null)
    setInputUrl("")
    void (async () => {
      const topics = updatedData.find((d) => d.id === discId)?.topics ?? []
      const res = await saveCustomTopicsAction(activeTargetId, discId, topics)
      if (res.success) {
        toast.success("Link do caderno de questões salvo!")
      } else {
        setData(previousData)
        toast.error(res.error || "Não foi possível salvar o link.")
      }
    })()
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
    // G1.16: trava de reentrância — duplo clique criava matérias duplicadas.
    if (isSaving) return
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
    // G1.16: trava de reentrância (id usa Date.now — duplo clique duplicava).
    if (isSaving) return
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

    // Salva no backend (com rollback honesto em falha — G1.16)
    const previousTopics = disc.topics
    const res = await saveCustomTopicsAction(activeTargetId, discId, updatedTopics)
    if (res.success) {
      setNewTopicName("")
      setAddingTopicDiscId(null)
      toast.success("Tópico adicionado!")
    } else {
      setData((prev) => prev.map((d) => (d.id === discId ? { ...d, topics: previousTopics } : d)))
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
    // G1.16: trava de reentrância — duplo clique disparava duas exclusões.
    if (isSaving) return
    setIsSaving(true)
    if (!activeTargetId) {
      toast.error("Nenhum concurso ativo.")
      // G1.16 (TRAP 1): este return precoce esquecia setIsSaving(false) e
      // travava todos os botões de add/delete até remontar a página.
      setIsSaving(false)
      return
    }
    const res = await removeDisciplineAction(discId, activeTargetId)
    if (res.success) {
      const removedTopicIds =
        data.find((d) => d.id === discId)?.topics.map((t) => t.id) ?? []
      setData((prev) => prev.filter((d) => d.id !== discId))
      // G1.14 — progresso dos tópicos da matéria excluída não conta mais.
      if (removedTopicIds.length > 0) {
        const removed = new Set(removedTopicIds)
        setCompletedTopics((prev) => {
          const next: Record<string, boolean> = {}
          for (const [k, v] of Object.entries(prev)) if (!removed.has(k)) next[k] = v
          return next
        })
        void Promise.all(
          removedTopicIds.map((topicId) =>
            deleteEditalTopicProgressAction(activeTargetId, topicId).catch(() => undefined),
          ),
        )
      }
      toast.success("Matéria removida!")
      // DECISAO DE PRODUTO (Fase 12 -> Fase 13, opcao A): Edital e Ciclo
      // continuam desacoplados de proposito - remover do Edital nunca apaga
      // nada do Ciclo. Este aviso é só informativo (nunca bloqueia a
      // remoção, que já aconteceu acima).
      if (res.activeCyclesWithDiscipline && res.activeCyclesWithDiscipline > 0) {
        const count = res.activeCyclesWithDiscipline
        toast.warning(
          `Esta disciplina também está presente em ${count} ciclo${count > 1 ? "s" : ""} ativo${count > 1 ? "s" : ""}. Removê-la do Edital não a removerá dos seus Ciclos.`,
        )
      }
      router.refresh()
    } else {
      toast.error(res.error || "Erro ao remover matéria")
    }
    setIsSaving(false)
  }

  const handleDeleteTopic = async (discId: string, topicId: string) => {
    if (!activeTargetId) return
    if (!confirm("Excluir este tópico?")) return
    // G1.16: trava de reentrância.
    if (isSaving) return
    setIsSaving(true)
    const res = await removeCustomTopicAction(activeTargetId, discId, topicId)
    if (res.success) {
      setData((prev) =>
        prev.map((d) =>
          d.id === discId ? { ...d, topics: d.topics.filter((t) => t.id !== topicId) } : d,
        ),
      )
      // G1.14 — progresso de tópico excluído não conta mais (local + servidor).
      setCompletedTopics((prev) => {
        if (!(topicId in prev)) return prev
        const next = { ...prev }
        delete next[topicId]
        return next
      })
      void deleteEditalTopicProgressAction(activeTargetId, topicId).catch(() => {
        // Best-effort: a verdade local já foi corrigida acima.
      })
      toast.success("Tópico removido!")
      router.refresh()
    } else {
      toast.error(res.error || "Erro ao remover tópico")
    }
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Barra de ações + progresso — Fase E: o título fica no cabeçalho fixo
          da página (antes havia um segundo H1 "Edital Verticalizado" aqui). */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <TargetSelectorDropdown
          initialActiveTargetName={activeTargetName ?? null}
          className="w-full md:w-[290px] min-w-0"
        />
        <Button onClick={() => setIsRegisterModalOpen(true)} className="shrink-0">
          <Plus aria-hidden className="h-4 w-4" />
          Adicionar estudo
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[13px] font-semibold text-foreground">Progresso no edital</span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
              {completedTopicsCount} de {totalTopicsCount} tópicos concluídos
            </span>
          </div>
          <span className="text-lg font-semibold tabular-nums text-foreground">{overallProgressPercentage}%</span>
        </div>
        <Progress value={overallProgressPercentage} aria-label="Progresso no edital" />
      </div>

      {/* Lista de Disciplinas do Edital */}
      <div className="space-y-2">
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
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* Cabeçalho da Disciplina */}
              <div
                onClick={() => setOpenDisciplineId(isOpen ? null : disc.id)}
                className="group flex items-center justify-between gap-3 px-4 py-3 bg-card hover:bg-muted/20 cursor-pointer border-b border-border transition-colors"
              >
                {/* Esquerda: Barra de Cor + Nome da Disciplina */}
                <div className="flex min-w-0 items-center gap-3">
                  <div aria-hidden className="w-1 h-5 shrink-0 rounded-full" style={{ backgroundColor: disc.color }} />
                  <h3 className="truncate text-sm font-semibold text-foreground">{disc.name}</h3>
                </div>

                {/* Direita: Pílula de Métricas + Barra de Progresso da Matéria + Lápis Editar + Setinha */}
                <div className="flex items-center gap-4">
                  {/* Pílula de Métricas das Questões (Verde/Red/Gray/%) */}
                  {/* Fase E: os 4 números agora têm rótulo (antes eram números soltos) */}
                  <div className="hidden md:flex items-center gap-3 tabular-nums text-xs text-muted-foreground">
                    <span title="Acertos"><span className="font-medium text-success">{totalCorrect}</span> acertos</span>
                    <span title="Erros"><span className="font-medium text-destructive">{totalWrong}</span> erros</span>
                    <span title="Questões"><span className="font-medium text-foreground">{totalQuestions}</span> questões</span>
                    <span title="Aproveitamento" className="font-medium text-foreground">{avgAccuracy}%</span>
                  </div>

                  {/* Barra de Progresso da Matéria (ex: 3% + Barra Verde-Água) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {progressPercentage}%
                    </span>
                    <Progress value={progressPercentage} className="w-24 lg:w-32" aria-label={`Progresso em ${disc.name}`} />
                  </div>

                  {/* Ícone de Expansão — G1.16: o lápis "Editar disciplina"
                      foi removido porque o modal de edição não tinha
                      persistência neste contexto (abrir, editar e "salvar"
                      perdia tudo no refresh com toast de sucesso falso).
                      Reintroduzir somente com action real de persistência. */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDiscipline(disc.id)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      title="Excluir disciplina"
                      aria-label={`Excluir ${disc.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenDisciplineId(isOpen ? null : disc.id)
                    }}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Recolher ${disc.name}` : `Expandir ${disc.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
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
                        <tr className="type-label border-b">
                          <th className="py-2.5 px-3 font-semibold">Tópicos</th>
                          <th
                            className="type-label py-2.5 px-3 text-center"
                            title="Acertos"
                          >
                            Acertos
                          </th>
                          <th
                            className="type-label py-2.5 px-3 text-center"
                            title="Erros"
                          >
                            Erros
                          </th>
                          <th
                            className="type-label py-2.5 px-3 text-center"
                            title="Total de questões"
                          >
                            Questões
                          </th>
                          <th
                            className="type-label py-2.5 px-3 text-center"
                            title="Desempenho"
                          >
                            %
                          </th>
                          <th className="type-label py-2.5 px-3 text-center" title="Data do último estudo">
                            Último estudo
                          </th>
                          <th className="type-label py-2.5 px-3 text-center" title="Quantidade de vezes estudou">
                            Sessões
                          </th>
                          <th className="type-label py-2.5 px-3 text-center">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {disc.topics.map((topic) => {
                          const isChecked = !!completedTopics[topic.id]

                          return (
                            <tr key={topic.id} className="hover:bg-muted/20 transition-colors">
                              {/* Checkbox + Tópico */}
                              <td className="py-2.5 px-3 font-medium text-muted-foreground leading-relaxed max-w-[450px]">
                                <div className="flex items-start gap-2.5 group/topic relative">
                                  <button
                                    onClick={() => toggleCheck(topic.id)}
                                    className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                                      isChecked
                                        ? "bg-primary border-primary text-white"
                                        : "border-muted-foreground/40 hover:border-primary bg-background"
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
                              <td className="py-2.5 px-3 text-center tabular-nums font-semibold text-emerald-600">
                                {topic.correct}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums font-semibold text-rose-500">
                                {topic.wrong}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums text-primary font-semibold">
                                {topic.questions}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums font-semibold text-foreground">
                                {topic.accuracy > 0 ? `${topic.accuracy}%` : "0"}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                                {topic.lastStudy || "-"}
                              </td>
                              <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                                {topic.studyCount}
                              </td>

                              {/* Link do Caderno de Questões */}
                              <td className="py-2.5 px-3 text-center">
                                {topic.link && isSafeHref(topic.link) ? (
                                  <a
                                    href={topic.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1"
                                  >
                                    <span>Abrir</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setLinkModalTopic(topic)
                                      setLinkModalDiscId(disc.id)
                                      setInputUrl("")
                                    }}
                                    className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
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
                                  className="h-8 px-3"
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
                        className="text-primary hover:text-primary/90 hover:bg-primary/10 text-xs font-semibold gap-1.5"
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

                  {/* Fase E: removido o rodapé "TOTAL / PROGRESSO" — repetia os mesmos
                      números e a mesma barra do cabeçalho da disciplina. */}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Adicionar Disciplina Section */}
      <div className="pt-2">
        {isAddingDiscipline ? (
          <div className="rounded-xl border bg-card p-4 flex flex-col gap-2 relative">
            <div className="flex items-center gap-3">
              <input
                type="text"
                autoFocus
                value={newDisciplineName}
                onChange={(e) => setNewDisciplineName(e.target.value)}
                placeholder="Nome da matéria (ex: Direito Penal)..."
                className="flex-1 bg-background border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDiscipline()
                  if (e.key === "Escape") setIsAddingDiscipline(false)
                }}
              />
              <Button
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
      <Dialog
        open={!!linkModalTopic}
        onOpenChange={() => {
          setLinkModalTopic(null)
          setLinkModalDiscId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2 text-primary">
              <ExternalLink className="h-4 w-4" />
              Adicionar Link do Caderno de Questões
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Insira o link (URL) do seu caderno de questões no QConcursos, TEC Concursos ou PDF
              para o tópico:
            </p>
            <p className="text-xs font-semibold text-foreground bg-muted p-2 rounded">
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
            <Button
              variant="outline"
              onClick={() => {
                setLinkModalTopic(null)
                setLinkModalDiscId(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveLink}
            >
              Salvar Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Registrar Estudo (Sua Foto 1) */}
      <StudyRegisterModal open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen} />
    </div>
  )
}
