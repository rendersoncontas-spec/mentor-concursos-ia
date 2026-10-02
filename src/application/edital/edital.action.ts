"use server"

import { revalidatePath } from "next/cache"

import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import {
  canonicalDisciplineKey,
  isValidDisciplineDisplayName,
  normalizeDisciplineDisplay,
} from "@/domain/disciplines/discipline-naming"
import { createClient } from "@/infrastructure/supabase/server"

export async function addCustomDisciplineAction(
  name: string,
  targetId: string,
): Promise<{ success: boolean; data?: { id: string; name: string }; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    // G1.1 (G-17/G-27): nome validado + resolução canônica. A linha global só
    // é criada quando o nome canônico é genuinamente novo.
    if (!isValidDisciplineDisplayName(name)) {
      return { success: false, error: "Nome da matéria é obrigatório." }
    }
    const discName = normalizeDisciplineDisplay(name)
    const discKey = canonicalDisciplineKey(discName)

    // 1. Procurar disciplina global (name_key primeiro, legado depois)
    let d: { id: string; name: string } | null = null
    try {
      const { data, error } = await supabase
        .from("disciplines")
        .select("id, name")
        .eq("name_key", discKey)
        .maybeSingle()
      if (!error && data) d = data
    } catch {
      // Coluna ainda não existe → legado abaixo.
    }
    if (!d) {
      const { data } = await supabase
        .from("disciplines")
        .select("id, name")
        .ilike("name", discName)
        .order("name")
        .order("id")
        .limit(1)
        .maybeSingle()
      d = data ?? null
    }

    // 2. Se não existe, cria global (com cor automática da paleta central)
    if (!d) {
      const color = await pickNextDisciplineColor(supabase)
      const base = { name: discName, area: "Geral", ...(color ? { color_hex: color } : {}) }
      const withKey = await supabase
        .from("disciplines")
        .insert({ ...base, name_key: discKey })
        .select("id, name")
        .maybeSingle()
      if (!withKey.error && withKey.data) {
        d = withKey.data
      } else {
        // Coluna ausente (pré-migration) ou corrida: tenta sem name_key e
        // resolve de novo antes de desistir.
        const legacy = await supabase.from("disciplines").insert(base).select("id, name").maybeSingle()
        if (!legacy.error && legacy.data) {
          d = legacy.data
        } else {
          const { data: retry } = await supabase
            .from("disciplines")
            .select("id, name")
            .ilike("name", discName)
            .order("name")
            .order("id")
            .limit(1)
            .maybeSingle()
          d = retry ?? null
        }
      }
    }

    if (!d) return { success: false, error: "Não foi possível resolver a matéria." }

    // 3. Adicionar ao user_disciplines
    const { error: udError } = await supabase.from("user_disciplines").upsert(
      {
        user_id: user.id,
        target_id: targetId,
        discipline_id: d.id,
        status: "NOT_STARTED",
        mastery_level: 0,
      },
      { onConflict: "user_id,target_id,discipline_id", ignoreDuplicates: true },
    )

    if (udError) return { success: false, error: "Erro ao vincular matéria ao seu perfil." }

    revalidatePath("/edital")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true, data: d }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}

