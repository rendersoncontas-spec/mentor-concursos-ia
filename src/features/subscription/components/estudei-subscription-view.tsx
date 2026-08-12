"use client"

import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function EstudeiSubscriptionView() {
  const handleManageSubscription = () => {
    toast.info("Você está utilizando a versão Free ilimitada do Mentor Concursos IA.")
  }

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

      {/* Card do Plano Ativo (100% Estudei) */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col md:flex-row">
        {/* Bloco Verde-Água da Esquerda */}
        <div className="w-full md:w-64 bg-[#2563EB] text-slate-900 font-black text-3xl flex items-center justify-center p-8 shrink-0 tracking-tight">
          Gratuito
        </div>

        {/* Bloco de Detalhes da Direita */}
        <div className="flex-1 p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-xs font-semibold">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Vencimento:</strong> Vitalício &nbsp;•&nbsp;{" "}
              <span className="text-emerald-600 font-bold">Ativo</span>
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Adesão:</strong> 05/08/2026
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Tempo restante de assinatura:</strong> Ilimitado
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Próximo pagamento:</strong> Isento
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Valor:</strong> R$ 0,00
            </p>
            <p className="text-muted-foreground">
              <strong className="text-foreground">Forma de pagamento:</strong> Plano Gratuito (Versão Free)
            </p>
          </div>
        </div>
      </div>

      {/* Tabela do Histórico de Compras (100% Estudei) */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-card">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            HISTÓRICO DE COMPRAS
          </h3>
        </div>

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
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono text-muted-foreground">05/08/2026</td>
                <td className="px-4 py-3 font-bold text-foreground">Mentor Concursos IA</td>
                <td className="px-4 py-3 font-semibold text-foreground">Gratuito (Versão Free)</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">05/08/2026 - Vitalício</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-600">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                    Ativo
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">Plano Gratuito</td>
                <td className="px-3 py-3 text-center text-muted-foreground font-mono">Não</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-foreground">R$ 0,00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

