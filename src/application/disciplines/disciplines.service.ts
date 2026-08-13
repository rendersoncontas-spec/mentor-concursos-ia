import { type SupabaseClient } from "@supabase/supabase-js"
import { type Exam, type ExamDisciplineWithDetails, type UserDisciplineWithDetails, type DisciplineStatus, type EditalTree, type EditalDisciplineNode } from "@/domain/disciplines/disciplines.types"

// Busca todos os concursos ativos para o Combobox do Onboarding
export async function getGlobalExams(supabase: SupabaseClient): Promise<Exam[]> {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("active", true)
    .order("name")

  if (error) {
    console.error("Error fetching exams:", error)
    return []
  }

  return data as Exam[]
}

// Busca as disciplinas vinculadas a um concurso específico (via exam_disciplines)
export async function getExamDisciplines(
  supabase: SupabaseClient,
  examId: string
): Promise<ExamDisciplineWithDetails[]> {
  const { data, error } = await supabase
    .from("exam_disciplines")
    .select(`
      id,
      exam_id,
      discipline_id,
      weight,
      display_order,
      active,
      created_at,
      disciplines ( id, name, area, created_at )
    `)
    .eq("exam_id", examId)
    .eq("active", true)
    .order("display_order")

  if (error) {
    console.error("Error fetching exam disciplines:", error)
    return []
  }

  type RawRow = {
    id: string
    exam_id: string
    discipline_id: string
    weight: number
    display_order: number
    active: boolean
    created_at: string
    disciplines: { id: string; name: string; area: string | null; created_at: string }
  }

  return (data as unknown as RawRow[]).map((row) => ({
    id: row.id,
    exam_id: row.exam_id,
    discipline_id: row.discipline_id,
    weight: row.weight,
    display_order: row.display_order,
    active: row.active,
    created_at: row.created_at,
    discipline: row.disciplines,
  }))
}

// Busca o progresso do aluno em suas disciplinas (com detalhes da disciplina)
export async function getUserDisciplines(
  supabase: SupabaseClient,
  userId: string,
  targetId?: string
): Promise<UserDisciplineWithDetails[]> {
  let query = supabase
    .from("user_disciplines")
    .select(`
      id,
      user_id,
      discipline_id,
      target_id,
      status,
      mastery_level,
      created_at,
      disciplines ( id, name, area, created_at )
    `)
    .eq("user_id", userId)

  if (targetId) {
    query = query.eq("target_id", targetId)
  }

  const { data, error } = await query.order("created_at")

  if (error) {
    console.error("Error fetching user disciplines:", error)
    return []
  }

  type RawRow = {
    id: string
    user_id: string
    discipline_id: string
    target_id: string | null
    status: DisciplineStatus
    mastery_level: number
    created_at: string
    disciplines: { id: string; name: string; area: string | null; created_at: string }
  }

  return (data as unknown as RawRow[]).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    discipline_id: row.discipline_id,
    target_id: row.target_id,
    status: row.status,
    mastery_level: row.mastery_level ?? 0,
    created_at: row.created_at,
    discipline: row.disciplines,
  }))
}

// Atualiza o status de uma disciplina do usuário
export async function updateUserDisciplineStatus(
  supabase: SupabaseClient,
  userId: string,
  userDisciplineId: string,
  status: DisciplineStatus
): Promise<boolean> {
  const { error } = await supabase
    .from("user_disciplines")
    .update({ status })
    .eq("id", userDisciplineId)
    .eq("user_id", userId) // RLS extra no client

  if (error) {
    console.error("Error updating user discipline status:", error)
    return false
  }

  return true
}

