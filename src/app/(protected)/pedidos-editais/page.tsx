import { FilePlus } from "lucide-react"

import { PedirEditalView } from "@/features/editais/components/pedir-edital-view"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = {
  title: "Pedidos de Editais",
  description: "Solicite a análise e cadastro de novos editais verticalizados no NomeIA.",
}

export default function PedidosEditaisPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={FilePlus}
        title="Pedidos de Editais"
        description="Solicitações de novos editais preparatórios"
      />

      <div className="flex-1 page-container py-5">
        <PedirEditalView />
      </div>
    </div>
  )
}
