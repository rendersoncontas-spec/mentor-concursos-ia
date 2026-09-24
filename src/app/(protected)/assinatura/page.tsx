import { CreditCard } from "lucide-react"

import { SubscriptionView } from "@/features/subscription/components/subscription-view"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = {
  title: "Assinatura & Planos",
  description: "Gerencie sua assinatura e plano no NomeIA.",
}

export default function AssinaturaPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={CreditCard}
        title="Assinatura & Planos"
        description="Detalhes da sua conta e histórico de compras"
      />

      <div className="flex-1 page-container py-5">
        <SubscriptionView />
      </div>
    </div>
  )
}
