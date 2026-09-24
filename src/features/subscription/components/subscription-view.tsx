"use client"

import type React from "react"
import { useEffect, useState } from "react"

import { Info, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  type SubscriptionData,
  getSubscriptionDataAction,
} from "@/application/subscription/subscription.action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

export function SubscriptionView() {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSubscriptionDataAction()
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setData(res.data)
        } else {
          setError(res.error || "Erro ao carregar assinatura.")
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleManageSubscription = () => {
    toast.info(
      "Você está utilizando a versão Free do Nomeia. Não há assinatura paga ativa para gerenciar.",
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        <p className="text-[13px]">Carregando dados da assinatura…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center space-y-1.5">
        <h2 className="text-sm font-medium text-foreground">Não foi possível carregar a assinatura</h2>
        <p className="text-[13px] text-muted-foreground">{error || "Tente novamente mais tarde."}</p>
      </div>
    )
  }

  const isFree = data.status === "gratuito"

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Adesão", value: data.adhesionDate ?? "—" },
    { label: "Vencimento", value: isFree ? "Sem vencimento (gratuito)" : "—" },
    { label: "Próximo pagamento", value: isFree ? "Isento" : (data.nextPayment ?? "—") },
    { label: "Valor", value: data.amount ?? "R$ 0,00" },
    {
      label: "Forma de pagamento",
      value: isFree ? "Plano gratuito (versão Free)" : (data.paymentMethod ?? "—"),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Plano atual — Fase E: cabeçalho da seção + lista de dados (antes: bloco
          teal sólido com o nome do plano em 30px e um H1 repetindo o título). */}
      <section aria-labelledby="plano-atual" className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">Plano atual</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="plano-atual" className="type-h2 text-foreground">
                {data.plan}
              </h2>
              <Badge variant={isFree ? "success" : "warning"}>
                {isFree ? "Ativo · gratuito" : data.status}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleManageSubscription}>
            Gerenciar assinatura
          </Button>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{d.label}</dt>
              <dd className="mt-0.5 text-sm text-foreground tabular-nums">{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Aviso honesto sobre assinatura paga */}
      {isFree && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium text-foreground">Você está no plano gratuito.</span> A
            assinatura paga ainda não está disponível nesta versão do aplicativo. Nenhum valor é
            cobrado da sua conta.
          </span>
        </p>
      )}

      {/* Tabela do Histórico de Compras */}
      <section aria-labelledby="historico-compras" className="space-y-2.5">
        <h2 id="historico-compras" className="type-h3 text-foreground">
          Histórico de compras
        </h2>
      <div className="rounded-lg border border-border bg-card overflow-hidden">

        {data.purchaseHistory.length === 0 ? (
          <EmptyState
            compact
            title="Nenhuma compra registrada"
            description="Quando houver compras ou renovações de assinatura, elas aparecerão aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="type-label border-b bg-muted/40">
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
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{purchase.date}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{purchase.provider}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{purchase.plan}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{purchase.period}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-600">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                        {purchase.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{purchase.paymentMethod}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground tabular-nums">
                      {purchase.recurring}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                      {purchase.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </section>
    </div>
  )
}
