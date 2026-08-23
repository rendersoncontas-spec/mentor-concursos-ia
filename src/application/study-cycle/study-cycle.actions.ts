"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/infrastructure/supabase/server"
import type {
  CreateCycleInput,
  CycleItemPriority,
  StudyCycleItemWithDetails,
  StudyCycleWithItems,
} from "@/domain/study-cycle/study-cycle.types"

async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Usuário não autenticado.")
  return { supabase, userId: user.id }
}

export async function getCyclesAction(): Promise<StudyCycleWithItems[]> {
  const { supabase, userId } = await getUser()

  const { data: cycles, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[getCyclesAction] Erro:", error)
    return []
  }

  if (!cycles || cycles.length === 0) return []

  const cycleIds = cycles.map((c) => c.id)

  const { data: items } = await supabase
    .from("study_cycle_items")
    .select("*, discipline:disciplines(id, name, area, color_hex)")
    .in("cycle_id", cycleIds)
    .order("order", { ascending: true })

  const itemsByCycle = new Map<string, StudyCycleItemWithDetails[]>()
  for (const item of items || []) {
    const list = itemsByCycle.get(item.cycle_id) || []
    list.push(item as StudyCycleItemWithDetails)
    itemsByCycle.set(item.cycle_id, list)
  }

  return cycles.map((c) => ({
    ...c,
    items: itemsByCycle.get(c.id) || [],
  }))
}

export async function getCycleByIdAction(cycleId: string): Promise<StudyCycleWithItems | null> {
  const { supabase, userId } = await getUser()

  const { data: cycle, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .single()

  if (error || !cycle) return null

  const { data: items } = await supabase
    .from("study_cycle_items")
    .select("*, discipline:disciplines(id, name, area, color_hex)")
    .eq("cycle_id", cycleId)
    .order("order", { ascending: true })

  return {
    ...cycle,
    items: (items || []) as StudyCycleItemWithDetails[],
  }
}

export async function getActiveCycleAction(): Promise<StudyCycleWithItems | null> {
  const { supabase, userId } = await getUser()

  const { data: cycle, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !cycle) return null

  const { data: items } = await supabase
    .from("study_cycle_items")
    .select("*, discipline:disciplines(id, name, area, color_hex)")
    .eq("cycle_id", cycle.id)
    .order("order", { ascending: true })

  return {
    ...cycle,
    items: (items || []) as StudyCycleItemWithDetails[],
  }
}

export async function createCycleAction(input: CreateCycleInput) {
  const { supabase, userId } = await getUser()

  if (!input.name.trim()) {
    return { success: false, error: "Nome do ciclo é obrigatório." }
  }

  if (!input.items || input.items.length === 0) {
    return { success: false, error: "Selecione pelo menos uma matéria." }
  }

  const { data: cycle, error: cycleError } = await supabase
    .from("study_cycles")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      contest_name: input.contestName || null,
      edital_name: input.editalName || null,
      status: "PAUSED",
      current_item_index: 0,
    })
    .select()
    .single()

  if (cycleError) {
    console.error("[createCycleAction] Erro ao criar ciclo:", cycleError)
    return { success: false, error: "Erro ao criar ciclo." }
  }

  const itemsToInsert = input.items.map((item, index) => ({
    cycle_id: cycle.id,
    discipline_id: item.disciplineId,
    order: index + 1,
    priority: item.priority,
    planned_minutes: item.plannedMinutes,
    completed_minutes: 0,
    status: "PENDENTE" as const,
  }))

  const { error: itemsError } = await supabase.from("study_cycle_items").insert(itemsToInsert)

  if (itemsError) {
    console.error("[createCycleAction] Erro ao criar itens:", itemsError)
    await supabase.from("study_cycles").delete().eq("id", cycle.id)
    return { success: false, error: "Erro ao criar itens do ciclo." }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")

  return { success: true, cycleId: cycle.id }
}

export async function updateCycleAction(
  cycleId: string,
  data: { name?: string; contest_name?: string | null; edital_name?: string | null }
) {
  const { supabase, userId } = await getUser()

  const { error } = await supabase
    .from("study_cycles")
    .update(data)
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) {
    console.error("[updateCycleAction] Erro:", error)
    return { success: false, error: "Erro ao atualizar ciclo." }
  }

  revalidatePath("/ciclos")
  return { success: true }
}

