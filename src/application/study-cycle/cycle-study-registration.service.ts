"use server"

import { revalidatePath } from "next/cache"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { reconcileCycleFromStudies } from "@/application/study-cycle/cycle-reconciliation.engine"
import { normalizeText, similarity } from "@/features/importacao/lib/subject-matcher"
import { createClient } from "@/infrastructure/supabase/server"

export interface RegisterStudyToCycleResult {
  success: boolean
  alreadyProcessed?: boolean
  cycleUpdated?: boolean
  advanceResult?: unknown
  error?: string | undefined
}

export interface RebuildDiagnosticItem {
  name: string
  studies: number
  minutes: number
  target: number
  progress: number
  extra: number
}

export interface RebuildUnmatchedSample {
  disciplineId: string | null
  disciplineName: string
  minutes: number
  startedAt: string | null
  studySource: string | null
}

export interface RebuildResult {
  success: boolean
  processed: number
  errors: string[]
  historyRows: number
  validRows: number
  matchedById: number
  matchedByName: number
  matchedBySimilarity: number
  skippedNoMatch: number
  unmatchedSamples: RebuildUnmatchedSample[]
  items: RebuildDiagnosticItem[]
}

export interface SkipCurrentCycleItemResult {
  success: boolean
  error?: string | undefined
  rebuild?: RebuildResult | undefined
}

type HistoryRow = {
  id: string
  discipline_id: string | null
  duration_minutes: number | null
  started_at: string | null
  study_source: string | null
  metadata: Record<string, unknown> | null
  disciplines: { name?: string } | { name?: string }[] | null
}

type CycleItemRow = {
  id: string
  discipline_id: string
  planned_minutes: number
  discipline: { id: string; name: string } | { id: string; name: string }[] | null
}

const EMPTY_DIAG: RebuildResult = {
  success: true,
  processed: 0,
  errors: [],
  historyRows: 0,
  validRows: 0,
  matchedById: 0,
  matchedByName: 0,
  matchedBySimilarity: 0,
  skippedNoMatch: 0,
  unmatchedSamples: [],
  items: [],
}

const rebuildsByUser = new Map<string, Promise<RebuildResult>>()

function secondsForHistory(row: HistoryRow): number {
  const metadata = row.metadata || {}
  const durationSeconds = Number(metadata["duration_seconds"])
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) return Math.round(durationSeconds)

  const importedSeconds = Number(metadata["imported_seconds"])
  if (Number.isFinite(importedSeconds) && importedSeconds > 0) return Math.round(importedSeconds)

  const minutes = Number(row.duration_minutes)
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0
}

async function loadHistory(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const rows: HistoryRow[] = []
  const pageSize = 1000
  let offset = 0

  for (;;) {
    const { data, error } = await supabase
      .from("study_history")
      .select("id, discipline_id, duration_minutes, started_at, study_source, metadata, disciplines(name)")
      .eq("user_id", userId)
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(`Erro ao buscar histórico: ${error.message}`)
    if (!data || data.length === 0) return rows
    rows.push(...(data as HistoryRow[]))
    if (data.length < pageSize) return rows
    offset += pageSize
  }
}

function disciplineName(row: HistoryRow): string {
  const discipline = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
  return discipline?.name || ""
}

function itemDiscipline(item: CycleItemRow): { id: string; name: string } | null {
  return Array.isArray(item.discipline) ? item.discipline[0] || null : item.discipline
}

