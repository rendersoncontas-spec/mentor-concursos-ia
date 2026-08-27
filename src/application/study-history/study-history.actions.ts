"use server"

import { revalidatePath } from "next/cache"

import * as Sentry from "@sentry/nextjs"

import { reconcileWeeklyPlan } from "@/application/study-plan/weekly-planner.service"
import type { StudyHistoryInsert } from "@/domain/study-history/study-history.types"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import { buildIsoFromSaoPauloDateTime, getDayInSaoPaulo } from "@/lib/sao-paulo"

import {
  createStudySession,
  deleteStudySession,
  finishStudySession,
  getAllUserHistory,
  getMonthlyHistory,
  getTotalStudyMinutes,
  getUserHistory,
  updateStudySession,
} from "./study-history.service"

const HISTORY_PATHS = ["/dashboard", "/dashboard/history", "/estatisticas", "/disciplines", "/planejamento"]

export async function getUserHistoryAction(page: number = 1, pageSize: number = 50) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
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
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const data = await getMonthlyHistory(supabase, user.id, year, month)
    return { data, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

export async function getAllHistoryAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const data = await getAllUserHistory(supabase, user.id)
    return { data, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

export async function startStudySessionAction(data: Omit<StudyHistoryInsert, "user_id">) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const session = await createStudySession(supabase, user.id, data as StudyHistoryInsert)

    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { data: session, error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "study-session" },
    })
    return { data: null, error: (error as { message?: string }).message ?? null }
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
  },
) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const session = await finishStudySession(supabase, user.id, sessionId, feedback)
    await reconcileWeeklyPlan(supabase, user.id).catch(() => null)

    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { data: session, error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "study-session" },
    })
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

export async function updateStudySessionAction(
  sessionId: string,
  data: Partial<StudyHistoryInsert>,
) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const session = await updateStudySession(supabase, user.id, sessionId, data)

    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { data: session, error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "study-session" },
    })
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

export async function deleteStudySessionAction(sessionId: string) {
  if (isMaintenanceMode()) return { error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    await deleteStudySession(supabase, user.id, sessionId)

    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "historico" },
    })
    return { error: (error as { message?: string }).message }
  }
}