export async function saveCustomTopicsAction(
  targetId: string,
  disciplineId: string,
  topics: { id: string }[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    // 1. Buscar o target atual
    const { data: targetData } = await supabase
      .from("user_targets")
      .select("main_study_source")
      .eq("id", targetId)
      .eq("user_id", user.id)
      .single()

    if (!targetData) return { success: false, error: "Concurso não encontrado." }

    // 2. Fazer o parser do JSON e injetar as novas topics.
    // G1.6 (G-42): JSON corrompido NÃO pode virar `{}` e ser sobrescrito —
    // isso apagava silenciosamente examDate/examName/etc. Erro honesto.
    let meta: { customEdital?: Record<string, { id: string }[]> } = {}
    if (targetData.main_study_source) {
      if (typeof targetData.main_study_source === "object") {
        meta = { ...targetData.main_study_source }
      } else if (
        typeof targetData.main_study_source === "string" &&
        targetData.main_study_source.startsWith("{")
      ) {
        try {
          meta = JSON.parse(targetData.main_study_source)
        } catch {
          return { success: false, error: "Dados do concurso inválidos. Não foi possível salvar." }
        }
      }
    }

    if (!meta.customEdital) meta.customEdital = {}
    meta.customEdital[disciplineId] = topics

    // 3. Salvar de volta
    const { error } = await supabase
      .from("user_targets")
      .update({ main_study_source: JSON.stringify(meta) })
      .eq("id", targetId)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao salvar tópicos." }

    revalidatePath("/edital")
    return { success: true }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}

export async function searchDisciplinesAction(query: string) {
  try {
    const supabase = await createClient()
    const trimmed = query.trim()
    if (!trimmed) return { success: true, data: [] as string[] }
    // G1.1 (G-27): busca pelo display e pela chave canônica (mesma regra do
    // resolve/insert). name_key pode não existir ainda → fallback só display.
    const key = canonicalDisciplineKey(trimmed)
    // Sanitiza curingas/reservados do PostgREST antes de interpolar no .or().
    const safe = (s: string) => s.replace(/[%*,()"]/g, " ").trim()
    const safeName = safe(trimmed)
    const safeKey = safe(key)
    let rows: { name: string }[] | null = null
    try {
      const res = await supabase
        .from("disciplines")
        .select("name")
        .or(`name.ilike.%${safeName}%,name_key.ilike.%${safeKey}%`)
        .order("name")
        .order("id")
        .limit(10)
      if (!res.error) rows = res.data
    } catch {
      rows = null
    }
    if (rows === null) {
      const { data } = await supabase
        .from("disciplines")
        .select("name")
        .ilike("name", `%${trimmed}%`)
        .order("name")
        .order("id")
        .limit(10)
      rows = data ?? []
    }

    return { success: true, data: rows?.map((d) => d.name) || [] }
  } catch {
    return { success: false, data: [] }
  }
}

export async function removeDisciplineAction(
  disciplineId: string,
  targetId: string,
): Promise<{ success: boolean; error?: string; activeCyclesWithDiscipline?: number }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { error } = await supabase
      .from("user_disciplines")
      .delete()
      .eq("user_id", user.id)
      .eq("target_id", targetId)
      .eq("discipline_id", disciplineId)

    if (error) return { success: false, error: "Erro ao excluir matéria." }

    revalidatePath("/edital")
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    // DECISAO DE PRODUTO (Fase 12 -> Fase 13, opcao A): Edital e Ciclo
    // continuam desacoplados de proposito. Remover uma disciplina do Edital
    // NUNCA apaga nada em study_cycle_items/study_cycle_sessions nem toca no
    // motor de ciclos (src/application/study-cycle/**,
    // src/domain/study-cycle/** permanecem intocados) - isso é so uma
    // consulta de leitura para avisar o usuário, nunca uma ação que muda o
    // Ciclo. Falha nesta checagem não pode derrubar a exclusão, que já
    // aconteceu com sucesso acima - por isso ela é best-effort.
    let activeCyclesWithDiscipline: number | undefined
    try {
      const { data: activeCycles } = await supabase
        .from("study_cycles")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")

      if (activeCycles && activeCycles.length > 0) {
        const { data: matchingItems } = await supabase
          .from("study_cycle_items")
          .select("cycle_id")
          .eq("discipline_id", disciplineId)
          .in(
            "cycle_id",
            activeCycles.map((cycle) => cycle.id),
          )

        const distinctCycleIds = new Set((matchingItems || []).map((item) => item.cycle_id))
        activeCyclesWithDiscipline = distinctCycleIds.size
      } else {
        activeCyclesWithDiscipline = 0
      }
    } catch (warningCheckError) {
      console.error(
        "[removeDisciplineAction] falha ao verificar uso em ciclos ativos (não bloqueia a remoção):",
        warningCheckError,
      )
    }

    return {
      success: true,
      ...(activeCyclesWithDiscipline !== undefined ? { activeCyclesWithDiscipline } : {}),
    }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}

export async function removeCustomTopicAction(
  targetId: string,
  disciplineId: string,
  topicId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: "Não autenticado." }

    const { data: targetData } = await supabase
      .from("user_targets")
      .select("main_study_source")
      .eq("id", targetId)
      .eq("user_id", user.id)
      .single()

    if (!targetData) return { success: false, error: "Concurso não encontrado." }

    let meta: { customEdital?: Record<string, { id: string }[]> } = {}
    if (targetData.main_study_source) {
      if (typeof targetData.main_study_source === "object") {
        meta = { ...targetData.main_study_source }
      } else if (
        typeof targetData.main_study_source === "string" &&
        targetData.main_study_source.startsWith("{")
      ) {
        try {
          meta = JSON.parse(targetData.main_study_source)
        } catch {
          // G1.6 (G-42): mesmo contrato de saveCustomTopicsAction — JSON
          // corrompido vira erro honesto, nunca overwrite com `{}`.
          return { success: false, error: "Dados do concurso inválidos. Não foi possível salvar." }
        }
      }
    }

    if (!meta.customEdital || !meta.customEdital[disciplineId]) {
      return { success: false, error: "Tópico não encontrado." }
    }

    // Filtra o tópico fora da lista
    meta.customEdital[disciplineId] = meta.customEdital[disciplineId].filter(
      (t) => t.id !== topicId,
    )

    const { error } = await supabase
      .from("user_targets")
      .update({ main_study_source: JSON.stringify(meta) })
      .eq("id", targetId)
      .eq("user_id", user.id)

    if (error) return { success: false, error: "Erro ao remover tópico." }

    revalidatePath("/edital")
    return { success: true }
  } catch {
    return { success: false, error: "Erro interno." }
  }
}
