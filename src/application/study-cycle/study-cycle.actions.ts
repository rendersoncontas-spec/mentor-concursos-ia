"use server"

import { revalidatePath } from "next/cache"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import { buildCycleOverview } from "@/application/study-cycle/cycle-progress.service"
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
import { reconcileCycleProgress, registerStudyToCycle, skipCurrentCycleItem } from "./cycle-study-registration.service"

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
 */
export async function getCyclesAction(): Promise<{ data: CycleOverview[]; reconcileErrors: string[] }> {
  const reconcileErrors: string[] = []
  try {
    const { supabase, userId } = await getUser()

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

    const [itemsResult, sessionsResult, skipsResult] = await Promise.all([
      supabase
        .from("study_cycle_items")
        .select("*, discipline:disciplines(id, name, area, color_hex)")
        .in("cycle_id", cycleIds)
        .order("order", { ascending: true }),
      supabase.from("study_cycle_sessions").select("*").in("cycle_id", cycleIds),
      supabase.from("study_cycle_item_skips").select("cycle_id, cycle_item_id, round_number").in("cycle_id", cycleIds),
    ])

    const itemsByCycle = new Map<string, StudyCycleItemWithDetails[]>()
    for (const item of itemsResult.data || []) {
      const list = itemsByCycle.get(item.cycle_id) || []
      list.push(item as StudyCycleItemWithDetails)
      itemsByCycle.set(item.cycle_id, list)
    }

    const sessionsByCycle = new Map<string, StudyCycleSession[]>()
    for (const s of sessionsResult.data || []) {
      const list = sessionsByCycle.get(s.cycle_id) || []
      list.push(s as StudyCycleSession)
      sessionsByCycle.set(s.cycle_id, list)
    }

    const skipRows = (skipsResult.data || []) as { cycle_id: string; cycle_item_id: string; round_number: number }[]

    const data = cycles.map((cycle) => {
      const cycleItems = itemsByCycle.get(cycle.id) || []
      const cycleSessions = sessionsByCycle.get(cycle.id) || []
      const skippedItemIds = new Set(
        skipRows
          .filter((row) => row.cycle_id === cycle.id && row.round_number === (cycle.current_round || 1))
          .map((row) => row.cycle_item_id)
      )
      return buildCycleOverview(cycle as StudyCycle, cycleItems, cycleSessions, skippedItemIds)
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

    const { data: cycle, error } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !cycle) return null

    const [itemsResult, sessionsResult, skipsResult] = await Promise.all([
      supabase
        .from("study_cycle_items")
        .select("*, discipline:disciplines(id, name, area, color_hex)")
        .eq("cycle_id", cycle.id)
        .order("order", { ascending: true }),
      supabase.from("study_cycle_sessions").select("*").eq("cycle_id", cycle.id),
      supabase
        .from("study_cycle_item_skips")
        .select("cycle_item_id")
        .eq("cycle_id", cycle.id)
        .eq("round_number", cycle.current_round || 1),
    ])

    const skippedItemIds = new Set((skipsResult.data || []).map((row) => row.cycle_item_id as string))

    return buildCycleOverview(
      cycle as StudyCycle,
      (itemsResult.data || []) as StudyCycleItemWithDetails[],
      (sessionsResult.data || []) as StudyCycleSession[],
      skippedItemIds
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

    const { data: skipRows } = await supabase
      .from("study_cycle_item_skips")
      .select("cycle_item_id")
      .eq("cycle_id", cycle.id)
      .eq("round_number", cycle.current_round || 1)

    return buildCycleOverview(
      cycle as StudyCycle,
      (items || []) as StudyCycleItemWithDetails[],
      (sessions || []) as StudyCycleSession[],
      new Set((skipRows || []).map((row) => row.cycle_item_id as string))
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

    // Audita se executado sob impersonation (modo suporte)
    try {
      const { cookies } = await import("next/headers")
      const { SUPPORT_SESSION_COOKIE_NAME } = await import("@/application/admin/auth-guard")
      const token = (await cookies()).get(SUPPORT_SESSION_COOKIE_NAME)?.value
      if (token) {
        const { data: supportSession } = await supabase
          .from("support_sessions")
          .select("id, moderator_id, target_user_id")
          .eq("session_token", token)
          .eq("status", "ACTIVE")
          .maybeSingle()
        if (supportSession) {
          const { auditSupportAction } = await import("@/application/admin/admin.actions")
          await auditSupportAction(supabase, {
            supportSessionId: supportSession.id,
            moderatorId: supportSession.moderator_id,
            targetUserId: supportSession.target_user_id,
            action: "DELETE_CYCLE",
            resource: cycleId,
            result: "success",
          })
        }
      }
    } catch {
      // Auditoria nunca quebra a ação principal
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
 * - Preserva os minutos parciais acumulados — o tempo real em study_history
 *   nunca é apagado nem alterado por esta ação.
 * - NÃO transforma a matéria em 100% concluída (o percentual real continua
 *   refletindo o tempo realmente estudado).
 * - Grava apenas um marcador durável (cycle_item_id + rodada) e delega ao
 *   rebuild central (skipCurrentCycleItem) todo o recálculo de cursor,
 *   rodada e progresso — nenhuma escrita direta em study_cycles ou
 *   study_cycle_sessions acontece aqui. Isso garante que o pulo sobrevive
 *   ao próximo estudo real registrado em qualquer disciplina.
 */
export async function skipCycleCurrentItemAction(cycleId: string) {
  try {
    const result = await skipCurrentCycleItem(cycleId)
    if (!result.success) {
      return { success: false, error: result.error || "Erro ao pular matéria." }
    }

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/history")
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
          .eq("cycle_id", input.id)
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
  historyRows?: number
  validRows?: number
  matchedById?: number
  matchedByName?: number
  matchedBySimilarity?: number
  skippedNoMatch?: number
  unmatchedSamples?: { disciplineId: string | null; disciplineName: string; minutes: number; startedAt: string | null; studySource: string | null }[]
  items?: { name: string; studies: number; minutes: number; target: number; progress: number; extra: number }[]
}> {
  try {
    await getUser()
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
 * Diagnóstico REAL: lista TODOS os ciclos do usuário com contagem de
 * itens e sessões — sem filtrar por status. Usado para investigar
 * regressão de ciclo "desaparecido".
 */
export async function diagnoseUserCyclesAction(): Promise<{
  success: boolean
  total: number
  cycles?: {
    id: string
    name: string
    status: string
    created_at: string
    updated_at: string
    items: number
    sessions: number
  }[]
  error?: string
}> {
  try {
    const { supabase, userId } = await getUser()

    const { data: cycles, error } = await supabase
      .from("study_cycles")
      .select("id, name, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (error) return { success: false, total: 0, error: error.message }
    if (!cycles || cycles.length === 0) return { success: true, total: 0, cycles: [] }

    const ids = cycles.map((c) => c.id)
    const [itemsRes, sessionsRes] = await Promise.all([
      supabase.from("study_cycle_items").select("cycle_id").in("cycle_id", ids),
      supabase.from("study_cycle_sessions").select("cycle_id").in("cycle_id", ids),
    ])

    const countBy = (rows: { cycle_id: string }[] | null) => {
      const map = new Map<string, number>()
      for (const r of rows || []) map.set(r.cycle_id, (map.get(r.cycle_id) || 0) + 1)
      return map
    }
    const itemsCount = countBy(itemsRes.data as { cycle_id: string }[] | null)
    const sessionsCount = countBy(sessionsRes.data as { cycle_id: string }[] | null)

    return {
      success: true,
      total: cycles.length,
      cycles: cycles.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        items: itemsCount.get(c.id) || 0,
        sessions: sessionsCount.get(c.id) || 0,
      })),
    }
  } catch {
    return { success: false, total: 0, error: "Erro ao diagnosticar ciclos." }
  }
}