// Seed automático de user_disciplines ao finalizar onboarding
export async function seedUserDisciplinesFromExam(
  supabase: SupabaseClient,
  userId: string,
  examId: string,
  targetId?: string
): Promise<boolean> {
  // 1. Busca as disciplinas do edital
  const examDisciplines = await getExamDisciplines(supabase, examId)

  if (examDisciplines.length === 0) {
    return true // Não é um erro fatal — o aluno pode adicionar depois
  }

  // 2. Monta os registros para inserção em massa
  const userDisciplinesToInsert = examDisciplines.map((ed) => ({
    user_id: userId,
    target_id: targetId,
    discipline_id: ed.discipline_id,
    status: "NOT_STARTED" as DisciplineStatus,
    mastery_level: 0,
  }))

  // 3. Insere ignorando duplicatas (UNIQUE user_id + target_id + discipline_id)
  const { error } = await supabase
    .from("user_disciplines")
    .upsert(userDisciplinesToInsert, {
      onConflict: "user_id,target_id,discipline_id",
      ignoreDuplicates: true,
    })

  if (error) {
    console.error("Error seeding user disciplines:", error)
    return false
  }

  return true
}

// Busca o edital completo de um concurso com assuntos aninhados por disciplina
export async function getExamEdital(supabase: SupabaseClient, examId: string): Promise<EditalTree | null> {
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .single()

  if (examError || !exam) {
    console.error("Error fetching exam:", examError)
    return null
  }

  const { data: mappings, error: mappingError } = await supabase
    .from("exam_subjects")
    .select(`
      weight,
      subjects ( id, name, slug ),
      disciplines ( id, name, area )
    `)
    .eq("exam_id", examId)

  if (mappingError || !mappings) {
    console.error("Error fetching exam mappings:", mappingError)
    return null
  }

  type ExamSubjectMapping = {
    weight: number
    subjects: { id: string; name: string; slug: string }
    disciplines: { id: string; name: string; area: string | null }
  }

  const disciplinesMap = new Map<string, EditalDisciplineNode>()

  const typedMappings = mappings as unknown as ExamSubjectMapping[]

  typedMappings.forEach((row) => {
    const discipline = row.disciplines
    const subject = row.subjects

    if (!discipline || !subject) return

    if (!disciplinesMap.has(discipline.id)) {
      disciplinesMap.set(discipline.id, {
        id: discipline.id,
        name: discipline.name,
        area: discipline.area,
        subjects: [],
      })
    }

    const disciplineNode = disciplinesMap.get(discipline.id)
    if (!disciplineNode) return

    disciplineNode.subjects.push({
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      weight: row.weight,
    })
  })

  const sortedDisciplines = Array.from(disciplinesMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  sortedDisciplines.forEach((d) => {
    d.subjects.sort((a, b) => a.name.localeCompare(b.name))
  })

  return {
    exam: exam as Exam,
    disciplines: sortedDisciplines,
  }
}

export interface DisciplinesPageData {
  target: {
    id: string | null
    name: string
    editalName: string
    role: string
    observations: string
  }
  totalStats: {
    studyTimeFormatted: string
    totalQuestions: number
    accuracyPercentage: number
    disciplinesCount: number
    topicsTotal: number
    topicsConcluded: number
  }
  disciplines: {
    id: string
    disciplineId: string
    name: string
    topicsStudied: number
    topicsTotal: number
    questionsSolved: number
    accuracy: number | null
    totalMinutes: number
    color: string
    status: DisciplineStatus
    area: string | null
  }[]
}

export async function getDisciplinesPageData(
  supabase: SupabaseClient,
  userId: string
): Promise<DisciplinesPageData> {
  const { data: rawTarget } = await supabase
    .from("user_targets")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  let exam_name = rawTarget?.target_exam || "Concurso Alvo"
  let editalName = "Edital Próprio"
  let role = rawTarget?.target_role || "Concurseiro"

  if (rawTarget?.main_study_source) {
    try {
      if (rawTarget.main_study_source.startsWith("{")) {
        const meta = JSON.parse(rawTarget.main_study_source)
        if (meta.examName) exam_name = meta.examName
        if (meta.role) role = meta.role
        if (meta.banca) editalName = meta.banca
      }
    } catch {
      // ignore
    }
  }

  const userDisciplines = await getUserDisciplines(supabase, userId, rawTarget?.id)

  // Buscar tópicos reais do edital do usuário (se houver target ativo)
  const topicsByDiscipline: Map<string, number> = new Map()
  if (rawTarget?.exam_id) {
    const edital = await getExamEdital(supabase, rawTarget.exam_id)
    if (edital?.disciplines) {
      edital.disciplines.forEach(d => {
        topicsByDiscipline.set(d.id, d.subjects?.length || 0)
      })
    }
  }

  const [questionAttemptsResult, studyHistoryResult] = await Promise.all([
    supabase
      .from("question_attempts")
      .select("id, correct, questions!inner ( discipline_id )")
      .eq("user_id", userId),
    supabase
      .from("study_history")
      .select("id, discipline_id, duration_minutes, completed, metadata")
      .eq("user_id", userId)
  ])

  const attempts = (questionAttemptsResult?.data || []).map((a: {
    id: string
    correct: boolean
    questions?: { discipline_id?: string } | Array<{ discipline_id?: string }>
  }) => ({
    id: a.id,
    correct: a.correct,
    discipline_id: (Array.isArray(a.questions) ? a.questions[0]?.discipline_id : a.questions?.discipline_id) ?? null,
  }))
  const history = studyHistoryResult?.data || []

  const COLOR_PALETTE = [
    "#fef08a", "#e0f2fe", "#f3e8ff", "#ffedd5", "#dbeafe",
    "#dcfce7", "#ede9fe", "#fce7f3", "#e0e7ff", "#d1fae5",
  ]

  let grandTotalMinutes = 0
  let grandTotalQuestions = 0
  let grandTotalCorrect = 0
  let grandTotalTopics = 0
  let grandTotalTopicsStudied = 0

  const disciplineCards = userDisciplines.map((ud, idx) => {
    const discId = ud.discipline_id
    const discName = ud.discipline?.name || "Disciplina"

    const discAttempts = attempts.filter((a) => a.discipline_id === discId)
    let correctCount = discAttempts.filter((a) => a.correct).length
    let totalCount = discAttempts.length

    const discHistory = history.filter((h) => h.discipline_id === discId && h.completed)
    discHistory.forEach((h) => {
      const meta = (h.metadata || {}) as Record<string, unknown>
      if (meta["questions_answered"]) totalCount += Number(meta["questions_answered"])
      if (meta["questions_correct"]) correctCount += Number(meta["questions_correct"])
    })

    const totalMinutes = discHistory.reduce((acc, h) => acc + (Number(h.duration_minutes) || 0), 0)

    grandTotalMinutes += totalMinutes
    grandTotalQuestions += totalCount
    grandTotalCorrect += correctCount

    // Tópicos reais do edital
    const topicsTotal = topicsByDiscipline.get(discId) || 0
    
    // Tópicos estudados baseado no mastery_level (0-100) aplicado ao total
    const mastery = ud.mastery_level ?? 0
    const topicsStudied = topicsTotal > 0 ? Math.round((topicsTotal * mastery) / 100) : 0

    grandTotalTopics += topicsTotal
    grandTotalTopicsStudied += topicsStudied

    return {
      id: ud.id,
      disciplineId: discId,
      name: discName,
      topicsStudied,
      topicsTotal,
      questionsSolved: totalCount,
      accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : null,
      totalMinutes,
      color: COLOR_PALETTE[idx % COLOR_PALETTE.length] || "#2563EB",
      status: ud.status,
      area: ud.discipline?.area || null,
    }
  })

  const totalH = Math.floor(grandTotalMinutes / 60)
  const totalM = grandTotalMinutes % 60
  const studyTimeFormatted = grandTotalMinutes > 0 ? `${totalH}h${totalM.toString().padStart(2, "0")}min` : "0h00min"
  const accuracyPercentage = grandTotalQuestions > 0 ? Math.round((grandTotalCorrect / grandTotalQuestions) * 100) : 0

  return {
    target: {
      id: rawTarget?.id || null,
      name: exam_name,
      editalName: editalName,
      role: role,
      observations: rawTarget?.observations || "Sem informações extras",
    },
    totalStats: {
      studyTimeFormatted,
      totalQuestions: grandTotalQuestions,
      accuracyPercentage,
      disciplinesCount: userDisciplines.length,
      topicsTotal: grandTotalTopics,
      topicsConcluded: grandTotalTopicsStudied,
    },
    disciplines: disciplineCards,
  }
}

