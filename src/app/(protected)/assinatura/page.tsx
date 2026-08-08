import { CreditCard } from "lucide-react"
import { EstudeiSubscriptionView } from "@/features/subscription/components/estudei-subscription-view"

export const metadata = {
  title: "Assinatura - Mentor Concursos IA",
  description: "Gerencie sua assinatura e histórico de pagamentos.",
}

export default function AssinaturaPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <CreditCard className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Assinatura & Planos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Detalhes da sua conta e histórico de compras</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <EstudeiSubscriptionView />
      </div>
    </div>
  )
}
