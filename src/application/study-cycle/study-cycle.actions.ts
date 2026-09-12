"use server"

import { revalidatePath } from "next/cache"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import {
  buildCycleOverview,
  calculateCycleAdvance,
  calculateCycleSkip,
} from "@/application/study-cycle/cycle-progress.service"
import type {
  CreateCycleInput,
  CycleItemDifficulty,
  CycleItemPriority,
  CycleOverview,
  StudyCycle,
  StudyCycleItemWithDetails,
  StudyCycleSession,
  UpdateCycleInput,
} from "@/domain/study-cycle/study-cycle.types"
import { createClient } from "@/infrastructure/supabase/server"
import { reconcileCycleProgress, registerStudyToCycle } from "./cycle-study-registration.service"

async function getUser() {
  const supabase = await createClient()
  const effectiveUserId = await getEffectiveUserId(supabase)
  if (!effectiveUserId) throw new Error("Usuário não autenticado.")
  return { supabase, userId: effectiveUserId }
}

function mapDifficultyToPriority(difficulty?: CycleItemDifficulty | string): CycleItemPriority {
  if (difficulty === "FACIL") return "BAIXA"
  if (difficulty === "DIFICIL") return "ALTA"
  return "MEDIA"
}

/**
 * Busca todos os ciclos do usuário com seus itens e dados computados.
 * Retorna ciclos E eventuais erros da reconciliação (para exibir na UI).
 */
export async function getCyclesAction(): Promise<{ data: CycleOverview[]; reconcileErrors: string[] }> {
  const reconcileErrors: string[] = []
  try {
    const { supabase, userId } = await getUser()

    // Auto-reconciliação para garantir que todo estudo do histórico elegível esteja no ciclo
    const reconcileResult = await reconcileCycleProgress().catch((err) => {
      console.error("[getCyclesAction] Reconcile error:", err)
      return { success: false, processed: 0, errors: [String(err)] }
    })
    if (reconcileResult.errors.length > 0) {
      reconcileErrors.push(...reconcileResult.errors)
    }

    const { data: cycles, error } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "ARCHIVED")
      .order("created_at", { ascending: false })

    if (error || !cycles || cycles.length === 0) {
      return { data: [], reconcileErrors }
    }

    const cycleIds = cycles.map((c) => c.id)

    const { data: items } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name, area, color_hex)")
      .in("cycle_id", cycleIds)
      .order("order", { ascending: true })

    const { data: sessions } = await supabase
      .from("study_cycle_sessions")
      .select("*")
      .in("cycle_id", cycleIds)

    const itemsByCycle = new Map<string, StudyCycleItemWithDetails[]>()
    for (const item of items || []) {
      const list = itemsByCycle.get(item.cycle_id) || []
      list.push(item as StudyCycleItemWithDetails)
      itemsByCycle.set(item.cycle_id, list)
    }

    const sessionsByCycle = new Map<string, StudyCycleSession[]>()
    for (const s of sessions || []) {
      const list = sessionsByCycle.get(s.cycle_id) || []
      list.push(s as StudyCycleSession)
      sessionsByCycle.set(s.cycle_id, list)
    }

    const data = cycles.map((cycle) => {
      const cycleItems = itemsByCycle.get(cycle.id) || []
      const cycleSessions = sessionsByCycle.get(cycle.id) || []
      return buildCycleOverview(cycle as StudyCycle, cycleItems, cycleSessions)
    })

    return { data, reconcileErrors }
  } catch (err) {
    console.error("[getCyclesAction] Erro:", err)
    return { data: [], reconcileErrors }
  }
}

/**
 * Busca a visão detalhada do ciclo atualmente ativo.
 */
export async function getActiveCycleAction(): Promise<CycleOverview | null> {
  try {
    const { supabase, userId } = await getUser()

    // Auto-reconciliação para garantir que todo estudo do histórico elegível esteja no ciclo
    await reconcileCycleProgress().catch((err) => console.error("[getActiveCycleAction] Reconcile error:", err))

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

    const { data: sessions } = await supabase
      .from("study_cycle_sessions")
      .select("*")
      .eq("cycle_id", cycle.id)

    return buildCycleOverview(
      cycle as StudyCycle,
      (items || []) as StudyCycleItemWithDetails[],
      (sessions || []) as StudyCycleSession[]
    )
  } catch (err) {
    console.error("[getActiveCycleAction] Erro:", err)
    return null
  }
}