async function rebuildForUser(userId: string): Promise<RebuildResult> {
  const supabase = await createClient()
  const history = await loadHistory(supabase, userId)
  const validHistory = history
    .map((row) => ({ row, seconds: secondsForHistory(row) }))
    .filter(({ seconds }) => seconds > 0)

  const { data: cycles, error: cyclesError } = await supabase
    .from("study_cycles")
    .select("id, name")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })

  if (cyclesError) throw new Error(`Erro ao buscar ciclos ativos: ${cyclesError.message}`)
  if (!cycles || cycles.length === 0) {
    return { ...EMPTY_DIAG, historyRows: history.length, validRows: validHistory.length }
  }

  let processed = 0
  let matchedById = 0
  let matchedByName = 0
  let matchedBySimilarity = 0
  let skippedNoMatch = 0
  const unmatchedSamples: RebuildUnmatchedSample[] = []
  const diagnostics: RebuildDiagnosticItem[] = []

  for (const cycle of cycles) {
    const { data, error } = await supabase
      .from("study_cycle_items")
      .select("id, discipline_id, planned_minutes, discipline:disciplines(id, name)")
      .eq("cycle_id", cycle.id)
      .order("order", { ascending: true })
    if (error) throw new Error(`Erro ao buscar itens do ciclo ${cycle.name}: ${error.message}`)

    const items = (data || []) as unknown as CycleItemRow[]
    if (items.length === 0) continue

    // Marcadores duráveis de "pular" (não são derivados de study_history e nunca
    // são apagados pelo rebuild — ver migration 20260919_1_cycle_item_skips.sql).
    const { data: skipRows, error: skipError } = await supabase
      .from("study_cycle_item_skips")
      .select("cycle_item_id, round_number")
      .eq("cycle_id", cycle.id)
    if (skipError) throw new Error(`Erro ao buscar pulos do ciclo ${cycle.name}: ${skipError.message}`)
    const skips = (skipRows || []).map((row) => ({
      cycleItemId: row.cycle_item_id as string,
      roundNumber: row.round_number as number,
    }))

    const byId = new Map(items.map((item) => [item.discipline_id, item]))
    const byName = new Map(items.map((item) => [normalizeText(itemDiscipline(item)?.name || ""), item]))
    const matchBySimilarity = (name: string) => {
      let best: CycleItemRow | null = null
      let score = 0
      for (const item of items) {
        const candidate = similarity(name, itemDiscipline(item)?.name || "")
        if (candidate > score) {
          best = item
          score = candidate
        }
      }
      return score >= 0.8 ? best : null
    }

    const matchedStudies: { id: string; cycleItemId: string; disciplineId: string | null; seconds: number }[] = []
    const statsByItem = new Map(items.map((item) => [item.id, { studies: 0 }]))

    for (const { row, seconds } of validHistory) {
      const name = disciplineName(row)
      const direct = row.discipline_id ? byId.get(row.discipline_id) : null
      const exact = !direct && name ? byName.get(normalizeText(name)) : null
      const similar = !direct && !exact && name ? matchBySimilarity(name) : null
      const item = direct || exact || similar

      if (!item) {
        skippedNoMatch += 1
        if (unmatchedSamples.length < 15) {
          unmatchedSamples.push({ disciplineId: row.discipline_id, disciplineName: name || "(sem nome)", minutes: seconds / 60, startedAt: row.started_at, studySource: row.study_source })
        }
        continue
      }

      if (direct) matchedById += 1
      else if (exact) matchedByName += 1
      else matchedBySimilarity += 1

      matchedStudies.push({ id: row.id, cycleItemId: item.id, disciplineId: row.discipline_id, seconds })
      const stat = statsByItem.get(item.id)
      if (stat) stat.studies += 1
    }

    const reconciled = reconcileCycleFromStudies(
      items.map((item) => ({ id: item.id, disciplineId: item.discipline_id, disciplineName: itemDiscipline(item)?.name || item.id, targetSeconds: Math.max(1, item.planned_minutes) * 60 })),
      matchedStudies,
      skips,
    )
    const sessionRows = reconciled.sessions.map((session) => ({
      cycle_id: cycle.id,
      ...session,
      minutes_contributed: Math.floor(session.minutes_contributed),
      extra_minutes: Math.floor(session.extra_minutes),
    }))
    const { error: persistError } = await supabase.rpc("reconcile_study_cycle", {
      p_cycle_id: cycle.id,
      p_sessions: sessionRows,
      p_state: {
        current_item_index: reconciled.state.currentItemIndex,
        current_round: reconciled.state.currentRound,
        total_rounds_done: reconciled.state.totalRoundsDone,
        current_item_progress_seconds: reconciled.state.currentItemProgressSeconds,
        current_item_progress_min: Math.floor(reconciled.state.currentItemProgressMinutes),
      },
    })
    if (persistError) throw new Error(`Erro ao persistir ciclo ${cycle.name}: ${persistError.message}`)

    processed += sessionRows.length
    for (const item of items) {
      const currentSessions = reconciled.sessions.filter((session) => session.round_number === reconciled.state.currentRound && session.cycle_item_id === item.id)
      const current = currentSessions.reduce((sum, session) => sum + session.seconds_contributed, 0)
      const extra = currentSessions.reduce((sum, session) => sum + session.extra_seconds, 0)
      const targetSeconds = Math.max(1, item.planned_minutes) * 60
      diagnostics.push({ name: itemDiscipline(item)?.name || item.id, studies: statsByItem.get(item.id)?.studies || 0, minutes: current / 60, target: item.planned_minutes, progress: Math.min(100, Math.round((current / targetSeconds) * 100)), extra: extra / 60 })
    }
  }

  revalidatePath("/ciclos")
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/history")
  return { success: true, processed, errors: [], historyRows: history.length, validRows: validHistory.length, matchedById, matchedByName, matchedBySimilarity, skippedNoMatch, unmatchedSamples, items: diagnostics }
}