export async function cancelStudySessionAction(sessionId: string) {
  if (isMaintenanceMode()) return { error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

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

    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "study-session" },
    })
    return { error: (error as { message?: string }).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR: Totais diários de estudo para o mês
// ─────────────────────────────────────────────────────────────────────────────

export type DailyTotal = { date: string; minutes: number }

export async function getMonthlyDailyTotalsAction(year: number, month: number) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: "Usuário não autenticado" }

    const paddedMonth = String(month).padStart(2, "0")
    const monthPrefix = `${year}-${paddedMonth}-`

    // Janela com margem de segurança para garantir que nenhum registro seja cortado por fuso
    const prevMonthDate = new Date(year, month - 1, 0)
    const prevYear = prevMonthDate.getFullYear()
    const prevMonthPadded = String(prevMonthDate.getMonth() + 1).padStart(2, "0")
    const prevDayPadded = String(prevMonthDate.getDate()).padStart(2, "0")
    const queryStartStr = `${prevYear}-${prevMonthPadded}-${prevDayPadded}T00:00:00.000Z`

    const nextMonthDate = new Date(year, month, 2)
    const nextY = nextMonthDate.getFullYear()
    const nextMPadded = String(nextMonthDate.getMonth() + 1).padStart(2, "0")
    const queryEndStr = `${nextY}-${nextMPadded}-03T00:00:00.000Z`

    const allMinutes: DailyTotal[] = []
    let offset = 0
    const pageSize = 1000

    while (true) {
      const { data, error } = await supabase
        .from("study_history")
        .select("started_at, duration_minutes")
        .eq("user_id", user.id)
        .gte("started_at", queryStartStr)
        .lte("started_at", queryEndStr)
        .not("duration_minutes", "is", null)
        .order("started_at", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (error) throw new Error("Erro ao buscar totais diários: " + error.message)
      if (!data || data.length === 0) break

      for (const row of data) {
        const dateStr = getDayInSaoPaulo(row.started_at)
        if (!dateStr.startsWith(monthPrefix)) continue

        const mins = Number(row.duration_minutes) || 0
        if (mins <= 0) continue

        const existing = allMinutes.find((d) => d.date === dateStr)
        if (existing) {
          existing.minutes += mins
        } else {
          allMinutes.push({ date: dateStr, minutes: mins })
        }
      }

      if (data.length < pageSize) break
      offset += pageSize
    }

    return { data: allMinutes, error: null }
  } catch (error) {
    return { data: [], error: (error as { message?: string }).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR: Registrar/editar tempo de estudo manual
// ─────────────────────────────────────────────────────────────────────────────

export async function saveManualStudyTimeAction(
  dateStr: string,
  durationMinutes: number,
  disciplineId: string,
) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    if (durationMinutes <= 0) {
      return { data: null, error: "Duração deve ser maior que zero." }
    }

    // Check for existing manual entry on this date
    const startOfDay = buildIsoFromSaoPauloDateTime(dateStr, "00:00")
    const endOfDay = buildIsoFromSaoPauloDateTime(dateStr, "23:59")

    const { data: existing } = await supabase
      .from("study_history")
      .select("id")
      .eq("user_id", user.id)
      .gte("started_at", startOfDay)
      .lte("started_at", endOfDay)
      .eq("study_source", "FREE")
      .contains("metadata", { manual_entry: true })
      .maybeSingle()

    const startedAt = buildIsoFromSaoPauloDateTime(dateStr, "12:00")

    if (existing) {
      // Update existing manual entry
      const { data: updated, error } = await supabase
        .from("study_history")
        .update({
          duration_minutes: durationMinutes,
          active_minutes: durationMinutes,
          discipline_id: disciplineId,
          finished_at: startedAt,
          completed: true,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .select()
        .single()

      if (error) throw new Error("Erro ao atualizar registro: " + error.message)
      await reconcileWeeklyPlan(supabase, user.id).catch(() => null)
      for (const path of HISTORY_PATHS) revalidatePath(path)
      return { data: updated, error: null }
    }

    // Create new manual entry
    const { data: created, error } = await supabase
      .from("study_history")
      .insert({
        user_id: user.id,
        discipline_id: disciplineId,
        study_source: "FREE",
        started_at: startedAt,
        finished_at: startedAt,
        duration_minutes: durationMinutes,
        active_minutes: durationMinutes,
        paused_minutes: 0,
        completed: true,
        interrupted: false,
        metadata: { manual_entry: true, calendar_date: dateStr },
      })
      .select()
      .single()

    if (error) throw new Error("Erro ao registrar estudo: " + error.message)
    await reconcileWeeklyPlan(supabase, user.id).catch(() => null)
    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { data: created, error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "calendar-manual-entry" },
    })
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

export async function deleteManualStudyTimeAction(dateStr: string) {
  if (isMaintenanceMode()) return { error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: "Usuário não autenticado" }

    const startOfDay = buildIsoFromSaoPauloDateTime(dateStr, "00:00")
    const endOfDay = buildIsoFromSaoPauloDateTime(dateStr, "23:59")

    const { error } = await supabase
      .from("study_history")
      .delete()
      .eq("user_id", user.id)
      .gte("started_at", startOfDay)
      .lte("started_at", endOfDay)
      .eq("study_source", "FREE")
      .contains("metadata", { manual_entry: true })

    if (error) throw new Error("Erro ao remover registro: " + error.message)
    for (const path of HISTORY_PATHS) revalidatePath(path)
    return { error: null }
  } catch (error) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: { feature: "calendar-manual-delete" },
    })
    return { error: (error as { message?: string }).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR: Buscar disciplinas para o seletor do modal
// ─────────────────────────────────────────────────────────────────────────────

export async function getDisciplinesForCalendarAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: "Usuário não autenticado" }

    const { data, error } = await supabase
      .from("user_disciplines")
      .select("discipline_id, disciplines ( id, name )")
      .eq("user_id", user.id)

    if (error) throw new Error("Erro ao buscar disciplinas: " + error.message)

    const disciplines = (data ?? [])
      .map((row) => {
        const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
        return disc ? { id: disc.id, name: disc.name } : null
      })
      .filter((d): d is { id: string; name: string } => d !== null)
      .filter((d, idx, arr) => arr.findIndex((x) => x.id === d.id) === idx)

    return { data: disciplines, error: null }
  } catch (error) {
    return { data: [], error: (error as { message?: string }).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR: Buscar registro manual existente para um dia
// ─────────────────────────────────────────────────────────────────────────────

export type ManualEntryInfo = {
  sessionId: string
  durationMinutes: number
  disciplineId: string
  disciplineName: string
} | null

export async function getManualEntryForDayAction(dateStr: string): Promise<{
  data: ManualEntryInfo
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const startOfDay = buildIsoFromSaoPauloDateTime(dateStr, "00:00")
    const endOfDay = buildIsoFromSaoPauloDateTime(dateStr, "23:59")

    const { data, error } = await supabase
      .from("study_history")
      .select("id, duration_minutes, discipline_id, disciplines ( id, name )")
      .eq("user_id", user.id)
      .gte("started_at", startOfDay)
      .lte("started_at", endOfDay)
      .eq("study_source", "FREE")
      .contains("metadata", { manual_entry: true })
      .maybeSingle()

    if (error) throw new Error("Erro ao buscar registro: " + error.message)
    if (!data) return { data: null, error: null }

    const disc = Array.isArray(data.disciplines) ? data.disciplines[0] : data.disciplines

    return {
      data: {
        sessionId: data.id,
        durationMinutes: Number(data.duration_minutes) || 0,
        disciplineId: data.discipline_id,
        disciplineName: disc?.name ?? "",
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR: Detalhes de um dia específico (sessões, questões, disciplinas)
// ─────────────────────────────────────────────────────────────────────────────

export type DayDisciplineBreakdown = {
  disciplineId: string
  disciplineName: string
  minutes: number
}

export type DayDetail = {
  date: string
  totalMinutes: number
  sessionCount: number
  questionsAnswered: number
  questionsCorrect: number
  accuracy: number | null
  disciplines: DayDisciplineBreakdown[]
}

export async function getDayDetailAction(dateStr: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const startOfDay = buildIsoFromSaoPauloDateTime(dateStr, "00:00")
    const endOfDay = buildIsoFromSaoPauloDateTime(dateStr, "23:59")

    const { data: sessions, error } = await supabase
      .from("study_history")
      .select("duration_minutes, metadata, discipline_id, disciplines ( id, name )")
      .eq("user_id", user.id)
      .gte("started_at", startOfDay)
      .lte("started_at", endOfDay)
      .not("duration_minutes", "is", null)

    if (error) throw new Error("Erro ao buscar detalhes do dia: " + error.message)
    if (!sessions || sessions.length === 0) {
      return {
        data: {
          date: dateStr,
          totalMinutes: 0,
          sessionCount: 0,
          questionsAnswered: 0,
          questionsCorrect: 0,
          accuracy: null,
          disciplines: [],
        },
        error: null,
      }
    }

    let totalMinutes = 0
    let questionsAnswered = 0
    let questionsCorrect = 0
    const disciplineMap = new Map<string, { name: string; minutes: number }>()

    for (const s of sessions) {
      totalMinutes += Number(s.duration_minutes) || 0

      const meta = (s.metadata as Record<string, unknown> | null) ?? {}
      questionsAnswered += Number(meta["questions_answered"]) || 0
      questionsCorrect += Number(meta["questions_correct"]) || 0

      const disc = Array.isArray(s.disciplines) ? s.disciplines[0] : s.disciplines
      const discId = s.discipline_id
      const discName = disc?.name ?? "Desconhecida"
      const discMins = Number(s.duration_minutes) || 0

      const existing = disciplineMap.get(discId)
      if (existing) {
        existing.minutes += discMins
      } else {
        disciplineMap.set(discId, { name: discName, minutes: discMins })
      }
    }

    const accuracy =
      questionsAnswered > 0 ? Math.round((questionsCorrect / questionsAnswered) * 100) : null

    const disciplines: DayDisciplineBreakdown[] = [...disciplineMap.entries()]
      .map(([id, d]) => ({
        disciplineId: id,
        disciplineName: d.name,
        minutes: d.minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes)

    return {
      data: {
        date: dateStr,
        totalMinutes,
        sessionCount: sessions.length,
        questionsAnswered,
        questionsCorrect,
        accuracy,
        disciplines,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR: Totais mensais (total + média) para o cabeçalho
// ─────────────────────────────────────────────────────────────────────────────

export type MonthlyStats = {
  totalMinutes: number
  averageMinutes: number
  daysStudied: number
}

export async function getMonthlyStatsAction(year: number, month: number) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const paddedMonth = String(month).padStart(2, "0")
    const monthPrefix = `${year}-${paddedMonth}-`

    // Janela com margem de segurança para fuso
    const prevMonthDate = new Date(year, month - 1, 0)
    const prevYear = prevMonthDate.getFullYear()
    const prevMonthPadded = String(prevMonthDate.getMonth() + 1).padStart(2, "0")
    const prevDayPadded = String(prevMonthDate.getDate()).padStart(2, "0")
    const queryStartStr = `${prevYear}-${prevMonthPadded}-${prevDayPadded}T00:00:00.000Z`

    const nextMonthDate = new Date(year, month, 2)
    const nextY = nextMonthDate.getFullYear()
    const nextMPadded = String(nextMonthDate.getMonth() + 1).padStart(2, "0")
    const queryEndStr = `${nextY}-${nextMPadded}-03T00:00:00.000Z`

    const allMinutes: Record<string, number> = {}
    let offset = 0
    const pageSize = 1000

    while (true) {
      const { data, error } = await supabase
        .from("study_history")
        .select("started_at, duration_minutes")
        .eq("user_id", user.id)
        .gte("started_at", queryStartStr)
        .lte("started_at", queryEndStr)
        .not("duration_minutes", "is", null)
        .order("started_at", { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (error) throw new Error("Erro ao buscar stats mensais: " + error.message)
      if (!data || data.length === 0) break

      for (const row of data) {
        const dateKey = getDayInSaoPaulo(row.started_at)
        if (!dateKey.startsWith(monthPrefix)) continue

        const mins = Number(row.duration_minutes) || 0
        if (mins <= 0) continue

        allMinutes[dateKey] = (allMinutes[dateKey] ?? 0) + mins
      }

      if (data.length < pageSize) break
      offset += pageSize
    }

    const totalMinutes = Object.values(allMinutes).reduce((a, b) => a + b, 0)
    const daysStudied = Object.keys(allMinutes).length
    const daysInMonth = new Date(year, month, 0).getDate()
    const averageMinutes = daysInMonth > 0 ? Math.round(totalMinutes / daysInMonth) : 0

    return {
      data: { totalMinutes, averageMinutes, daysStudied },
      error: null,
    }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? null }
  }
}
