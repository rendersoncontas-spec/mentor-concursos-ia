import { type SupabaseClient } from "@supabase/supabase-js"
import {
  type StudyPlan,
  type StudyPlanItemWithDetails,
  type StudyPlanWeek,
  type StudyPlanDisciplineSummary,
  type DayOfWeek,
  type AlgorithmInput,
  type CycleOverviewData,
  type CycleBlock,
  type BlockStatus,
  DAY_LABELS,
  DAY_SHORT,
} from "@/domain/study-plan/study-plan.types"
import { calculateWeeklyDistribution, calculateCycleDistribution, calcDisciplineSummary } from "@/application/study-plan/study-plan.algorithm"
import { generateAdaptiveDecisions, type AnalyticsContext } from "@/application/adaptive-learning/adaptive-learning.service"

/**
 * Gera e persiste um novo cronograma para o usuário.
 * 1. Busca perfil + concurso ativo + disciplinas
 * 2. Chama o algoritmo puro
 * 3. Desativa planos anteriores
 * 4. Persiste o novo plano
 */
export async function generateStudyPlan(
  supabase: SupabaseClient,
  userId: string,
  reason: string = "manual",
  targetId?: string,
  overrideWeeklyHours?: number
): Promise<{ id: string; version: number } | null> {
  // 1a. Buscar perfil
  const { data: profile } = await supabase
    .from("profiles")
    .select("weekly_study_hours, experience_level")
    .eq("id", userId)
    .maybeSingle()

  const targetHours = overrideWeeklyHours || profile?.weekly_study_hours || 25

  // 1b. Buscar concurso ativo (exam_id pode ser null para concursos customizados)
  const { data: target } = await supabase
    .from("user_targets")
    .select("id, exam_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  let examDisciplines: Array<{
    id: string
    exam_id: string | null
    discipline_id: string
    weight: number
    display_order: number | null
    active: boolean | null
    created_at: string
    discipline: { id: string; name: string; area: string; created_at: string } | null
  }> = []

  // 1c. Buscar disciplinas do usuário (user_disciplines)
  const { data: userDiscs } = await supabase
    .from("user_disciplines")
    .select(`
      id,
      discipline_id,
      status,
      discipline:disciplines(
        id,
        name,
        area,
        created_at
      )
    `)
    .eq("user_id", userId)
    .eq("target_id", targetId || target?.id)
    .limit(30)

  if (userDiscs && userDiscs.length > 0) {
    examDisciplines = userDiscs
      .filter(ud => ud.discipline)
      .map((ud, idx) => ({
        id: ud.id as string,
        exam_id: target?.exam_id || null,
        discipline_id: ud.discipline_id as string,
        weight: 5,
        display_order: idx,
        active: true,
        created_at: new Date().toISOString(),
        discipline: ((Array.isArray(ud.discipline) ? ud.discipline[0] : ud.discipline) ?? null)
      }))
  } else if (target?.exam_id) {
    // 1c-Fallback. Se tiver exam_id mas não tiver user_disciplines, buscar do edital
    const { data: rawExamDisciplines } = await supabase
      .from("exam_disciplines")
      .select(`
        id,
        exam_id,
        discipline_id,
        weight,
        display_order,
        active,
        created_at,
        discipline:disciplines(
          id,
          name,
          area,
          created_at
        )
      `)
      .eq("exam_id", target.exam_id)

    examDisciplines = (rawExamDisciplines || [])
      .filter(ed => ed.active !== false && ed.discipline)
      .map(row => ({
        id: row.id as string,
        exam_id: row.exam_id as string | null,
        discipline_id: row.discipline_id as string,
        weight: (row.weight ?? 5) as number,
        display_order: row.display_order as number | null,
        active: row.active as boolean | null,
        created_at: row.created_at as string,
        discipline: (Array.isArray(row.discipline) ? row.discipline[0] : row.discipline) ?? null
      }))
  }
  if (examDisciplines.length === 0) {
    console.error("generateStudyPlan: no disciplines found (neither exam nor user_disciplines)")
    return null
  }

  // 1d. Buscar status das disciplinas do usuário
  const { data: userDisciplines } = await supabase
    .from("user_disciplines")
    .select("discipline_id, status")
    .eq("user_id", userId)

  const statusMap = new Map<string, string>(
    (userDisciplines ?? []).map((ud) => [ud.discipline_id, ud.status as string])
  )

  // 1e. Construir AnalyticsContext para o Motor Adaptativo
  // Desempenho real por disciplina (acurácia e volume de estudo nos últimos 90 dias).
  const perfCutoff = new Date()
  perfCutoff.setDate(perfCutoff.getDate() - 90)
  const { data: perfHistory } = await supabase
    .from("study_history")
    .select("discipline_id, duration_minutes, metadata")
    .eq("user_id", userId)
    .gte("started_at", perfCutoff.toISOString())

  const perfByDiscipline = new Map<string, { answered: number; correct: number; minutes: number }>()
  ;(perfHistory ?? []).forEach((h) => {
    const meta = (h.metadata ?? {}) as Record<string, unknown>
    const answered = Number(meta["questions_answered"]) || 0
    const correct = Number(meta["questions_correct"]) || 0
    const record = perfByDiscipline.get(h.discipline_id) ?? { answered: 0, correct: 0, minutes: 0 }
    record.answered += answered
    record.correct += correct
    record.minutes += Number(h.duration_minutes) || 0
    perfByDiscipline.set(h.discipline_id, record)
  })

  let hasRealPerformance = false
  const mockContext: AnalyticsContext = {
    userId,
    disciplines: examDisciplines.map(ed => {
      const record = perfByDiscipline.get(ed.discipline_id)
      let performanceScore = 50
      let retentionRate = 50
      if (record && (record.answered > 0 || record.minutes > 0)) {
        hasRealPerformance = true
        performanceScore = record.answered > 0
          ? Math.round((record.correct / record.answered) * 100)
          : 60
        retentionRate = performanceScore
      }
      return {
        id: ed.discipline_id,
        name: ed.discipline?.name || "Desconhecido",
        weight: ed.weight,
        performanceScore,
        retentionRate,
        lapsesCount: 0,
        daysSinceLastStudy: 0
      }
    }),
    userStats: {
      averageEnergy: 3,
      weeklyHoursStudied: profile?.weekly_study_hours ?? 20,
      currentStreak: 5,
      totalBacklogReviews: 0
    }
  }

  // 1f. Gerar decisões adaptativas
  const adaptiveDecisions = generateAdaptiveDecisions(mockContext)

  // 1g. Salvar decisões no banco (Auditoria) — somente com desempenho real,
  // para não persistir recomendações fabricadas no adaptive_history.
  if (hasRealPerformance && adaptiveDecisions.length > 0) {
    const historyPayload = adaptiveDecisions.map(d => ({
      user_id: userId,
      discipline_id: d.disciplineId,
      recommendation_type: d.recommendationType,
      previous_value: d.previousValue,
      new_value: d.newValue,
      delta: d.delta,
      reason: d.reason,
      confidence: d.confidence,
      engine: d.engine,
      algorithm_version: d.algorithmVersion,
      expires_at: d.expiresAt,
      is_active: true
    }))
    
    const { error: aleError } = await supabase.from("adaptive_history").insert(historyPayload)
    if (aleError) console.error("Erro ao salvar adaptive_history:", aleError)
  }

  // 2. Montar input e chamar algoritmo puro
  const weeklyMinutes = targetHours * 60
  const availableDays: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]  // Futuro: virá do perfil

  const algorithmInput: AlgorithmInput = {
    weeklyMinutes,
    availableDays,
    disciplines: examDisciplines.map((ed) => ({
      disciplineId: ed.discipline_id,
      name: ed.discipline?.name || "Desconhecido",
      area: ed.discipline?.area || "Desconhecida",
      weight: ed.weight,
      status: statusMap.get(ed.discipline_id) ?? "NOT_STARTED",
    })),
    adaptiveDecisions
  }

  const algorithmItems = calculateWeeklyDistribution(algorithmInput)

  if (algorithmItems.length === 0) {
    return null
  }

  // 3. Desativar planos anteriores
  await supabase
    .from("study_plans")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("active", true)

  // 4a. Determinar nova versão
  const { count } = await supabase
    .from("study_plans")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)

  const newVersion = (count ?? 0) + 1

  // 4b. Inserir novo plano
  const { data: newPlan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      version: newVersion,
      generated_reason: reason,
      active: true,
    })
    .select()
    .single()

  if (planError || !newPlan) {
    console.error("generateStudyPlan: plan insert error", planError)
    return null
  }

  // 4c. Inserir itens do plano
  const itemsToInsert = algorithmItems.map((item) => ({
    study_plan_id: newPlan.id,
    discipline_id: item.disciplineId,
    day_of_week: item.dayOfWeek,
    duration_minutes: item.durationMinutes,
    priority: item.priority,
    priority_score: item.priorityScore,
    recommended_sessions: item.recommendedSessions,
  }))

  const { error: itemsError } = await supabase
    .from("study_plan_items")
    .insert(itemsToInsert)

  if (itemsError) {
    console.error("generateStudyPlan: items insert error", itemsError)
    // O plano foi criado mas os itens falharam — ainda retornamos o plano
  }

  return newPlan as StudyPlan
}

