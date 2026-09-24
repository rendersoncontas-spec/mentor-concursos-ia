"use server"

import { createClient } from "@/infrastructure/supabase/server"
import type { HomologationResult } from "./homologation.service"
import { HomologationService } from "./homologation.service"
import { runHomologationGuarded } from "./homologation-access"
import { isMaintenanceMode } from "@/lib/maintenance"

// Fase G.1: toda action desta ferramenta interna autoriza no servidor
// (somente administradores) ANTES de tocar em qualquer dado — ver
// homologation-access.ts. A página também é protegida, mas uma Server Action
// pode ser chamada diretamente, então a checagem aqui é a que vale.

export async function runHomologationFlow1Action(): Promise<{ data: HomologationResult[] | null, error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    return await runHomologationGuarded(supabase, (userId) =>
      HomologationService.runFlow1_FullCycle(supabase, userId),
    )
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function runHomologationMentorAction(): Promise<{ data: HomologationResult[] | null, error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    return await runHomologationGuarded(supabase, (userId) =>
      HomologationService.runTest_MentorEnergyDifference(supabase, userId),
    )
  } catch (error: unknown) {
    return { data: null, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}
