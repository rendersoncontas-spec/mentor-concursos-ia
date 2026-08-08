"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export interface ConcursoData {
  id: string
  name: string
  role: string
  banca: string
  exam_date: string | null
  exam_time: string | null
  exam_location: string | null
  exam_pdf_url: string | null
  is_active: boolean
  is_archived: boolean
  days_remaining: number | null
  created_at: string
}

export interface CreateConcursoInput {
  name: string
  role?: string | undefined
  banca?: string | undefined
  exam_date?: string | undefined
  exam_time?: string | undefined
  exam_location?: string | undefined
  exam_pdf_url?: string | undefined
}

// Typed meta object — avoids TS4111 index-signature errors
interface ConcursoMeta {
  examName?: string | null | undefined
  role?: string | null | undefined
  banca?: string | null | undefined
  examDate?: string | null | undefined
  examTime?: string | null | undefined
  examLocation?: string | null | undefined
  examPdfUrl?: string | null | undefined
  archived?: boolean | undefined
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function buildMeta(data: Partial<CreateConcursoInput>): string {
  const meta: ConcursoMeta = {
    examName: data.name ?? null,
    banca: data.banca ?? null,
    examDate: data.exam_date ?? null,
    examTime: data.exam_time ?? null,
    examLocation: data.exam_location ?? null,
    examPdfUrl: data.exam_pdf_url ?? null,
    archived: false,
  }
  return JSON.stringify(meta)
}

function parseMeta(raw: string | null): ConcursoMeta {
  if (!raw) return {}
  try {
    if (raw.startsWith("{")) return JSON.parse(raw) as ConcursoMeta
  } catch { /* noop */ }
  return {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ConcursoData {
  const meta = parseMeta(row.main_study_source as string | null)
  const targetExam = (row.target_exam as string) || "Concurso"
  const name = meta.examName || targetExam
  const role = meta.role || (row.target_role as string) || ""
  const banca = meta.banca || ""
  const exam_date = meta.examDate || (row.exam_date as string | null) || null
  const exam_time = meta.examTime || (row.exam_time as string | null) || null
  const exam_location = meta.examLocation || (row.exam_location as string | null) || null
  const exam_pdf_url = meta.examPdfUrl || null
  const is_archived = Boolean(meta.archived)

  let days_remaining: number | null = null
  if (exam_date) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(exam_date + "T00:00:00")
    days_remaining = Math.ceil((target.getTime() - today.getTime()) / 86400000)
  }

  return {
    id: row.id as string,
    name,
    role,
    banca,
    exam_date,
    exam_time,
    exam_location,
    exam_pdf_url,
    is_active: Boolean(row.is_active),
    is_archived,
    days_remaining,
    created_at: row.created_at as string,
  }
}

function revalidateAll() {
  revalidatePath("/dashboard")
  revalidatePath("/edital")
  revalidatePath("/planejamento")
  revalidatePath("/concursos")
  revalidatePath("/disciplines")
  revalidatePath("/dashboard/reviews")
  revalidatePath("/dashboard/analytics")
  revalidatePath("/dashboard/history")
  revalidatePath("/dashboard/questions")
}

// ────────────────────────────────────────────────────────────
// Actions
// ────────────────────────────────────────────────────────────

export async function getConcursosAction(): Promise<{ success: boolean; concursos?: ConcursoData[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    const { data, error } = await supabase
      .from("user_targets")
      .select("*")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) return { success: false, error: "Erro ao buscar concursos." }

    const concursos = (data || []).map(row => mapRow(row))
    return { success: true, concursos }
  } catch (err) {
    console.error("getConcursosAction:", err)
    return { success: false, error: "Erro interno." }
  }
}

export async function createConcursoAction(
  input: CreateConcursoInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    if (!input.name?.trim()) return { success: false, error: "O nome do concurso é obrigatório." }

    // Desativar concurso ativo atual
    await supabase
      .from("user_targets")
      .update({ is_active: false })
      .eq("user_id", user.id)

    const { data, error } = await supabase
      .from("user_targets")
      .insert({
        user_id: user.id,
        target_exam: input.name.trim(),
        target_role: input.role?.trim() ?? null,
        is_active: true,
        main_study_source: buildMeta(input),
      })
      .select()
      .single()

    if (error || !data) {
      console.error("createConcursoAction insert error:", error)
      return { success: false, error: "Erro ao criar concurso." }
    }

    revalidateAll()
    return { success: true, id: data.id as string }
  } catch (err) {
    console.error("createConcursoAction:", err)
    return { success: false, error: "Erro interno ao criar concurso." }
  }
}