/**
 * Busca a visão detalhada de um ciclo específico por ID.
 */
export async function getCycleByIdAction(cycleId: string): Promise<CycleOverview | null> {
  try {
    const { supabase, userId } = await getUser()

    const { data: cycle, error } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("id", cycleId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !cycle) return null

    const { data: items } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name, area, color_hex)")
      .eq("cycle_id", cycle.id)
      .order("order", { ascending: true })

    const { data: sessions } = await supabase
      .from("study_cycle_sessions")
      .select("*")
      .eq("cycle_id", cycle.id)

    return buildCycleOverview(
      cycle as StudyCycle,
      (items || []) as StudyCycleItemWithDetails[],
      (sessions || []) as StudyCycleSession[]
    )
  } catch (err) {
    console.error("[getCycleByIdAction] Erro:", err)
    return null
  }
}

/**
 * Cria um novo ciclo de estudo rotativo com resolução automática de disciplinas.
 */
export async function createCycleAction(input: CreateCycleInput) {
  try {
    const { supabase, userId } = await getUser()

    if (!input.name || !input.name.trim()) {
      return { success: false, error: "Nome do ciclo é obrigatório." }
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, error: "Selecione pelo menos uma matéria para o ciclo." }
    }

    // 1. Resolver todas as disciplinas (garantir ID válido em `disciplines`)
    const resolvedItems: {
      disciplineId: string
      order: number
      priority: CycleItemPriority
      difficulty: CycleItemDifficulty
      plannedMinutes: number
    }[] = []

    for (let index = 0; index < input.items.length; index++) {
      const item = input.items[index]
      if (!item) continue

      let finalDisciplineId = item.disciplineId

      // Se não tem disciplineId ou se o ID não for válido no banco, busca/cria por nome
      if (!finalDisciplineId && item.disciplineName) {
        const discName = item.disciplineName.trim()
        const { data: existingDisc } = await supabase
          .from("disciplines")
          .select("id")
          .ilike("name", discName)
          .maybeSingle()

        if (existingDisc) {
          finalDisciplineId = existingDisc.id
        } else {
          const color = await pickNextDisciplineColor(supabase)
          const { data: newDisc, error: discErr } = await supabase
            .from("disciplines")
            .insert({
              name: discName,
              area: "Geral",
              ...(color ? { color_hex: color } : {}),
            })
            .select("id")
            .single()

          if (discErr || !newDisc) {
            console.error("[createCycleAction] Erro ao criar disciplina:", discErr)
            return { success: false, error: `Erro ao cadastrar disciplina "${discName}".` }
          }
          finalDisciplineId = newDisc.id
        }
      } else if (finalDisciplineId) {
        // Valida se o ID existe
        const { data: checkDisc } = await supabase
          .from("disciplines")
          .select("id")
          .eq("id", finalDisciplineId)
          .maybeSingle()

        if (!checkDisc && item.disciplineName) {
          const color = await pickNextDisciplineColor(supabase)
          const { data: newDisc } = await supabase
            .from("disciplines")
            .insert({
              name: item.disciplineName.trim(),
              area: "Geral",
              ...(color ? { color_hex: color } : {}),
            })
            .select("id")
            .single()
          if (newDisc) finalDisciplineId = newDisc.id
        }
      }

      if (!finalDisciplineId) {
        return {
          success: false,
          error: `Não foi possível identificar a disciplina na posição #${index + 1}.`,
        }
      }

      const diff: CycleItemDifficulty = item.difficulty || "MEDIA"
      const prio: CycleItemPriority = item.priority || mapDifficultyToPriority(diff)

      resolvedItems.push({
        disciplineId: finalDisciplineId,
        order: index + 1,
        priority: prio,
        difficulty: diff,
        plannedMinutes: Math.max(15, item.plannedMinutes || 60),
      })
    }

    // 2. Verificar se já existe algum ciclo ativo; se não existir, este nasce ativo
    const { data: activeCycles } = await supabase
      .from("study_cycles")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .limit(1)

    const initialStatus = activeCycles && activeCycles.length > 0 ? "PAUSED" : "ACTIVE"

    // 3. Inserir study_cycles com fallback defensivo para schemas anteriores
    let cycleId: string | null = null

    // Tentativa 1: com campos V2 completos
    const { data: cycleV2, error: cycleV2Err } = await supabase
      .from("study_cycles")
      .insert({
        user_id: userId,
        name: input.name.trim(),
        contest_name: input.contestName?.trim() || null,
        edital_name: input.editalName?.trim() || null,
        status: initialStatus,
        current_item_index: 0,
        current_round: 1,
        total_rounds_done: 0,
        current_item_progress_min: 0,
      })
      .select("id")
      .single()

    if (cycleV2?.id) {
      cycleId = cycleV2.id
    } else {
      // Tentativa 2: fallback sem campos V2 se coluna não existir
      console.warn("[createCycleAction] Fallback para inserção básica de study_cycles:", cycleV2Err?.message)
      const { data: cycleBasic, error: cycleBasicErr } = await supabase
        .from("study_cycles")
        .insert({
          user_id: userId,
          name: input.name.trim(),
          contest_name: input.contestName?.trim() || null,
          edital_name: input.editalName?.trim() || null,
          status: initialStatus,
          current_item_index: 0,
        })
        .select("id")
        .single()

      if (cycleBasicErr || !cycleBasic) {
        console.error("[createCycleAction] Erro fatal ao criar ciclo:", cycleBasicErr || cycleV2Err)
        return {
          success: false,
          error: `Erro ao salvar ciclo de estudos: ${cycleBasicErr?.message || cycleV2Err?.message || "falha na tabela study_cycles."}`,
        }
      }
      cycleId = cycleBasic.id
    }

    // 4. Inserir study_cycle_items com fallback defensivo
    const itemsV2 = resolvedItems.map((item) => ({
      cycle_id: cycleId,
      discipline_id: item.disciplineId,
      order: item.order,
      priority: item.priority,
      difficulty: item.difficulty,
      planned_minutes: item.plannedMinutes,
      completed_minutes: 0,
      status: "PENDENTE",
    }))

    const { error: itemsV2Err } = await supabase.from("study_cycle_items").insert(itemsV2)

    if (itemsV2Err) {
      console.warn("[createCycleAction] Tentando fallback para study_cycle_items sem difficulty:", itemsV2Err.message)
      const itemsBasic = resolvedItems.map((item) => ({
        cycle_id: cycleId,
        discipline_id: item.disciplineId,
        order: item.order,
        priority: item.priority,
        planned_minutes: item.plannedMinutes,
        completed_minutes: 0,
        status: "PENDENTE",
      }))

      const { error: itemsBasicErr } = await supabase.from("study_cycle_items").insert(itemsBasic)

      if (itemsBasicErr) {
        console.error("[createCycleAction] Erro fatal ao criar matérias:", itemsBasicErr)
        await supabase.from("study_cycles").delete().eq("id", cycleId)
        return {
          success: false,
          error: `Erro ao adicionar matérias ao ciclo: ${itemsBasicErr.message}`,
        }
      }
    }

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")
    return { success: true, cycleId }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao criar ciclo."
    console.error("[createCycleAction] Exceção:", err)
    return { success: false, error: message }
  }
}

