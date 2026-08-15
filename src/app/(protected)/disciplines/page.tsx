import { Suspense } from "react"

import { redirect } from "next/navigation"

import { BookOpen } from "lucide-react"

import { getDisciplinesPageData } from "@/application/disciplines/disciplines.service"
import { DisciplinesView } from "@/features/disciplines/components/disciplines-view"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Disciplinas",
  description: "Gerencie suas disciplinas, tópicos e desempenho por matéria no NomeIA.",
}

export default async function DisciplinesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const initialData = await getDisciplinesPageData(supabase, user.id)

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-[#2563EB]" />
        <div>
          <h1 className="text-lg font-bold leading-none">Disciplinas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gerenciamento de matérias e tópicos do edital
          </p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
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
