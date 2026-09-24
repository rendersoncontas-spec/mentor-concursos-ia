import Link from "next/link"

import { CalendarRange, Plus } from "lucide-react"

import { PlanosView } from "@/features/planos/components/planos-view"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = {
  title: "Planos de Estudo",
  description: "Gerencie seu plano de concurso e matérias no NomeIA.",
}

export default function PlanosPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={CalendarRange}
        title="Planos de Estudo"
        description="Escolha qual plano seguir e acompanhe a carga de cada um"
        actions={
          <Button asChild size="sm">
            <Link href="/planejamento">
              <Plus aria-hidden className="h-4 w-4" />
              Criar plano
            </Link>
          </Button>
        }
      />

      <div className="flex-1 page-container py-5">
        <PlanosView />
      </div>
    </div>
  )
}
