"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import { detectStudyType, studyTypeToSource } from "@/features/importacao/lib/study-map"
import type { StudySource, StudyType } from "@/domain/study-history/study-history.types"
import type { ImportChunkResult, ImportedStudyRecord, ImportPreviewResult } from "@/features/importacao/lib/types"
import {
  compactToRecords,
  type CompactRecord,
  type SubjectImportConfig,
  type SubjectImportMap,
} from "@/features/importacao/lib/import-contract"
import {
  normalizeOrigin,
  type ImportOrigin,
} from "@/features/importacao/lib/origin"
import { normalizeText } from "@/features/importacao/lib/subject-matcher"
import type { OriginSource } from "@/domain/study-history/study-history.types"

type Supabase = Awaited<ReturnType<typeof createClient>>

const MAX_RECORDS_PER_CHUNK = 400
const MAX_HISTORY_ROWS_FOR_DEDUPE = 50_000

function fingerprint(
  epochSeconds: string,
  disciplineId: string,
  durationMinutes: string,
  questions: string,
  correct: string,
  origin: string,
): string {
  return `v2|${epochSeconds}|${disciplineId}|${durationMinutes}|${questions}|${correct}|${origin}`
}

function recordFingerprint(record: ImportedStudyRecord, disciplineId: string | null, origin: string): string | null {
  if (!record.startAt) return null
  const epoch = Math.floor(new Date(record.startAt).getTime() / 1000)
  const minutes = record.durationSeconds !== null ? Math.round(record.durationSeconds / 60) : null
  return fingerprint(
    String(epoch),
    disciplineId ?? "",
    minutes !== null ? String(minutes) : "",
    record.questions !== null ? String(record.questions) : "",
    record.correctAnswers !== null ? String(record.correctAnswers) : "",
    origin,
  )
}

async function loadExistingFingerprints(supabase: Supabase, userId: string): Promise<Set<string>> {
  const set = new Set<string>()
  let offset = 0
  const pageSize = 1000
  while (offset < MAX_HISTORY_ROWS_FOR_DEDUPE) {
    const { data, error } = await supabase
      .from("study_history")
      .select("started_at, discipline_id, duration_minutes, metadata, origin_source")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) break
    if (!data || data.length === 0) break

    for (const row of data) {
      const metadata = row.metadata as Record<string, unknown> | null
      const epoch = row.started_at ? Math.floor(new Date(row.started_at).getTime() / 1000) : null
      if (epoch === null) continue
      set.add(
        fingerprint(
          String(epoch),
          row.discipline_id ?? "",
          row.duration_minutes !== null && row.duration_minutes !== undefined ? String(row.duration_minutes) : "",
          metadata?.["questions_answered"] !== undefined && metadata?.["questions_answered"] !== null ? String(metadata["questions_answered"]) : "",
          metadata?.["questions_correct"] !== undefined && metadata?.["questions_correct"] !== null ? String(metadata["questions_correct"]) : "",
          row.origin_source ?? "",
        ),
      )
    }

    if (data.length < pageSize) break
    offset += pageSize
  }
  return set
}

async function findDisciplineByNormalizedName(supabase: Supabase, name: string): Promise<{ id: string } | null> {
  const normalized = normalizeText(name)
  if (!normalized) return null
  const { data } = await supabase.from("disciplines").select("id, name").limit(500)
  for (const row of data ?? []) {
    if (normalizeText(String(row.name)) === normalized) return { id: row.id }
  }
  return null
}

