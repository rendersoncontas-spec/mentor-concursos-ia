import type { SupabaseClient } from "@supabase/supabase-js"

import { buildCycleOverview } from "@/application/study-cycle/cycle-progress.service"
import type {
  CycleOverview,
  StudyCycle,
  StudyCycleItemWithDetails,
  StudyCycleSession,
} from "@/domain/study-cycle/study-cycle.types"

import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

import { fetchAllCycleSessions } from "./cycle-sessions.reader"

/**
 * Fase F.1 — leituras da aba Ciclos / widget "Foco de hoje", extraídas das
 * Server Actions (getCyclesAction, getActiveCycleAction, getCycleByIdAction)
 * para poderem ser testadas com um banco falso.
 *
 * Garantias (cobertas por cycle-overview.reader.test.ts):
 * - SOMENTE LEITURA: nenhuma escrita, nenhum rebuild/reconcile, cursor
 *   (current_item_index) e volta (current_round) nunca são alterados ao abrir
 *   a página;
 * - sessões do ciclo lidas por completo (paginadas, ORDER BY id) — antes
 *   eram cortadas em 1.000 linhas pelo PostgREST;
 * - mesma matemática: o resultado sai de buildCycleOverview, sem mudança.
 *
 * As consultas são as mesmas de antes (mesmos filtros, colunas e ordenação
 * dos ciclos e itens); só a de sessões passou a paginar.
 */

type ItemsRow = StudyCycleItemWithDetails
const ITEMS_SELECT = "*, discipline:disciplines(id, name, area, color_hex)"

export async function loadCyclesOverview(supabase: SupabaseClient, userId: string): Promise<CycleOverview[]> {
  const { data: cycles, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: false })

  if (error || !cycles || cycles.length === 0) return []

  const cycleIds = (cycles as StudyCycle[]).map((c) => c.id)

  const [itemsResult, sessionsResult, skipsResult] = await Promise.all([
    supabase.from("study_cycle_items").select(ITEMS_SELECT).in("cycle_id", cycleIds).order("order", { ascending: true }),
    fetchAllCycleSessions<StudyCycleSession>(supabase, { cycleIds }),
    // Todas as voltas de todos os ciclos: cresce a cada skip → também paginado.
    fetchAllRowsPaged<{ cycle_id: string; cycle_item_id: string; round_number: number }>(
      (withCount) =>
        supabase
          .from("study_cycle_item_skips")
          .select("cycle_id, cycle_item_id, round_number", countOption(withCount))
          .in("cycle_id", cycleIds),
      [{ column: "id", ascending: true }],
    ).then(({ data, error }) => ({ data: error ? null : data })),
  ])

  const itemsByCycle = new Map<string, ItemsRow[]>()
  for (const item of (itemsResult.data || []) as ItemsRow[]) {
    const list = itemsByCycle.get(item.cycle_id) || []
    list.push(item)
    itemsByCycle.set(item.cycle_id, list)
  }

  const sessionsByCycle = new Map<string, StudyCycleSession[]>()
  for (const s of sessionsResult.data) {
    const list = sessionsByCycle.get(s.cycle_id) || []
    list.push(s)
    sessionsByCycle.set(s.cycle_id, list)
  }

  const skipRows = skipsResult.data || []

  return (cycles as StudyCycle[]).map((cycle) => {
    const cycleItems = itemsByCycle.get(cycle.id) || []
    const cycleSessions = sessionsByCycle.get(cycle.id) || []
    const skippedItemIds = new Set(
      skipRows
        .filter((row) => row.cycle_id === cycle.id && row.round_number === (cycle.current_round || 1))
        .map((row) => row.cycle_item_id),
    )
    return buildCycleOverview(cycle, cycleItems, cycleSessions, skippedItemIds)
  })
}

async function loadOverviewForCycle(supabase: SupabaseClient, cycle: StudyCycle): Promise<CycleOverview> {
  const [itemsResult, sessionsResult, skipsResult] = await Promise.all([
    supabase.from("study_cycle_items").select(ITEMS_SELECT).eq("cycle_id", cycle.id).order("order", { ascending: true }),
    fetchAllCycleSessions<StudyCycleSession>(supabase, { cycleId: cycle.id }),
    supabase
      .from("study_cycle_item_skips")
      .select("cycle_item_id")
      .eq("cycle_id", cycle.id)
      .eq("round_number", cycle.current_round || 1),
  ])

  const skippedItemIds = new Set(((skipsResult.data || []) as { cycle_item_id: string }[]).map((row) => row.cycle_item_id))

  return buildCycleOverview(cycle, (itemsResult.data || []) as ItemsRow[], sessionsResult.data, skippedItemIds)
}

export async function loadActiveCycleOverview(supabase: SupabaseClient, userId: string): Promise<CycleOverview | null> {
  const { data: cycle, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !cycle) return null
  return loadOverviewForCycle(supabase, cycle as StudyCycle)
}

export async function loadCycleOverviewById(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
): Promise<CycleOverview | null> {
  const { data: cycle, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !cycle) return null
  // Antes: itens → sessões → skips em sequência. As três leituras são
  // independentes e agora saem juntas (mesmos filtros, mesmo resultado).
  return loadOverviewForCycle(supabase, cycle as StudyCycle)
}