export async function deleteCycleAction(cycleId: string) {
  const { supabase, userId } = await getUser()

  const { error } = await supabase
    .from("study_cycles")
    .delete()
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) {
    console.error("[deleteCycleAction] Erro:", error)
    return { success: false, error: "Erro ao excluir ciclo." }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function activateCycleAction(cycleId: string) {
  const { supabase, userId } = await getUser()

  await supabase
    .from("study_cycles")
    .update({ status: "PAUSED" })
    .eq("user_id", userId)
    .eq("status", "ACTIVE")

  const { error } = await supabase
    .from("study_cycles")
    .update({ status: "ACTIVE" })
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) {
    console.error("[activateCycleAction] Erro:", error)
    return { success: false, error: "Erro ao ativar ciclo." }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function pauseCycleAction(cycleId: string) {
  const { supabase, userId } = await getUser()

  const { error } = await supabase
    .from("study_cycles")
    .update({ status: "PAUSED" })
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) {
    console.error("[pauseCycleAction] Erro:", error)
    return { success: false, error: "Erro ao pausar ciclo." }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function concludeCycleAction(cycleId: string) {
  const { supabase, userId } = await getUser()

  const { error } = await supabase
    .from("study_cycles")
    .update({ status: "CONCLUDED" })
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) {
    console.error("[concludeCycleAction] Erro:", error)
    return { success: false, error: "Erro ao concluir ciclo." }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function advanceCycleItemAction(cycleId: string, studyMinutes: number) {
  const { supabase, userId } = await getUser()

  const { data: cycle, error: cycleError } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .single()

  if (cycleError || !cycle) {
    return { success: false, error: "Ciclo não encontrado." }
  }

  const { data: items } = await supabase
    .from("study_cycle_items")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("order", { ascending: true })

  if (!items || items.length === 0) {
    return { success: false, error: "Ciclo sem matérias." }
  }

  const currentIndex = cycle.current_item_index
  if (currentIndex >= items.length) {
    await supabase
      .from("study_cycles")
      .update({ status: "CONCLUDED", current_item_index: items.length })
      .eq("id", cycleId)
    revalidatePath("/ciclos")
    revalidatePath("/dashboard")
    return { success: true, concluded: true }
  }

  const currentItem = items[currentIndex]
  const newCompletedMinutes = Math.min(
    currentItem.completed_minutes + studyMinutes,
    currentItem.planned_minutes
  )

  const isBlockComplete = newCompletedMinutes >= currentItem.planned_minutes

  await supabase
    .from("study_cycle_items")
    .update({
      completed_minutes: newCompletedMinutes,
      status: isBlockComplete ? "CONCLUIDO" : "EM_ANDAMENTO",
      last_studied_at: new Date().toISOString(),
    })
    .eq("id", currentItem.id)

  let nextIndex = currentIndex
  let blockJustCompleted = false

  if (isBlockComplete) {
    nextIndex = currentIndex + 1
    blockJustCompleted = true

    if (nextIndex < items.length) {
      await supabase
        .from("study_cycle_items")
        .update({ status: "EM_ANDAMENTO" })
        .eq("id", items[nextIndex].id)
    } else {
      await supabase
        .from("study_cycles")
        .update({ status: "CONCLUDED", current_item_index: nextIndex })
        .eq("id", cycleId)
      revalidatePath("/ciclos")
      revalidatePath("/dashboard")
      return { success: true, blockJustCompleted, concluded: true, nextIndex }
    }
  }

  await supabase
    .from("study_cycles")
    .update({ current_item_index: nextIndex })
    .eq("id", cycleId)

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")

  return {
    success: true,
    blockJustCompleted,
    concluded: false,
    nextIndex,
  }
}

export async function registerCycleSessionAction(
  cycleId: string,
  cycleItemId: string,
  studyHistoryId: string
) {
  const { supabase } = await getUser()

  const { error } = await supabase.from("study_cycle_sessions").insert({
    cycle_id: cycleId,
    cycle_item_id: cycleItemId,
    study_history_id: studyHistoryId,
  })

  if (error) {
    console.error("[registerCycleSessionAction] Erro:", error)
  }

  return { success: !error }
}

export async function updateCycleItemMinutesAction(
  cycleItemId: string,
  additionalMinutes: number
) {
  const { supabase, userId } = await getUser()

  const { data: item, error: itemError } = await supabase
    .from("study_cycle_items")
    .select("*, cycle:study_cycles(user_id)")
    .eq("id", cycleItemId)
    .single()

  if (itemError || !item || (item as any).cycle?.user_id !== userId) {
    return { success: false, error: "Item não encontrado." }
  }

  const newCompleted = item.completed_minutes + additionalMinutes

  const { error } = await supabase
    .from("study_cycle_items")
    .update({
      completed_minutes: newCompleted,
      status: newCompleted >= item.planned_minutes ? "CONCLUIDO" : item.status,
      last_studied_at: new Date().toISOString(),
    })
    .eq("id", cycleItemId)

  if (error) {
    return { success: false, error: "Erro ao atualizar item." }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")
  return { success: true, completed: newCompleted >= item.planned_minutes }
}

export async function reorderCycleItemsAction(cycleId: string, orderedItemIds: string[]) {
  const { supabase, userId } = await getUser()

  const { data: cycle } = await supabase
    .from("study_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .single()

  if (!cycle) return { success: false, error: "Ciclo não encontrado." }

  for (let i = 0; i < orderedItemIds.length; i++) {
    await supabase
      .from("study_cycle_items")
      .update({ order: i + 1 })
      .eq("id", orderedItemIds[i])
      .eq("cycle_id", cycleId)
  }

  revalidatePath("/ciclos")
  return { success: true }
}