async function resolveSubjectDisciplineId(
  supabase: Supabase,
  subjectName: string,
  config: SubjectImportConfig,
  createIfMissing: boolean,
): Promise<{ disciplineId: string | null; created: boolean; error: string | null }> {
  if (config.mode === "ignore") return { disciplineId: null, created: false, error: null }

  if (config.mode === "existing" && config.disciplineId) {
    const { data, error } = await supabase
      .from("disciplines")
      .select("id")
      .eq("id", config.disciplineId)
      .maybeSingle()
    if (error || !data) {
      return { disciplineId: null, created: false, error: `Disciplina não encontrada: ${subjectName}` }
    }
    return { disciplineId: data.id, created: false, error: null }
  }

  if (config.mode === "create" && createIfMissing) {
    const trimmed = subjectName.trim()
    const { data: existing } = await supabase
      .from("disciplines")
      .select("id")
      .ilike("name", trimmed)
      .maybeSingle()
    if (existing) return { disciplineId: existing.id, created: false, error: null }

    const normalizedMatch = await findDisciplineByNormalizedName(supabase, trimmed)
    if (normalizedMatch) return { disciplineId: normalizedMatch.id, created: false, error: null }

    const { data: inserted, error } = await supabase
      .from("disciplines")
      .insert({ name: trimmed, area: "Geral" })
      .select("id")
      .single()
    if (!error && inserted) return { disciplineId: inserted.id, created: true, error: null }

    const { data: retry } = await supabase
      .from("disciplines")
      .select("id")
      .ilike("name", trimmed)
      .maybeSingle()
    if (retry) return { disciplineId: retry.id, created: false, error: null }
    return { disciplineId: null, created: false, error: `Não foi possível criar a disciplina "${subjectName}": ${error?.message ?? "erro desconhecido"}` }
  }

  if (config.mode === "create" && !createIfMissing) {
    const trimmed = subjectName.trim()
    const { data: existing } = await supabase
      .from("disciplines")
      .select("id")
      .ilike("name", trimmed)
      .maybeSingle()
    if (existing) return { disciplineId: existing.id, created: false, error: null }
    const normalizedMatch = await findDisciplineByNormalizedName(supabase, trimmed)
    if (normalizedMatch) return { disciplineId: normalizedMatch.id, created: false, error: null }
    return { disciplineId: `__new__:${trimmed}`, created: true, error: null }
  }

  return { disciplineId: null, created: false, error: null }
}

export async function listDisciplinesForImportAction() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const { data, error } = await supabase
      .from("disciplines")
      .select("id, name, area")
      .order("name")
      .limit(500)
    if (error) return { data: null, error: error.message }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: (err as { message?: string }).message }
  }
}

const ALLOWED_ORIGIN_SOURCES: OriginSource[] = ["aprovado", "estudei", "outra", "gran", "tec", "qconcursos"]

function validateOriginPayload(origin: ImportOrigin | null): ImportOrigin | null {
  if (!origin || typeof origin !== "object") return null
  if (!ALLOWED_ORIGIN_SOURCES.includes(origin.source as OriginSource)) return null
  const normalized = normalizeOrigin(origin.source as OriginSource, origin.sourceName ?? "")
  return normalized
}

/**
 * Abre um lote de importação e persiste a origem da plataforma.
 * Retorna o id do lote, que identifica a importação nas sessões gravadas.
 */
export async function beginImportAction(
  origin: ImportOrigin,
  fileName: string | null,
  totalRows: number,
): Promise<{ success: boolean; importId?: string; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const normalized = validateOriginPayload(origin)
    if (!normalized) return { success: false, error: "Selecione a plataforma de origem." }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data: batch, error } = await supabase
      .from("study_imports")
      .insert({
        user_id: user.id,
        source: normalized.source,
        source_name: normalized.sourceName,
        file_name: fileName ? fileName.slice(0, 200) : null,
        total_rows: Number.isFinite(totalRows) ? Math.max(0, Math.floor(totalRows)) : 0,
      })
      .select("id")
      .single()

    if (error || !batch) return { success: false, error: `Erro ao registrar origem: ${error?.message ?? "desconhecido"}` }
    return { success: true, importId: batch.id }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro desconhecido." }
  }
}

/**
 * Prévia: calcula quantos registros serão novos, duplicados ou inválidos,
 * resolvendo disciplinas (sem criar nada).
 */
export async function previewImportAction(
  records: CompactRecord[],
  subjectMap: SubjectImportMap,
  origin: ImportOrigin,
): Promise<{ success: boolean; result?: ImportPreviewResult; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const normalized = validateOriginPayload(origin)
    if (!normalized) return { success: false, error: "Selecione a plataforma de origem." }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const parsed = compactToRecords(records)
    const existingSet = await loadExistingFingerprints(supabase, user.id)

    const resolutionCache = new Map<string, string | null>()
    const seenInRun = new Set<string>()
    let newCount = 0
    let duplicateCount = 0
    let errorCount = 0
    let ignoredCount = 0
    const errors: string[] = []

    for (const record of parsed) {
      if (!record.startAt) {
        errorCount++
        continue
      }

      if (!record.subjectName) {
        errorCount++
        errors.push(`Registro sem disciplina em ${record.startAt} — será ignorado.`)
        continue
      }

      const config = subjectMap[record.subjectName] ?? { mode: "ignore" }
      if (config.mode === "ignore") {
        ignoredCount++
        continue
      }

      let disciplineId = resolutionCache.get(record.subjectName)
      if (disciplineId === undefined) {
        const resolved = await resolveSubjectDisciplineId(supabase, record.subjectName, config, false)
        if (resolved.error) {
          errors.push(resolved.error)
          disciplineId = null
        } else {
          disciplineId = resolved.disciplineId
        }
        resolutionCache.set(record.subjectName, disciplineId)
      }
      if (disciplineId === null) {
        errorCount++
        continue
      }

      const finalFp = recordFingerprint(record, disciplineId, normalized.source)
      if (!finalFp) {
        errorCount++
        continue
      }

      if (existingSet.has(finalFp) || seenInRun.has(finalFp)) {
        duplicateCount++
        seenInRun.add(finalFp)
      } else {
        newCount++
        seenInRun.add(finalFp)
      }
    }

    return { success: true, result: { newCount, duplicateCount, errorCount, ignoredCount, errors } }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro desconhecido." }
  }
}

