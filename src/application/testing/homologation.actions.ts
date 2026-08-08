"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { HomologationService, HomologationResult } from "./homologation.service"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function runHomologationFlow1Action(): Promise<{ data: HomologationResult[] | null, error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Não autenticado")

    const logs = await HomologationService.runFlow1_FullCycle(supabase, user.id)
    return { data: logs, error: null }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

export async function runHomologationMentorAction(): Promise<{ data: HomologationResult[] | null, error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error("Não autenticado")

    const logs = await HomologationService.runTest_MentorEnergyDifference(supabase, user.id)
    return { data: logs, error: null }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}
