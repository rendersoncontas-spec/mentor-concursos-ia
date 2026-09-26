"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { getStudyHistoryForAnalytics, AnalyticsEngine } from "./study-analytics.service"
import { isMaintenanceMode } from "@/lib/maintenance"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import { getDayInSaoPaulo, daysAgoKeyInSaoPaulo, startOfDayInSaoPauloMs, endOfDayInSaoPauloMs } from "@/lib/sao-paulo"
import { getSaoPauloWeekRange, resolveWeekStartDay } from "@/lib/study-time-calculator"

type Supabase = Awaited<ReturnType<typeof createClient>>

export type RankingPeriod = 'today' | 'this_week' | 'last_week' | 'this_month' | 'general'

interface RankingEntry {
  rank: number
  id: string
  name: string
  avatar: string
  targetContest: string
  hours: string
  totalMinutes: number
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
        totalMinutes,
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
    
    // Acertos/erros reais (question_attempts)
    const { data: attemptsRows } = await supabase
      .from("question_attempts")
      .select("correct")
      .eq("user_id", user.id)
    const attempts = attemptsRows || []
    const totalCorrect = attempts.filter((a: { correct: boolean }) => a.correct).length
    const totalWrong = attempts.length - totalCorrect
    
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

export async function getGlobalRankingAction(period: RankingPeriod = 'this_week', weekOffset: number = 0) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  
  try {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    // 1. Usar a RPC que bypassa RLS via SECURITY DEFINER
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_global_ranking', {
        p_period: period,
        p_current_user_id: currentUser?.id || null,
        p_week_offset: weekOffset,
      })

    let rankingData: {
      totalParticipants: number
      rankingTempo: RankingEntry[]
      rankingQuestions: RankingEntry[]
      rankingPages: RankingEntry[]
      userStats: {
        tempo: RankingEntry | null
        questoes: RankingEntry | null
        paginas: RankingEntry | null
      }
    } | null = null

    if (!rpcError && rpcData) {
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

          rankingData = {
            totalParticipants: toNumber(typedPayload['totalParticipants']) || rankingTempo.length,
            rankingTempo,
            rankingQuestions: normalizeRankingList(typedPayload['rankingQuestions']),
            rankingPages: normalizeRankingList(typedPayload['rankingPages']),
            userStats: {
              tempo: normalizeRankingList(rawUserStats['tempo'] ? [rawUserStats['tempo']] : [])[0] ?? null,
              questoes: normalizeRankingList(rawUserStats['questoes'] ? [rawUserStats['questoes']] : [])[0] ?? null,
              paginas: normalizeRankingList(rawUserStats['paginas'] ? [rawUserStats['paginas']] : [])[0] ?? null,
            },
          }
        }
      }
    }

    if (!rankingData) {
      const fallbackResult = await getRankingViaDirectQuery(supabase, period, currentUser?.id, weekOffset)
      if (fallbackResult.error || !fallbackResult.data) {
        return fallbackResult
      }
      rankingData = fallbackResult.data
    }

    // 2. ENRIQUECER com profiles reais (avatar_url, nickname e preferências de foto/iniciais)
    const allStudentIds = [
      ...rankingData.rankingTempo.map((r) => r.id),
      ...rankingData.rankingQuestions.map((r) => r.id),
      ...rankingData.rankingPages.map((r) => r.id),
      currentUser?.id || '',
    ].filter(Boolean)

    const uniqueUserIds = Array.from(new Set(allStudentIds))

    if (uniqueUserIds.length > 0) {
      const { data: profilesList } = await supabase
        .from('profiles')
        .select('id, name, full_name, nickname, avatar_url, preferences')
        .in('id', uniqueUserIds)

      const profileMap = new Map<
        string,
        {
          id: string
          name: string | null
          full_name: string | null
          nickname: string | null
          avatar_url: string | null
          preferences: Record<string, unknown>
        }
      >()

      profilesList?.forEach((p) => {
        profileMap.set(p.id, {
          id: p.id,
          name: p.name,
          full_name: p.full_name,
          nickname: p.nickname,
          avatar_url: p.avatar_url,
          preferences: (p.preferences as Record<string, unknown>) || {},
        })
      })

      const enrichStudent = (student: RankingEntry | null): RankingEntry | null => {
        if (!student) return null
        const prof = profileMap.get(student.id)
        if (!prof) return student

        const prefs = prof.preferences || {}
        const avatarType = (prefs['avatarType'] as string) || 'foto'
        const nameType = (prefs['nameType'] as string) || 'nome'

        const chosenName =
          nameType === 'apelido' && prof.nickname
            ? prof.nickname
            : prof.name || prof.full_name || student.name

        const isUserSelf = currentUser?.id && student.id === currentUser.id
        const displayName = isUserSelf ? `${chosenName} (Você)` : chosenName

        const avatarUrl =
          avatarType === 'iniciais' ? '' : prof.avatar_url || student.avatar || ''

        return {
          ...student,
          name: displayName,
          avatar: avatarUrl,
          initials: initialsFor(chosenName),
        }
      }

      rankingData.rankingTempo = rankingData.rankingTempo.map(enrichStudent) as RankingEntry[]
      rankingData.rankingQuestions = rankingData.rankingQuestions.map(enrichStudent) as RankingEntry[]
      rankingData.rankingPages = rankingData.rankingPages.map(enrichStudent) as RankingEntry[]
      rankingData.userStats = {
        tempo: enrichStudent(rankingData.userStats.tempo),
        questoes: enrichStudent(rankingData.userStats.questoes),
        paginas: enrichStudent(rankingData.userStats.paginas),
      }
    }

    return { data: rankingData, error: null }
  } catch (error) {
    console.error("Erro em getGlobalRankingAction:", error)
    return { data: null, error: (error as { message?: string }).message }
  }
}