/**
 * Importa um lote de registros (<= MAX_RECORDS_PER_CHUNK). Cria disciplinas
 * pendentes ("create"), deduplica contra o histórico existente e o próprio lote,
 * e vincula as disciplinas ao usuário. A origem vem do lote (study_imports).
 */
export async function importHistoryChunkAction(
  records: CompactRecord[],
  subjectMap: SubjectImportMap,
  importId: string,
): Promise<{ success: boolean; result?: ImportChunkResult; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    if (typeof importId !== "string" || !importId) {
      return { success: false, error: "Importação não identificada." }
    }

    const { data: batch, error: batchError } = await supabase
      .from("study_imports")
      .select("id, source, source_name, created_at")
      .eq("id", importId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (batchError || !batch) {
      return { success: false, error: "Importação não encontrada ou não pertence ao usuário." }
    }

    const parsed = compactToRecords(records).slice(0, MAX_RECORDS_PER_CHUNK)
    const existingSet = await loadExistingFingerprints(supabase, user.id)
    const seenInRun = new Set<string>()
    const resolutionCache = new Map<string, { disciplineId: string | null; created: boolean }>()

    const rows: Record<string, unknown>[] = []
    const usedDisciplineIds = new Set<string>()
    const createdSubjects = new Set<string>()
    const errorDetails: string[] = []
    let duplicates = 0

    for (const record of parsed) {
      if (!record.startAt || !record.subjectName) {
        errorDetails.push(record.startAt ? "Registro sem disciplina" : "Registro sem data")
        continue
      }

      let resolution = resolutionCache.get(record.subjectName)
      if (!resolution) {
        const config = subjectMap[record.subjectName] ?? { mode: "ignore" }
        const resolved = await resolveSubjectDisciplineId(supabase, record.subjectName, config, true)
        resolution = { disciplineId: resolved.disciplineId, created: resolved.created }
        if (resolved.error) {
          errorDetails.push(resolved.error)
          continue
        }
        resolutionCache.set(record.subjectName, resolution)
      }

      const disciplineId = resolution.disciplineId
      if (disciplineId === null) {
        continue
      }

      const realDisciplineId = disciplineId.startsWith("__new__:")
        ? disciplineId.slice("__new__:".length)
        : disciplineId

      const finalFp = recordFingerprint(record, realDisciplineId, batch.source)
      if (!finalFp) {
        errorDetails.push("Fingerprint inválido")
        continue
      }
      if (existingSet.has(finalFp) || seenInRun.has(finalFp)) {
        duplicates++
        continue
      }
      seenInRun.add(finalFp)

      const durationMinutes =
        record.durationSeconds !== null ? Math.round(record.durationSeconds / 60) : null
      const detectedType: StudyType | null = detectStudyType(record.studyType)
      const studySource: StudySource = studyTypeToSource(detectedType)

      rows.push({
        user_id: user.id,
        discipline_id: realDisciplineId,
        study_source: studySource,
        study_type: detectedType,
        technique: null,
        started_at: record.startAt,
        finished_at: null,
        duration_minutes: durationMinutes,
        active_minutes: durationMinutes,
        paused_minutes: null,
        planned_minutes: null,
        completed: true,
        interrupted: false,
        notes: record.notes,
        origin_source: batch.source,
        origin_source_name: batch.source_name,
        origin_imported_at: batch.created_at,
        import_batch_id: importId,
        metadata: {
          importer: "1.0",
          imported_seconds: record.durationSeconds,
          imported_topic: record.topicName,
          questions_answered: record.questions,
          questions_correct: record.correctAnswers,
        },
      })

      usedDisciplineIds.add(realDisciplineId)
      if (resolution.created) createdSubjects.add(record.subjectName.trim())
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("study_history").insert(rows)
      if (error) {
        return { success: false, error: `Erro ao gravar histórico: ${error.message}` }
      }
    }

    if (usedDisciplineIds.size > 0) {
      const { error: linkError } = await supabase.from("user_disciplines").upsert(
        [...usedDisciplineIds].map((disciplineId) => ({
          user_id: user.id,
          target_id: null,
          discipline_id: disciplineId,
          status: "NOT_STARTED",
        })),
        { onConflict: "user_id,target_id,discipline_id", ignoreDuplicates: true },
      )
      if (linkError) {
        return { success: false, error: `Erro ao vincular disciplinas: ${linkError.message}` }
      }
    }

    revalidatePath("/dashboard/history")

    return {
      success: true,
      result: {
        imported: rows.length,
        duplicates,
        errors: errorDetails.length,
        createdSubjects: [...createdSubjects],
        errorDetails,
      },
    }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro desconhecido." }
  }
}

