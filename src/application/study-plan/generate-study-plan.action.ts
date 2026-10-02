"use server"

import { revalidatePath } from "next/cache"

import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import {
  computeStudyPlanDraft,
  deactivateUserStudyPlan,
  generateStudyPlan,
  persistStudyPlanDraftAtomic,
} from "@/application/study-plan/study-plan.service"
import {
  MAX_WEEKLY_HOURS,
  MIN_WEEKLY_HOURS,
  validatePlanningForm,
} from "@/features/planejamento/lib/planning-form"
import {
  canonicalDisciplineKey,
  isValidDisciplineDisplayName,
  normalizeDisciplineDisplay,
} from "@/domain/disciplines/discipline-naming"
import { createClient } from "@/infrastructure/supabase/server"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { isMaintenanceMode } from "@/lib/maintenance"
import { normalizeExperienceLevel } from "@/application/study-plan/planning-preferences"
import { parseRhythmConfig } from "@/domain/study-plan/study-plan.types"

export type GeneratePlanResult =
  { success: true; planId: string; version: number } | { success: false; error: string }

type GeneratePlanConfig = {
  horasSemana?: number | string | Array<number | string>
  nivel?: string
  importanceMap?: Record<string, unknown>
  knowledgeMap?: Record<string, unknown>
  /**
   * G2.1 (Opção A) — ritmo do wizard. Validado no boundary (estilo do enum
   * canônico; personalizado exige min/max); ausente = legado (30–60).
   */
  ritmo?: {
    style?: unknown
    minMinutes?: unknown
    maxMinutes?: unknown
  }
}

