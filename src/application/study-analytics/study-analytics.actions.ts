"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getStudyHistoryForAnalytics, AnalyticsEngine } from "./study-analytics.service"
import { isMaintenanceMode } from "@/lib/maintenance"
import type { StudyHistory } from "@/domain/study-history/study-history.types"

type Supabase = Awaited<ReturnType<typeof createClient>>

interface RankingEntry {
  rank: number
  id: string
  name: string
  avatar: string
  targetContest: string
  hours: string
  questions: number
  pages: number
  initials: string
  bgColor: string
  hasActivity: boolean
}

type RankingRowLike = Record<string, unknown>

const bgColors = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600']

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
  }
  return ''
}

function formatHours(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function initialsFor(name: string): string {
  const nameParts = name.trim().split(/\s+/)
  if (nameParts.length > 1) {
    return `${nameParts[0]?.[0] ?? ''}${nameParts[nameParts.length - 1]?.[0] ?? ''}`.toUpperCase()
  }
  return (nameParts[0]?.substring(0, 2) || 'ES').toUpperCase()
}

// Normaliza o retorno da RPC para o shape esperado pelo cliente (RankingStudent).
// A RPC devolve snake_case (user_id, avatar_url, bg_color, questions_count,
// pages_count, hours_formatted) e versões antigas omitem hasActivity.
function normalizeRankingList(rows: unknown): RankingEntry[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter((row): row is RankingRowLike => !!row && typeof row === 'object')
    .map((row, idx) => {
      const name = firstString(row['name'], row['display_name']) || 'Estudante'
      const totalMinutes = toNumber(row['total_minutes'])
      const rawHours = row['hours'] ?? row['hours_formatted']

      return {
        rank: toNumber(row['rank'] ?? row['rank_tempo']),
        id: firstString(row['id'], row['user_id']),
        name,
        avatar: firstString(row['avatar'], row['avatar_url']),
        targetContest: firstString(row['targetContest']) || 'Global',
        hours: typeof rawHours === 'string' ? rawHours : formatHours(totalMinutes),
        questions: toNumber(row['questions'] ?? row['questions_count']),
        pages: toNumber(row['pages'] ?? row['pages_count']),
        initials: firstString(row['initials']) || initialsFor(name),
        bgColor: firstString(row['bgColor'], row['bg_color']) || bgColors[idx % bgColors.length] || 'bg-blue-600',
        hasActivity: typeof row['hasActivity'] === 'boolean' ? row['hasActivity'] : totalMinutes > 0,
      }
    })
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
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message }
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
      // Fallback: tentar query direta (caso a RPC não esteja disponível)
      return await getRankingViaDirectQuery(supabase, period, currentUser?.id)
    }

    // Normaliza a resposta da RPC para o shape esperado pelo cliente:
    // aceita objeto direto, { result } ou array de linhas e converte
    // snake_case (user_id, avatar_url, bg_color, questions_count...) em
    // camelCase (id, avatar, bgColor, questions...).
    const rawPayload = Array.isArray(rpcData) ? rpcData[0] : rpcData
    const nestedPayload =
      rawPayload && typeof rawPayload === 'object' && 'result' in rawPayload
        ? (rawPayload as RankingRowLike)['result']
        : rawPayload
    const payload = Array.isArray(nestedPayload) ? nestedPayload[0] : nestedPayload

    if (payload && typeof payload === 'object') {
      const typedPayload = payload as RankingRowLike
      const hasRankingData =
        typedPayload['totalParticipants'] !== undefined ||
        Array.isArray(typedPayload['rankingTempo']) ||
        Array.isArray(typedPayload['rankingQuestions']) ||
        Array.isArray(typedPayload['rankingPages'])

      if (hasRankingData) {
        const rankingTempo = normalizeRankingList(typedPayload['rankingTempo'])
        const rawUserStats =
          typedPayload['userStats'] && typeof typedPayload['userStats'] === 'object'
            ? (typedPayload['userStats'] as RankingRowLike)
            : {}

        return {
          data: {
            totalParticipants: toNumber(typedPayload['totalParticipants']) || rankingTempo.length,
            rankingTempo,
            rankingQuestions: normalizeRankingList(typedPayload['rankingQuestions']),
            rankingPages: normalizeRankingList(typedPayload['rankingPages']),
            userStats: {
              tempo: normalizeRankingList(rawUserStats['tempo'] ? [rawUserStats['tempo']] : [])[0] ?? null,
              questoes: normalizeRankingList(rawUserStats['questoes'] ? [rawUserStats['questoes']] : [])[0] ?? null,
              paginas: normalizeRankingList(rawUserStats['paginas'] ? [rawUserStats['paginas']] : [])[0] ?? null,
            },
          },
          error: null,
        }
      }
    }

    // Se RPC não retornou dados válidos, usar fallback
    console.warn("RPC retornou dados, mas não no formato esperado:", rpcData)
    return await getRankingViaDirectQuery(supabase, period, currentUser?.id)
  } catch (error) {
    console.error("Erro em getGlobalRankingAction:", error)
    return { data: null, error: (error as { message?: string }).message }
  }
}