export interface ImportBatchItem {
  id: string
  source: string
  sourceName: string
  fileName: string | null
  totalRows: number
  sessionCount: number
  createdAt: string
}

/**
 * Lista as importações do usuário autenticado com a contagem real de sessões
 * de cada lote (somente sessões importadas do próprio usuário).
 */
export async function listImportsAction(): Promise<{ success: boolean; data?: ImportBatchItem[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data: batches, error } = await supabase
      .from("study_imports")
      .select("id, source, source_name, file_name, total_rows, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) return { success: false, error: error.message }

    const items: ImportBatchItem[] = []
    for (const batch of batches ?? []) {
      const { count } = await supabase
        .from("study_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("import_batch_id", batch.id)
      items.push({
        id: batch.id,
        source: batch.source,
        sourceName: batch.source_name,
        fileName: batch.file_name,
        totalRows: batch.total_rows,
        sessionCount: count ?? 0,
        createdAt: batch.created_at,
      })
    }
    return { success: true, data: items }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro desconhecido." }
  }
}

const IMPORT_REVALIDATE_PATHS = [
  "/dashboard/history",
  "/dashboard",
  "/dashboard/analytics",
  "/estatisticas",
  "/ranking",
  "/planejamento",
]

/**
 * Exclui UM lote de importação e todas as suas sessões do usuário autenticado.
 * Sessões criadas manualmente ou de outros usuários nunca são tocadas (RLS).
 */
export async function deleteImportBatchAction(
  importId: string,
): Promise<{ success: boolean; deleted?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }
    if (typeof importId !== "string" || !importId) {
      return { success: false, error: "Importação não identificada." }
    }

    const { data: batch } = await supabase
      .from("study_imports")
      .select("id")
      .eq("id", importId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!batch) return { success: false, error: "Importação não encontrada." }

    const { count: existing } = await supabase
      .from("study_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("import_batch_id", importId)

    const { count, error: deleteError } = await supabase
      .from("study_history")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .eq("import_batch_id", importId)
    if (deleteError) return { success: false, error: deleteError.message }

    // RLS bloqueia DELETE silenciosamente: se havia sessões e nenhuma foi apagada,
    // algo está errado (policy de DELETE ausente) — avisar em vez de fingir sucesso.
    if ((existing ?? 0) > 0 && (count ?? 0) === 0) {
      return {
        success: false,
        error: "A exclusão foi bloqueada pelo banco (permissão ausente). Execute a migration docs/ensure-import-delete.sql.",
      }
    }

    const { error: batchError } = await supabase
      .from("study_imports")
      .delete()
      .eq("id", importId)
      .eq("user_id", user.id)
    if (batchError) return { success: false, error: batchError.message }

    for (const path of IMPORT_REVALIDATE_PATHS) revalidatePath(path)
    return { success: true, deleted: count ?? 0 }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro desconhecido." }
  }
}

/**
 * Exclui TODAS as sessões importadas do usuário autenticado (e os lotes),
 * preservando estudos manuais, do cronômetro, planejamento e outros usuários.
 */
export async function deleteAllImportedAction(): Promise<{ success: boolean; deleted?: number; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { count: existing } = await supabase
      .from("study_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("import_batch_id", "is", null)

    const { count, error: deleteError } = await supabase
      .from("study_history")
      .delete({ count: "exact" })
      .eq("user_id", user.id)
      .not("import_batch_id", "is", null)
    if (deleteError) return { success: false, error: deleteError.message }

    if ((existing ?? 0) > 0 && (count ?? 0) === 0) {
      return {
        success: false,
        error: "A exclusão foi bloqueada pelo banco (permissão ausente). Execute a migration docs/ensure-import-delete.sql.",
      }
    }

    const { error: batchError } = await supabase
      .from("study_imports")
      .delete()
      .eq("user_id", user.id)
    if (batchError) return { success: false, error: batchError.message }

    for (const path of IMPORT_REVALIDATE_PATHS) revalidatePath(path)
    return { success: true, deleted: count ?? 0 }
  } catch (err) {
    return { success: false, error: (err as { message?: string }).message ?? "Erro desconhecido." }
  }
}