/**
 * Ativa um ciclo de estudos e pausa os outros.
 */
export async function activateCycleAction(cycleId: string) {
  try {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao ativar ciclo."
    return { success: false, error: message }
  }
}

/**
 * Pausa um ciclo de estudos sem perder o progresso ou posição.
 */
export async function pauseCycleAction(cycleId: string) {
  try {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao pausar ciclo."
    return { success: false, error: message }
  }
}

/**
 * Exclui um ciclo de estudos e seus itens.
 */
export async function deleteCycleAction(cycleId: string) {
  try {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao excluir ciclo."
    return { success: false, error: message }
  }
}

/**
 * Atualiza metadados do ciclo (nome, concurso, edital).
 */
export async function updateCycleAction(
  cycleId: string,
  data: { name?: string; contest_name?: string | null; edital_name?: string | null }
) {
  try {
    const { supabase, userId } = await getUser()

    const { error } = await supabase
      .from("study_cycles")
      .update(data)
      .eq("id", cycleId)
      .eq("user_id", userId)

    if (error) {
      return { success: false, error: "Erro ao atualizar ciclo." }
    }

    revalidatePath("/ciclos")
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar ciclo."
    return { success: false, error: message }
  }
}

/**
 * Reordena as matérias dentro de um ciclo.
 */