// Fallback: query direta (caso a RPC não esteja disponível no banco).
// ATENÇÃO: study_history e profiles têm RLS por usuário (auth.uid() = user_id);
// quando a leitura direta só retorna o próprio usuário, complementamos com a
// view pública public_study_stats, que agrega dados de TODOS os usuários e
// foi criada justamente para o ranking global sem RLS (sprint3-history.sql).
// A view também devolve display_name (docs/fix-ranking-names.sql):
// sem isso o nome dos demais usuários nunca chega, pois profiles tem RLS por
// usuário e o SELECT direto só retorna o perfil de quem está logado.
async function getRankingViaDirectQuery(supabase: Supabase, period: string, currentUserId?: string) {
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
  historyData?.forEach((h) => { if (h.user_id) activeUserIds.add(h.user_id) })
  if (currentUserId) activeUserIds.add(currentUserId)

  const totalsByUser = new Map<string, { totalMinutes: number; questionsCount: number; pagesCount: number }>()

  // Acumula totais do período lendo as linhas que o RLS permite enxergar
  // (todas quando permissivo; apenas o próprio usuário quando restrito).
  const periodTotals = new Map<string, { totalMinutes: number; questionsCount: number; pagesCount: number }>()
  historyData?.forEach((h) => {
    const entry = periodTotals.get(h.user_id) || { totalMinutes: 0, questionsCount: 0, pagesCount: 0 }
    entry.totalMinutes += h.active_minutes ?? h.duration_minutes ?? 0
    const meta = h.metadata || {}
    if (meta['pages_read']) entry.pagesCount += Number(meta['pages_read'])
    if (meta['questions_answered']) entry.questionsCount += Number(meta['questions_answered'])
    periodTotals.set(h.user_id, entry)
  })

  // Se a leitura direta só trouxe o próprio usuário, o RLS está filtrando os
  // demais: usamos a view pública agregada (que consulta todos os usuários e
  // também devolve o nome/avatar real de cada um, sem passar pelo RLS).
  const rlsLimited = activeUserIds.size <= 1
  const publicInfoMap = new Map<string, { name: string }>()
  if (rlsLimited) {
    interface PublicStudyStatsRow {
      user_id: string
      display_name: string | null
      total_minutes: number
      questions_count: number
      pages_count: number
    }
    const { data: statsRows } = await supabase
      .from('public_study_stats')
      .select('user_id, display_name, total_minutes, questions_count, pages_count')
      .returns<PublicStudyStatsRow[]>()

    statsRows?.forEach((row) => {
      totalsByUser.set(row.user_id, {
        totalMinutes: row.total_minutes || 0,
        questionsCount: row.questions_count || 0,
        pagesCount: row.pages_count || 0,
      })
      if (row.user_id) {
        publicInfoMap.set(row.user_id, {
          name: row.display_name || '',
        })
      }
      activeUserIds.add(row.user_id)
    })
    if (currentUserId) activeUserIds.add(currentUserId)
  }

  // Garante entrada para todos os usuários ativos (inclusive os que não têm
  // sessão no período, para o usuário atual ficar na lista final).
  activeUserIds.forEach((uid) => {
    if (!totalsByUser.has(uid)) {
      totalsByUser.set(uid, { totalMinutes: 0, questionsCount: 0, pagesCount: 0 })
    }
  })

  // Totais do período: com RLS permissivo valem para todos; com RLS restrito
  // substituem a agregação da view apenas para o próprio usuário (sem somar
  // duas vezes os mesmos minutos).
  if (!rlsLimited) {
    periodTotals.forEach((totals, uid) => {
      if (totalsByUser.has(uid)) totalsByUser.set(uid, totals)
    })
  } else if (currentUserId) {
    const ownTotals = periodTotals.get(currentUserId)
    if (ownTotals) totalsByUser.set(currentUserId, ownTotals)
  }

  const userIdsArray = Array.from(activeUserIds)

  const profilesMap = new Map<string, { name: string }>()
  if (userIdsArray.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIdsArray)

    profiles?.forEach((p) => {
      profilesMap.set(p.id, {
        name: p.name || 'Estudante',
      })
    })
  }

  const userMap = new Map<string, {
    id: string; name: string; avatar: string; initials: string; bgColor: string;
    totalMinutes: number; questionsCount: number; pagesCount: number;
  }>()

  userIdsArray.forEach((uid, idx) => {
    const profile = profilesMap.get(uid)
    const publicInfo = publicInfoMap.get(uid)
    const rawName = profile?.name || publicInfo?.name || (currentUserId && uid === currentUserId ? 'Você' : `Estudante #${uid.substring(0, 4)}`)
    const initials = initialsFor(rawName)
    const totals = totalsByUser.get(uid) || { totalMinutes: 0, questionsCount: 0, pagesCount: 0 }

    userMap.set(uid, {
      id: uid, name: rawName, avatar: '', initials,
      bgColor: bgColors[idx % bgColors.length] || 'bg-blue-600',
      ...totals,
    })
  })

  const allUsers = Array.from(userMap.values())
  const sortByTempo = [...allUsers].sort((a, b) => b.totalMinutes - a.totalMinutes || b.questionsCount - a.questionsCount || b.pagesCount - a.pagesCount)
  const sortByQuestions = [...allUsers].sort((a, b) => b.questionsCount - a.questionsCount || b.totalMinutes - a.totalMinutes)
  const sortByPages = [...allUsers].sort((a, b) => b.pagesCount - a.pagesCount || b.totalMinutes - a.totalMinutes)

  const mapToList = (list: typeof allUsers): RankingEntry[] => list.map((item, idx) => ({
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

  const findUserStats = (ranking: RankingEntry[]) => {
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
    
    await supabase.rpc('get_global_ranking', {
      p_period: 'this_week',
      p_current_user_id: user?.id || null
    })
    
    // Verificar dados na tabela study_history
    await supabase
      .from('study_history')
      .select('user_id, active_minutes, duration_minutes, started_at, completed, metadata')
      .limit(10)
    
    // Verificar se question_attempts existe
    await supabase
      .from('question_attempts')
      .select('user_id, correct, answered_at')
      .limit(10)
    
    // Verificar perfis (apenas coluna name)
    await supabase
      .from('profiles')
      .select('id, name')
      .limit(10)
    
    return { success: true, debug: "Verifique o console do servidor" }
  } catch (err) {
    console.error("[TEST RPC] Error:", err)
    return { success: false, error: (err as { message?: string }).message }
  }
}

