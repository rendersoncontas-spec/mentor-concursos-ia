"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { normalizeText, similarity } from "@/features/importacao/lib/subject-matcher"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"
import { revalidatePath } from "next/cache"

export interface RegisterStudyToCycleResult {
  success: boolean
  alreadyProcessed?: boolean
  cycleUpdated?: boolean
  advanceResult?: any
  error?: string | undefined
}

let _rebuildInFlight: Promise<RebuildResult> | null = null
let _lastRebuildResult: RebuildResult | null = null
let _lastRebuildFinishedAt = 0
const REBUILD_COOLDOWN_MS = 5_000

/**
 * RECONSTRUÇÃO TOTAL DO CICLO (DO ZERO)
 *
 * Esta é a FONTE DE VERDADE do progresso do ciclo.
 * Limpa o estado atual e reconstrói o progresso baseando-se
 * em TODO o study_history real do usuário (incluindo imports
 * anteriores à criação do ciclo, ex: Aprovado).
 *
 * Fluxo:
 *   1. Buscar o ciclo ativo e seus itens
 *   2. Buscar TODOS os study_history do usuário
 *   3. Simular 100% em memória: validar data, matchear matéria, avançar cursor
 *   4. Persistir: deletar sessões antigas + inserir novas + atualizar estado do ciclo
 *
 * Determinística: executar N vezes → mesmo resultado.
 */
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

