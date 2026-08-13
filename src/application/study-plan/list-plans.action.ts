"use server"

import { createClient } from "@/infrastructure/supabase/server"
import type { PlanStatus, PlanType } from "@/domain/study-plan/study-plan.types"
import { isMaintenanceMode } from "@/lib/maintenance"

export interface PlanDisciplineSummary {
  id: string
  name: string
  area: string | null
  weeklyMinutes: number
  itemsCount: number
}

export interface PlanCardData {
  id: string
  name: string
  description: string | null
  version: number
  planType: PlanType
  status: PlanStatus
  active: boolean
  generatedReason: string
  generatedAt: string
  startDate: string | null
  endDate: string | null
  totalMinutes: number
  disciplinesCount: number
  itemsCount: number
  disciplines: PlanDisciplineSummary[]
  // Progresso real de estudo
  studiedMinutes: number
  adherencePercentage: number | null
  // Histórico de versões do mesmo grupo
  versionsCount: number
  previousVersions: {
    id: string
    version: number
    generatedAt: string
    weeklyMinutes: number
    status: PlanStatus
  }[]
}

export async function listPlansAction(): Promise<{ data: PlanCardData[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    // Busca todos os planos do usuário.
    // Usamos select com fallback gracioso para colunas que podem não existir antes da migration.
    const { data: rawPlans, error } = await supabase
      .from("study_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })

    if (error) return { data: null, error: error.message }
    if (!rawPlans || rawPlans.length === 0) return { data: [], error: null }

    const rawTyped = rawPlans as Record<string, unknown>[]

    // Mapeamos para calcular estudo real (nos últimos 90 dias ou desde generated_at)
    const { data: history } = await supabase
      .from("study_history")
      .select("discipline_id, duration_minutes, started_at")
      .eq("user_id", user.id)
      .not("duration_minutes", "is", null)

    const historyRows = (history ?? []) as { discipline_id: string; duration_minutes: number; started_at: string }[]

    // Buscar o concurso ativo para dar o nome do concurso quando o nome for padrão
    const { data: activeTarget } = await supabase
      .from("user_targets")
      .select("target_exam")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const targetExamName = activeTarget?.target_exam ?? "Plano de Estudos"

    // 1. Processar cada plano individualmente
    const processedMap = new Map<string, PlanCardData>()

    for (const plan of rawTyped) {
      const planId = String(plan["id"])
      const version = Number(plan["version"]) || 1
      const active = Boolean(plan["active"])
      const generatedAt = String(plan["generated_at"] ?? plan["created_at"] ?? new Date().toISOString())
      const reason = String(plan["generated_reason"] ?? "")

      // Fallbacks graciosos para colunas novas
      const planTypeRaw = String(plan["plan_type"] ?? "")
      const planType: PlanType =
        planTypeRaw === "CICLO_ROTATIVO" || reason === "cycle_wizard"
          ? "CICLO_ROTATIVO"
          : "CRONOGRAMA_SEMANAL"

      let status: PlanStatus = "ARCHIVED"
      if (plan["status"]) {
        status = String(plan["status"]) as PlanStatus
      } else if (active) {
        status = "ACTIVE"
      }

      // Nome do plano
      let name = String(plan["name"] ?? "").trim()
      if (!name) {
        name = `${targetExamName} — v${version}`
      }

      const description = plan["description"] ? String(plan["description"]) : null
      const startDate = plan["start_date"] ? String(plan["start_date"]) : null
      const endDate = plan["end_date"] ? String(plan["end_date"]) : null

      // Buscar itens do plano
      const { data: items } = await supabase
        .from("study_plan_items")
        .select("id, discipline_id, duration_minutes, disciplines ( id, name, area )")
        .eq("study_plan_id", planId)

      const itemRows = (items ?? []) as unknown as {
        id: string
        discipline_id: string
        duration_minutes: number
        disciplines: { id: string; name: string; area: string | null } | { id: string; name: string; area: string | null }[]
      }[]

      const byDiscipline = new Map<string, PlanDisciplineSummary>()
      let itemMinutes = 0

      for (const row of itemRows) {
        const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
        itemMinutes += row.duration_minutes
        const current = byDiscipline.get(row.discipline_id)
        if (current) {
          current.weeklyMinutes += row.duration_minutes
          current.itemsCount += 1
        } else {
          byDiscipline.set(row.discipline_id, {
            id: row.discipline_id,
            name: disc?.name ?? "Disciplina",
            area: disc?.area ?? null,
            weeklyMinutes: row.duration_minutes,
            itemsCount: 1,
          })
        }
      }

      // Calcular tempo estudado real desde a criação deste plano
      const planDate = new Date(generatedAt).getTime()
      let studiedMinutes = 0
      for (const h of historyRows) {
        const hDate = new Date(h.started_at).getTime()
        if (hDate >= planDate) {
          studiedMinutes += Number(h.duration_minutes) || 0
        }
      }

      const adherencePercentage =
        itemMinutes > 0 ? Math.min(100, Math.round((studiedMinutes / itemMinutes) * 100)) : null

      processedMap.set(planId, {
        id: planId,
        name,
        description,
        version,
        planType,
        status,
        active,
        generatedReason: reason,
        generatedAt,
        startDate,
        endDate,
        totalMinutes: itemMinutes,
        disciplinesCount: byDiscipline.size,
        itemsCount: itemRows.length,
        disciplines: [...byDiscipline.values()].sort((a, b) => b.weeklyMinutes - a.weeklyMinutes),
        studiedMinutes,
        adherencePercentage,
        versionsCount: 1,
        previousVersions: [],
      })
    }

    const allCards = [...processedMap.values()]

    // 2. Agrupar por versão (versões técnicas do mesmo plano ficam agrupadas na lista de versões)
    // O plano ativo (ou o mais recente de um grupo) é a "cabeça" do grupo.
    const groupedCards: PlanCardData[] = []
    const seenGroupHead = new Set<string>()

    // Ordenação de exibição: 1º ATIVO, 2º PAUSADO, 3º mais recentes
    const sortedAll = [...allCards].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      if (a.status !== b.status) {
        if (a.status === "ACTIVE") return -1
        if (b.status === "ACTIVE") return 1
        if (a.status === "PAUSED") return -1
        if (b.status === "PAUSED") return 1
      }
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    })

    // Agrupamento de versões: se houver plano ativo, ele atrai as versões inativas anteriores do mesmo nome/concurso
    const activeHead = sortedAll.find((p) => p.active)
    if (activeHead) {
      seenGroupHead.add(activeHead.id)
      const previous = sortedAll.filter((p) => p.id !== activeHead.id)
      activeHead.versionsCount = sortedAll.length
      activeHead.previousVersions = previous.map((p) => ({
        id: p.id,
        version: p.version,
        generatedAt: p.generatedAt,
        weeklyMinutes: p.totalMinutes,
        status: p.status,
      }))
      groupedCards.push(activeHead)

      // Adiciona também os planos arquivados distintos (se forem de nome/origem bem diferente)
      for (const p of previous) {
        if (!seenGroupHead.has(p.id)) {
          // Se for o mesmo nome genérico, já está agrupado sob activeHead
          if (p.name === activeHead.name || p.name.includes("v")) {
            continue
          }
          groupedCards.push(p)
          seenGroupHead.add(p.id)
        }
      }
    } else {
      // Se não há plano ativo, o mais recente do topo é a cabeça
      for (const p of sortedAll) {
        if (!seenGroupHead.has(p.id)) {
          groupedCards.push(p)
          seenGroupHead.add(p.id)
        }
      }
    }

    return { data: groupedCards.length > 0 ? groupedCards : sortedAll, error: null }
  } catch (err) {
    return { data: null, error: (err as { message?: string }).message ?? "Erro ao listar planos" }
  }
}

