"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { type OnboardingResponse } from "@/domain/onboarding/onboarding.types"
import { onboardingSchema, type OnboardingInput } from "@/domain/onboarding/onboarding.schemas"
import { seedUserDisciplinesFromExam } from "@/application/disciplines/disciplines.service"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function completeOnboardingAction(data: OnboardingInput): Promise<OnboardingResponse> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const validatedData = onboardingSchema.parse(data)
    const supabase = await createClient()

    const { data: userData, error: userError } = await supabase.auth.getUser()
    
    if (userError || !userData.user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const userId = userData.user.id

    // PASSO 1: Atualizar Profile (SEM onboarding_completed ainda)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        weekly_study_hours: validatedData.weeklyStudyHours,
        work_regime: validatedData.workRegime,
        experience_level: validatedData.experienceLevel,
      })
      .eq("id", userId)

    if (profileError) {
      console.error("Profile update error:", profileError)
      return { success: false, error: "Falha ao salvar o perfil." }
    }

    // PASSO 2: Busca o nome do Exam para compatibilidade retroativa
    const { data: examData } = await supabase
      .from("exams")
      .select("name")
      .eq("id", validatedData.examId)
      .single()
      
    const examName = examData?.name || "Concurso Personalizado"

    // PASSO 3: Inserir Target
    const { data: targetData, error: targetError } = await supabase
      .from("user_targets")
      .insert({
        user_id: userId,
        exam_id: validatedData.examId,
        target_exam: examName,
        target_role: validatedData.targetRole,
        main_study_source: validatedData.mainStudySource,
        is_active: true,
      })
      .select()
      .single()

    if (targetError || !targetData) {
      console.error("Target insert error:", targetError)
      return { success: false, error: "Falha ao salvar o objetivo do concurso." }
    }

    // PASSO 4: Seed automático de user_disciplines baseado no edital do concurso escolhido
    const disciplinesSeeded = await seedUserDisciplinesFromExam(supabase, userId, validatedData.examId, targetData.id)

    if (!disciplinesSeeded) {
      console.error("Failed to seed user disciplines — rolling back is not possible via REST. Continuing.")
      // Não bloquear o onboarding por falha nas disciplinas, pois o aluno pode adicionar depois
    }

    // PASSO 5: Inserir Disciplinas manuais do formulário (se houver seleção no wizard)
    if (validatedData.studiedDisciplines.length > 0) {
      const disciplinesToInsert = validatedData.studiedDisciplines.map(d => ({
        user_id: userId,
        target_id: targetData.id,
        discipline_id: d.id,
        proficiency_level: d.proficiencyLevel,
        status: "COMPLETED",
        mastery_level: 100,
      }))

      const { error: disciplinesError } = await supabase
        .from("user_disciplines")
        .upsert(disciplinesToInsert, {
          onConflict: "user_id,target_id,discipline_id",
          ignoreDuplicates: false,
        })

      if (disciplinesError) {
        console.error("Disciplines insert error:", disciplinesError)
      }
    }

    // PASSO 6 (FINAL): Marcar onboarding como concluído — apenas após todos os passos
    const { error: completionError } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId)

    if (completionError) {
      console.error("Onboarding completion error:", completionError)
      return { success: false, error: "Falha ao finalizar o onboarding." }
    }

    revalidatePath("/dashboard")
    return { success: true }
  } catch (err: unknown) {
    console.error("Onboarding action error:", err)
    return { success: false, error: "Erro interno no servidor ao completar o onboarding." }
  }
}
