"use client"

import { useCallback, useEffect, useState } from "react"

import { AlertTriangle, Database, Eye, Loader2, Trash2 } from "lucide-react"
import { Upload } from "lucide-react"
import { toast } from "sonner"

import {
  type ImportBatchItem,
  deleteAllImportedAction,
  deleteImportBatchAction,
  listImportsAction,
} from "@/application/import-history/import-history.actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { originDisplayName } from "@/features/importacao/lib/origin"

interface ManageImportsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
  onImportClick?: () => void
}

function formatImportDate(value: string): string {
  const date = new Date(value)
  if (isNaN(date.getTime())) return ""
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()} • ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function ManageImportsModal({
  open,
  onOpenChange,
  onChanged,
  onImportClick,
}: ManageImportsModalProps) {
  const [imports, setImports] = useState<ImportBatchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmAllStep, setConfirmAllStep] = useState<0 | 1 | 2>(0)
  const [deletingAll, setDeletingAll] = useState(false)

  const loadImports = useCallback(async () => {
    setLoading(true)
    const res = await listImportsAction()
    if (res.success && res.data) {
      setImports(res.data)
      setLoadError(null)
    } else {
      setLoadError(res.error ?? "Erro desconhecido ao carregar importações.")
      toast.error(res.error ?? "Erro ao carregar importações.")
    }
    setLoading(false)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setConfirmingDeleteId(null)
        setConfirmAllStep(0)
        void loadImports()
      }
      onOpenChange(next)
    },
    [onOpenChange, loadImports],
  )

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => void loadImports(), 0)
    return () => clearTimeout(timer)
  }, [open, loadImports])

  const totalSessions = imports.reduce((acc, i) => acc + i.sessionCount, 0)

  const perOriginSummary = useCallback(() => {
    const map = new Map<string, number>()
    for (const item of imports) {
      const name = originDisplayName(item.source as never, item.sourceName)
      map.set(name, (map.get(name) ?? 0) + item.sessionCount)
    }
    return [...map.entries()]
  }, [imports])

  const handleDeleteBatch = async (importId: string) => {
    setDeletingId(importId)
    const res = await deleteImportBatchAction(importId)
    setDeletingId(null)
    if (!res.success) {
      toast.error(res.error ?? "Erro ao excluir importação.")
      return
    }
    toast.success("Importação excluída com sucesso.")
    setConfirmingDeleteId(null)
    onChanged?.()
    void loadImports()
  }

  const handleDeleteAll = async () => {
    setDeletingAll(true)
    const res = await deleteAllImportedAction()
    setDeletingAll(false)
    if (!res.success) {
      toast.error(res.error ?? "Erro ao excluir dados importados.")
      return
    }
    toast.success("Todos os dados importados foram excluídos.")
    setConfirmAllStep(0)
    onChanged?.()
    void loadImports()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-background p-0 gap-0">
        <DialogTitle className="sr-only">Gerenciar importações</DialogTitle>
        <DialogDescription className="sr-only">
          Lista, visualiza e exclui importações de histórico realizadas na sua conta.
        </DialogDescription>

        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-6 py-4">
          <Database className="h-4 w-4 text-[#2563EB]" />
          <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
            Gerenciar importações
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Importações realizadas para a sua conta. Excluir uma importação remove apenas as sessões
            importadas — estudos criados normalmente no Nomeia não são afetados.
          </p>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && imports.length === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center space-y-3">
              <Database className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-bold text-foreground">Nenhuma importação encontrada</p>
              {loadError ? (
                <p className="text-[11px] font-bold text-rose-600">{loadError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Importe seu histórico de outra plataforma para começar.
                </p>
              )}
              <Button
                size="sm"
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs gap-2"
                onClick={() => {
                  onOpenChange(false)
                  onImportClick?.()
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                Importar Histórico
              </Button>
            </div>
          )}
          {!loading && imports.length > 0 && (
            <div className="space-y-3">
              {imports.map((item) => (
                <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-extrabold text-foreground">
                        {originDisplayName(item.source as never, item.sourceName)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatImportDate(item.createdAt)} •{" "}
                        <span className="font-bold">
                          {item.sessionCount} registro{item.sessionCount !== 1 ? "s" : ""}
                        </span>
                        {item.fileName ? ` • ${item.fileName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] font-bold gap-1 h-7"
                        onClick={() => {
                          window.location.assign(`/dashboard/history?import=${item.id}`)
                        }}
                      >
                        <Eye className="h-3 w-3" />
                        Ver registros
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] font-bold gap-1 h-7 text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => setConfirmingDeleteId(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Excluir
                      </Button>
                    </div>
                  </div>

                  {confirmingDeleteId === item.id && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/20 p-3 space-y-2">
                      <p className="text-xs font-extrabold text-rose-700 dark:text-rose-300">
                        EXCLUIR IMPORTAÇÃO?
                      </p>
                      <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                        Você está prestes a excluir {item.sessionCount} registro
                        {item.sessionCount !== 1 ? "s" : ""} importado
                        {item.sessionCount !== 1 ? "s" : ""} do{" "}
                        {originDisplayName(item.source as never, item.sourceName)}. Essa ação NÃO
                        afetará seus estudos criados diretamente no Nomeia.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-[11px] font-bold"
                          onClick={() => setConfirmingDeleteId(null)}
                          disabled={deletingId !== null}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white"
                          disabled={deletingId !== null}
                          onClick={() => void handleDeleteBatch(item.id)}
                        >
                          {deletingId === item.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Excluindo...
                            </>
                          ) : (
                            "Excluir importação"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && imports.length > 0 && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <p className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Excluir todos os dados importados
                </p>
              </div>

              {confirmAllStep === 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold text-rose-700 dark:text-rose-300">
                    Excluir todos os dados importados?
                  </p>
                  <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                    Isso removerá as sessões importadas para sua conta de todas as origens (
                    {totalSessions} sessão{totalSessions !== 1 ? "es" : ""} no total):
                  </p>
                  <ul className="text-[11px] text-rose-700 dark:text-rose-300 space-y-0.5">
                    {perOriginSummary().map(([name, count]) => (
                      <li key={name} className="flex justify-between font-bold">
                        <span>{name}:</span>
                        <span>{count}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[11px] font-bold border-rose-300 text-rose-700 hover:bg-rose-100"
                    onClick={() => setConfirmAllStep(1)}
                  >
                    Continuar
                  </Button>
                </div>
              )}

              {confirmAllStep === 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold text-rose-700 dark:text-rose-300">
                    Esta ação removerá todas as sessões importadas da sua conta e não poderá ser
                    desfeita.
                  </p>
                  <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                    Estudos criados normalmente no Nomeia, sessões do cronômetro e dados de outros
                    usuários não serão afetados.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-[11px] font-bold"
                      onClick={() => setConfirmAllStep(0)}
                      disabled={deletingAll}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white"
                      disabled={deletingAll}
                      onClick={() => void handleDeleteAll()}
                    >
                      {deletingAll ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Excluindo...
                        </>
                      ) : (
                        "Sim, excluir tudo"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