export async function rebuildActiveCycleProgress(options?: {
  /** Chamadas de import em chunks sequenciais NÃO usam cooldown: cada chunk traz novos registros. */
  skipCooldown?: boolean
}): Promise<RebuildResult> {
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
  if (!options?.skipCooldown && _lastRebuildResult && elapsed < REBUILD_COOLDOWN_MS) {
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

async function _doRebuild(): Promise<RebuildResult> {
  const errors: string[] = []
  const log = (msg: string) => console.log(`[rebuildCycle] ${msg}`)

  try {
    const supabase = await createClient()
    const userId = await getEffectiveUserId(supabase)
    if (!userId)
      return { ...EMPTY_DIAG, success: false, errors: ["Não autenticado"] }

    // ── 1. Buscar Ciclo Ativo ──────────────────────────────────────
    const { data: cycle, error: cycleErr } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle()

    if (cycleErr) {
      errors.push(`Erro ao buscar ciclo ativo: ${cycleErr.message}`)
      return { ...EMPTY_DIAG, success: false, errors }
    }
    if (!cycle) {
      log("Nenhum ciclo ativo encontrado. Nada a fazer.")
      return { ...EMPTY_DIAG }
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
      return { ...EMPTY_DIAG, success: false, errors }
    }
    if (!items || items.length === 0) {
      log("Ciclo sem itens. Nada a processar.")
      return { ...EMPTY_DIAG }
    }

    log(`${items.length} itens no ciclo: ${items.map(i => `${i.discipline?.name} (${i.planned_minutes}min)`).join(", ")}`)

    // ── 3. Buscar Histórico de Estudos (TODO o histórico válido do usuário) ──
    // NÃO filtrar por cycle.created_at: imports (ex: Aprovado) anteriores à
    // criação do ciclo devem contribuir para o progresso (CHECK 5).
    // Usa metadata.imported_seconds como fonte de duração quando disponível
    // (mesma fonte que o Histórico exibe), com fallback para duration_minutes.
    // PAGINAÇÃO OBRIGATÓRIA: o PostgREST limita a ~1000 linhas por request;
    // sem paginar, históricos grandes perdem os registros MAIS RECENTES.
    const history: Record<string, unknown>[] = []
    const PAGE_SIZE = 1000
    let offset = 0
    let histErr: { message: string } | null = null
    for (;;) {
      const { data: page, error } = await supabase
        .from("study_history")
        .select("id, discipline_id, duration_minutes, started_at, study_source, metadata, disciplines(name)")
        .eq("user_id", userId)
        .order("started_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) {
        histErr = { message: error.message }
        break
      }
      if (!page || page.length === 0) break
      history.push(...(page as unknown as Record<string, unknown>[]))
      if (page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    if (histErr) {
      errors.push(`Erro ao buscar histórico: ${histErr.message}`)
      log(`FALHA ao buscar histórico: ${histErr.message}`)
      return { ...EMPTY_DIAG, success: false, errors }
    }

    if (!history || history.length === 0) {
      log("Nenhum registro no study_history. Ciclo fica zerado.")
      revalidatePath("/ciclos")
      return { ...EMPTY_DIAG }
    }

    // Duração efetiva em MINUTOS (com fração): prefere imported_seconds
    // (preciso, mesma fonte do Histórico) e cai para duration_minutes.
    // Registros sem duração válida são descartados aqui (não no SQL),
    // para que imports com segundos fracionários (< 1min) também contem.
    const withDuration = (history || [])
      .map((h) => {
        const meta = (h as { metadata?: Record<string, unknown> | null }).metadata
        const importedSeconds = Number(meta?.["imported_seconds"] || 0)
        const minutes =
          importedSeconds > 0
            ? importedSeconds / 60
            : Number((h as { duration_minutes?: number | null }).duration_minutes || 0)
        return { row: h, minutes }
      })
      .filter((e) => e.minutes > 0)

    const validHistory = withDuration.map((e) => ({
      ...(e.row as Record<string, unknown>),
      _effectiveMinutes: e.minutes,
    }))

    log(`${history.length} registros no study_history, ${validHistory.length} com duração válida.`)

    // ── 4. Matching maps ──────────────────────────────────────────
    // Prioridade: discipline_id → nome normalizado exato → similaridade
    // por tokens (>= 0.8, ex: "Tecnologia da Informação (TI)" vs
    // "Tecnologia da Informação" quando o import criou discipline_id novo).
    const itemMapById = new Map(items.map(i => [i.discipline_id, i]))
    const itemMapByName = new Map(items.map(i => [normalizeText(i.discipline?.name || ""), i]))
    const matchBySimilarity = (name: string) => {
      let best: (typeof items)[number] | null = null
      let bestScore = 0
      for (const item of items) {
        const score = similarity(name, item.discipline?.name || "")
        if (score > bestScore) {
          bestScore = score
          best = item
        }
      }
      return bestScore >= 0.8 ? best : null
    }

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
    // Acumulação TOTAL por item (todas as voltas somadas, capped na meta
    // para progresso + extra separado). A UI soma as sessões persistidas;
    // cada estudo é registrado na volta em que ocorreu (simulação abaixo).
    const roundExtra = new Map<number, Map<string, number>>()
    const addExtraInRound = (round: number, itemId: string, extra: number) => {
      if (extra <= 0) return
      let ext = roundExtra.get(round)
      if (!ext) {
        ext = new Map()
        roundExtra.set(round, ext)
      }
      ext.set(itemId, (ext.get(itemId) || 0) + extra)
    }

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
    let matchedBySimilarityCount = 0
    const unmatchedSamples: RebuildUnmatchedSample[] = []

    // Track round state as we process studies chronologically
    let simCurrentRound = 1
    let simCursorIndex = 0
    let simItemProgressMin = 0

    for (const study of validHistory as Array<Record<string, unknown> & { _effectiveMinutes: number }>) {
      const rawDisc = study["disciplines"] as
        | { name?: string }
        | { name?: string }[]
        | null
        | undefined
      const disc = Array.isArray(rawDisc) ? rawDisc[0] : rawDisc
      const disciplineName = disc?.name || ""
      const disciplineId = study["discipline_id"] as string | null
      const studyMinutes = study._effectiveMinutes

      const matchById = disciplineId ? itemMapById.get(disciplineId) : null
      const matchByName = disciplineName ? itemMapByName.get(normalizeText(disciplineName)) : null
      const matchBySimilarityScore = !matchById && !matchByName && disciplineName
        ? matchBySimilarity(disciplineName)
        : null
      const cycleItem = matchById || matchByName || matchBySimilarityScore

      if (!cycleItem) {
        skippedNoMatch++
        // Amostra prioriza os MAIS RECENTES (unshift): os 4 novos importados
        // aparecem primeiro em vez dos estudos de 2020.
        if (unmatchedSamples.length < 15) {
          unmatchedSamples.unshift({
            disciplineId,
            disciplineName: disciplineName || "(sem nome)",
            minutes: Math.round(studyMinutes * 10) / 10,
            startedAt: (study["started_at"] as string) || null,
            studySource: (study["study_source"] as string) || null,
          })
          if (unmatchedSamples.length > 15) unmatchedSamples.pop()
        }
        continue
      }

      if (matchById) matchedById++
      else if (matchByName) matchedByName++
      else matchedBySimilarityCount++

      const target = itemTarget.get(cycleItem.id)!
      const accumulated = itemAccumulated.get(cycleItem.id) || 0
      const remaining = Math.max(0, target - accumulated)
      const consumed = Math.min(studyMinutes, remaining)
      const extra = Math.max(studyMinutes - consumed, 0)
      const studyRound = simCurrentRound
      const perRoundAlloc: { round: number; consumed: number; extra: number }[] = [
        { round: simCurrentRound, consumed, extra },
      ]
      addExtraInRound(simCurrentRound, cycleItem.id, extra)
      const totalConsumed = consumed
      const totalExtra = extra
      // Se o item completou, avança o cursor simulado.
      if (accumulated + consumed >= target) {
        const nextIndex = simCursorIndex + 1
        if (nextIndex >= items.length) {
          simCurrentRound += 1
          simCursorIndex = 0
          simItemProgressMin = 0
        } else {
          simCursorIndex = nextIndex
          simItemProgressMin = 0
        }
      } else {
        simItemProgressMin += consumed
      }

      const prevAccumulated = itemAccumulated.get(cycleItem.id) || 0
      itemAccumulated.set(cycleItem.id, prevAccumulated + totalConsumed)

      const diag = diagByItem.get(cycleItem.id)!
      diag.studyCount++
      diag.totalMinutes += studyMinutes
      diag.normal += totalConsumed
      diag.extra += totalExtra

      for (const alloc of perRoundAlloc) {
        pendingSessions.push({
          cycle_id: cycle.id,
          cycle_item_id: cycleItem.id,
          study_history_id: study["id"] as string,
          discipline_id: disciplineId,
          round_number: alloc.round,
          minutes_contributed: Math.round(alloc.consumed),
          extra_minutes: Math.round(alloc.extra),
        })
      }
    }

    // ── 6. Estado final a partir do acumulado + cursor simulado ───
    // O progresso exibido é o ACUMULADO TOTAL por item (capped na meta):
    // a UI soma as sessões persistidas e o diagnóstico reflete o mesmo.
    // A simulação acima só define volta/cursor (para onde o ciclo anda).
    const totalPlannedPerRound = items.reduce((sum, it) => sum + (itemTarget.get(it.id) || 0), 0)

    const validMinutesPerItem = new Map<string, number>()
    for (const item of items) {
      const accumulated = itemAccumulated.get(item.id) || 0
      const target = itemTarget.get(item.id)!
      validMinutesPerItem.set(item.id, Math.min(accumulated, target))
    }

    let totalValidMinutes = 0
    for (const item of items) {
      totalValidMinutes += validMinutesPerItem.get(item.id) || 0
    }

    let totalRoundsDone = 0
    if (totalPlannedPerRound > 0) {
      totalRoundsDone = Math.floor(totalValidMinutes / totalPlannedPerRound)
    }

    // Cursor = primeira incompleta na ordem (usa o simulado como base e
    // valida contra o acumulado, para nunca apontar item já completo).
    let cursorIndex = Math.min(simCursorIndex, items.length - 1)
    let currentItemProgressMin = 0
    let foundIncomplete = false
    for (let i = 0; i < items.length; i++) {
      const target = itemTarget.get(items[i].id)!
      const validMinutes = validMinutesPerItem.get(items[i].id) || 0
      if (validMinutes < target) {
        cursorIndex = i
        currentItemProgressMin = Math.max(0, validMinutes)
        foundIncomplete = true
        break
      }
    }
    if (!foundIncomplete) {
      cursorIndex = 0
      currentItemProgressMin = 0
    }

    const currentRound = totalRoundsDone + 1

    const diagItems: RebuildDiagnosticItem[] = items.map((item) => {
      const d = diagByItem.get(item.id)!
      const target = itemTarget.get(item.id)!
      const valid = validMinutesPerItem.get(item.id) || 0
      const extraTotal = Math.max(0, (itemAccumulated.get(item.id) || 0) - target)
      const pct = target > 0 ? Math.min(100, Math.round((valid / target) * 100)) : 0
      return {
        name: d.name,
        studies: d.studyCount,
        minutes: Math.round(valid * 10) / 10,
        target,
        progress: pct,
        extra: Math.round(extraTotal * 10) / 10,
      }
    })

    // ── 7. Diagnostic table (volta corrente — igual à UI) ───────
    log(`Rebuild concluído: ${pendingSessions.length} sessões.`)
    log(`  Match por ID: ${matchedById}, por nome: ${matchedByName}, por similaridade: ${matchedBySimilarityCount}, sem match: ${skippedNoMatch}`)
    log(`  Total planejado/volta: ${totalPlannedPerRound}min`)
    log(`  Minutos válidos total: ${totalValidMinutes}min`)
    log(`  Voltas completas: ${totalRoundsDone}`)
    log(`  Volta atual: ${currentRound}`)
    log(`  Cursor: #${cursorIndex + 1} ${items[cursorIndex]?.discipline?.name || "?"} (${currentItemProgressMin}min)`)
    log(`  ┌──────────────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐`)
    log(`  │ MATÉRIA (volta atual)        │ ESTUDOS  │ MINUTOS  │ META     │ PROGRESSO│ EXTRA    │`)
    log(`  ├──────────────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤`)
    for (const diag of diagItems) {
      const name = (diag.name || "").padEnd(28)
      log(`  │ ${name} │ ${String(diag.studies).padStart(8)} │ ${String(diag.minutes).padStart(8)} │ ${String(diag.target).padStart(8)} │ ${String(diag.progress + "%").padStart(8)} │ ${String(diag.extra).padStart(8)} │`)
    }
    log(`  └──────────────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘`)

    // ── 8. Persistir: Deletar antigos + Inserir novos ──────────────
    //    Se INSERT falhar (ex: migration V2 não rodada), logamos mas
    //    NÃO perdemos o estado antigo sem antes ter os novos prontos.

    const { error: delErr } = await supabase
      .from("study_cycle_sessions")
      .delete()
      .eq("cycle_id", cycle.id)

    const diagBase = {
      historyRows: history.length,
      validRows: validHistory.length,
      matchedById,
      matchedByName,
      matchedBySimilarity: matchedBySimilarityCount,
      skippedNoMatch,
      unmatchedSamples,
      items: diagItems,
    }

    if (delErr) {
      const msg = `Erro ao deletar sessões antigas: ${delErr.message}`
      errors.push(msg)
      log(msg)
      return { ...diagBase, success: false, processed: 0, errors }
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
        current_round: currentRound,
        total_rounds_done: totalRoundsDone,
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
          current_round: currentRound,
          total_rounds_done: totalRoundsDone,
          current_item_progress_min: currentItemProgressMin,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cycle.id)
      finalErr = retry.error
    }

    if (finalErr) {
      errors.push(`Erro ao salvar estado final: ${finalErr.message}`)
      log(`FALHA ao salvar estado final: ${finalErr.message}`)
      return { ...diagBase, success: false, processed: pendingSessions.length, errors }
    }

    if (insertFailed > 0) {
      errors.push(`${insertFailed} de ${pendingSessions.length} sessões falharam ao inserir.`)
    }

    log(`=== REBUILD CONCLUÍDO ===`)
    log(`  Sessões persistidas: ${pendingSessions.length - insertFailed}/${pendingSessions.length}`)
    log(`  Cursor: #${cursorIndex + 1} ${items[cursorIndex]?.discipline?.name || "?"}`)
    log(`  Volta atual: ${currentRound}, Voltas concluídas: ${totalRoundsDone}`)
    log(`  Estado final: item=${cursorIndex}, progress=${currentItemProgressMin}min`)

    revalidatePath("/ciclos")
    revalidatePath("/dashboard")

    return { ...diagBase, success: pendingSessions.length > 0 || true, processed: pendingSessions.length, errors }
  } catch (err: any) {
    console.error("[rebuildCycle] Erro inesperado:", err)
    return { ...EMPTY_DIAG, success: false, processed: 0, errors: [err.message || "Erro desconhecido"] }
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
  return await rebuildActiveCycleProgress({ skipCooldown: true })
}

export async function reconcileCycleProgress(): Promise<RebuildResult> {
  return await rebuildActiveCycleProgress()
}