/**
 * Busca o plano ativo do usuário com todos os itens e detalhes das disciplinas.
 */
export async function getActiveStudyPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<StudyPlanWeek | null> {
  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (planError || !plan) return null

  const { data: items, error: itemsError } = await supabase
    .from("study_plan_items")
    .select(`
      id, study_plan_id, discipline_id, day_of_week,
      duration_minutes, priority, priority_score, recommended_sessions, created_at,
      disciplines ( id, name, area )
    `)
    .eq("study_plan_id", plan.id)
    .order("day_of_week")
    .order("priority")

  if (itemsError || !items) return null

  type RawItem = {
    id: string
    study_plan_id: string
    discipline_id: string
    day_of_week: number
    duration_minutes: number
    priority: number
    priority_score: number
    recommended_sessions: number
    created_at: string
    disciplines: { id: string; name: string; area: string | null }
  }

  const typedItems: StudyPlanItemWithDetails[] = (items as unknown as RawItem[]).map((row) => ({
    id: row.id,
    study_plan_id: row.study_plan_id,
    discipline_id: row.discipline_id,
    day_of_week: row.day_of_week as DayOfWeek,
    duration_minutes: row.duration_minutes,
    priority: row.priority,
    priority_score: row.priority_score,
    recommended_sessions: row.recommended_sessions,
    created_at: row.created_at,
    discipline: row.disciplines,
  }))

  // Agrupar por dia
  const daysMap = new Map<DayOfWeek, StudyPlanItemWithDetails[]>()
  typedItems.forEach((item) => {
    const existing = daysMap.get(item.day_of_week) ?? []
    existing.push(item)
    daysMap.set(item.day_of_week, existing)
  })

  const days = (Array.from(daysMap.entries()) as [DayOfWeek, StudyPlanItemWithDetails[]][])
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, dayItems]) => ({
      dayOfWeek,
      label: DAY_LABELS[dayOfWeek],
      shortLabel: DAY_SHORT[dayOfWeek],
      totalMinutes: dayItems.reduce((s, i) => s + i.duration_minutes, 0),
      items: dayItems,
    }))

  const totalWeeklyMinutes = typedItems.reduce((s, i) => s + i.duration_minutes, 0)

  return {
    plan: plan as StudyPlan,
    days,
    totalWeeklyMinutes,
  }
}

