"use client"

import { useCallback, useEffect, useState } from "react"

import { Check, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import {
  addTopicToReviewAction,
  getReviewCatalogAction,
} from "@/application/review-engine/review.actions"
import type { ReviewCatalogTopic } from "@/application/review-engine/review.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CatalogState {
  disciplines: { id: string; name: string }[]
  disciplineId: string | null
  topics: ReviewCatalogTopic[]
  /** Fase I.6: a consulta falhou — diferente de "nenhuma disciplina cadastrada". */
  loadError: boolean
}

/** Adiciona tópicos/subtópicos do edital à revisão. Nada é criado sozinho. */
export function AddToReviewModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [catalog, setCatalog] = useState<CatalogState | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState<string | null>(null)

  const load = useCallback(async (disciplineId?: string | null) => {
    setLoading(true)
    const res = await getReviewCatalogAction(disciplineId ?? null)
    setLoading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    setCatalog(res.data)
  }, [])

  useEffect(() => {
    if (!open) return
    // Carregar o catálogo ao abrir: o estado inicial do modal vem do servidor,
    // não há como derivá-lo em render (mesmo padrão dos outros modais do app).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch("")
    void load(null)
  }, [open, load])

  const add = useCallback(
    async (sourceType: "EDITAL_TOPIC" | "EDITAL_SUBTOPIC", sourceId: string, label: string) => {
      setAdding(sourceId)
      const res = await addTopicToReviewAction({ sourceType, sourceId })
      setAdding(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(res.data?.alreadyExisted ? `${label} já estava nas revisões.` : `${label} adicionado às revisões.`)
      await load(catalog?.disciplineId ?? null)
    },
    [catalog?.disciplineId, load],
  )

  const query = search.trim().toLowerCase()
  const topics = (catalog?.topics ?? []).filter((topic) => {
    if (!query) return true
    if (topic.name.toLowerCase().includes(query)) return true
    return topic.subtopics.some((sub) => sub.name.toLowerCase().includes(query))
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar à revisão</DialogTitle>
          <DialogDescription>
            Escolha um tópico ou subtópico do edital. Ele entra na fila de hoje como novo.
          </DialogDescription>
        </DialogHeader>

        {loading && !catalog && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            <span className="ml-2 text-sm">Carregando o edital…</span>
          </div>
        )}

        {/*
          Fase I.6: três estados. Erro de leitura NÃO pode aparecer como "nenhuma
          disciplina cadastrada" — era o que acontecia quando a consulta falhava.
        */}
        {catalog?.loadError && (
          <EmptyState
            title="Não foi possível carregar suas disciplinas"
            description="A consulta ao servidor falhou. Feche e abra este painel novamente em instantes."
            action={
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(null)}>
                Tentar novamente
              </Button>
            }
          />
        )}

        {catalog && !catalog.loadError && catalog.disciplines.length === 0 && (
          <EmptyState
            title="Nenhuma disciplina cadastrada"
            description="Cadastre suas disciplinas para escolher os tópicos que quer revisar."
          />
        )}

        {catalog && !catalog.loadError && catalog.disciplines.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                {...(catalog.disciplineId ? { value: catalog.disciplineId } : {})}
                onValueChange={(value) => void load(value)}
              >
                <SelectTrigger className="sm:w-64" aria-label="Disciplina">
                  <SelectValue placeholder="Selecione a disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.disciplines.map((discipline) => (
                    <SelectItem key={discipline.id} value={discipline.id}>
                      {discipline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar tópico ou subtópico"
                aria-label="Buscar tópico ou subtópico"
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
              {topics.length === 0 ? (
                <EmptyState
                  compact
                  title="Nenhum tópico encontrado"
                  description="Esta disciplina não tem tópicos cadastrados no catálogo do edital."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {topics.map((topic) => (
                    <li key={topic.id} className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[13px] font-medium text-foreground">
                          {topic.name}
                        </p>
                        {topic.inReview ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Check aria-hidden className="h-3.5 w-3.5" />
                            Na revisão
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={adding === topic.id}
                            aria-label={`Adicionar o tópico ${topic.name} à revisão`}
                            onClick={() => void add("EDITAL_TOPIC", topic.id, topic.name)}
                          >
                            <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />
                            Adicionar
                          </Button>
                        )}
                      </div>

                      {topic.subtopics.length > 0 && (
                        <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                          {topic.subtopics
                            .filter((sub) => !query || sub.name.toLowerCase().includes(query) || topic.name.toLowerCase().includes(query))
                            .map((sub) => (
                              <li key={sub.id} className="flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-xs text-muted-foreground">{sub.name}</p>
                                {sub.inReview ? (
                                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                                    <Check aria-hidden className="h-3 w-3" />
                                    Na revisão
                                  </span>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={adding === sub.id}
                                    aria-label={`Adicionar o subtópico ${sub.name} à revisão`}
                                    onClick={() => void add("EDITAL_SUBTOPIC", sub.id, sub.name)}
                                  >
                                    <Plus aria-hidden className="h-3 w-3" />
                                  </Button>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
