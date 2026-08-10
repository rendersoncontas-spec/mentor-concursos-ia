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

    // 1. Calcular datas dos períodos (Segunda a Domingo)
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

    // 2. Buscar histórico de estudo para o período (sem restrição de RLS para leitura agregada se houver política, mas pegamos o que for visível)
    let studyQuery = supabase
      .from('study_history')
      .select('user_id, duration_minutes, active_minutes, started_at, metadata')

    if (startDate) studyQuery = studyQuery.gte('started_at', startDate)
    if (endDate) studyQuery = studyQuery.lte('started_at', endDate)

    const { data: historyData, error: historyError } = await studyQuery

    if (historyError) {
      console.error("Erro ao buscar histórico para o ranking:", historyError)
      return { data: null, error: "Erro ao carregar dados de estudo." }
    }

    // 3. Buscar tentativas de questões para o período
    let attemptQuery = supabase
      .from('question_attempts')
      .select('user_id, correct, answered_at, created_at')

    if (startDate) attemptQuery = attemptQuery.gte('answered_at', startDate).gte('created_at', startDate)
    if (endDate) attemptQuery = attemptQuery.lte('answered_at', endDate)

    const { data: attemptsData } = await attemptQuery

    // Coletar todos os user_ids únicos encontrados nas atividades
    const activeUserIds = new Set<string>()
    historyData?.forEach((h: any) => { if (h.user_id) activeUserIds.add(h.user_id) })
    attemptsData?.forEach((a: any) => { if (a.user_id) activeUserIds.add(a.user_id) })
    if (currentUser?.id) activeUserIds.add(currentUser.id)

    const userIdsArray = Array.from(activeUserIds)

    // 4. Buscar perfis correspondentes aos usuários ativos
    let profilesMap = new Map<string, { name: string; avatar_url: string | null }>()
    if (userIdsArray.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, full_name, avatar_url')
        .in('id', userIdsArray)

      profiles?.forEach(p => {
        profilesMap.set(p.id, {
          name: p.name || p.full_name || "Estudante",
          avatar_url: p.avatar_url || null
        })
      })
    }

    // 5. Agregar dados por usuário
    const userMap = new Map<string, {
      id: string
      name: string
      avatar: string
      initials: string
      bgColor: string
      totalMinutes: number
      questionsCount: number
      pagesCount: number
    }>()

    const bgColors = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600']
    
    userIdsArray.forEach((uid, idx) => {
      const profile = profilesMap.get(uid)
      const rawName = profile?.name || (currentUser && uid === currentUser.id ? "Você" : `Estudante #${uid.substring(0, 4)}`)
      const nameParts = rawName.trim().split(/\s+/)
      const initials = nameParts.length > 1 
        ? `${nameParts[0]?.[0] || ""}${nameParts[nameParts.length - 1]?.[0] || ""}`.toUpperCase() 
        : (nameParts[0]?.substring(0, 2) || "ES").toUpperCase()

      userMap.set(uid, {
        id: uid,
        name: rawName,
        avatar: profile?.avatar_url || '',
        initials,
        bgColor: bgColors[idx % bgColors.length] || 'bg-blue-600',
        totalMinutes: 0,
        questionsCount: 0,
        pagesCount: 0,
      })
    })

    // Somar minutos de estudo
    historyData?.forEach((h: AnalyticsHistoryItem) => {
      const entry = userMap.get(h.user_id)
      if (entry) {
        const mins = h.active_minutes ?? h.duration_minutes ?? 0
        entry.totalMinutes += mins

        const meta = h.metadata || {}
        if (meta['pages_read']) {
          entry.pagesCount += Number(meta['pages_read'])
        }
      }
    })

    // Somar questões respondidas
    attemptsData?.forEach((a: { user_id: string }) => {
      const entry = userMap.get(a.user_id)
      if (entry) {
        entry.questionsCount += 1
      }
    })

    // Questões do metadata
    historyData?.forEach((h: AnalyticsHistoryItem) => {
      const entry = userMap.get(h.user_id)
      if (entry) {
        const meta = h.metadata || {}
        if (meta['questions_answered']) {
          entry.questionsCount += Number(meta['questions_answered'])
        }
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

    const sortByTempo = [...allUsers].sort((a, b) => {
      if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes
      if (b.questionsCount !== a.questionsCount) return b.questionsCount - a.questionsCount
      if (b.pagesCount !== a.pagesCount) return b.pagesCount - a.pagesCount
      return a.id.localeCompare(b.id)
    })

    const sortByQuestions = [...allUsers].sort((a, b) => {
      if (b.questionsCount !== a.questionsCount) return b.questionsCount - a.questionsCount
      if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes
      if (b.pagesCount !== a.pagesCount) return b.pagesCount - a.pagesCount
      return a.id.localeCompare(b.id)
    })

    const sortByPages = [...allUsers].sort((a, b) => {
      if (b.pagesCount !== a.pagesCount) return b.pagesCount - a.pagesCount
      if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes
      if (b.questionsCount !== a.questionsCount) return b.questionsCount - a.questionsCount
      return a.id.localeCompare(b.id)
    })

    const mapToList = (list: typeof allUsers, metricKey: 'totalMinutes' | 'questionsCount' | 'pagesCount') => {
      return list.map((item, idx) => ({
        rank: idx + 1,
        id: item.id,
        name: item.id === currentUser?.id ? `${item.name} (Você)` : item.name,
        avatar: item.avatar,
        targetContest: "Global",
        hours: formatHours(item.totalMinutes),
        questions: item.questionsCount,
        pages: item.pagesCount,
        initials: item.initials,
        bgColor: item.bgColor,
        hasActivity: item[metricKey] > 0,
      }))
    }

    const rankingTempo = mapToList(sortByTempo, 'totalMinutes')
    const rankingQuestions = mapToList(sortByQuestions, 'questionsCount')
    const rankingPages = mapToList(sortByPages, 'pagesCount')

    const currentUserId = currentUser?.id
    let userRankTempo = null
    let userRankQuestions = null
    let userRankPages = null

    if (currentUserId) {
      const idxT = rankingTempo.findIndex(r => r.id === currentUserId)
      if (idxT !== -1) userRankTempo = rankingTempo[idxT]
      else {
        // Se o usuário atual não tem nenhuma atividade no período mas está logado, adicionar com 0
        userRankTempo = {
          rank: rankingTempo.length + 1,
          id: currentUserId,
          name: "Você (Você)",
          avatar: "",
          targetContest: "Global",
          hours: "0min",
          questions: 0,
          pages: 0,
          initials: "VC",
          bgColor: "bg-blue-600",
          hasActivity: false
        }
      }

      const idxQ = rankingQuestions.findIndex(r => r.id === currentUserId)
      if (idxQ !== -1) userRankQuestions = rankingQuestions[idxQ]
      else userRankQuestions = userRankTempo

      const idxP = rankingPages.findIndex(r => r.id === currentUserId)
      if (idxP !== -1) userRankPages = rankingPages[idxP]
      else userRankPages = userRankTempo
    }

    return {
      data: {
        totalParticipants: allUsers.length,
        rankingTempo,
        rankingQuestions,
        rankingPages,
        userStats: {
          tempo: userRankTempo,
          questoes: userRankQuestions,
          paginas: userRankPages,
        }
      },
      error: null
    }
  } catch (error: any) {
    console.error("Erro em getGlobalRankingAction:", error)
    return { data: null, error: error.message }
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

