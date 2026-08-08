"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { type Exam } from "@/domain/disciplines/disciplines.types"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function createExamAction(name: string, organizer?: string): Promise<{ success: boolean; data?: Exam; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema em manutenção." }

  if (!name || name.trim().length < 2) {
    return { success: false, error: "Nome do concurso inválido." }
  }

  try {
    const supabase = await createClient()

    // 1. Check permissions (must be logged in)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // 2. Insert into exams
    // RLS in Supabase might require authenticated users to insert, or we might need service role if RLS is strict.
    // Assuming authenticated users can insert into 'exams', or we'd use an RPC. Let's try standard insert.
    // Usually 'slug' is generated automatically by a database trigger or we can omit it if it's nullable.
    const { data, error } = await supabase
      .from("exams")
      .insert({
        name: name.trim(),
        organizer: organizer?.trim() || null,
        active: true,
      })
      .select("*")
      .single()

    if (error) {
      console.error("Error creating exam:", error)
      return { success: false, error: "Não foi possível criar o concurso. Verifique as permissões." }
    }

    return { success: true, data: data as Exam }
  } catch (error) {
    console.error("Server error creating exam:", error)
    return { success: false, error: "Erro interno no servidor." }
  }
}