/**
 * Busca itens do plano ativo para o dia atual (hoje).
 */
export async function getTodayStudyItems(
  supabase: SupabaseClient,
  userId: string
): Promise<StudyPlanItemWithDetails[]> {
  const todayDow = new Date().getDay() as DayOfWeek

  const { data: plans } = await supabase
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)

  const plan = plans?.[0]
  if (!plan) return []

  const { data: items, error } = await supabase
    .from("study_plan_items")
    .select(`
      id, study_plan_id, discipline_id, day_of_week,
      duration_minutes, priority, priority_score, recommended_sessions, created_at,
      disciplines ( id, name, area )
    `)
    .eq("study_plan_id", plan.id)
    .eq("day_of_week", todayDow)
    .order("priority")

  if (error || !items) return []

  type RawItem = {
    id: string
    study_plan_id: string
    discipline_id: string
    day_of_week: number
    duration_minutes: number
    priority: number
    priority_score: number
    recommended_sessions: number
    created_at: string
    disciplines: { id: string; name: string; area: string | null }
  }

  return (items as unknown as RawItem[]).map((row) => ({
    id: row.id,
    study_plan_id: row.study_plan_id,
    discipline_id: row.discipline_id,
    day_of_week: row.day_of_week as DayOfWeek,
    duration_minutes: row.duration_minutes,
    priority: row.priority,
    priority_score: row.priority_score,
    recommended_sessions: row.recommended_sessions,
    created_at: row.created_at,
    discipline: row.disciplines,
  }))
}

