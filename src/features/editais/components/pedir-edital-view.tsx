"use client"

import { useCallback, useEffect, useState } from "react"

import { Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import {
  type EditalRequestItem,
  createEditalRequestAction,
  deleteEditalRequestAction,
  listEditalRequestsAction,
} from "@/application/editais/edital-request.action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"

export function PedirEditalView() {
  const [requests, setRequests] = useState<EditalRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("Todos")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const [editalName, setEditalName] = useState("")
  const [cargo, setCargo] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [description, setDescription] = useState("")
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const loadRequests = useCallback(() => {
    void (async () => {
      await Promise.resolve()
      setIsLoading(true)
      setLoadError(null)
      const res = await listEditalRequestsAction()
      if (res.success && res.data) {
        setRequests(res.data)
      } else {
        setLoadError(res.error || "Erro ao carregar pedidos.")
      }
      setIsLoading(false)
    })()
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editalName.trim()) {
      toast.error("Informe o nome do edital que procura.")
      return
    }

    if (!linkUrl.trim() && !pdfFile) {
      toast.error("Informe um link ou anexe um arquivo PDF do edital.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await createEditalRequestAction({
        editalName,
        cargo,
        linkUrl,
        pdfName: pdfFile ? pdfFile.name : undefined,
        description,
      })

      if (!res.success) {
        toast.error(res.error || "Erro ao enviar o pedido.")
        return
      }

      toast.success(
        "Pedido de edital enviado com sucesso! Nosso time analisará em até 5 dias úteis.",
      )
      setEditalName("")
      setCargo("")
      setLinkUrl("")
      setDescription("")
      setPdfFile(null)
      setIsModalOpen(false)
      loadRequests()
    } catch {
      toast.error("Erro inesperado ao enviar o pedido.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveRequest = async (id: string) => {
    setRemovingId(id)
    try {
      const res = await deleteEditalRequestAction(id)
      if (!res.success) {
        toast.error(res.error || "Erro ao remover o pedido.")
        return
      }
      setRequests((prev) => prev.filter((r) => r.id !== id))
      toast.success("Pedido removido.")
    } catch {
      toast.error("Erro inesperado ao remover o pedido.")
    } finally {
      setRemovingId(null)
    }
  }

  const filteredRequests = requests.filter((r) => {
    if (statusFilter === "Todos") return true
    return r.status === statusFilter
  })

  const statusBadgeClass = (status: EditalRequestItem["status"]) => {
    if (status === "Concluído") return "bg-emerald-500/10 text-emerald-600"
    if (status === "Em Análise") return "bg-sky-500/10 text-sky-600"
    return "bg-amber-500/10 text-amber-600"
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="rounded-xl border bg-card p-14 shadow-sm flex flex-col items-center justify-center text-center space-y-4 my-4">
          <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
          <p className="text-xs text-muted-foreground font-medium">Carregando seus pedidos...</p>
        </div>
      )
    }

    if (loadError) {
      return (
        <div className="rounded-xl border bg-card p-14 shadow-sm flex flex-col items-center justify-center text-center space-y-4 my-4">
          <h3 className="text-lg font-bold text-foreground">
            Não foi possível carregar os pedidos
          </h3>
          <p className="text-xs text-muted-foreground font-medium">{loadError}</p>
          <Button
            onClick={loadRequests}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 shadow-xs mt-2"
          >
            Tentar novamente
          </Button>
        </div>
      )
    }

    if (filteredRequests.length === 0) {
      return (
        <div className="rounded-xl border bg-card p-14 shadow-sm flex flex-col items-center justify-center text-center space-y-4 my-4">
          <div className="space-y-1 max-w-md">
            <h3 className="text-lg font-bold text-foreground">Nenhum pedido de edital ainda</h3>
            <p className="text-xs text-muted-foreground font-medium">
              Quando você não encontrar um edital, pode enviar um pedido para nossa equipe.
            </p>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-6 shadow-xs mt-2"
          >
            Pedir agora
          </Button>
        </div>
      )
    }

    return (
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-card flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            MEUS PEDIDOS DE EDITAIS
          </h3>
          <Badge variant="outline" className="text-[10px] font-semibold">
            {filteredRequests.length} pedidos
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground font-semibold">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Edital Solicitado</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-muted-foreground">{req.date}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{req.editalName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{req.cargo || "—"}</td>
                  <td className="px-3 py-3 text-center">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] font-bold ${statusBadgeClass(req.status)}`}
                    >
                      {req.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => handleRemoveRequest(req.id)}
                      disabled={removingId === req.id}
                      className="text-muted-foreground/50 hover:text-rose-500 p-1 rounded transition-colors disabled:opacity-40"
                      title="Remover"
                    >
                      {removingId === req.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-foreground">Pedidos de Editais</h1>

        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
        >
          Novo pedido
        </Button>
      </div>

      <div className="max-w-xs space-y-1">
        <label className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block">
          STATUS
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full h-9 bg-transparent border-b border-[#2563EB] text-xs font-bold text-foreground focus:outline-none cursor-pointer py-1"
        >
          <option value="Todos">Todos</option>
          <option value="Pendente">Pendente</option>
          <option value="Em Análise">Em Análise</option>
          <option value="Concluído">Concluído</option>
        </select>
      </div>

      {renderContent()}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-xl p-6 rounded-2xl">
          <div className="space-y-4">
            <h2 className="text-xl font-black text-foreground tracking-tight">Pedir edital</h2>

            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              Não encontrou seu edital? Envie os dados abaixo. Nosso time analisa seu pedido em até
              5 dias úteis e avisaremos quando ele for cadastrado.
            </p>

            <form onSubmit={handleSendRequest} className="space-y-4 pt-1">
              {/* Campo 1: Nome do Edital */}
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                  NOS CONTE, QUAL É O EDITAL QUE VOCÊ PROCURA? (OBRIGATÓRIO)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Polícia Federal 2026"
                  value={editalName}
                  onChange={(e) => setEditalName(e.target.value)}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground py-1.5 focus:outline-none placeholder:text-muted-foreground/50"
                  required
                  autoFocus
                />
              </div>

              {/* Campos 2 & 3: Cargo e Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                    CARGO (OPCIONAL)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Delegado"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground py-1.5 focus:outline-none placeholder:text-muted-foreground/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                    LINK DO EDITAL (OBRIGATÓRIO SE NÃO ANEXAR PDF)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="w-full bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground py-1.5 focus:outline-none placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>

              {/* Campo 4: Descrição */}
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground">
                  DESCRIÇÃO (OPCIONAL)
                </label>
                <textarea
                  placeholder="Qualquer detalhe que ajude nossa equipe a encontrar o edital"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.substring(0, 100))}
                  maxLength={100}
                  className="w-full bg-transparent border-b border-[#2563EB] text-xs font-semibold text-foreground py-1.5 focus:outline-none resize-none h-16 placeholder:text-muted-foreground/50"
                />
                <div className="text-right text-[10px] text-muted-foreground font-mono">
                  {description.length}/100
                </div>
              </div>

              {/* Campo 5: Anexar PDF */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-extrabold uppercase text-muted-foreground block">
                  ANEXAR EDITAL (OBRIGATÓRIO SE NÃO INFORMAR LINK: 1 ARQUIVO PDF, ATÉ 20MB)
                </label>

                <label className="border-2 border-dashed border-muted hover:border-[#2563EB] rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-muted/20">
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs font-bold text-muted-foreground">
                    {pdfFile ? pdfFile.name : "Inserir seu PDF aqui"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <p className="text-[11px] text-muted-foreground font-medium leading-relaxed pt-1">
                Preencha o nome do edital e informe ao menos o link ou um PDF. Isso ajuda nosso time
                a localizar o edital correto com mais rapidez e precisão. O prazo de análise é de
                até 5 dias úteis.
              </p>

              {/* Modal Buttons (Cancelar & Enviar) */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-muted-foreground/40 text-muted-foreground hover:bg-muted font-bold text-xs px-6 h-9 rounded-xl"
                >
                  Cancelar
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-7 h-9 rounded-xl shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
