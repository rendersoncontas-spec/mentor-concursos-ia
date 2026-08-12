"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  getSubscriptionDataAction,
  type SubscriptionData,
} from "@/application/subscription/subscription.action"

export function EstudeiSubscriptionView() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSubscriptionDataAction().then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setData(res.data)
      } else {
        setError(res.error || "Erro ao carregar assinatura.")
      }
      setIsLoading(false)
    }).catch(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const handleManageSubscription = () => {
    toast.info("Você está utilizando a versão Free do Mentor Concursos IA. Não há assinatura paga ativa para gerenciar.")
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
        <p className="text-xs text-muted-foreground font-medium">Carregando dados da assinatura...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border bg-card p-14 shadow-sm flex flex-col items-center justify-center text-center space-y-4 my-4">
        <h3 className="text-lg font-bold text-foreground">Não foi possível carregar a assinatura</h3>
        <p className="text-xs text-muted-foreground font-medium">{error || "Tente novamente mais tarde."}</p>
      </div>
    )
  }

  const isFree = data.status === "gratuito"

  return (
    <div className="space-y-6">
      {/* Header Actions — 100% Estudei */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-foreground">Assinatura</h1>

        <Button
          onClick={handleManageSubscription}
          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs px-5 shadow-xs"
        >
          Gerenciar
        </Button>
      </div>

      {/* Card do Plano Ativo */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col md:flex-row">
        {/* Bloco da Esquerda */}
        <div className="w-full md:w-64 bg-[#2563EB] text-slate-900 font-black text-3xl flex items-center justify-center p-8 shrink-0 tracking-tight">
          {data.plan}
        </div>

        {/* Bloco de Detalhes da Direita */}
        <div className="flex-1 p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-xs font-semibold">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Status:</strong>{" "}
              <span className={isFree ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                {isFree ? "Ativo (Plano Gratuito)" : data.status}
              </span>
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Adesão:</strong>{" "}
              {data.adhesionDate ?? "—"}
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Vencimento:</strong>{" "}
              <span className="text-muted-foreground">{isFree ? "Sem vencimento (gratuito)" : "—"}</span>
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Próximo pagamento:</strong>{" "}
              {isFree ? "Isento" : data.nextPayment ?? "—"}
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Valor:</strong>{" "}
              {data.amount ?? "R$ 0,00"}
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Forma de pagamento:</strong>{" "}
              {isFree ? "Plano Gratuito (Versão Free)" : data.paymentMethod ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Aviso honesto sobre assinatura paga */}
      {isFree && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs text-foreground">
          <strong>Você está no plano gratuito.</strong>{" "}
          A funcionalidade de assinatura paga ainda não está disponível nesta versão do aplicativo. Nenhum valor é cobrado da sua conta.
        </div>
      )}

      {/* Tabela do Histórico de Compras */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-card">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            HISTÓRICO DE COMPRAS
          </h3>
        </div>

        {data.purchaseHistory.length === 0 ? (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-2">
            <h4 className="text-sm font-bold text-foreground">Você ainda não possui histórico de compras</h4>
            <p className="text-xs text-muted-foreground font-medium max-w-md">
              Quando houver compras ou renovações de assinatura, elas aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground font-semibold">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Provedor</th>
                  <th className="px-4 py-3">Assinatura</th>
                  <th className="px-4 py-3">Período do Serviço</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Forma de Pagamento</th>
                  <th className="px-3 py-3 text-center">Recorrência</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.purchaseHistory.map((purchase, idx) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-muted-foreground">{purchase.date}</td>
                    <td className="px-4 py-3 font-bold text-foreground">{purchase.provider}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{purchase.plan}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{purchase.period}</td>
                    <td className="px-3 py-3 text-center font-bold text-emerald-600">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                        {purchase.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{purchase.paymentMethod}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground font-mono">{purchase.recurring}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">{purchase.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