/**
 * Ativa um plano específico e desativa os demais.
 */
export async function activatePlanAction(planId: string): Promise<{ success: boolean; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Usuário não autenticado." }

    // 1. Desativa todos
    await supabase.from("study_plans").update({ active: false, status: "ARCHIVED" }).eq("user_id", user.id)

    // 2. Ativa o plano selecionado
    const { error } = await supabase
      .from("study_plans")
      .update({ active: true, status: "ACTIVE" })
      .eq("id", planId)
      .eq("user_id", user.id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro ao ativar plano" }
  }
}

/**
 * Alterna entre Pausado e Ativo.
 */
export async function togglePausePlanAction(planId: string, currentStatus: PlanStatus): Promise<{ success: boolean; newStatus?: PlanStatus; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Usuário não autenticado." }

    const nextStatus: PlanStatus = currentStatus === "PAUSED" ? "ACTIVE" : "PAUSED"
    const isActive = nextStatus === "ACTIVE"

    // Se for reativar, desativa outros ativos primeiro
    if (isActive) {
      await supabase.from("study_plans").update({ active: false, status: "ARCHIVED" }).eq("user_id", user.id)
    }

    const { error } = await supabase
      .from("study_plans")
      .update({
        active: isActive,
        status: nextStatus,
        paused_at: nextStatus === "PAUSED" ? new Date().toISOString() : null,
      })
      .eq("id", planId)
      .eq("user_id", user.id)

    if (error) return { success: false, error: error.message }
    return { success: true, newStatus: nextStatus }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro ao pausar/retomar plano" }
  }
}

