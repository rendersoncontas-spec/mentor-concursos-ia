"use server"

import { createClient } from "@/infrastructure/supabase/server"

export interface UserNote {
  id: string
  user_id?: string
  title: string
  content: string
  discipline_name?: string | null
  tags?: string[]
  color?: string
  is_pinned?: boolean
  created_at?: string
  updated_at?: string
}

export async function getUserNotesAction(): Promise<{
  success: boolean
  data?: UserNote[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // 1. Tentar carregar da tabela dedicada user_notes
    const { data: notes, error: dbError } = await supabase
      .from("user_notes")
      .select("*")
      .eq("user_id", user.id)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })

    if (!dbError && Array.isArray(notes)) {
      return {
        success: true,
        data: notes.map((n) => ({
          id: n.id,
          user_id: n.user_id,
          title: n.title || "",
          content: n.content || "",
          discipline_name: n.discipline_name || null,
          tags: Array.isArray(n.tags) ? n.tags : [],
          color: n.color || "yellow",
          is_pinned: Boolean(n.is_pinned),
          created_at: n.created_at,
          updated_at: n.updated_at,
        })),
      }
    }

    // 2. Fallback resiliente: carregar de profiles.preferences.quick_notes
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .maybeSingle()

    const prefs = (profile?.preferences as Record<string, unknown>) || {}
    const fallbackNotes = Array.isArray(prefs["quick_notes"])
      ? (prefs["quick_notes"] as UserNote[])
      : []

    return {
      success: true,
      data: fallbackNotes.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
      }),
    }
  } catch (err: unknown) {
    console.error("Erro em getUserNotesAction:", err)
    return { success: false, error: "Erro ao listar anotações." }
  }
}

export async function saveUserNoteAction(
  noteInput: Partial<UserNote> & { id?: string }
): Promise<{
  success: boolean
  data?: UserNote
  error?: string
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const noteId = noteInput.id || crypto.randomUUID()
    const now = new Date().toISOString()

    const notePayload = {
      id: noteId,
      user_id: user.id,
      title: (noteInput.title ?? "").trim(),
      content: noteInput.content ?? "",
      discipline_name: noteInput.discipline_name || null,
      tags: Array.isArray(noteInput.tags) ? noteInput.tags : [],
      color: noteInput.color || "yellow",
      is_pinned: Boolean(noteInput.is_pinned),
      updated_at: now,
    }

    // 1. Tentar salvar na tabela user_notes
    const { data: savedDb, error: dbError } = await supabase
      .from("user_notes")
      .upsert(notePayload, { onConflict: "id" })
      .select()
      .maybeSingle()

    if (!dbError && savedDb) {
      return {
        success: true,
        data: {
          id: savedDb.id,
          user_id: savedDb.user_id,
          title: savedDb.title || "",
          content: savedDb.content || "",
          discipline_name: savedDb.discipline_name || null,
          tags: Array.isArray(savedDb.tags) ? savedDb.tags : [],
          color: savedDb.color || "yellow",
          is_pinned: Boolean(savedDb.is_pinned),
          created_at: savedDb.created_at,
          updated_at: savedDb.updated_at,
        },
      }
    }

    // 2. Fallback resiliente: salvar em profiles.preferences.quick_notes
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .maybeSingle()

    const prefs = (profile?.preferences as Record<string, unknown>) || {}
    const existingNotes: UserNote[] = Array.isArray(prefs["quick_notes"])
      ? (prefs["quick_notes"] as UserNote[])
      : []

    const noteToSave: UserNote = {
      id: noteId,
      user_id: user.id,
      title: notePayload.title,
      content: notePayload.content,
      discipline_name: notePayload.discipline_name,
      tags: notePayload.tags,
      color: notePayload.color,
      is_pinned: notePayload.is_pinned,
      created_at: noteInput.created_at || now,
      updated_at: now,
    }

    const filtered = existingNotes.filter((n) => n.id !== noteId)
    const updatedNotes = [noteToSave, ...filtered]

    await supabase
      .from("profiles")
      .update({
        preferences: {
          ...prefs,
          quick_notes: updatedNotes,
        },
      })
      .eq("id", user.id)

    return { success: true, data: noteToSave }
  } catch (err: unknown) {
    console.error("Erro em saveUserNoteAction:", err)
    return { success: false, error: "Erro ao salvar anotação." }
  }
}

export async function deleteUserNoteAction(
  noteId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // 1. Tentar excluir de user_notes
    const { error: dbError } = await supabase
      .from("user_notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", user.id)

    // 2. Também limpar em profiles.preferences.quick_notes se existir lá
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", user.id)
      .maybeSingle()

    const prefs = (profile?.preferences as Record<string, unknown>) || {}
    if (Array.isArray(prefs["quick_notes"])) {
      const remaining = (prefs["quick_notes"] as UserNote[]).filter((n) => n.id !== noteId)
      await supabase
        .from("profiles")
        .update({
          preferences: {
            ...prefs,
            quick_notes: remaining,
          },
        })
        .eq("id", user.id)
    }

    if (dbError) {
      console.warn("Aviso ao deletar de user_notes (fallback aplicado):", dbError)
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Erro em deleteUserNoteAction:", err)
    return { success: false, error: "Erro ao excluir anotação." }
  }
}