/**
 * Calcula resumo semanal por disciplina a partir do plano ativo.
 */
export async function getStudyPlanDisciplineSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<StudyPlanDisciplineSummary[]> {
  const plan = await getActiveStudyPlan(supabase, userId)
  if (!plan) return []

  const allItems = plan.days.flatMap((d) => d.items)

  return calcDisciplineSummary(
    allItems.map((item) => ({
      disciplineId: item.discipline_id,
      disciplineName: item.discipline.name,
      disciplineArea: item.discipline.area,
      dayOfWeek: item.day_of_week,
      durationMinutes: item.duration_minutes,
      priority: item.priority,
      priorityScore: item.priority_score,
      recommendedSessions: item.recommended_sessions,
    }))
  )
}

/**
 * Cores bonitas para os cards das disciplinas do ciclo.
 */
const DISCIPLINE_COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899",
  "#06b6d4", "#ef4444", "#6366f1", "#2563EB", "#f97316"
]

type StudyHistoryRecord = {
  discipline_id: string
  duration_minutes: number | null
  started_at: string | null
}

type CyclePlanItemRecord = {
  id: string
  study_plan_id: string
  discipline_id: string
  duration_minutes: number
  priority_score: number
  disciplines: { id?: string; name: string; area: string | null }[] | { id?: string; name: string; area: string | null } | null
}

/**
 * Cria e persiste um novo Ciclo Rotativo Contínuo para o usuário.
 */
export async function createCycleStudyPlan(
  supabase: SupabaseClient,
  userId: string,
  config: {
    totalCycleHours: number
    disciplines: {
      disciplineId: string
      name: string
      area: string | null
      weight: number
      difficulty: number
    }[]
  }
): Promise<StudyPlan | null> {
  const totalCycleMinutes = (config.totalCycleHours || 20) * 60

  const algorithmItems = calculateCycleDistribution({
    totalCycleMinutes,
    disciplines: config.disciplines
  })

  if (algorithmItems.length === 0) {
    return null
  }

  // 1. Desativar planos anteriores
  await supabase
    .from("study_plans")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("active", true)

  // 2. Determinar versão
  const { count } = await supabase
    .from("study_plans")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)

  const newVersion = (count ?? 0) + 1

  // 3. Inserir novo plano
  const { data: newPlan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      version: newVersion,
      generated_reason: "cycle_wizard",
      active: true,
    })
    .select()
    .single()

  if (planError || !newPlan) {
    console.error("createCycleStudyPlan: insert plan error", planError)
    return null
  }

  // 4. Inserir itens/blocos do ciclo
  const itemsToInsert = algorithmItems.map((item, idx: number) => ({
    study_plan_id: newPlan.id,
    discipline_id: item.disciplineId,
    day_of_week: 0,
    duration_minutes: item.durationMinutes,
    priority: idx + 1,
    priority_score: item.priorityScore,
    recommended_sessions: 1
  }))

  const { error: itemsError } = await supabase
    .from("study_plan_items")
    .insert(itemsToInsert)

  if (itemsError) {
    console.error("createCycleStudyPlan: insert items error", itemsError)
  }

  return newPlan as StudyPlan
}

/**
 * Busca a visão completa e progresso da rodada atual do Ciclo Rotativo.
 */
