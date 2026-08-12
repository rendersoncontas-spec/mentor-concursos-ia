"use server"

import { createClient } from "@/infrastructure/supabase/server"

export interface EditalRequestItem {
  id: string
  editalName: string
  cargo?: string | undefined
  linkUrl?: string | undefined
  pdfName?: string | undefined
  description?: string | undefined
  date: string
  status: "Pendente" | "Em Análise" | "Concluído"
}

export async function listEditalRequestsAction(): Promise<{
  success: boolean
  data?: EditalRequestItem[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data, error } = await supabase
      .from("edital_requests")
      .select("id, edital_name, cargo, link_url, pdf_name, description, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erro ao listar pedidos de edital:", error)
      return { success: false, error: "Erro ao carregar pedidos de edital." }
    }

    const items: EditalRequestItem[] = (data ?? []).map((row) => ({
      id: row["id"] as string,
      editalName: row["edital_name"] as string,
      cargo: (row["cargo"] as string | null) ?? undefined,
      linkUrl: (row["link_url"] as string | null) ?? undefined,
      pdfName: (row["pdf_name"] as string | null) ?? undefined,
      description: (row["description"] as string | null) ?? undefined,
      date: formatDate(row["created_at"] as string),
      status: normalizeStatus(row["status"] as string),
    }))

    return { success: true, data: items }
  } catch (err: unknown) {
    console.error("Erro em listEditalRequestsAction:", err)
    return { success: false, error: "Erro interno ao carregar pedidos." }
  }
}

export async function createEditalRequestAction(input: {
  editalName: string
  cargo?: string | undefined
  linkUrl?: string | undefined
  pdfName?: string | undefined
  description?: string | undefined
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const name = input["editalName"]?.trim() ?? ""
    if (!name) {
      return { success: false, error: "Informe o nome do edital que procura." }
    }

    const { error } = await supabase.from("edital_requests").insert({
      user_id: user.id,
      edital_name: name,
      cargo: input["cargo"]?.trim() || null,
      link_url: input["linkUrl"]?.trim() || null,
      pdf_name: input["pdfName"]?.trim() || null,
      description: input["description"]?.trim() || null,
      status: "Pendente",
    })

    if (error) {
      console.error("Erro ao criar pedido de edital:", error)
      return { success: false, error: "Falha ao enviar o pedido." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Erro em createEditalRequestAction:", err)
    return { success: false, error: "Erro interno ao enviar o pedido." }
  }
}

export async function deleteEditalRequestAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { error } = await supabase
      .from("edital_requests")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Erro ao excluir pedido de edital:", error)
      return { success: false, error: "Falha ao excluir o pedido." }
    }

    return { success: true }
  } catch (err: unknown) {
    console.error("Erro em deleteEditalRequestAction:", err)
    return { success: false, error: "Erro interno ao excluir o pedido." }
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("pt-BR")
}

function normalizeStatus(status: string): EditalRequestItem["status"] {
  if (status === "Em Análise" || status === "Concluído") return status
  return "Pendente"
}