export async function reorderCycleItemsAction(cycleId: string, orderedItemIds: string[]) {
  try {
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao reordenar matérias."
    return { success: false, error: message }
  }
}

/**
 * Registra o estudo no ciclo rotativo contínuo.
 * ATUALIZAÇÃO: Agora usa a lógica unificada que permite qualquer origem de estudo contribuir para o ciclo.
 * Se cycleId não for fornecido, usa o ciclo ativo.
 */
export async function registerCycleStudyProgressAction(input: {
  cycleId?: string
  cycleItemId?: string | null
  studyHistoryId: string
  durationMinutes: number
  disciplineId: string
  studySource?: string
}) {
  try {
    const { supabase, userId } = await getUser()
    const { cycleId, studyHistoryId, durationMinutes, disciplineId, studySource } = input

    if (durationMinutes <= 0) {
      return { success: false, error: "Parâmetros inválidos." }
    }

    // Se cycleId não fornecido, buscar ciclo ativo
    let targetCycleId = cycleId
    if (!targetCycleId) {
      const { data: activeCycle } = await supabase
        .from("study_cycles")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      targetCycleId = activeCycle?.id
    }

    if (!targetCycleId) {
      return { success: false, error: "Nenhum ciclo ativo encontrado." }
    }

    // Usar a nova lógica unificada
    const result = await registerStudyToCycle({
      studyHistoryId,
      disciplineId,
      durationMinutes,
      studySource: studySource || "CYCLE",
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")

    return {
      success: true,
      alreadyProcessed: result.alreadyProcessed,
      cycleUpdated: result.cycleUpdated,
      advanceResult: result.advanceResult,
    }
  } catch (err) {
    console.error("[registerCycleStudyProgressAction] Erro inesperado:", err)
    return { success: false, error: "Erro ao atualizar progresso do ciclo." }
  }
}

/**
 * Pula manualmente a matéria atual do ciclo.
 * Regras:
 * - Preserva os minutos parciais acumulados (NÃO zera nem apaga o tempo).
 * - NÃO transforma a matéria em 100% concluída.
 * - Registra em study_cycle_sessions como pulada nesta volta.
 * - Avança o cursor para a próxima disciplina (ou faz o looping se era a última).
 */
export async function skipCycleCurrentItemAction(cycleId: string) {
  try {
    const { supabase, userId } = await getUser()

    const { data: cycle } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("id", cycleId)
      .eq("user_id", userId)
      .single()

    if (!cycle) return { success: false, error: "Ciclo não encontrado." }

    const { data: items } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name, area, color_hex)")
      .eq("cycle_id", cycleId)
      .order("order", { ascending: true })

    if (!items || items.length === 0) return { success: false, error: "Ciclo sem matérias." }

    const typedCycle = cycle as StudyCycle
    const typedItems = items as StudyCycleItemWithDetails[]

    const skipResult = calculateCycleSkip(typedCycle, typedItems)

    // Registrar o pulo em study_cycle_sessions com o tempo que foi cumprido
    if (skipResult.skippedItemId) {
      try {
        await supabase.from("study_cycle_sessions").insert({
          cycle_id: cycleId,
          cycle_item_id: skipResult.skippedItemId,
          round_number: typedCycle.current_round || 1,
          minutes_contributed: skipResult.partialMinutesPreserved,
          extra_minutes: 0,
        })
      } catch {
        // Fallback silencioso
      }
    }

    const { error: updateErr } = await supabase
      .from("study_cycles")
      .update({
        current_item_index: skipResult.newCurrentItemIndex,
        current_round: skipResult.newCurrentRound,
        total_rounds_done: skipResult.newTotalRoundsDone,
        current_item_progress_min: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycleId)
      .eq("user_id", userId)

    if (updateErr) {
      await supabase
        .from("study_cycles")
        .update({
          current_item_index: skipResult.newCurrentItemIndex,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cycleId)
        .eq("user_id", userId)
    }

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao pular matéria."
    return { success: false, error: message }
  }
}

/**
 * Edita integralmente um ciclo de estudos existente com proteção ao histórico.
 * Permite renomear, reorganizar a fila, alterar metas de tempo e dificuldades.
 */
export async function updateFullCycleAction(input: UpdateCycleInput) {
  try {
    const { supabase, userId } = await getUser()

    if (!input.name || !input.name.trim()) {
      return { success: false, error: "Nome do ciclo é obrigatório." }
    }

    if (!input.items || input.items.length === 0) {
      return { success: false, error: "O ciclo deve conter pelo menos uma matéria." }
    }

    // 1. Atualizar metadados do ciclo
    const { error: cycleErr } = await supabase
      .from("study_cycles")
      .update({
        name: input.name.trim(),
        contest_name: input.contestName?.trim() || null,
        edital_name: input.editalName?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", userId)

    if (cycleErr) {
      return { success: false, error: "Erro ao atualizar metadados do ciclo." }
    }

    // 2. Resolver itens existentes
    const { data: currentItems } = await supabase
      .from("study_cycle_items")
      .select("id, discipline_id")
      .eq("cycle_id", input.id)

    const existingItemIds = new Set((currentItems || []).map((i) => i.id))
    const incomingItemIds = new Set(input.items.filter((i) => i.id).map((i) => i.id as string))

    // Remover itens retirados pelo usuário
    const toDeleteIds = Array.from(existingItemIds).filter((id) => !incomingItemIds.has(id))
    if (toDeleteIds.length > 0) {
      await supabase.from("study_cycle_items").delete().in("id", toDeleteIds)
    }

    // Atualizar ou inserir novos itens
    for (let index = 0; index < input.items.length; index++) {
      const item = input.items[index]
      if (!item) continue

      let finalDisciplineId = item.disciplineId

      // Criar/identificar disciplina se necessário
      if (!finalDisciplineId && item.disciplineName) {
        const discName = item.disciplineName.trim()
        const { data: existingDisc } = await supabase
          .from("disciplines")
          .select("id")
          .ilike("name", discName)
          .maybeSingle()

        if (existingDisc) {
          finalDisciplineId = existingDisc.id
        } else {
          const color = await pickNextDisciplineColor(supabase)
          const { data: newDisc } = await supabase
            .from("disciplines")
            .insert({
              name: discName,
              area: "Geral",
              ...(color ? { color_hex: color } : {}),
            })
            .select("id")
            .single()
          if (newDisc) finalDisciplineId = newDisc.id
        }
      }

      if (!finalDisciplineId) continue

      const diff: CycleItemDifficulty = item.difficulty || "MEDIA"
      const prio: CycleItemPriority = item.priority || mapDifficultyToPriority(diff)
      const plannedMinutes = Math.max(15, item.plannedMinutes || 60)

      if (item.id && existingItemIds.has(item.id)) {
        await supabase
          .from("study_cycle_items")
          .update({
            discipline_id: finalDisciplineId,
            order: index + 1,
            priority: prio,
            difficulty: diff,
            planned_minutes: plannedMinutes,
          })
          .eq("id", item.id)
      } else {
        await supabase.from("study_cycle_items").insert({
          cycle_id: input.id,
          discipline_id: finalDisciplineId,
          order: index + 1,
          priority: prio,
          difficulty: diff,
          planned_minutes: plannedMinutes,
          completed_minutes: 0,
          status: "PENDENTE",
        })
      }
    }

    // 3. Ajuste de segurança do índice atual se a quantidade de matérias mudou
    const { data: remainingItems } = await supabase
      .from("study_cycle_items")
      .select("id")
      .eq("cycle_id", input.id)
      .order("order", { ascending: true })

    const totalCount = (remainingItems || []).length
    if (totalCount > 0) {
      const { data: cycleData } = await supabase
        .from("study_cycles")
        .select("current_item_index")
        .eq("id", input.id)
        .single()

      if (cycleData && cycleData.current_item_index >= totalCount) {
        await supabase
          .from("study_cycles")
          .update({
            current_item_index: Math.max(0, totalCount - 1),
            current_item_progress_min: 0,
          })
          .eq("id", input.id)
      }
    }

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar ciclo."
    console.error("[updateFullCycleAction] Erro:", err)
    return { success: false, error: message }
  }
}

/**
 * Reconcilia o progresso do ciclo com o histórico existente.
 * Executa rebuild completo uma única vez — a reconstrução é determinística.
 */
export async function reconcileCycleProgressAction(): Promise<{
  success: boolean
  processed: number
  errors: string[]
}> {
  try {
    const result = await reconcileCycleProgress()
    revalidatePath("/ciclos")
    revalidatePath("/dashboard")
    return result
  } catch (err) {
    console.error("[reconcileCycleProgressAction] Erro:", err)
    return { success: false, processed: 0, errors: ["Erro inesperado na reconciliação."] }
  }
}

/**
 * Debug: retorna detalhes do ciclo ativo, itens e estudos candidatos
 * para diagnosticar por que estudos não estão contando.
 */
export async function debugCycleProgressAction(): Promise<{
  success: boolean
  data?: {
    cycle: any
    items: any[]
    candidateStudies: any[]
    cycleCreatedAt: string
    itemDetails: { id: string; disciplineId: string; name: string; createdAt: string }[]
  }
  error?: string
}> {
  try {
    const { supabase, userId } = await getUser()

    // Buscar ciclo ativo
    const { data: cycle, error: cycleErr } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cycleErr || !cycle) {
      return { success: false, error: "Nenhum ciclo ativo encontrado." }
    }

    // Buscar itens do ciclo
    const { data: items, error: itemsErr } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name)")
      .eq("cycle_id", cycle.id)
      .order("order", { ascending: true })

    if (itemsErr || !items || items.length === 0) {
      return { success: false, error: "Ciclo sem matérias." }
    }

    const cycleDisciplineIds = items.map((i) => i.discipline_id)

    // Buscar TODOS os estudos dessas disciplinas (incluindo já processados)
    const { data: allStudies, error: studiesErr } = await supabase
      .from("study_history")
      .select("id, discipline_id, duration_minutes, study_source, started_at, created_at")
      .eq("user_id", userId)
      .not("duration_minutes", "is", null)
      .gt("duration_minutes", 0)
      .in("discipline_id", cycleDisciplineIds)
      .order("started_at", { ascending: true })

    // Buscar quais já estão no ciclo
    const { data: existingSessions } = await supabase
      .from("study_cycle_sessions")
      .select("study_history_id")
      .eq("cycle_id", cycle.id)

    const existingIds = new Set((existingSessions || []).map((s) => s.study_history_id))

    // Separar por status
    const candidateStudies = (allStudies || []).map((s) => {
      const item = items.find((i) => i.discipline_id === s.discipline_id)
      const studyDate = new Date(s.started_at)
      const cycleDate = new Date(cycle.created_at)
      const itemDate = item ? new Date(item.created_at) : null

      const validCycle = studyDate >= cycleDate
      const validItem = itemDate ? studyDate >= itemDate : false
      const alreadyProcessed = existingIds.has(s.id)

      return {
        studyHistoryId: s.id,
        disciplineId: s.discipline_id,
        disciplineName: item?.discipline?.name || "N/A",
        durationMinutes: s.duration_minutes,
        studySource: s.study_source,
        startedAt: s.started_at,
        cycleCreatedAt: cycle.created_at,
        itemCreatedAt: item?.created_at || null,
        validForCycle: validCycle,
        validForItem: validItem,
        alreadyProcessed,
        decision: alreadyProcessed 
          ? "IGNORADO — já processado" 
          : !validCycle 
            ? "IGNORADO — anterior ao ciclo" 
            : !validItem 
              ? "IGNORADO — anterior à entrada do item no ciclo"
              : "CONTABILIZADO",
      }
    })

    return {
      success: true,
      data: {
        cycle: {
          id: cycle.id,
          name: cycle.name,
          status: cycle.status,
          created_at: cycle.created_at,
          current_item_index: cycle.current_item_index,
          current_round: cycle.current_round,
          current_item_progress_min: cycle.current_item_progress_min,
        },
        items: items.map((i) => ({
          id: i.id,
          disciplineId: i.discipline_id,
          name: i.discipline?.name,
          order: i.order,
          created_at: i.created_at,
          planned_minutes: i.planned_minutes,
        })),
        candidateStudies,
        cycleCreatedAt: cycle.created_at,
        itemDetails: items.map((i) => ({
          id: i.id,
          disciplineId: i.discipline_id,
          name: i.discipline?.name,
          createdAt: i.created_at,
        })),
      },
    }
  } catch (err) {
    console.error("[debugCycleProgressAction] Erro:", err)
    return { success: false, error: "Erro ao buscar debug do ciclo." }
  }
}

/**
 * Debug detalhado: Executa a reconciliação passo a passo e mostra exatamente o que acontece.
 * Retorna diagnóstico completo para identificar falhas.
 */
export async function debugReconcileDetailedAction(): Promise<{
  success: boolean
  diagnostic: any
  error?: string
}> {
  try {
    const { supabase, userId } = await getUser()
    const { normalizeText } = await import("@/features/importacao/lib/subject-matcher")
    const { getDayInSaoPaulo } = await import("@/lib/sao-paulo")
    const { calculateCycleAdvance } = await import("./cycle-progress.service")

    // 1. Buscar Ciclo Ativo
    const { data: cycle, error: cycleErr } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cycleErr || !cycle) {
      return { success: false, diagnostic: {}, error: "Nenhum ciclo ativo encontrado." }
    }

    const cycleDayKey = getDayInSaoPaulo(cycle.created_at)

    // 2. Buscar Itens do Ciclo
    const { data: items } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name)")
      .eq("cycle_id", cycle.id)
      .order("order", { ascending: true })

    if (!items || items.length === 0) {
      return { success: false, diagnostic: {}, error: "Ciclo sem matérias." }
    }

    // 3. Buscar histórico de estudos (TODOS, sem filtro por disciplina do ciclo)
    const { data: allHistory, error: histErr } = await supabase
      .from("study_history")
      .select("id, discipline_id, duration_minutes, started_at, created_at, study_source, disciplines(name)")
      .eq("user_id", userId)
      .not("duration_minutes", "is", null)
      .gt("duration_minutes", 0)
      .order("started_at", { ascending: true })

    // 4. Buscar sessões existentes
    const { data: existingSessions } = await supabase
      .from("study_cycle_sessions")
      .select("*")
      .eq("cycle_id", cycle.id)

    // Mapas de matching
    const itemMapById = new Map(items.map(i => [i.discipline_id, i]))
    const itemMapByName = new Map(items.map(i => [normalizeText(i.discipline?.name || ""), i]))

    // Debug de cada estudo
    const studyDebug = (allHistory || []).map((study) => {
      const studyDayKey = getDayInSaoPaulo(study.started_at)
      const disc = Array.isArray(study.disciplines) ? study.disciplines[0] : study.disciplines
      const disciplineName = disc?.name || ""

      const matchById = study.discipline_id ? itemMapById.get(study.discipline_id) : null
      const matchByName = disciplineName ? itemMapByName.get(normalizeText(disciplineName)) : null
      const cycleItem = matchById || matchByName

      const validForCycle = studyDayKey >= cycleDayKey
      let validForItem = false
      if (cycleItem) {
        const itemDayKey = cycleItem.created_at ? getDayInSaoPaulo(cycleItem.created_at) : cycleDayKey
        validForItem = studyDayKey >= itemDayKey
      }

      const alreadyProcessed = (existingSessions || []).some(s => s.study_history_id === study.id)

      return {
        studyId: study.id,
        disciplineId: study.discipline_id,
        disciplineName,
        durationMinutes: study.duration_minutes,
        startedAt: study.started_at,
        studyDayKey,
        source: study.study_source,
        matchedCycleItem: cycleItem ? {
          id: cycleItem.id,
          disciplineId: cycleItem.discipline_id,
          name: cycleItem.discipline?.name,
          order: cycleItem.order,
          created_at: cycleItem.created_at,
        } : null,
        matchType: matchById ? "BY_ID" : matchByName ? "BY_NAME" : "NO_MATCH",
        validForCycle,
        validForItem,
        alreadyProcessed,
        finalDecision: alreadyProcessed
          ? "SKIP_JA_PROCESSADO"
          : !cycleItem
            ? "SKIP_NAO_E_CICLO"
            : !validForCycle
              ? "SKIP_DATA_ANTERIOR_CICLO"
              : !validForItem
                ? "SKIP_DATA_ANTERIOR_ITEM"
                : "PROCESSAR",
      }
    })

    // Filtrar apenas os que seriam processados
    const toProcess = studyDebug.filter(s => s.finalDecision === "PROCESSAR")

    // Simular o que aconteceria
    let simulation = { current_item_index: 0, current_round: 1, total_rounds_done: 0, current_item_progress_min: 0 }
    const simulationLog: any[] = []

    for (const study of toProcess) {
      const cycleItem = itemMapById.get(study.disciplineId) || itemMapByName.get(normalizeText(study.disciplineName))
      if (!cycleItem) continue

      const currentIndex = simulation.current_item_index
      const isCurrent = items[currentIndex]?.id === cycleItem.id
      const isPast = items.findIndex(i => i.id === cycleItem.id) < currentIndex

      let action = ""
      let minutesContributed = 0
      let extraMinutes = 0

      if (isCurrent) {
        const result = calculateCycleAdvance(simulation as any, items as any, study.durationMinutes)
        minutesContributed = result.minutesContributed
        extraMinutes = result.extraMinutes
        simulation.current_item_index = result.newCurrentItemIndex
        simulation.current_round = result.newCurrentRound
        simulation.total_rounds_done = result.newTotalRoundsDone
        simulation.current_item_progress_min = result.newCurrentItemProgressMin
        action = `AVANÇA cursor para item ${result.newCurrentItemIndex}, progresso ${result.newCurrentItemProgressMin}`
      } else if (isPast) {
        minutesContributed = 0
        extraMinutes = study.durationMinutes
        action = "EXTRA — matéria já passou"
      } else {
        minutesContributed = study.durationMinutes
        extraMinutes = 0
        action = `FUTURA — acumula ${study.durationMinutes}min sem mover cursor`
      }

      simulationLog.push({
        studyId: study.studyId,
        disciplineName: study.disciplineName,
        minutes: study.durationMinutes,
        minutesContributed,
        extraMinutes,
        action,
        cursorAfter: { ...simulation },
      })
    }

    // Estado final simulado
    const finalCycleState = {
      current_item_index: simulation.current_item_index,
      current_round: simulation.current_round,
      total_rounds_done: simulation.total_rounds_done,
      current_item_progress_min: simulation.current_item_progress_min,
    }

    // Estado real no banco
    const realCycleState = {
      current_item_index: cycle.current_item_index,
      current_round: cycle.current_round,
      total_rounds_done: cycle.total_rounds_done,
      current_item_progress_min: cycle.current_item_progress_min,
    }

    return {
      success: true,
      diagnostic: {
        userId,
        cycle: {
          id: cycle.id,
          name: cycle.name,
          status: cycle.status,
          created_at: cycle.created_at,
          cycleDayKey,
        },
        items: items.map(i => ({
          id: i.id,
          disciplineId: i.discipline_id,
          name: i.discipline?.name,
          order: i.order,
          created_at: i.created_at,
          planned_minutes: i.planned_minutes,
          dayKey: getDayInSaoPaulo(i.created_at),
        })),
        totalHistoryRecords: allHistory?.length || 0,
        totalHistoryForCycleDisciplines: studyDebug.filter(s => s.matchedCycleItem).length,
        studyDebug,
        toProcessCount: toProcess.length,
        simulationLog,
        simulationFinalState: finalCycleState,
        realCycleState,
        stateMismatch: JSON.stringify(finalCycleState) !== JSON.stringify(realCycleState),
        existingSessionsCount: existingSessions?.length || 0,
      },
    }
  } catch (err: any) {
    console.error("[debugReconcileDetailedAction] Erro:", err)
    return { success: false, diagnostic: {}, error: err.message }
  }
}

