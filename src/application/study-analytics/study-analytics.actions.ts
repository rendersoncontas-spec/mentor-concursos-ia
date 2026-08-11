"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getStudyHistoryForAnalytics, AnalyticsEngine } from "./study-analytics.service"
import { isMaintenanceMode } from "@/lib/maintenance"
import { StudyHistory } from "@/domain/study-history/study-history.types"

// Tipo parcial retornado pela query otimizada
interface AnalyticsHistoryItem {
  user_id: string
  duration_minutes: number
  active_minutes: number | null
  started_at: string
  metadata: Record<string, any> | null
}

export async function getUserStatisticsAction(periodDays: number = 365) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const history = await getStudyHistoryForAnalytics(supabase, user.id, periodDays)
    
    // Calcula agregações
    const context = AnalyticsEngine.createContext(history as unknown as StudyHistory[])
    const baseAggregations = AnalyticsEngine.aggregations.getBase(context)
    const disciplineRanking = AnalyticsEngine.rankings.getDisciplineRanking(context)
    const evolution = AnalyticsEngine.visuals.getEvolutionTimeSeries(context, 7) // Ultimos 7 dias
    
    // Mock de acertos por enquanto até integrar com 'question_attempts'
    const totalCorrect = 0
    const totalWrong = 0
    
    return {
      data: {
        totalMinutes: baseAggregations.totalMinutes,
        totalSessions: baseAggregations.totalSessions,
        disciplineRanking,
        evolution,
        totalCorrect,
        totalWrong,
      },
      error: null
    }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

export async function getGlobalRankingAction(period: 'this_week' | 'last_week' | 'general' = 'this_week') {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  
  try {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    // Usar a RPC que bypassa RLS via SECURITY DEFINER
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_global_ranking', { p_period: period, p_current_user_id: currentUser?.id || null })

    if (rpcError) {
      console.error("Erro ao chamar RPC get_global_ranking:", rpcError)
      // Fallback: tentar query direta (funciona se RLS não bloquear)
      return await getRankingViaDirectQuery(supabase, period, currentUser?.id)
    }

    // Log da resposta bruta para debug
    console.log("[RANKING DEBUG] RPC response:", rpcData)
    if (rpcData && typeof rpcData === 'object') {
      const dataToUse = rpcData.result || rpcData
      
      if (dataToUse && dataToUse.totalParticipants !== undefined) {
        return { data: dataToUse, error: null }
      }
    }
    
    // Se RPC não retornou dados válidos, usar fallback
    console.warn("RPC retornou dados, mas não no formato esperado:", rpcData)
    return await getRankingViaDirectQuery(supabase, period, currentUser?.id)
  } catch (error: any) {
    console.error("Erro em getGlobalRankingAction:", error)
    return { data: null, error: error.message }
  }
}

// Helper para converter "2h 30min" em minutos
function parseHoursToMinutes(hoursStr: string): number {
  const hMatch = hoursStr.match(/(\d+)h/)
  const mMatch = hoursStr.match(/(\d+)\s*min/)
  return (hMatch ? parseInt(hMatch[1] || '0') * 60 : 0) + (mMatch ? parseInt(mMatch[1] || '0') : 0)
}

const bgColors = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600']

