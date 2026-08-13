"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { createStudySession, finishStudySession, getUserHistory, updateStudySession, deleteStudySession, getTotalStudyMinutes, getMonthlyHistory } from "./study-history.service"
import type { StudyHistoryInsert } from "@/domain/study-history/study-history.types"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function getUserHistoryAction(page: number = 1, pageSize: number = 50) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado", total: 0, totalMinutes: 0 }

    const result = await getUserHistory(supabase, user.id, { page, pageSize })
    const totalMinutes = await getTotalStudyMinutes(supabase, user.id)
    return { data: result.data, error: null, total: result.total, totalMinutes }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message, total: 0, totalMinutes: 0 }
  }
}

export async function getMonthlyHistoryAction(year: number, month: number) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const data = await getMonthlyHistory(supabase, user.id, year, month)
    return { data, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message }
  }
}


export async function startStudySessionAction(data: Omit<StudyHistoryInsert, "user_id">) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const session = await createStudySession(supabase, user.id, data as StudyHistoryInsert)
    
    revalidatePath("/dashboard")
    return { data: session, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message }
  }
}

export async function finishStudySessionAction(
  sessionId: string,
  feedback: {
    energy_level?: number
    difficulty?: number
    focus_score?: number
    mood?: string
    notes?: string
    interrupted?: boolean
  }
) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const session = await finishStudySession(supabase, user.id, sessionId, feedback)
    
    revalidatePath("/dashboard")
    return { data: session, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message }
  }
}

export async function updateStudySessionAction(
  sessionId: string,
  data: Partial<StudyHistoryInsert>
) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const session = await updateStudySession(supabase, user.id, sessionId, data)
    
    revalidatePath("/dashboard/history")
    return { data: session, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message }
  }
}

export async function deleteStudySessionAction(sessionId: string) {
  if (isMaintenanceMode()) return { error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    await deleteStudySession(supabase, user.id, sessionId)

    revalidatePath("/dashboard/history")
    return { error: null }
  } catch (error) {
    return { error: (error as { message?: string }).message }
  }
}

export async function cancelStudySessionAction(sessionId: string) {
  if (isMaintenanceMode()) return { error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    // Apenas apaga a sessão iniciada (útil caso o usuário inicie por acidente)
    const { error } = await supabase
      .from("study_history")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id)

    if (error) throw error

    revalidatePath("/dashboard")
    return { error: null }
  } catch (error) {
    return { error: (error as { message?: string }).message }
  }
}
