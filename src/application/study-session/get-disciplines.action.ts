"use server"

import { createClient } from "@/infrastructure/supabase/server"

export type DisciplineOption = {
  id: string
  name: string
  area: string | null
  fromPlan: boolean
}

/**
 * Busca disciplinas para o autocomplete do modal de estudo.
 * Retorna disciplinas do plano ativo do usuário + todas as disciplinas do banco.
 */
export async function getDisciplinesForAutocomplete(): Promise<{
  planDisciplines: DisciplineOption[]
  allDisciplines: DisciplineOption[]
}> {
  console.log("[getDisciplinesForAutocomplete] Iniciando busca...")
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  console.log("[getDisciplinesForAutocomplete] User:", user?.id, "AuthError:", authError)

  if (authError || !user) {
    console.log("[getDisciplinesForAutocomplete] Sem usuário autenticado, retornando vazio")
    return { planDisciplines: [], allDisciplines: [] }
  }

  // 1. Buscar disciplinas do plano ativo do usuário (via user_disciplines)
  const { data: userDiscs, error: userDiscsError } = await supabase
    .from("user_disciplines")
    .select(`
      discipline_id,
      discipline:disciplines(
        id,
        name,
        area
      )
    `)
    .eq("user_id", user.id)
    .limit(50)

  console.log("[getDisciplinesForAutocomplete] userDiscs:", userDiscs, "Error:", userDiscsError)

  const planDisciplines: DisciplineOption[] = (userDiscs || [])
    .filter((ud: any) => ud.discipline)
    .map((ud: any) => {
      const disc = Array.isArray(ud.discipline) ? ud.discipline[0] : ud.discipline
      return {
        id: disc.id,
        name: disc.name,
        area: disc.area,
        fromPlan: true,
      }
    })
    // Remover duplicatas
    .filter((d: DisciplineOption, i: number, arr: DisciplineOption[]) => 
      arr.findIndex(x => x.id === d.id) === i
    )

  // 2. Buscar todas as disciplinas globais do banco
  const { data: allDiscs, error: allDiscsError } = await supabase
    .from("disciplines")
    .select("id, name, area")
    .order("name")
    .limit(200)

  console.log("[getDisciplinesForAutocomplete] allDiscs:", allDiscs, "Error:", allDiscsError)

  const allDisciplines: DisciplineOption[] = (allDiscs || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    area: d.area,
    fromPlan: false,
  }))

  console.log("[getDisciplinesForAutocomplete] Retornando:", { planDisciplines, allDisciplines })
  return { planDisciplines, allDisciplines }
}
