"use server"

import { resolveTargetFields } from "@/application/dashboard/active-target"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { loadCycleOverviewById } from "@/application/study-cycle/cycle-overview.reader"
import { getStatisticsCenterAction } from "@/application/study-analytics/statistics-center.action"
import type { MentorSectionStatus, StudentMentorContext } from "@/domain/mentor/student-mentor-context"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

import { buildStudentMentorContext, type MentorContextInput } from "./student-context.builder"

/**
 * G2.15 — contexto estruturado do aluno para o Mentor (somente leitura).
 *
 * Segurança: nenhum parâmetro vem do cliente — o aluno é resolvido no servidor
 * (`getEffectiveUserId`, a mesma regra de todas as telas, inclusive o modo
 * suporte auditado) e todas as leituras filtram por esse id (RLS por cima).
 * Nada aqui escreve no banco.
 *
 * Consultas (sem N+1, sem consulta por disciplina):
 *   1. payload da Central de Estatísticas (getStatisticsCenterAction): sessões,
 *      questões, vínculos/edital, revisões ativas, plano, início da semana,
 *      simulados e identidade canônica — com o cache e as invalidações dela;
 *   2. ciclo ativo (1 linha) → leitor do ciclo (itens, sessões, pulos);
 *   3. metas do perfil (1 linha);
 *   4. concurso-alvo ativo (1 linha).
 * 2–4 em paralelo.
 */
export async function getStudentMentorContextAction(): Promise<{
  data: StudentMentorContext | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const userId = await getEffectiveUserId(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    const [statsResult, cycle, profileGoals, target] = await Promise.all([
      getStatisticsCenterAction(),
      loadCycle(supabase, userId),
      loadProfileGoals(supabase, userId),
      loadTarget(supabase, userId),
    ])
    if (statsResult.error || !statsResult.data) {
      return { data: null, error: statsResult.error ?? "Não foi possível carregar seus dados de estudo." }
    }

    const context = buildStudentMentorContext({
      now: new Date(),
      stats: statsResult.data,
      cycle,
      profileGoals,
      target,
      sources: [
        `statistics_center_payload${statsResult.cached ? " (cache ≤ 5 min)" : ""}`,
        "study_cycles + study_cycle_items + study_cycle_sessions + study_cycle_item_skips",
        "profiles (metas semanais)",
        "user_targets (alvo ativo)",
      ],
    })
    return { data: context, error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao montar o contexto do Mentor." }
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

async function loadCycle(supabase: Supabase, userId: string): Promise<MentorContextInput["cycle"]> {
  try {
    // Erro ≠ ausência: a existência do ciclo ativo é conferida aqui; o estado
    // (volta, cursor, progresso) sai do leitor oficial do ciclo, sem cálculo novo.
    const { data, error } = await supabase
      .from("study_cycles")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { status: "UNAVAILABLE", overview: null }
    if (!data) return { status: "NO_DATA", overview: null }
    const overview = await loadCycleOverviewById(supabase, userId, data.id as string)
    return overview ? { status: "OK", overview } : { status: "UNAVAILABLE", overview: null }
  } catch {
    return { status: "UNAVAILABLE", overview: null }
  }
}

async function loadProfileGoals(supabase: Supabase, userId: string): Promise<MentorContextInput["profileGoals"]> {
  const empty = { weeklyStudyHours: null, weeklyQuestionsGoal: null, weeklyStudyDaysGoal: null }
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("weekly_study_hours, weekly_questions_goal, weekly_study_days_goal")
      .eq("id", userId)
      .maybeSingle()
    if (error) return { status: "UNAVAILABLE", ...empty }
    if (!data) return { status: "NO_DATA", ...empty }
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
    return {
      status: "OK" as MentorSectionStatus,
      weeklyStudyHours: num(data.weekly_study_hours),
      weeklyQuestionsGoal: num(data.weekly_questions_goal),
      weeklyStudyDaysGoal: num(data.weekly_study_days_goal),
    }
  } catch {
    return { status: "UNAVAILABLE", ...empty }
  }
}

async function loadTarget(supabase: Supabase, userId: string): Promise<MentorContextInput["target"]> {
  try {
    const { data, error } = await supabase
      .from("user_targets")
      // user_targets NÃO tem colunas exam_name/exam_date (conferido no banco): data e
      // nome do exame moram no JSON de main_study_source.
      .select("target_exam, main_study_source")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    if (error) return { status: "UNAVAILABLE", examName: null, examDate: null }
    if (!data) return { status: "NO_DATA", examName: null, examDate: null }
    const resolved = resolveTargetFields(data)
    const targetExam = typeof data.target_exam === "string" && data.target_exam.trim() ? data.target_exam.trim() : null
    return { status: "OK", examName: resolved.examName ?? targetExam, examDate: resolved.examDate }
  } catch {
    return { status: "UNAVAILABLE", examName: null, examDate: null }
  }
}
