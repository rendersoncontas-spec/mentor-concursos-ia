"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { updateUserDisciplineStatus } from "@/application/disciplines/disciplines.service"
import { type DisciplineStatus } from "@/domain/disciplines/disciplines.types"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function updateDisciplineStatusAction(
  userId: string,
  userDisciplineId: string,
  status: DisciplineStatus
) {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  const supabase = await createClient()

  const ok = await updateUserDisciplineStatus(supabase, userId, userDisciplineId, status)
  
  if (!ok) {
    return { success: false }
  }

  return { success: true }
}
