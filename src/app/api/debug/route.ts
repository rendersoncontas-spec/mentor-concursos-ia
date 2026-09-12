import { NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"

// ---------------------------------------------------------------------------
// /api/debug?audit=replan[&userId=<id>]
// /api/debug?audit=cycle[&userId=<id>]
//
// Auditoria de integridade dos blocos do replanejamento ou ciclo.
// Protegido: requer autenticação via cookie de sessão Supabase.
// Em produção, este endpoint é filtrado pelo matcher do middleware.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  if (process.env["NODE_ENV"] === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]

  if (!url || !key) {
    return NextResponse.json({ error: "Need service role key" })
  }

  const supabase = createClient(url, key)
  const { searchParams } = new URL(request.url)
  const audit = searchParams.get("audit")
  const userId = searchParams.get("userId")

  if (audit === "cycle") {
    return await debugCycle(supabase, userId)
  }

  if (audit !== "replan") {
    return NextResponse.json({ error: "Unknown audit. Use ?audit=replan or ?audit=cycle" })
  }

  let query = supabase
    .from("study_plan_daily_blocks")
    .select("id, scheduled_date, duration_minutes, status, origin, source_block_id, item_id")

  if (userId) {
    query = query.eq("user_id", userId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    id: string
    scheduled_date: string
    duration_minutes: number
    status: string
    origin: string
    source_block_id: string | null
    item_id: string | null
  }>

  const today = new Date().toISOString().slice(0, 10)

  const byOrigin: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let totalBlocks = 0
  let totalPlannedMinutes = 0
  const roots: Array<{ id: string; date: string; minutes: number }> = []
  const orphans: Array<{ id: string; date: string; minutes: number; origin: string }> = []
  const sourceCount = new Map<string, number>()
  const baseByItemDate = new Map<string, string[]>()

  for (const r of rows) {
    totalBlocks += 1
    totalPlannedMinutes += r.duration_minutes || 0
    byOrigin[r.origin] = (byOrigin[r.origin] ?? 0) + 1
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

    if (r.origin === "BASE" && !r.source_block_id) {
      roots.push({ id: r.id, date: r.scheduled_date, minutes: r.duration_minutes || 0 })
    }
    if (r.origin !== "BASE" && !r.source_block_id) {
      orphans.push({
        id: r.id,
        date: r.scheduled_date,
        minutes: r.duration_minutes || 0,
        origin: r.origin,
      })
    }
    if (r.source_block_id) {
      sourceCount.set(r.source_block_id, (sourceCount.get(r.source_block_id) ?? 0) + 1)
    }
    if (r.origin === "BASE" && r.item_id) {
      const k = `${r.item_id}|${r.scheduled_date}`
      const list = baseByItemDate.get(k) ?? []
      list.push(r.id)
      baseByItemDate.set(k, list)
    }
  }

  const duplicatesBySource = [...sourceCount.entries()]
    .filter(([, n]) => n > 1)
    .map(([sourceBlockId, count]) => ({ sourceBlockId, count }))
    .sort((a, b) => b.count - a.count)

  const duplicatedBaseByItemDate = [...baseByItemDate.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, blockIds: ids }))

  const pastPlanned = rows
    .filter((r) => r.scheduled_date < today)
    .reduce((acc, r) => acc + (r.duration_minutes || 0), 0)
  const futurePlanned = rows
    .filter((r) => r.scheduled_date >= today)
    .reduce((acc, r) => acc + (r.duration_minutes || 0), 0)
  const pastRootPlanned = roots.filter((r) => r.date < today).reduce((acc, r) => acc + r.minutes, 0)

  return NextResponse.json({
    auditedUserId: userId ?? null,
    scope: userId ? "user" : "all users",
    today,
    totals: {
      blocks: totalBlocks,
      plannedMinutes: totalPlannedMinutes,
      pastPlannedMinutes: pastPlanned,
      futurePlannedMinutes: futurePlanned,
      pastRootPlannedMinutes: pastRootPlanned,
    },
    byOrigin,
    byStatus,
    roots: {
      count: roots.length,
      pastRoots: roots.filter((r) => r.date < today).length,
      // Teto de pendência plausível (passado): soma do planejado das raízes
      plausibleMaxPendingPastMinutes: pastRootPlanned,
    },
    continuations: {
      count: totalBlocks - roots.length,
      orphanRedistBlocks: orphans, // REAJUSTE/CRITICO sem source_block_id (corrompidos)
    },
    duplicates: {
      bySourceBlockId: duplicatesBySource,
      baseBlocksWithSameItemAndDate: duplicatedBaseByItemDate,
    },
  })
}

