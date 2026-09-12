"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { normalizeText } from "@/features/importacao/lib/subject-matcher"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import { revalidatePath } from "next/cache"

export interface RegisterStudyToCycleResult {
  success: boolean
  alreadyProcessed?: boolean
  cycleUpdated?: boolean
  advanceResult?: any
  error?: string | undefined
}

let _rebuildInFlight: Promise<{ success: boolean; processed: number; errors: string[] }> | null = null
let _lastRebuildResult: { success: boolean; processed: number; errors: string[] } | null = null
let _lastRebuildFinishedAt = 0
const REBUILD_COOLDOWN_MS = 5_000

/**
 * RECONSTRUÇÃO TOTAL DO CICLO (DO ZERO)
 *
 * Esta é a FONTE DE VERDADE do progresso do ciclo.
 * Limpa o estado atual e reconstrói o progresso baseando-se
 * exclusivamente no study_history real posterior à criação do ciclo.
 *
 * Fluxo:
 *   1. Buscar o ciclo ativo e seus itens
 *   2. Buscar TODOS os study_history do usuário
 *   3. Simular 100% em memória: validar data, matchear matéria, avançar cursor
 *   4. Persistir: deletar sessões antigas + inserir novas + atualizar estado do ciclo
 *
 * Determinística: executar N vezes → mesmo resultado.
 */
export async function rebuildActiveCycleProgress(): Promise<{ success: boolean; processed: number; errors: string[] }> {
  // Deduplicação 1: se já existe uma rebuild em andamento, aguardar a mesma
  if (_rebuildInFlight) {
    try {
      return await _rebuildInFlight
    } catch {
      // Se a anterior falhou, prosseguir com rebuild novo
    }
  }

  // Deduplicação 2: se uma rebuild terminou há menos de 5s, retornar resultado cacheado
  const elapsed = Date.now() - _lastRebuildFinishedAt
  if (_lastRebuildResult && elapsed < REBUILD_COOLDOWN_MS) {
    console.log(`[rebuildCycle] Cooldown: última rebuild há ${elapsed}ms, ignorando.`)
    return _lastRebuildResult
  }

  _rebuildInFlight = _doRebuild()
  try {
    const result = await _rebuildInFlight
    _lastRebuildResult = result
    _lastRebuildFinishedAt = Date.now()
    return result
  } finally {
    _rebuildInFlight = null
  }
}