export async function getCycleOverviewData(
  supabase: SupabaseClient,
  userId: string
): Promise<CycleOverviewData | null> {
  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (planError || !plan) return null

  const { data: rawItems, error: itemsError } = await supabase
    .from("study_plan_items")
    .select(`
      id, study_plan_id, discipline_id, day_of_week,
      duration_minutes, priority, priority_score, recommended_sessions, created_at,
      disciplines ( id, name, area )
    `)
    .eq("study_plan_id", plan.id)
    .order("priority", { ascending: true })

  if (itemsError || !rawItems) return null

  // Mapear cores fixas por disciplina
  const disciplineColorMap = new Map<string, string>()
  let colorIndex = 0

  // 1. Fetch study history since plan creation to allocate studied minutes
  const planDate = plan.generated_at || plan.created_at
  const { data: historyData } = await supabase
    .from("study_history")
    .select("discipline_id, duration_minutes, started_at")
    .eq("user_id", userId)
    .gte("started_at", planDate)

  const studiedMap = new Map<string, number>()
  const history = ((historyData as StudyHistoryRecord[] | null)?.map((h) => ({
    disciplineId: h.discipline_id,
    minutes: h.duration_minutes || 0,
    // Use started_at split as YYYY-MM-DD (calendar date, not timezone-converted)
    date: h.started_at ? h.started_at.split("T")[0] : null
  })) || []).filter((h): h is { disciplineId: string; minutes: number; date: string } => h.date !== null)

  if (historyData) {
    (historyData as StudyHistoryRecord[]).forEach((h) => {
      const current = studiedMap.get(h.discipline_id) || 0
      studiedMap.set(h.discipline_id, current + (h.duration_minutes || 0))
    })
  }

  const blocks: CycleBlock[] = (rawItems as unknown as CyclePlanItemRecord[]).map((item, idx: number) => {
    const discId = item.discipline_id
    if (!disciplineColorMap.has(discId)) {
      const color = DISCIPLINE_COLORS[colorIndex % DISCIPLINE_COLORS.length]
      if (color) disciplineColorMap.set(discId, color)
      colorIndex++
    }

    const disc = Array.isArray(item.disciplines) ? item.disciplines[0] : item.disciplines
    const requiredMins = item.duration_minutes
    // Note: We do NOT set status to "CONCLUIDO" here based on global history.
    // Status per day is calculated by DailyPlanningView / WeeklyPlanningView
    // using history filtered by the selected date.
    const status: BlockStatus = "PENDENTE"
    const studied = 0

    return {
      id: item.id,
      studyPlanId: item.study_plan_id,
      disciplineId: item.discipline_id,
      disciplineName: disc?.name || "Disciplina",
      disciplineArea: disc?.area || null,
      color: disciplineColorMap.get(discId) || "#3b82f6",
      executionOrder: idx + 1,
      durationMinutes: requiredMins,
      studiedMinutes: studied,
      status,
      priorityScore: item.priority_score
    }
  })

  // Set the first PENDENTE or EM_ANDAMENTO block as the current one, if none is found, all are CONCLUIDO
  const firstIncompleteIndex = blocks.findIndex(b => b.status !== "CONCLUIDO")
  const currentBlockIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : blocks.length - 1

  // If the very first incomplete block is still PENDENTE and hasn't received any studied minutes, it's EM_ANDAMENTO implicitly for UI purposes
  const firstIncompleteBlock = firstIncompleteIndex >= 0 ? blocks[firstIncompleteIndex] : undefined
  if (firstIncompleteBlock?.status === "PENDENTE") {
    firstIncompleteBlock.status = "EM_ANDAMENTO"
  }

  const totalCycleMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const completedBlocks = blocks.filter(b => b.status === "CONCLUIDO")
  const completedMinutes = completedBlocks.reduce((acc, b) => acc + b.durationMinutes, 0)


  const progressPercentage = totalCycleMinutes > 0
    ? Math.round((completedMinutes / totalCycleMinutes) * 100)
    : 0

  return {
    planId: plan.id,
    version: plan.version,
    planType: "CICLO_ROTATIVO",
    totalCycleMinutes,
    completedMinutes,
    progressPercentage,
    currentBlockIndex: currentBlockIndex >= 0 ? currentBlockIndex : 0,
    totalBlocksCount: blocks.length,
    completedBlocksCount: completedBlocks.length,
    blocks,
    history
  }
}

/**
 * Desativa o plano de estudos ativo do usuário.
 */
export async function deactivateUserStudyPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("study_plans")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("active", true)

  return !error
}


