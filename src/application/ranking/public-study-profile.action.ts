"use server"

import * as Sentry from "@sentry/nextjs"

import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

import {
  computeBgColor,
  computeInitials,
  computeStreaksFromDates,
  formatMinutesToHours,
  getRelativeDateLabel,
} from "./public-study-profile.utils"

export interface PublicStudyDiscipline {
  disciplineId: string
  disciplineName: string
  studiedMinutes: number
  formattedDuration: string
  totalQuestions: number
  correctQuestions: number
  accuracyPercentage: number | null
}

export interface PublicStudyRecentActivity {
  id: string
  disciplineName: string
  studiedMinutes: number
  formattedDuration: string
  relativeDateLabel: string
  dateIso: string
}

export interface PublicStudyProfileStats {
  totalMinutes: number
  formattedHours: string
  currentStreak: number
  longestStreak: number
  totalQuestions: number
  correctQuestions: number
  wrongQuestions: number
  accuracyPercentage: number | null
  averageFocusPercentage: number | null
  thisWeekMinutes: number
  lastWeekMinutes: number
}

export interface PublicStudyProfile {
  id: string
  name: string
  avatarUrl: string | null
  initials: string
  bgColor: string
  targetContest: string | null
  isPrivate: boolean
  isSelf: boolean
  stats: PublicStudyProfileStats | null
  topDisciplines: PublicStudyDiscipline[]
  recentActivities: PublicStudyRecentActivity[]
}

export interface GetPublicStudyProfileResult {
  success: boolean
  data: PublicStudyProfile | null
  error?: string
}

interface RawHistoryRow {
  id: string
  discipline_id: string | null
  started_at: string
  duration_minutes: number | null
  active_minutes: number | null
  focus_percentage?: number | null
  focus_score?: number | null
  metadata?: Record<string, unknown> | null
  disciplines?: { id?: string; name?: string } | { id?: string; name?: string }[] | null
}

