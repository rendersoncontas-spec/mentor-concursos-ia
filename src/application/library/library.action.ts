"use server"

import { createClient } from "@/infrastructure/supabase/server"

export interface LibraryMaterialItem {
  id: string
  title: string
  disciplineName: string
  type: "PDF" | "Resumo" | "Link" | "Vídeo"
  url: string
  dateAdded: string
}

export async function listLibraryMaterialsAction(): Promise<{
  success: boolean
  data?: LibraryMaterialItem[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data, error } = await supabase
      .from("library_materials")
      .select("id, title, discipline_name, type, url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erro ao listar materiais da biblioteca:", error)
      return { success: false, error: "Erro ao carregar biblioteca." }
    }

    const items: LibraryMaterialItem[] = (data ?? []).map((row) => ({
      id: row["id"] as string,
      title: row["title"] as string,
      disciplineName: (row["discipline_name"] as string | null) ?? "Geral",
      type: normalizeType(row["type"] as string),
      url: (row["url"] as string | null) ?? "",
      dateAdded: formatDate(row["created_at"] as string),
    }))

    return { success: true, data: items }
  } catch (err: unknown) {
    console.error("Erro em listLibraryMaterialsAction:", err)
    return { success: false, error: "Erro interno ao carregar biblioteca." }
  }
}

export async function createLibraryMaterialAction(input: {
  title: string
  disciplineName?: string | undefined
  type: LibraryMaterialItem["type"]
  url?: string | undefined
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const title = input["title"]?.trim() ?? ""
    if (!title) {
      return { success: false, error: "Informe o título do material." }
    }

    const { error } = await supabase.from("library_materials").insert({
      user_id: user.id,
      title,
      discipline_name: input["disciplineName"]?.trim() || null,
      type: input["type"],
      url: input["url"]?.trim() || "",
    })

    if (error) {
      console.error("Erro ao adicionar material na biblioteca:", error)
      return { success: false, error: "Falha ao adicionar material." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Erro em createLibraryMaterialAction:", err)
    return { success: false, error: "Erro interno ao adicionar material." }
  }
}

export async function deleteLibraryMaterialAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { error } = await supabase
      .from("library_materials")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Erro ao excluir material da biblioteca:", error)
      return { success: false, error: "Falha ao excluir material." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Erro em deleteLibraryMaterialAction:", err)
    return { success: false, error: "Erro interno ao excluir material." }
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("pt-BR")
}

function normalizeType(type: string): LibraryMaterialItem["type"] {
  if (type === "PDF" || type === "Resumo" || type === "Link" || type === "Vídeo") return type
  return "PDF"
}