export async function updateConcursoAction(
  id: string,
  input: Partial<CreateConcursoInput>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    const { data: existing } = await supabase
      .from("user_targets")
      .select("main_study_source, target_exam, target_role")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!existing) return { success: false, error: "Concurso não encontrado." }

    const currentMeta = parseMeta(existing.main_study_source as string | null)
    const mergedMeta: ConcursoMeta = {
      ...currentMeta,
      examName: input.name?.trim() ?? currentMeta.examName ?? (existing.target_exam as string | null),
      banca: input.banca ?? currentMeta.banca,
      examDate: input.exam_date ?? currentMeta.examDate,
      examTime: input.exam_time ?? currentMeta.examTime,
      examLocation: input.exam_location ?? currentMeta.examLocation,
      examPdfUrl: input.exam_pdf_url ?? currentMeta.examPdfUrl,
      archived: currentMeta.archived ?? false,
    }

    const { error } = await supabase
      .from("user_targets")
      .update({
        target_exam: input.name?.trim() ?? (existing.target_exam as string),
        target_role: input.role?.trim() ?? (existing.target_role as string | null),
        main_study_source: JSON.stringify(mergedMeta),
      })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao atualizar concurso." }

    revalidateAll()
    return { success: true }
  } catch (err) {
    console.error("updateConcursoAction:", err)
    return { success: false, error: "Erro interno." }
  }
}

export async function duplicateConcursoAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    const { data: original } = await supabase
      .from("user_targets")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!original) return { success: false, error: "Concurso não encontrado." }

    const meta = parseMeta(original.main_study_source as string | null)
    const newMeta: ConcursoMeta = {
      ...meta,
      examName: `${meta.examName || (original.target_exam as string)} (Cópia)`,
      archived: false,
    }

    const { error } = await supabase
      .from("user_targets")
      .insert({
        user_id: user.id,
        target_exam: `${original.target_exam as string} (Cópia)`,
        target_role: original.target_role as string | null,
        is_active: false,
        main_study_source: JSON.stringify(newMeta),
      })

    if (error) return { success: false, error: "Erro ao duplicar concurso." }

    revalidatePath("/concursos")
    return { success: true }
  } catch (err) {
    console.error("duplicateConcursoAction:", err)
    return { success: false, error: "Erro interno." }
  }
}

export async function setActiveConcursoAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    // 1. Desativar todos
    await supabase.from("user_targets").update({ is_active: false }).eq("user_id", user.id)

    // 2. Ativar o selecionado + desarquivar
    const { data: existing } = await supabase
      .from("user_targets")
      .select("main_study_source")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    const meta = parseMeta(existing?.main_study_source as string | null)
    const updatedMeta: ConcursoMeta = { ...meta, archived: false }

    const { error } = await supabase
      .from("user_targets")
      .update({ is_active: true, main_study_source: JSON.stringify(updatedMeta) })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao ativar concurso." }

    revalidateAll()
    return { success: true }
  } catch (err) {
    console.error("setActiveConcursoAction:", err)
    return { success: false, error: "Erro interno." }
  }
}

export async function archiveConcursoAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    const { data: existing } = await supabase
      .from("user_targets")
      .select("main_study_source, is_active")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!existing) return { success: false, error: "Concurso não encontrado." }

    const meta = parseMeta(existing.main_study_source as string | null)
    const isCurrentlyArchived = Boolean(meta.archived)
    const updatedMeta: ConcursoMeta = { ...meta, archived: !isCurrentlyArchived }

    const { error } = await supabase
      .from("user_targets")
      .update({ is_active: false, main_study_source: JSON.stringify(updatedMeta) })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao arquivar concurso." }

    revalidatePath("/concursos")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (err) {
    console.error("archiveConcursoAction:", err)
    return { success: false, error: "Erro interno." }
  }
}

export async function deleteConcursoAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { success: false, error: "Não autenticado." }

    const { data: existing } = await supabase
      .from("user_targets")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!existing) return { success: false, error: "Concurso não encontrado." }

    // Excluir planos de estudo e seus itens
    const { data: plans } = await supabase
      .from("study_plans")
      .select("id")
      .eq("user_id", user.id)

    if (plans && plans.length > 0) {
      const planIds = plans.map((p: { id: string }) => p.id)
      
      // Excluir os itens do plano
      await supabase
        .from("study_plan_items")
        .delete()
        .in("study_plan_id", planIds)
        
      // Excluir o histórico de estudo associado
      await supabase
        .from("study_history")
        .delete()
        .eq("user_id", user.id)
        
      // Excluir os planos
      await supabase
        .from("study_plans")
        .delete()
        .in("id", planIds)
    }

    const { error } = await supabase
      .from("user_targets")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("[deleteConcursoAction] Erro no supabase:", error)
      return { success: false, error: "Erro ao excluir concurso: " + error.message }
    }

    revalidateAll()
    return { success: true }
  } catch (err) {
    console.error("deleteConcursoAction:", err)
    return { success: false, error: "Erro interno ao excluir concurso." }
  }
}