// Fallback: query direta (caso a RPC não esteja disponível no banco).
async function getRankingViaDirectQuery(supabase: Supabase, period: RankingPeriod, currentUserId?: string, weekOffset: number = 0, now: Date = new Date()) {
  // Fase 5 da auditoria de estabilização (timezone — ranking): os limites de
  // período abaixo eram calculados com accessors de Date no fuso LOCAL DO
  // RUNTIME (UTC em produção: getDay, getDate, getFullYear, getMonth,
  // setHours(0,0,0,0)), não no fuso de negócio (America/Sao_Paulo). Entre
  // 21h e 23h59 em São Paulo (00h-02h59 UTC do dia seguinte), uma sessão de
  // estudo podia ser contada no período errado do ranking público (ex.:
  // "semana passada" quando na verdade ainda era "esta semana" para o
  // aluno). Corrigido para usar os helpers de fuso de São Paulo já usados
  // no resto do projeto. O parâmetro `now` é opcional e permite testar de
  // forma determinística.
  const todayKey = getDayInSaoPaulo(now)
  const weekRange = getSaoPauloWeekRange(todayKey, 1) // semana começa na Segunda (ISO)
  const thisMondayKey = weekRange.mondayKey
  const lastMondayKey = daysAgoKeyInSaoPaulo(7, thisMondayKey)
  const lastSundayKey = daysAgoKeyInSaoPaulo(1, thisMondayKey)
  const offsetMondayKey = daysAgoKeyInSaoPaulo(-weekOffset * 7, thisMondayKey)
  const offsetSundayKey = daysAgoKeyInSaoPaulo(-6, offsetMondayKey)

  let startDate: string | null = null
  let endDate: string | null = null

  if (period === 'today') {
    startDate = new Date(startOfDayInSaoPauloMs(todayKey)).toISOString()
  } else if (period === 'this_week') {
    startDate = new Date(startOfDayInSaoPauloMs(offsetMondayKey)).toISOString()
    if (weekOffset < 0) endDate = new Date(endOfDayInSaoPauloMs(offsetSundayKey)).toISOString()
  } else if (period === 'last_week') {
    startDate = new Date(startOfDayInSaoPauloMs(lastMondayKey)).toISOString()
    endDate = new Date(endOfDayInSaoPauloMs(lastSundayKey)).toISOString()
  } else if (period === 'this_month') {
    const monthStartKey = `${todayKey.slice(0, 7)}-01`
    startDate = new Date(startOfDayInSaoPauloMs(monthStartKey)).toISOString()
  }

  // Fase F.1: paginado (antes 1 requisição cortada em 1.000 linhas → no
  // período "geral" o total do próprio usuário saía subcontado).
  //
  // Fase I.8: erro NÃO é mais "sem linhas". Sem o histórico, todo mundo entrava
  // no ranking com 0 minutos e o aluno via a si mesmo zerado, em posição de
  // último — um dado falso, e ainda por cima comparativo. Agora a leitura que
  // falha devolve erro controlado, e a tela mostra o estado de erro que ela já
  // tem, com "Tentar novamente". A fórmula, a ordenação e os desempates do
  // ranking continuam exatamente os mesmos.
  const historyResult = await fetchAllRowsPaged<{
    user_id: string
    duration_minutes: number | null
    active_minutes: number | null
    started_at: string
    metadata: Record<string, unknown> | null
  }>(
    (withCount) => {
      let query = supabase
        .from('study_history')
        .select('user_id, duration_minutes, active_minutes, started_at, metadata', countOption(withCount))
      if (startDate) query = query.gte('started_at', startDate)
      if (endDate) query = query.lte('started_at', endDate)
      return query
    },
    [{ column: 'id', ascending: true }],
  )
  if (historyResult.error) {
    console.error("[RANKING] Erro ao carregar o histórico do ranking:", historyResult.error)
    return {
      data: null,
      error: "Não foi possível calcular o ranking agora. Tente novamente em instantes.",
    }
  }
  const historyData = historyResult.data

  const activeUserIds = new Set<string>()
  historyData?.forEach((h) => { if (h.user_id) activeUserIds.add(h.user_id) })
  if (currentUserId) activeUserIds.add(currentUserId)

  const totalsByUser = new Map<string, { totalMinutes: number; questionsCount: number; pagesCount: number }>()

  const periodTotals = new Map<string, { totalMinutes: number; questionsCount: number; pagesCount: number }>()
  historyData?.forEach((h) => {
    const entry = periodTotals.get(h.user_id) || { totalMinutes: 0, questionsCount: 0, pagesCount: 0 }
    entry.totalMinutes += h.active_minutes ?? h.duration_minutes ?? 0
    const meta = h.metadata || {}
    if (meta['pages_read']) entry.pagesCount += Number(meta['pages_read'])
    if (meta['questions_answered']) entry.questionsCount += Number(meta['questions_answered'])
    periodTotals.set(h.user_id, entry)
  })

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
    const { data: statsRows, error: statsError } = await supabase
      .from('public_study_stats')
      .select('user_id, display_name, total_minutes, questions_count, pages_count')
      .returns<PublicStudyStatsRow[]>()

    // Fase I.8: neste caminho (RLS limitando o histórico a um usuário) a visão
    // pública É o ranking. Se ela falha, não existe ranking para mostrar — e
    // seguir em frente deixaria o aluno sozinho no quadro, com 0 minutos.
    if (statsError) {
      console.error("[RANKING] Erro ao carregar public_study_stats:", statsError)
      return {
        data: null,
        error: "Não foi possível calcular o ranking agora. Tente novamente em instantes.",
      }
    }

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

  activeUserIds.forEach((uid) => {
    if (!totalsByUser.has(uid)) {
      totalsByUser.set(uid, { totalMinutes: 0, questionsCount: 0, pagesCount: 0 })
    }
  })

  if (!rlsLimited) {
    periodTotals.forEach((totals, uid) => {
      if (totalsByUser.has(uid)) totalsByUser.set(uid, totals)
    })
  } else if (currentUserId) {
    const ownTotals = periodTotals.get(currentUserId)
    if (ownTotals) totalsByUser.set(currentUserId, ownTotals)
  }

  const userIdsArray = Array.from(activeUserIds)

  const profilesMap = new Map<string, { name: string; full_name?: string; nickname?: string; avatar_url?: string; preferences?: Record<string, unknown> }>()
  if (userIdsArray.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, full_name, nickname, avatar_url, preferences')
      .in('id', userIdsArray)

    profiles?.forEach((p) => {
      profilesMap.set(p.id, {
        name: p.name || 'Estudante',
        full_name: p.full_name,
        nickname: p.nickname,
        avatar_url: p.avatar_url,
        preferences: (p.preferences as Record<string, unknown>) || {},
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
    const pPrefs = (profile?.preferences as Record<string, unknown>) || {}
    const avatarType = (pPrefs['avatarType'] as string) || 'foto'
    const nameType = (pPrefs['nameType'] as string) || 'nome'

    const chosenName =
      nameType === 'apelido' && profile?.nickname
        ? profile.nickname
        : profile?.name || profile?.full_name || publicInfo?.name || (currentUserId && uid === currentUserId ? 'Você' : `Estudante #${uid.substring(0, 4)}`)

    const initials = initialsFor(chosenName)
    const avatar = avatarType === 'iniciais' ? '' : profile?.avatar_url || ''
    const totals = totalsByUser.get(uid) || { totalMinutes: 0, questionsCount: 0, pagesCount: 0 }

    userMap.set(uid, {
      id: uid, name: chosenName, avatar, initials,
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
    hours: formatHours(item.totalMinutes), totalMinutes: item.totalMinutes,
    questions: item.questionsCount,
    pages: item.pagesCount, initials: item.initials,
    bgColor: item.bgColor, hasActivity: item.totalMinutes > 0,
  }))

  const rankingTempo = mapToList(sortByTempo)
  const rankingQuestions = mapToList(sortByQuestions)
  const rankingPages = mapToList(sortByPages)

  const findUserStats = (ranking: RankingEntry[]) => {
    if (!currentUserId) return null
    const found = ranking.find(r => r.id === currentUserId)
    const ownProf = profilesMap.get(currentUserId)
    const ownAvatar = (ownProf?.preferences?.['avatarType'] === 'iniciais') ? '' : (ownProf?.avatar_url || '')
    return found || {
      rank: ranking.length + 1, id: currentUserId, name: 'Você', avatar: ownAvatar,
      targetContest: 'Global', hours: '0min', totalMinutes: 0, questions: 0, pages: 0,
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

// Contexto pessoal do Ranking (dados reais, mínimas queries):
// meta semanal (profiles.weekly_study_hours + minutos da semana) e constância
// (sequência atual e recorde). Reutiliza o AnalyticsEngine e o histórico do usuário.
export interface RankingPersonalContext {
  /** Fase H: target/percentage/remaining = null quando o aluno não definiu meta. */
  weeklyGoal: {
    targetMinutes: number | null
    achievedMinutes: number
    percentage: number | null
    remainingMinutes: number | null
  }
  streak: {
    consecutiveDays: number
    longestDays: number
  }
}

export async function getRankingPersonalContextAction(): Promise<{
  data: RankingPersonalContext | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const [profileResult, history] = await Promise.all([
      supabase
        .from("profiles")
        .select("weekly_study_hours, week_start_day, preferences")
        .eq("id", user.id)
        .maybeSingle(),
      getStudyHistoryForAnalytics(supabase, user.id, 365),
    ])

    const profile = profileResult?.data
    const ctx = AnalyticsEngine.createContext(
      history as unknown as StudyHistory[],
      365,
      "America/Sao_Paulo",
      // Fase H: mesma regra de início de semana do resto do app (preferência
      // firstDayOfWeek > coluna week_start_day > Domingo).
      resolveWeekStartDay(
        (profile?.preferences as Record<string, unknown> | null)?.["firstDayOfWeek"],
        profile?.week_start_day,
      ),
    )
    const base = AnalyticsEngine.aggregations.getBase(ctx)

    // Fase H: sem meta definida, não inventar uma ("|| 10" mostrava 10h como
    // se fosse a meta do aluno).
    const goalHours = profile?.weekly_study_hours
    const targetMinutes = goalHours && goalHours > 0 ? goalHours * 60 : null
    const achievedMinutes = base.weeklyMinutes
    const remainingMinutes = targetMinutes !== null ? Math.max(0, targetMinutes - achievedMinutes) : null
    const percentage =
      targetMinutes !== null ? Math.min(100, Math.round((achievedMinutes / targetMinutes) * 100)) : null

    return {
      data: {
        weeklyGoal: {
          targetMinutes,
          achievedMinutes,
          percentage,
          remainingMinutes,
        },
        streak: {
          consecutiveDays: base.consecutiveStreak,
          longestDays: base.longestStreak,
        },
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? "Erro inesperado." }
  }
}

export interface RecentHistoryEntry {
  date: string
  disciplineId: string
  minutes: number
  studyPlanItemId: string | null
}

// Histórico recente de estudo (por dia) para o widget "Estudos de Hoje": dados
// reais de study_history, sem valores inventados.
export async function getRecentStudyHistoryAction(
  days = 14
): Promise<{ data: RecentHistoryEntry[] | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    // BUG CORRIGIDO (Fase 13, decisao aprovada na Fase 12): esta action
    // alimenta o widget de "atividades recentes" do Dashboard
    // (dashboard-widget-catalog.tsx). O restante do Dashboard nesse mesmo
    // domínio (dashboard-layout.action.ts, statistics-center.action.ts) ja
    // usa getEffectiveUserId - antes desta correção, um admin em modo
    // suporte veria as estatisticas do usuario-alvo, mas este widget
    // especifico mostraria o HISTORICO DO PROPRIO ADMIN, misturando dados
    // de duas contas na mesma tela.
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId) return { data: [], error: null }

    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data: rows, error } = await supabase
      .from("study_history")
      .select("discipline_id, duration_minutes, started_at, study_plan_item_id")
      .eq("user_id", effectiveUserId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(500)

    if (error) return { data: null, error: error.message }

    const entries: RecentHistoryEntry[] = []
    for (const r of rows ?? []) {
      const startedAt = r.started_at
      if (startedAt === null || startedAt === undefined) continue
      const minutes = Number(r.duration_minutes) || 0
      if (minutes <= 0) continue
      const disciplineId = typeof r.discipline_id === "string" ? r.discipline_id : ""
      if (!disciplineId) continue
      entries.push({
        date: new Date(startedAt).toISOString(),
        disciplineId,
        minutes,
        studyPlanItemId: typeof r.study_plan_item_id === "string" ? r.study_plan_item_id : null,
      })
    }

    return { data: entries, error: null }
  } catch (error) {
    return { data: null, error: (error as { message?: string }).message ?? "Erro inesperado." }
  }
}
