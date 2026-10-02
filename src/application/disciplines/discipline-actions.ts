"use server"

import { revalidatePath } from "next/cache"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

import { getEffectiveUserId, requireAdmin } from "@/application/admin/auth-guard"
import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import { getCatalogTopicsByDiscipline } from "@/application/topic-catalog/topic-catalog.service"
import { type CatalogTopicWithSubTopics } from "@/domain/topic-catalog/topic-catalog.types"
import {
  canonicalDisciplineKey,
  isValidDisciplineColorHex,
  isValidDisciplineDisplayName,
  normalizeDisciplineColorHex,
  normalizeDisciplineDisplay,
} from "@/domain/disciplines/discipline-naming"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

interface DisciplineRef {
  id: string
  name: string
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error)
  return message.includes(column) || message.includes("column") || message.includes("schema cache")
}

/**
 * G1.1 (G-27) — resolução única de disciplina global por nome.
 * 1) igualdade em `name_key` (pós-migration, indexada, sem limite de página);
 * 2) compatibilidade: varredura canônica em memória (cobre linhas com
 *    `name_key` ainda nulo e o período pré-migration).
 * Nunca cria duplicata por caixa/espaço/hífen/acento no caminho novo.
 */
async function findDisciplineByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawName: string,
): Promise<DisciplineRef | null> {
  const display = normalizeDisciplineDisplay(rawName)
  if (!display) return null
  const key = canonicalDisciplineKey(display)

  try {
    const { data, error } = await supabase
      .from("disciplines")
      .select("id, name")
      .eq("name_key", key)
      .maybeSingle()
    if (!error && data) return data as DisciplineRef
    if (error && !isMissingColumnError(error, "name_key")) {
      console.error("[findDisciplineByName] name_key lookup falhou:", error)
    }
  } catch {
    // Coluna ainda não existe (migration G1.1 pendente) → legado abaixo.
  }

  // Legado: igualdade exata case-insensitive + comparação canônica em memória
  // sobre a página (evita duplicar "Direito-Penal" vs "Direito Penal").
  const { data: exact } = await supabase
    .from("disciplines")
    .select("id, name")
    .ilike("name", display)
    .order("name")
    .order("id")
    .limit(1)
    .maybeSingle()
  if (exact) return exact as DisciplineRef

  const { data: candidates } = await supabase
    .from("disciplines")
    .select("id, name")
    .order("name")
    .limit(500)
  const found = (candidates ?? []).find(
    (d) => canonicalDisciplineKey((d as DisciplineRef).name) === key,
  )
  return (found as DisciplineRef | undefined) ?? null
}

/**
 * G1.1 (G-02/G-17) — cria a linha global quando o nome canônico é genuinamente
 * novo. Inclui `name_key` quando a coluna existe (dedupe no banco via UNIQUE);
 * se a coluna ainda não existir, insere sem ela (compatibilidade).
 */
async function insertGlobalDiscipline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  displayName: string,
): Promise<DisciplineRef | null> {
  const key = canonicalDisciplineKey(displayName)
  const color = await pickNextDisciplineColor(supabase)
  const base: Record<string, unknown> = {
    name: displayName,
    area: "Geral",
    ...(color ? { color_hex: color } : {}),
  }

  const withKey = await supabase
    .from("disciplines")
    .insert({ ...base, name_key: key })
    .select("id, name")
    .maybeSingle()
  if (!withKey.error && withKey.data) return withKey.data as DisciplineRef
  if (withKey.error && !isMissingColumnError(withKey.error, "name_key")) {
    // UNIQUE violado por corrida (outro request criou primeiro) → resolve.
    const existing = await findDisciplineByName(supabase, displayName)
    if (existing) return existing
    console.error("[insertGlobalDiscipline] insert falhou:", withKey.error)
    return null
  }

  const legacy = await supabase.from("disciplines").insert(base).select("id, name").maybeSingle()
  if (!legacy.error && legacy.data) return legacy.data as DisciplineRef
  // Corrida no caminho legado: alguém criou entre o resolve e o insert.
  const existing = await findDisciplineByName(supabase, displayName)
  return existing
}

// Busca os tópicos do catálogo (com subtópicos) de uma disciplina por nome
export async function getDisciplineCatalogTopicsAction(
  disciplineName: string,
): Promise<{ success: boolean; topics: CatalogTopicWithSubTopics[]; error?: string }> {
  if (isMaintenanceMode())
    return { success: false, error: "Sistema temporariamente indisponível.", topics: [] }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId) return { success: false, error: "Não autenticado.", topics: [] }

    // G1.1 (G-27): resolução canônica (name_key primeiro, legado depois).
    const discipline = await findDisciplineByName(supabase, disciplineName)
    if (!discipline) return { success: true, topics: [] }

    const topics = await getCatalogTopicsByDiscipline(supabase, discipline.id)
    return { success: true, topics }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message, topics: [] }
  }
}

