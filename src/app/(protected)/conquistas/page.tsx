import { Medal } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { ConquistasView } from "@/features/conquistas/components/conquistas-view"

export const metadata = {
  title: "Minhas Conquistas",
  description: "Acompanhe suas conquistas, medalhas e marcos de estudo no NomeIA.",
}

export default function ConquistasPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Medal}
        title="Conquistas"
        description="Marcos de consistência, volume e desempenho da sua preparação"
      />
      <div className="flex-1 page-container py-5">
        <ConquistasView />
      </div>
    </div>
  )
}
