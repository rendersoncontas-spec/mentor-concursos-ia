import { FilePlus } from "lucide-react"

import { PedirEditalView } from "@/features/editais/components/pedir-edital-view"

export const metadata = {
  title: "Pedidos de Editais",
  description: "Solicite a análise e cadastro de novos editais verticalizados no NomeIA.",
}

export default function PedidosEditaisPage() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <FilePlus className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Pedidos de Editais</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Solicitações de novos editais preparatórios
          </p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <PedirEditalView />
      </div>
    </div>
  )
}