export interface DisciplineDetailStats {
  minutes: number
  questionsAnswered: number
  correct: number
  pagesRead: number
}

// Métricas reais de uma disciplina: tempo estudado (study_history), questões
// respondidas/corretas (question_attempts) e páginas lidas (metadata). Tudo
// agregado por discipline_id; retorna null se a disciplina não existir.
export async function getDisciplineDetailStatsAction(
  disciplineName: string,
): Promise<{ success: boolean; data: DisciplineDetailStats | null; error?: string }> {
  if (isMaintenanceMode())
    return { success: false, error: "Sistema temporariamente indisponível.", data: null }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId) return { success: false, error: "Não autenticado.", data: null }

    // G1.1 (G-27): resolução canônica (name_key primeiro, legado depois).
    const disc = await findDisciplineByName(supabase, disciplineName)
    if (!disc) return { success: true, data: null }
    const discId = disc.id

    // Fase F.1: paginados (antes 1 requisição cada, cortada em 1.000 linhas).
    // Mesmo formato { data } de antes; erro → data null.
    const [historyRes, attemptsRes] = await Promise.all([
      fetchAllRowsPaged<{ duration_minutes: number | null; metadata: Record<string, unknown> | null }>(
        (withCount) =>
          supabase
            .from("study_history")
            .select("duration_minutes, metadata", countOption(withCount))
            .eq("user_id", effectiveUserId)
            .eq("discipline_id", discId),
        [{ column: "id", ascending: true }],
      ).then(({ data, error }) => ({ data: error ? null : data })),
      fetchAllRowsPaged<{ correct: boolean }>(
        (withCount) =>
          supabase
            .from("question_attempts")
            .select("correct", countOption(withCount))
            .eq("user_id", effectiveUserId)
            .eq("discipline_id", discId),
        [{ column: "id", ascending: true }],
      ).then(({ data, error }) => ({ data: error ? null : data })),
    ])

    let minutes = 0
    let pagesRead = 0
    for (const row of historyRes.data ?? []) {
      minutes += Number(row.duration_minutes) || 0
      const meta = (row.metadata ?? {}) as Record<string, unknown>
      pagesRead += Number(meta["pages_read"]) || 0
    }

    const attempts = attemptsRes.data ?? []
    const correct = attempts.filter((a: { correct: boolean }) => a.correct).length

    return {
      success: true,
      data: { minutes, questionsAnswered: attempts.length, correct, pagesRead },
    }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message, data: null }
  }
}

export async function addUserDisciplineAction(name: string) {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "ADD_USER_DISCIPLINE" })
    if (!effectiveUserId) return { success: false, error: "Não autenticado." }

    const { data: target } = await supabase
      .from("user_targets")
      .select("id")
      .eq("user_id", effectiveUserId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    // G1.1 (G-17/G-27): nome validado + resolução canônica. Cria a linha
    // global SOMENTE quando o nome canônico é genuinamente novo (sem
    // duplicar por caixa/espaço/hífen/acento); o vínculo pessoal vai para
    // `user_disciplines` (nunca se escreve preferência aqui).
    if (!isValidDisciplineDisplayName(name)) {
      return { success: false, error: "Nome de disciplina inválido." }
    }
    const displayName = normalizeDisciplineDisplay(name)

    let disc = await findDisciplineByName(supabase, displayName)

    if (!disc) {
      disc = await insertGlobalDiscipline(supabase, displayName)
    }

    if (!disc) return { success: false, error: "Erro ao cadastrar disciplina." }

    const { error } = await supabase.from("user_disciplines").upsert(
      {
        user_id: effectiveUserId,
        target_id: target?.id || null,
        discipline_id: disc.id,
        status: "STUDYING",
      },
      { onConflict: "user_id,target_id,discipline_id", ignoreDuplicates: true },
    )

    if (error) return { success: false, error: error.message }

    revalidatePath("/disciplines")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message }
  }
}

export async function removeUserDisciplineAction(id: string) {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "REMOVE_USER_DISCIPLINE", resource: id })
    if (!effectiveUserId) return { success: false, error: "Não autenticado." }

    const { error } = await supabase
      .from("user_disciplines")
      .delete()
      .eq("id", id)
      .eq("user_id", effectiveUserId)

    if (error) return { success: false, error: error.message }

    revalidatePath("/disciplines")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro ao remover."
    return { success: false, error: message }
  }
}

