import { Suspense } from "react"
import { redirect } from "next/navigation"
import { BookOpen } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/server"
import { getDisciplinesPageData } from "@/application/disciplines/disciplines.service"
import { EstudeiDisciplinesView } from "@/features/disciplines/components/estudei-disciplines-view"

export const metadata = {
  title: "Disciplinas & Planos - Mentor Concursos IA",
  description: "Gerencie suas disciplinas, tópicos e desempenho por matéria.",
}

export default async function DisciplinesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const initialData = await getDisciplinesPageData(supabase, user.id)

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <BookOpen className="h-5 w-5 text-emerald-500" />
        <div>
          <h1 className="text-lg font-bold leading-none">Disciplinas & Planos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Visão geral do plano de estudos e matérias</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Carregando disciplinas...</div>}>
          <EstudeiDisciplinesView initialData={initialData} />
        </Suspense>
      </div>
    </div>
  )
}