function formatHours(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// Fallback: query direta (caso RPC não esteja disponível)
async function getRankingViaDirectQuery(supabase: any, period: string, currentUserId?: string) {
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
  const lastSunday = new Date(thisMonday)
  lastSunday.setMilliseconds(-1)

  let startDate: string | null = null
  let endDate: string | null = null

  if (period === 'this_week') {
    startDate = thisMonday.toISOString()
  } else if (period === 'last_week') {
    startDate = lastMonday.toISOString()
    endDate = lastSunday.toISOString()
  }

  let query = supabase
    .from('study_history')
    .select('user_id, duration_minutes, active_minutes, started_at, metadata')

  if (startDate) query = query.gte('started_at', startDate)
  if (endDate) query = query.lte('started_at', endDate)

  const { data: historyData } = await query

  const activeUserIds = new Set<string>()
  historyData?.forEach((h: any) => { if (h.user_id) activeUserIds.add(h.user_id) })
  if (currentUserId) activeUserIds.add(currentUserId)

  const userIdsArray = Array.from(activeUserIds)

  let profilesMap = new Map<string, { name: string; avatar_url: string | null }>()
  if (userIdsArray.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, full_name, avatar_url')
      .in('id', userIdsArray)

    profiles?.forEach((p: any) => {
      profilesMap.set(p.id, {
        name: p.name || p.full_name || 'Estudante',
        avatar_url: p.avatar_url || null
      })
    })
  }

  const userMap = new Map<string, {
    id: string; name: string; avatar: string; initials: string; bgColor: string;
    totalMinutes: number; questionsCount: number; pagesCount: number;
  }>()

  userIdsArray.forEach((uid, idx) => {
    const profile = profilesMap.get(uid)
    const rawName = profile?.name || (currentUserId && uid === currentUserId ? 'Você' : `Estudante #${uid.substring(0, 4)}`)
    const nameParts = rawName.trim().split(/\s+/)
    const initials = nameParts.length > 1
      ? `${nameParts[0]?.[0] || ''}${nameParts[nameParts.length - 1]?.[0] || ''}`.toUpperCase()
      : (nameParts[0]?.substring(0, 2) || 'ES').toUpperCase()

    userMap.set(uid, {
      id: uid, name: rawName, avatar: profile?.avatar_url || '', initials,
      bgColor: bgColors[idx % bgColors.length] || 'bg-blue-600',
      totalMinutes: 0, questionsCount: 0, pagesCount: 0,
    })
  })

  historyData?.forEach((h: any) => {
    const entry = userMap.get(h.user_id)
    if (entry) {
      entry.totalMinutes += h.active_minutes ?? h.duration_minutes ?? 0
      const meta = h.metadata || {}
      if (meta['pages_read']) entry.pagesCount += Number(meta['pages_read'])
      if (meta['questions_answered']) entry.questionsCount += Number(meta['questions_answered'])
    }
  })

  const allUsers = Array.from(userMap.values())
  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }

  const sortByTempo = [...allUsers].sort((a, b) => b.totalMinutes - a.totalMinutes || b.questionsCount - a.questionsCount || b.pagesCount - a.pagesCount)
  const sortByQuestions = [...allUsers].sort((a, b) => b.questionsCount - a.questionsCount || b.totalMinutes - a.totalMinutes)
  const sortByPages = [...allUsers].sort((a, b) => b.pagesCount - a.pagesCount || b.totalMinutes - a.totalMinutes)

  const mapToList = (list: typeof allUsers) => list.map((item, idx) => ({
    rank: idx + 1, id: item.id,
    name: item.id === currentUserId ? `${item.name} (Você)` : item.name,
    avatar: item.avatar, targetContest: 'Global',
    hours: formatHours(item.totalMinutes), questions: item.questionsCount,
    pages: item.pagesCount, initials: item.initials,
    bgColor: item.bgColor, hasActivity: item.totalMinutes > 0,
  }))

  const rankingTempo = mapToList(sortByTempo)
  const rankingQuestions = mapToList(sortByQuestions)
  const rankingPages = mapToList(sortByPages)

  const findUserStats = (ranking: any[]) => {
    if (!currentUserId) return null
    const found = ranking.find(r => r.id === currentUserId)
    return found || {
      rank: ranking.length + 1, id: currentUserId, name: 'Você', avatar: '',
      targetContest: 'Global', hours: '0min', questions: 0, pages: 0,
      initials: 'VC', bgColor: 'bg-blue-600', hasActivity: false,
    }
  }

  return {
    data: {
      totalParticipants: allUsers.length,
      rankingTempo, rankingQuestions, rankingPages,
      userStats: { tempo: findUserStats(rankingTempo), questoes: findUserStats(rankingQuestions), paginas: findUserStats(rankingPages) }
    },
    error: null
  }
}

// Nova função de teste para debug direto do RPC
export async function testGlobalRankingRpc() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    console.log("[TEST RPC] Testando RPC...")
    const { data, error } = await supabase.rpc('get_global_ranking', {
      p_period: 'this_week',
      p_current_user_id: user?.id || null
    })
    
    console.log("[TEST RPC] Resultado:", { data: !!data, error, dataSample: data })
    
    // Verificar dados na tabela study_history
    const { data: hist, error: histError } = await supabase
      .from('study_history')
      .select('user_id, active_minutes, duration_minutes, started_at, completed, metadata')
      .limit(10)
    
    console.log("[TEST RPC] study_history sample:", { data: hist, error: histError })
    
    // Verificar se question_attempts existe
    const { data: attempts, error: attError } = await supabase
      .from('question_attempts')
      .select('user_id, correct, answered_at')
      .limit(10)
    
    console.log("[TEST RPC] question_attempts sample:", { data: attempts, error: attError })
    
    // Verificar perfis (apenas coluna name)
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, name')
      .limit(10)
    
    console.log("[TEST RPC] profiles sample:", { data: profiles, error: profError })
    
    return { success: true, debug: "Verifique o console do servidor" }
  } catch (err: any) {
    console.error("[TEST RPC] Error:", err)
    return { success: false, error: err.message }
  }
}