/**
 * G1.1 (G-02) — aparência de disciplina com ownership separado.
 *
 * - ADMIN (operador real, nunca em modo suporte): escreve no CATÁLOGO GLOBAL
 *   (`disciplines`, incluindo `name_key` no rename + checagem de colisão
 *   canônica). Ato administrativo.
 * - DEMAIS USUÁRIOS: escrevem SOMENTE a preferência pessoal
 *   (`user_disciplines.custom_name/custom_color_hex`, RLS own). O catálogo
 *   global nunca é tocado — rename/recolor de um usuário não afeta ninguém.
 *
 * As telas preferem o valor pessoal quando presente (ver
 * `resolveUserDisciplineDisplay` em disciplines.service).
 */
export async function updateDisciplineAppearanceAction(
  disciplineId: string,
  data: { name?: string; colorHex?: string | null },
): Promise<{ success: boolean; error?: string }> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "UPDATE_DISCIPLINE_APPEARANCE", resource: disciplineId })
    if (!effectiveUserId) return { success: false, error: "Não autenticado." }

    let newName: string | undefined
    if (data.name !== undefined) {
      if (!isValidDisciplineDisplayName(data.name)) {
        return { success: false, error: "Nome de disciplina inválido." }
      }
      newName = normalizeDisciplineDisplay(data.name)
    }
    let newColor: string | null | undefined
    if (data.colorHex !== undefined) {
      if (!isValidDisciplineColorHex(data.colorHex)) {
        return { success: false, error: "Cor inválida. Use o formato #rrggbb." }
      }
      newColor = normalizeDisciplineColorHex(data.colorHex)
    }

    if (newName === undefined && newColor === undefined) return { success: true }

    // Operador REAL para a decisão administrativa (modo suporte nunca concede
    // poder de catálogo: o `role` efetivo em suporte é preservado, mas a
    // escrita global exige o admin autenticado de verdade).
    const {
      data: { user: operator },
    } = await supabase.auth.getUser()
    let isAdmin = false
    if (operator) {
      try {
        await requireAdmin(supabase, operator.id)
        isAdmin = true
      } catch {
        isAdmin = false
      }
    }

    if (isAdmin) {
      const payload: Record<string, unknown> = {}
      if (newName !== undefined) {
        // Colisão canônica: rename não pode fundir duas disciplinas.
        const collision = await findDisciplineByName(supabase, newName)
        if (collision && collision.id !== disciplineId) {
          return { success: false, error: "Já existe uma disciplina com esse nome." }
        }
        payload["name"] = newName
        payload["name_key"] = canonicalDisciplineKey(newName)
      }
      if (newColor !== undefined) payload["color_hex"] = newColor

      let { error } = await supabase.from("disciplines").update(payload).eq("id", disciplineId)

      // Compatibilidade: banco sem as colunas G1.1/color_hex — persiste o que
      // existir, sem falhar a operação inteira.
      if (error && (isMissingColumnError(error, "name_key") || String(error.message).includes("color_hex"))) {
        const retryPayload = { ...payload }
        delete retryPayload["name_key"]
        if (isMissingColumnError(error, "color_hex") || String(error.message).includes("color_hex")) {
          delete retryPayload["color_hex"]
        }
        if (Object.keys(retryPayload).length === 0) {
          error = null
        } else {
          const retry = await supabase.from("disciplines").update(retryPayload).eq("id", disciplineId)
          error = retry.error
        }
      }

      if (error) return { success: false, error: error.message }

      revalidatePath("/disciplines")
      revalidatePath("/dashboard")
      revalidatePath("/estatisticas")
      revalidatePath("/dashboard/history")

      return { success: true }
    }

    // Caminho pessoal: preferência do usuário efetivo, nunca o catálogo.
    const { data: links, error: linksError } = await supabase
      .from("user_disciplines")
      .select("id")
      .eq("user_id", effectiveUserId)
      .eq("discipline_id", disciplineId)
    if (linksError) return { success: false, error: linksError.message }
    if (!links || links.length === 0) {
      return { success: false, error: "Vínculo com a disciplina não encontrado." }
    }

    const personal: Record<string, unknown> = {}
    if (newName !== undefined) personal["custom_name"] = newName
    if (newColor !== undefined) personal["custom_color_hex"] = newColor

    const { error: personalError } = await supabase
      .from("user_disciplines")
      .update(personal)
      .eq("user_id", effectiveUserId)
      .eq("discipline_id", disciplineId)
    if (personalError) {
      if (isMissingColumnError(personalError, "custom_name") || isMissingColumnError(personalError, "custom_color_hex")) {
        return {
          success: false,
          error: "Aparência pessoal indisponível no momento (atualização do banco pendente). Tente novamente em instantes.",
        }
      }
      return { success: false, error: personalError.message }
    }

    revalidatePath("/disciplines")
    revalidatePath("/dashboard")
    revalidatePath("/estatisticas")
    revalidatePath("/dashboard/history")
    revalidatePath("/edital")

    return { success: true }
  } catch (err) {
    const message = (err as { message?: string }).message || "Erro desconhecido."
    return { success: false, error: message }
  }
}
