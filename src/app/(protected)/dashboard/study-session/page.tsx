import { redirect } from "next/navigation"
import { createClient } from "@/infrastructure/supabase/server"
import { ActiveSessionRunner } from "@/features/study-session/components/active-session-runner"

export const metadata = {
  title: "Sessão Inteligente | Mentor Concursos IA",
}

interface PageProps {
  searchParams: Promise<{ planId?: string; disciplineId?: string }>
}

export default async function StudySessionPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams
  const { planId, disciplineId } = resolvedParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  let planItem = undefined

  if (planId) {
    const { data: item } = await supabase
      .from("study_plan_items")
      .select(`
        id, study_plan_id, discipline_id, day_of_week,
        duration_minutes, priority, priority_score, recommended_sessions, created_at,
        disciplines ( id, name, area )
      `)
      .eq("id", planId)
      .single()
      
    if (item) {
      planItem = {
        ...item,
        discipline: Array.isArray(item.disciplines) ? item.disciplines[0] : item.disciplines
      } as any
    }
  } else if (disciplineId) {
    const { data: disc } = await supabase
      .from("disciplines")
      .select("id, name, area")
      .eq("id", disciplineId)
      .single()
      
    if (disc) {
      // Item de planejamento temporário por disciplina selecionada
      planItem = {
        discipline_id: disc.id,
        duration_minutes: 60, // Padrão
        discipline: disc
      } as any
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-10 px-4 md:px-8">
      <ActiveSessionRunner planItem={planItem} />
    </div>
  )
}