async function debugCycle(supabase: any, userId: string | null) {
  let query = supabase
    .from("study_cycles")
    .select("*")
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .limit(1)

  if (userId) {
    query = query.eq("user_id", userId)
  }

  const { data: cycle, error: cycleErr } = await query.maybeSingle()

  if (cycleErr || !cycle) {
    return NextResponse.json({ error: "Nenhum ciclo ativo encontrado.", userId }, { status: 404 })
  }

  const { data: items, error: itemsErr } = await supabase
    .from("study_cycle_items")
    .select("*, discipline:disciplines(id, name)")
    .eq("cycle_id", cycle.id)
    .order("order", { ascending: true })

  if (itemsErr || !items || items.length === 0) {
    return NextResponse.json({ error: "Ciclo sem matérias.", cycle }, { status: 404 })
  }

  const cycleDisciplineIds = items.map((i: any) => i.discipline_id)

  const { data: allStudies, error: studiesErr } = await supabase
    .from("study_history")
    .select("id, discipline_id, duration_minutes, study_source, started_at, created_at, origin_source, origin_source_name, import_batch_id")
    .eq("user_id", cycle.user_id)
    .not("duration_minutes", "is", null)
    .gt("duration_minutes", 0)
    .in("discipline_id", cycleDisciplineIds)
    .order("started_at", { ascending: true })

  const { data: existingSessions } = await supabase
    .from("study_cycle_sessions")
    .select("study_history_id, cycle_item_id, minutes_contributed, extra_minutes, round_number")
    .eq("cycle_id", cycle.id)

  const existingMap = new Map<string, any>()
  for (const s of existingSessions || []) {
    existingMap.set(s.study_history_id, s)
  }

  const candidateStudies = (allStudies || []).map((s: any) => {
    const item = items.find((i: any) => i.discipline_id === s.discipline_id)
    const studyDayKey = getDayInSaoPaulo(s.started_at)
    const cycleDayKey = getDayInSaoPaulo(cycle.created_at)
    const itemDayKey = item ? getDayInSaoPaulo(item.created_at) : cycleDayKey

    const validCycle = studyDayKey >= cycleDayKey
    const validItem = studyDayKey >= itemDayKey
    const alreadyProcessed = existingMap.has(s.id)
    const existing = existingMap.get(s.id)
    const studyDate = new Date(s.started_at)
    const itemDate = item ? new Date(item.created_at) : null

    return {
      studyHistoryId: s.id,
      disciplineId: s.discipline_id,
      disciplineName: item?.discipline?.name || "N/A",
      durationMinutes: s.duration_minutes,
      studySource: s.study_source,
      originSource: s.origin_source,
      originSourceName: s.origin_source_name,
      importBatchId: s.import_batch_id,
      startedAt: s.started_at,
      startedAtLocal: studyDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      cycleCreatedAt: cycle.created_at,
      cycleCreatedAtLocal: cycleDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      itemCreatedAt: item?.created_at || null,
      itemCreatedAtLocal: itemDate ? itemDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null,
      validForCycle: validCycle,
      validForItem: validItem,
      alreadyProcessed,
      existingCycleSession: existing ? {
        cycleItemId: existing.cycle_item_id,
        minutesContributed: existing.minutes_contributed,
        extraMinutes: existing.extra_minutes,
        roundNumber: existing.round_number,
      } : null,
      decision: alreadyProcessed 
        ? "IGNORADO — já processado (idempotência)" 
        : !validCycle 
          ? "IGNORADO — anterior ao ciclo" 
          : !validItem 
            ? "IGNORADO — anterior à entrada do item no ciclo"
            : "CONTABILIZADO",
    }
  })

  const cycleDate = new Date(cycle.created_at)

  return NextResponse.json({
    cycle: {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      created_at: cycle.created_at,
      created_at_local: cycleDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      current_item_index: cycle.current_item_index,
      current_round: cycle.current_round,
      total_rounds_done: cycle.total_rounds_done,
      current_item_progress_min: cycle.current_item_progress_min,
    },
    items: items.map((i: any) => ({
      id: i.id,
      disciplineId: i.discipline_id,
      name: i.discipline?.name,
      order: i.order,
      created_at: i.created_at,
      created_at_local: new Date(i.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      planned_minutes: i.planned_minutes,
    })),
    candidateStudies,
    summary: {
      totalStudies: candidateStudies.length,
      countContabilizado: candidateStudies.filter((s: any) => s.decision === "CONTABILIZADO").length,
      countIgnoradoAnteriorCiclo: candidateStudies.filter((s: any) => s.decision.includes("anterior ao ciclo")).length,
      countIgnoradoAnteriorItem: candidateStudies.filter((s: any) => s.decision.includes("anterior à entrada")).length,
      countJaProcessado: candidateStudies.filter((s: any) => s.decision.includes("já processado")).length,
    },
  })
}