export async function generateStudyPlanAction(
  reason: string = "manual",
  config?: GeneratePlanConfig,
): Promise<GeneratePlanResult> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()

    const effectiveUserId = await getEffectiveUserId(supabase, { action: "GENERATE_STUDY_PLAN" })

    if (!effectiveUserId) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Buscar target ativo
    const { data: rawTarget } = await supabase
      .from("user_targets")
      .select("id, exam_id")
      .eq("user_id", effectiveUserId)
      .eq("is_active", true)
      .limit(1)
      .single()

    if (!rawTarget) {
      return { success: false, error: "Nenhum concurso ativo encontrado." }
    }

    let targetWeeklyHours: number | undefined = undefined

    if (config) {
      const rawHours = Array.isArray(config.horasSemana)
        ? config.horasSemana[0]
        : config.horasSemana
      const hoursNum =
        typeof rawHours === "number" ? rawHours : parseInt(String(rawHours ?? ""), 10) || NaN

      // G2.1 — ritmo validado no boundary com erro honesto (nunca
      // silencioso, nunca dummy). Ausente = legado.
      const rhythm = parseRhythmConfig(config.ritmo)
      if (!rhythm.ok) {
        return { success: false, error: rhythm.error }
      }

      // Mesma validação do wizard (cliente e servidor usam planning-form.ts)
      const serverValidation = validatePlanningForm({
        mode: "ciclo",
        weeklyHours: Number.isFinite(hoursNum) ? hoursNum : NaN,
        dayConfigMode: "semana",
        scale: "normal",
        customWorkDays: 3,
        customOffDays: 2,
        firstShiftDay: 2,
        studyDays: [],
        minMinutes: rhythm.bounds.min,
        maxMinutes: rhythm.bounds.max,
        sessionStyle: rhythm.style,
        selectedDisciplines: Object.keys(config.importanceMap || {}),
        importanceMap: (config.importanceMap || {}) as Record<string, number>,
        knowledgeMap: (config.knowledgeMap || {}) as Record<string, number>,
      })
      if (!serverValidation.ok) {
        return { success: false, error: serverValidation.errors[0] || "Dados inválidos." }
      }

      targetWeeklyHours = Number.isFinite(hoursNum)
        ? Math.min(MAX_WEEKLY_HOURS, Math.max(MIN_WEEKLY_HOURS, Math.round(hoursNum)))
        : 25

      // G1.3 (G-21): NENHUM write destrutivo aqui. Resolve o catálogo global
      // e monta o pool; profile + vínculos + plano + itens vão juntos na RPC
      // atômica (persistStudyPlanDraftAtomic). Falha → estado anterior intacto.
      let disciplinePool: { id: string; name: string; area: string }[] | undefined
      if (config.importanceMap && config.knowledgeMap) {
        const discNames = Object.keys(config.importanceMap)

        // G1.1 (G-27): resolução canônica em lote — evita N+1 e duplicatas por
        // caixa/espaço/hífen/acento. Display preservado; chave canônica usada
        // na comparação e persistida em `name_key` (quando a coluna existe).
        const displayByKey = new Map<string, string>()
        for (const raw of discNames) {
          const display = normalizeDisciplineDisplay(raw)
          if (!display || !isValidDisciplineDisplayName(display)) continue
          const key = canonicalDisciplineKey(display)
          if (!displayByKey.has(key)) displayByKey.set(key, display)
        }
        // Evita N+1: busca todas as disciplinas já existentes com esses nomes
        // numa única query, em vez de uma consulta sequencial por nome.
        const existingByName = new Map<string, { id: string; name: string; area: string }>()
        const wantedKeys = [...displayByKey.keys()]
        if (wantedKeys.length > 0) {
          try {
            const { data: existingDisciplines, error: existingError } = await supabase
              .from("disciplines")
              .select("id, name, area, name_key")
              .in("name_key", wantedKeys)
            if (!existingError) {
              for (const disc of existingDisciplines ?? []) {
                const row = disc as { id: string; name: string; area: string; name_key?: string | null }
                const k = row.name_key ?? canonicalDisciplineKey(row.name)
                if (!existingByName.has(k)) {
                  existingByName.set(k, { id: row.id, name: row.name, area: row.area })
                }
              }
            }
          } catch {
            // Coluna ainda não existe → legado abaixo.
          }
          if (existingByName.size === 0) {
            const { data: legacyDisciplines } = await supabase
              .from("disciplines")
              .select("id, name, area")
              .in("name", [...displayByKey.values()])
            for (const disc of legacyDisciplines ?? []) {
              const k = canonicalDisciplineKey(disc.name)
              if (!existingByName.has(k)) {
                existingByName.set(k, { id: disc.id, name: disc.name, area: disc.area })
              }
            }
          }
        }

        disciplinePool = []
        for (const [key, display] of displayByKey) {
          let d: { id: string; name: string; area: string } | null = existingByName.get(key) ?? null
          if (!d) {
            // Disciplina nova: mantém a criação sequencial, pois a cor
            // atribuída depende do estado das cores já usadas até aqui.
            const color = await pickNextDisciplineColor(supabase)
            const base = { name: display, area: "Geral", ...(color ? { color_hex: color } : {}) }
            const withKey = await supabase
              .from("disciplines")
              .insert({ ...base, name_key: key })
              .select("id, name, area")
              .maybeSingle()
            if (!withKey.error && withKey.data) {
              const row = withKey.data as { id: string; name: string; area: string }
              d = { id: row.id, name: row.name, area: row.area }
            } else {
              const legacy = await supabase
                .from("disciplines")
                .insert(base)
                .select("id, name, area")
                .maybeSingle()
              d =
                !legacy.error && legacy.data
                  ? (legacy.data as { id: string; name: string; area: string })
                  : null
            }
          }
          if (d) disciplinePool.push(d)
        }
      }

      const draft = await computeStudyPlanDraft(supabase, effectiveUserId, {
        reason,
        targetId: rawTarget.id,
        overrideWeeklyHours: targetWeeklyHours,
        disciplinePool,
        // G2.1: ausente no payload = legado single-pass; explícito = ritmo.
        rhythm: rhythm.explicit ? rhythm.rhythm : undefined,
      })
      if (!draft) {
        return {
          success: false,
          error:
            "Não foi possível gerar o cronograma. Verifique se seu concurso e disciplinas estão configurados.",
        }
      }

      // Perfil + vínculos + plano + itens em UMA transação. Falha → nada mudou.
      const persisted = await persistStudyPlanDraftAtomic(supabase, effectiveUserId, draft, {
        reason,
        profile: config
          ? {
              weekly_study_hours: targetWeeklyHours,
              experience_level: normalizeExperienceLevel(config.nivel),
            }
          : null,
        replaceDisciplines: disciplinePool ? disciplinePool.map((d) => d.id) : null,
      })
      if (!persisted) {
        return {
          success: false,
          error:
            "Não foi possível gerar o cronograma. Nenhum dado foi alterado; tente novamente.",
        }
      }

      revalidatePath("/planejamento")
      revalidatePath("/study-plan")
      revalidatePath("/dashboard")
      revalidatePath("/planos")

      return { success: true, planId: persisted.id, version: persisted.version }
    }

    const plan = await generateStudyPlan(supabase, effectiveUserId, reason, rawTarget.id, targetWeeklyHours)

    if (!plan) {
      return {
        success: false,
        error:
          "Não foi possível gerar o cronograma. Verifique se seu concurso e disciplinas estão configurados.",
      }
    }

    revalidatePath("/planejamento")
    revalidatePath("/study-plan")
    revalidatePath("/dashboard")
    revalidatePath("/planos")

    return { success: true, planId: plan.id, version: plan.version }
  } catch (err: unknown) {
    // P1.1 (auditoria item 12): NÃO revalidar paths aqui de propósito.
    // Revalidar após falha poderia servir cache com estado parcial/antigo
    // como se fosse novo. Erro retorna sem revalidate; sucesso revalida acima.
    console.error("generateStudyPlanAction error:", err)
    return { success: false, error: "Erro interno ao gerar o cronograma." }
  }
}

export async function deactivateStudyPlanAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase, { action: "DEACTIVATE_STUDY_PLAN" })

    if (!effectiveUserId) return { success: false, error: "Usuário não autenticado." }

    const ok = await deactivateUserStudyPlan(supabase, effectiveUserId)
    if (ok) {
      revalidatePath("/planejamento")
      revalidatePath("/dashboard")
      revalidatePath("/planos")
    }
    return { success: ok }
  } catch (err: unknown) {
    console.error("deactivateStudyPlanAction error:", err)
    return { success: false, error: "Erro ao desativar planejamento." }
  }
}