/**
 * Duplica a estrutura de um plano para ser reutilizada ou modificada.
 */
export async function duplicatePlanAction(planId: string, newName?: string): Promise<{ success: boolean; planId?: string; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Usuário não autenticado." }

    // 1. Buscar plano original
    const { data: original, error: origError } = await supabase
      .from("study_plans")
      .select("*")
      .eq("id", planId)
      .eq("user_id", user.id)
      .single()

    if (origError || !original) return { success: false, error: "Plano original não encontrado." }

    // 2. Buscar itens do plano original
    const { data: origItems, error: itemsError } = await supabase
      .from("study_plan_items")
      .select("*")
      .eq("study_plan_id", planId)

    if (itemsError || !origItems) return { success: false, error: "Itens do plano original não encontrados." }

    // 3. Contar planos para nova versão
    const { count } = await supabase.from("study_plans").select("*", { count: "exact", head: true }).eq("user_id", user.id)
    const newVersion = (count ?? 0) + 1

    const sourceName = original["name"] ? String(original["name"]) : `Plano v${original["version"]}`
    const finalName = newName?.trim() || `${sourceName} (Cópia)`

    // 4. Inserir novo plano duplicado (inicia como inativo por padrão)
    const { data: newPlan, error: insertError } = await supabase
      .from("study_plans")
      .insert({
        user_id: user.id,
        version: newVersion,
        name: finalName,
        description: original["description"] ?? null,
        generated_reason: "duplicate",
        active: false,
        status: "ARCHIVED",
        parent_plan_id: original.id,
      })
      .select("id")
      .single()

    if (insertError || !newPlan) return { success: false, error: insertError?.message ?? "Erro ao duplicar plano." }

    // 5. Inserir os itens clonados
    const newItems = origItems.map((item) => ({
      study_plan_id: newPlan.id,
      discipline_id: item.discipline_id,
      day_of_week: item.day_of_week,
      duration_minutes: item.duration_minutes,
      priority: item.priority,
      priority_score: item.priority_score,
      recommended_sessions: item.recommended_sessions,
    }))

    const { error: copyItemsError } = await supabase.from("study_plan_items").insert(newItems)
    if (copyItemsError) return { success: false, error: copyItemsError.message }

    return { success: true, planId: newPlan.id }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro ao duplicar plano" }
  }
}

/**
 * Exclui um plano de estudos (NÃO apaga sessões nem histórico).
 */
export async function deletePlanAction(planId: string): Promise<{ success: boolean; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Usuário não autenticado." }

    // CASCADE exclui automaticamente os study_plan_items (via FK)
    const { error } = await supabase.from("study_plans").delete().eq("id", planId).eq("user_id", user.id)
    if (error) return { success: false, error: error.message }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro ao excluir plano" }
  }
}