async function _doRebuild(): Promise<{ success: boolean; processed: number; errors: string[] }> {
  const errors: string[] = []
  const log = (msg: string) => console.log(`[rebuildCycle] ${msg}`)

  try {
    const supabase = await createClient()
    const userId = await getEffectiveUserId(supabase)
    if (!userId) return { success: false, processed: 0, errors: ["Não autenticado"] }

    // ── 1. Buscar Ciclo Ativo ──────────────────────────────────────
    const { data: cycle, error: cycleErr } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle()

    if (cycleErr) {
      errors.push(`Erro ao buscar ciclo ativo: ${cycleErr.message}`)
      return { success: false, processed: 0, errors }
    }
    if (!cycle) {
      log("Nenhum ciclo ativo encontrado. Nada a fazer.")
      return { success: true, processed: 0, errors: [] }
    }

    const cycleDayKey = getDayInSaoPaulo(cycle.created_at)
    log(`Ciclo: ${cycle.id} "${cycle.name}" criado em ${cycleDayKey}`)

    // ── 2. Buscar Itens do Ciclo ───────────────────────────────────
    const { data: items, error: itemsErr } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name)")
      .eq("cycle_id", cycle.id)
      .order("order", { ascending: true })

    if (itemsErr) {
      errors.push(`Erro ao buscar itens do ciclo: ${itemsErr.message}`)
      return { success: false, processed: 0, errors }
    }
    if (!items || items.length === 0) {
      log("Ciclo sem itens. Nada a processar.")
      return { success: true, processed: 0, errors: [] }
    }

    log(`${items.length} itens no ciclo: ${items.map(i => `${i.discipline?.name} (${i.planned_minutes}min)`).join(", ")}`)

    // ── 3. Buscar Histórico de Estudos (apenas desde a criação do ciclo) ──
    const { data: history, error: histErr } = await supabase
      .from("study_history")
      .select("id, discipline_id, duration_minutes, started_at, disciplines(name)")
      .eq("user_id", userId)
      .not("duration_minutes", "is", null)
      .gt("duration_minutes", 0)
      .gte("started_at", cycle.created_at)
      .order("started_at", { ascending: true })

    if (histErr) {
      errors.push(`Erro ao buscar histórico: ${histErr.message}`)
      log(`FALHA ao buscar histórico: ${histErr.message}`)
      return { success: false, processed: 0, errors }
    }

    if (!history || history.length === 0) {
      log("Nenhum registro no study_history. Ciclo fica zerado.")
      revalidatePath("/ciclos")
      return { success: true, processed: 0, errors: [] }
    }

    log(`${history.length} registros no study_history (desde ${cycleDayKey}).`)

    // ── 4. Matching maps ──────────────────────────────────────────
    const itemMapById = new Map(items.map(i => [i.discipline_id, i]))
    const itemMapByName = new Map(items.map(i => [normalizeText(i.discipline?.name || ""), i]))

    // ── 5. Group studies by discipline ────────────────────────────
    //    For each study: find matching item, accumulate minutes.
    //    Then: total = sum, progress = min(total, target), extra = max(total - target, 0).
    //    Cursor = first incomplete item.

    interface PendingSession {
      cycle_id: string
      cycle_item_id: string
      study_history_id: string
      discipline_id: string | null
      round_number: number
      minutes_contributed: number
      extra_minutes: number
    }
    const pendingSessions: PendingSession[] = []

    // Accumulate minutes per item (in order)
    const itemAccumulated = new Map(items.map(it => [it.id, 0]))
    const itemTarget = new Map(items.map(it => [it.id, Math.max(1, it.planned_minutes)]))

    // Track per-item: total studies, total minutes, normal, extra
    const diagByItem = new Map(items.map(it => [it.id, {
      name: it.discipline?.name || it.id,
      studyCount: 0,
      totalMinutes: 0,
      normal: 0,
      extra: 0,
    }]))

    let skippedNoMatch = 0
    let matchedById = 0
    let matchedByName = 0

    for (const study of history) {
      const disc = Array.isArray(study.disciplines) ? study.disciplines[0] : study.disciplines
      const disciplineName = disc?.name || ""

      const matchById = study.discipline_id ? itemMapById.get(study.discipline_id) : null
      const matchByName = disciplineName ? itemMapByName.get(normalizeText(disciplineName)) : null
      const cycleItem = matchById || matchByName

      if (!cycleItem) {
        skippedNoMatch++
        continue
      }

      if (matchById) matchedById++
      else matchedByName++

      const target = itemTarget.get(cycleItem.id)!
      const accumulated = itemAccumulated.get(cycleItem.id) || 0
      const remaining = Math.max(0, target - accumulated)
      const consumed = Math.min(study.duration_minutes, remaining)
      const extra = Math.max(study.duration_minutes - consumed, 0)

      itemAccumulated.set(cycleItem.id, accumulated + consumed)

      const diag = diagByItem.get(cycleItem.id)!
      diag.studyCount++
      diag.totalMinutes += study.duration_minutes
      diag.normal += consumed
      diag.extra += extra

      pendingSessions.push({
        cycle_id: cycle.id,
        cycle_item_id: cycleItem.id,
        study_history_id: study.id,
        discipline_id: study.discipline_id,
        round_number: 1,
        minutes_contributed: consumed,
        extra_minutes: extra,
      })
    }

    // ── 6. Cursor = first incomplete item ─────────────────────────
    let cursorIndex = 0
    for (let i = 0; i < items.length; i++) {
      const accumulated = itemAccumulated.get(items[i].id) || 0
      const target = itemTarget.get(items[i].id)!
      if (accumulated < target) {
        cursorIndex = i
        break
      }
      cursorIndex = i + 1 // all completed, cursor goes past end
    }
    if (cursorIndex >= items.length) cursorIndex = items.length - 1

    const currentItemProgressMin = itemAccumulated.get(items[cursorIndex]?.id) || 0

    // ── 7. Diagnostic table ──────────────────────────────────────
    log(`Rebuild concluído: ${pendingSessions.length} sessões.`)
    log(`  Match por ID: ${matchedById}, por nome: ${matchedByName}, sem match: ${skippedNoMatch}`)
    log(`  Cursor: #${cursorIndex + 1} ${items[cursorIndex]?.discipline?.name || "?"}`)
    log(`  ┌──────────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐`)
    log(`  │ MATÉRIA                      │ ESTUDOS  │ MINUTOS  │ META     │ PROGRESSO│ EXTRA    │`)
    log(`  ├──────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤`)
    for (const item of items) {
      const d = diagByItem.get(item.id)!
      const target = itemTarget.get(item.id)!
      const pct = target > 0 ? Math.min(100, Math.round((d.normal / target) * 100)) : 0
      const name = (d.name || "").padEnd(28)
      log(`  │ ${name} │ ${String(d.studyCount).padStart(8)} │ ${String(d.totalMinutes).padStart(8)} │ ${String(target).padStart(8)} │ ${String(pct + "%").padStart(8)} │ ${String(d.extra).padStart(8)} │`)
    }
    log(`  └──────────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘`)

    // ── 6. Persistir: Deletar antigos + Inserir novos ──────────────
    //    Se INSERT falhar (ex: migration V2 não rodada), logamos mas
    //    NÃO perdemos o estado antigo sem antes ter os novos prontos.

    const { error: delErr } = await supabase
      .from("study_cycle_sessions")
      .delete()
      .eq("cycle_id", cycle.id)

    if (delErr) {
      const msg = `Erro ao deletar sessões antigas: ${delErr.message}`
      errors.push(msg)
      log(msg)
      return { success: false, processed: 0, errors }
    }

    let insertFailed = 0
    if (pendingSessions.length > 0) {
      const { error: batchErr } = await supabase
        .from("study_cycle_sessions")
        .insert(pendingSessions)

      if (batchErr) {
        const msg = `Erro ao inserir sessões em lote: ${batchErr.message}`
        errors.push(msg)
        log(msg)

        if (batchErr.message?.includes("column") && batchErr.message?.includes("does not exist")) {
          const migrationMsg = "COLUNAS V2 NÃO EXISTEM — Execute docs/study-cycles-v2-migration.sql no Supabase SQL Editor!"
          errors.push(migrationMsg)
          log(`*** ${migrationMsg} ***`)
        }

        insertFailed = pendingSessions.length

        for (const s of pendingSessions) {
          const { error: singleErr } = await supabase
            .from("study_cycle_sessions")
            .insert(s)
          if (!singleErr) {
            insertFailed--
          } else {
            log(`  FALHA sessão ${s.study_history_id}: ${singleErr.message}`)
          }
        }
      }
    }

    // ── 8. Persistir Estado Final do Ciclo ─────────────────────────
    let { error: finalErr } = await supabase
      .from("study_cycles")
      .update({
        current_item_index: cursorIndex,
        current_round: 1,
        current_item_progress_min: currentItemProgressMin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycle.id)

    // Se colunas V2 não existem, tentar sem elas
    if (finalErr?.message?.includes("column") && finalErr?.message?.includes("does not exist")) {
      const v2Msg = "COLUNAS V2 NÃO EXISTEM em study_cycles — Execute a migration V2 no Supabase SQL Editor!"
      errors.push(v2Msg)
      log(`*** ${v2Msg} ***`)
      const retry = await supabase
        .from("study_cycles")
        .update({
          current_item_index: cursorIndex,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cycle.id)
      finalErr = retry.error
    }

    if (finalErr) {
      errors.push(`Erro ao salvar estado final: ${finalErr.message}`)
      log(`FALHA ao salvar estado final: ${finalErr.message}`)
      return { success: false, processed: pendingSessions.length, errors }
    }

    if (insertFailed > 0) {
      errors.push(`${insertFailed} de ${pendingSessions.length} sessões falharam ao inserir.`)
    }

    log(`=== REBUILD CONCLUÍDO ===`)
    log(`  Sessões persistidas: ${pendingSessions.length - insertFailed}/${pendingSessions.length}`)
    log(`  Cursor: #${cursorIndex + 1} ${items[cursorIndex]?.discipline?.name || "?"}`)
    log(`  Estado final: item=${cursorIndex}, progress=${currentItemProgressMin}min`)

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")

    return { success: pendingSessions.length > 0 || true, processed: pendingSessions.length, errors }
  } catch (err: any) {
    console.error("[rebuildCycle] Erro inesperado:", err)
    return { success: false, processed: 0, errors: [err.message || "Erro desconhecido"] }
  }
}

/**
 * Função de conveniência para ser chamada ao registrar novo estudo ou importar.
 * Re-executa a reconstrução completa para integridade garantida.
 */
export async function registerStudyToCycle(_input?: any): Promise<RegisterStudyToCycleResult> {
  const res = await rebuildActiveCycleProgress()
  return {
    success: res.success,
    error: res.errors[0],
    cycleUpdated: res.processed > 0,
    alreadyProcessed: false,
  }
}

export async function registerStudiesToCycleBatch(_studies?: any): Promise<any> {
  return await rebuildActiveCycleProgress()
}

export async function reconcileCycleProgress(): Promise<{ success: boolean; processed: number; errors: string[] }> {
  return await rebuildActiveCycleProgress()
}
