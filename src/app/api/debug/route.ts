import { NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// /api/debug?audit=replan[&userId=<id>]
//
// Auditoria de integridade dos blocos do replanejamento. Retorna apenas
// contagens e IDs internos de blocos (NENHUM dado pessoal). Use para
// comparar Banco x Frontend durante a manutenção do replan.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]

  if (!url || !key) {
    return NextResponse.json({ error: "Need service role key" })
  }

  const supabase = createClient(url, key)
  const { searchParams } = new URL(request.url)
  const audit = searchParams.get("audit")
  const userId = searchParams.get("userId")

  if (audit !== "replan") {
    return NextResponse.json({ error: "Unknown audit. Use ?audit=replan" })
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