export async function getPublicStudyProfileAction(
  targetUserId: string,
): Promise<GetPublicStudyProfileResult> {
  if (!targetUserId || typeof targetUserId !== "string") {
    return { success: false, data: null, error: "Identificador de usuário inválido." }
  }

  if (isMaintenanceMode()) {
    return { success: false, data: null, error: "Sistema temporariamente em manutenção." }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    const currentUserId = currentUser?.id || null
    const isSelf = currentUserId === targetUserId

    // 1. Tentar RPC get_public_study_profile se disponível
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_public_study_profile", {
        p_target_user_id: targetUserId,
        p_current_user_id: currentUserId,
      })

      if (!rpcError && rpcData && typeof rpcData === "object") {
        const payload = rpcData as unknown as PublicStudyProfile
        if (payload.id) {
          return { success: true, data: payload }
        }
      }
    } catch {
      // Segue para a consulta estruturada de fallback
    }

    // 2. Fallback: Buscar dados do perfil
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, full_name, nickname, avatar_url, preferences")
      .eq("id", targetUserId)
      .maybeSingle()

    if (profileError || !profileData) {
      // Se não encontrou no profile com RLS, pode ser outro usuário:
      // montar perfil mínimo público com dados básicos
      const defaultName = "Estudante"
      return {
        success: true,
        data: {
          id: targetUserId,
          name: defaultName,
          avatarUrl: null,
          initials: computeInitials(defaultName),
          bgColor: computeBgColor(targetUserId),
          targetContest: "Concurseiro",
          isPrivate: !isSelf,
          isSelf,
          stats: null,
          topDisciplines: [],
          recentActivities: [],
        },
      }
    }

    const preferences = (profileData.preferences as Record<string, unknown>) || {}
    const isPublicConfig = preferences["publicProfile"] !== false
    const isPrivate = !isSelf && !isPublicConfig

    const publicName =
      (profileData.nickname && preferences["nameType"] === "apelido"
        ? profileData.nickname
        : profileData.name || profileData.full_name) || "Estudante"

    const avatarUrl =
      preferences["avatarType"] === "iniciais" ? null : profileData.avatar_url || null

    const baseProfile: PublicStudyProfile = {
      id: targetUserId,
      name: publicName,
      avatarUrl,
      initials: computeInitials(publicName),
      bgColor: computeBgColor(targetUserId),
      targetContest: "Concurseiro",
      isPrivate,
      isSelf,
      stats: null,
      topDisciplines: [],
      recentActivities: [],
    }

    // Se privado e não é o próprio usuário, retornar apenas a identidade pública
    if (isPrivate) {
      return { success: true, data: baseProfile }
    }

    // 3. Buscar histórico de estudos para calcular métricas públicas
    const { data: historyRows, error: historyError } = await supabase
      .from("study_history")
      .select(
        "id, discipline_id, started_at, duration_minutes, active_minutes, focus_percentage, focus_score, metadata, disciplines(id, name)",
      )
      .eq("user_id", targetUserId)
      .order("started_at", { ascending: false })
      .limit(1000)

    if (historyError) {
      console.warn("Aviso ao carregar study_history para perfil público:", historyError.message)
    }

    const rows: RawHistoryRow[] = (historyRows as unknown as RawHistoryRow[]) || []

    // Datas para cálculo de esta semana e semana passada
    const now = new Date()
    const getMonday = (d: Date) => {
      const date = new Date(d)
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1)
      date.setHours(0, 0, 0, 0)
      return new Date(date.setDate(diff))
    }

    const thisMonday = getMonday(now)
    const lastMonday = new Date(thisMonday)
    lastMonday.setDate(lastMonday.getDate() - 7)

    let totalMinutes = 0
    let totalQuestions = 0
    let correctQuestions = 0
    let thisWeekMinutes = 0
    let lastWeekMinutes = 0

    const validFocusValues: number[] = []
    const datesWithStudy: string[] = []

    const disciplinesMap = new Map<
      string,
      {
        disciplineId: string
        disciplineName: string
        studiedMinutes: number
        totalQuestions: number
        correctQuestions: number
      }
    >()

    const recentActivities: PublicStudyRecentActivity[] = []

    for (const row of rows) {
      const minutes = Number(row.active_minutes || row.duration_minutes || 0)
      const startedAt = row.started_at
      const startDate = startedAt ? new Date(startedAt) : null

      if (minutes > 0 && startedAt) {
        totalMinutes += minutes
        datesWithStudy.push(startedAt)

        if (startDate) {
          if (startDate >= thisMonday) {
            thisWeekMinutes += minutes
          } else if (startDate >= lastMonday && startDate < thisMonday) {
            lastWeekMinutes += minutes
          }
        }
      }

      // Questões (do metadata ou colunas diretas)
      const qAnswered = Number(row.metadata?.["questions_answered"] || 0)
      const qCorrect = Number(row.metadata?.["questions_correct"] || 0)
      if (qAnswered > 0) {
        totalQuestions += qAnswered
        correctQuestions += Math.min(qCorrect, qAnswered)
      }

      // Foco médio: aceita SOMENTE valores numéricos válidos (> 0)
      const rawFocus = row.focus_percentage ?? row.focus_score ?? row.metadata?.["focus_percentage"]
      if (typeof rawFocus === "number" && rawFocus > 0 && rawFocus <= 100) {
        validFocusValues.push(rawFocus)
      }

      // Agrupamento por disciplina
      const discRaw = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
      const discName = discRaw?.name || "Estudos Gerais"
      const discId = row.discipline_id || discRaw?.id || discName

      const existing = disciplinesMap.get(discName) || {
        disciplineId: discId,
        disciplineName: discName,
        studiedMinutes: 0,
        totalQuestions: 0,
        correctQuestions: 0,
      }

      existing.studiedMinutes += minutes
      existing.totalQuestions += qAnswered
      existing.correctQuestions += qCorrect
      disciplinesMap.set(discName, existing)

      // Últimos estudos (máximo 5)
      if (recentActivities.length < 5 && minutes > 0 && startedAt) {
        recentActivities.push({
          id: row.id,
          disciplineName: discName,
          studiedMinutes: minutes,
          formattedDuration: formatMinutesToHours(minutes),
          relativeDateLabel: getRelativeDateLabel(startedAt),
          dateIso: startedAt,
        })
      }
    }

    // Streaks
    const { currentStreak, longestStreak } = computeStreaksFromDates(datesWithStudy)

    // Acurácia de questões
    const accuracyPercentage =
      totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : null

    // Foco médio (null se não houver dados válidos de foco)
    const averageFocusPercentage =
      validFocusValues.length > 0
        ? Math.round(validFocusValues.reduce((a, b) => a + b, 0) / validFocusValues.length)
        : null

    // Top 5 Disciplinas ordenadas por tempo de estudo
    const topDisciplines: PublicStudyDiscipline[] = Array.from(disciplinesMap.values())
      .filter((d) => d.studiedMinutes > 0 || d.totalQuestions > 0)
      .sort((a, b) => b.studiedMinutes - a.studiedMinutes)
      .slice(0, 5)
      .map((d) => ({
        disciplineId: d.disciplineId,
        disciplineName: d.disciplineName,
        studiedMinutes: d.studiedMinutes,
        formattedDuration: formatMinutesToHours(d.studiedMinutes),
        totalQuestions: d.totalQuestions,
        correctQuestions: d.correctQuestions,
        accuracyPercentage:
          d.totalQuestions > 0 ? Math.round((d.correctQuestions / d.totalQuestions) * 100) : null,
      }))

    baseProfile.stats = {
      totalMinutes,
      formattedHours: formatMinutesToHours(totalMinutes),
      currentStreak,
      longestStreak,
      totalQuestions,
      correctQuestions,
      wrongQuestions: Math.max(0, totalQuestions - correctQuestions),
      accuracyPercentage,
      averageFocusPercentage,
      thisWeekMinutes,
      lastWeekMinutes,
    }
    baseProfile.topDisciplines = topDisciplines
    baseProfile.recentActivities = recentActivities

    return { success: true, data: baseProfile }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { feature: "public-study-profile" },
      extra: { targetUserId },
    })
    console.error("Erro em getPublicStudyProfileAction:", errorMsg)
    return { success: false, data: null, error: "Falha ao carregar o perfil de estudos." }
  }
}
