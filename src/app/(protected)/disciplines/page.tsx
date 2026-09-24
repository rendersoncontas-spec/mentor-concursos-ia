import { Suspense } from "react"

import { redirect } from "next/navigation"

import { BookOpen } from "lucide-react"

import { getDisciplinesPageData } from "@/application/disciplines/disciplines.service"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { DisciplinesView } from "@/features/disciplines/components/disciplines-view"
import { createClient } from "@/infrastructure/supabase/server"
import { PageHeader } from "@/components/ui/page-header"

export const metadata = {
  title: "Disciplinas",
  description: "Gerencie suas disciplinas, tópicos e desempenho por matéria no NomeIA.",
}

export default async function DisciplinesPage() {
  const supabase = await createClient()
  const effectiveUser = await getEffectiveSessionUser(supabase)
  if (!effectiveUser) redirect("/login")

  const initialData = await getDisciplinesPageData(supabase, effectiveUser.id)

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={BookOpen}
        title="Disciplinas"
        description="Gerenciamento de matérias e tópicos do edital"
      />

      <div className="flex-1 page-container py-5">
        <Suspense
          fallback={
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando disciplinas...
            </div>
          }
        >
          <DisciplinesView initialData={initialData} />
        </Suspense>
      </div>
    </div>
  )
}