/** Sole server-side authority for cycle aggregation, rounds and cursor. */
export async function rebuildActiveCycleProgress(): Promise<RebuildResult> {
  const supabase = await createClient()
  const userId = await getEffectiveUserId(supabase)
  if (!userId) return { ...EMPTY_DIAG, success: false, errors: ["Não autenticado"] }

  const active = rebuildsByUser.get(userId)
  if (active) return active

  const rebuild = rebuildForUser(userId)
    .catch((error: unknown) => ({ ...EMPTY_DIAG, success: false, errors: [error instanceof Error ? error.message : "Erro desconhecido ao reconciliar ciclo"] }))
    .finally(() => rebuildsByUser.delete(userId))
  rebuildsByUser.set(userId, rebuild)
  return rebuild
}

export async function registerStudyToCycle(_input?: unknown): Promise<RegisterStudyToCycleResult> {
  const result = await rebuildActiveCycleProgress()
  return { success: result.success, error: result.errors[0], cycleUpdated: result.processed > 0, alreadyProcessed: false }
}

export async function registerStudiesToCycleBatch(_studies?: unknown): Promise<RebuildResult> {
  return rebuildActiveCycleProgress()
}

export async function reconcileCycleProgress(): Promise<RebuildResult> {
  return rebuildActiveCycleProgress()
}

/**
 * Sole authority for "pular matéria". Never mutates study_cycles or
 * study_cycle_sessions directly — it only writes a durable skip marker
 * (cycle_item_id + round_number) and then defers entirely to the central
 * rebuild to recompute cursor/round/progress. This is what makes a skip
 * survive the very next real study event instead of being silently
 * overwritten by it.
 */
export async function skipCurrentCycleItem(cycleId: string): Promise<SkipCurrentCycleItemResult> {
  const supabase = await createClient()
  const userId = await getEffectiveUserId(supabase)
  if (!userId) return { success: false, error: "Não autenticado" }

  const { data: cycle, error: cycleError } = await supabase
    .from("study_cycles")
    .select("id, current_item_index, current_round")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle()
  if (cycleError) return { success: false, error: cycleError.message }
  if (!cycle) return { success: false, error: "Ciclo não encontrado." }

  const { data: items, error: itemsError } = await supabase
    .from("study_cycle_items")
    .select("id")
    .eq("cycle_id", cycleId)
    .order("order", { ascending: true })
  if (itemsError) return { success: false, error: itemsError.message }
  if (!items || items.length === 0) return { success: false, error: "Ciclo sem matérias." }

  const currentIndex = Math.min(Math.max(0, cycle.current_item_index || 0), items.length - 1)
  const currentItem = items[currentIndex]
  if (!currentItem) return { success: false, error: "Não foi possível identificar a matéria atual." }

  const { error: skipError } = await supabase.from("study_cycle_item_skips").upsert(
    {
      cycle_id: cycleId,
      cycle_item_id: currentItem.id,
      round_number: cycle.current_round || 1,
      user_id: userId,
    },
    { onConflict: "cycle_item_id,round_number", ignoreDuplicates: true },
  )
  if (skipError) return { success: false, error: `Erro ao registrar o pulo: ${skipError.message}` }

  const rebuild = await rebuildActiveCycleProgress()
  return { success: rebuild.success, error: rebuild.errors[0], rebuild }
}
