import type { SupabaseClient } from "@supabase/supabase-js"
import type { StudyCycle, StudyCycleItem, StudyCycleSession } from "@/domain/study-cycle/study-cycle.types"
import type { StudyPlan, StudyPlanItem } from "@/domain/study-plan/study-plan.types"
import type { CycleMigrationRepository } from "./cycle-migration.service"

/**
 * Implementação do CycleMigrationRepository sobre Supabase.
 *
 * RLS: quando instanciado com um cliente autenticado (usuário comum), lê apenas
 * os próprios dados — suficiente para dry-run por usuário único. Quando o CLI
 * exporta SUPABASE_SERVICE_ROLE_KEY pontualmente (bypass RLS), suporta varredura
 * multi-usuário (necessário para listUserIdsWithCycles).
 */
export function createSupabaseMigrationRepository(
  supabase: SupabaseClient
): CycleMigrationRepository {
  return {
    async listUserIdsWithCycles() {
      // DISTINCT user_id exige leitura跨-usuários → só funciona com service key
      const { data, error } = await supabase
        .from("study_cycles")
        .select("user_id")
        .not("migrated_at", "is", null)
        .is("migrated_at", null) // nunca migrados (migrated_at IS NULL)
        // Nota: combinar filtros contraditórios não; abaixo busca todos distintos via fetch + Set

      if (error) {
        // Fallback: busca páginas de study_cycles e deduplica no cliente
        const { data: all, error: allErr } = await supabase
          .from("study_cycles")
          .select("user_id")
          .limit(10000)
        if (allErr || !all) return []
        return Array.from(new Set((all ?? []).map((r: { user_id: string }) => r.user_id)))
      }
      if (!data) return []
      return Array.from(new Set(data.map((r: { user_id: string }) => r.user_id)))
    },

    async fetchLegacyCycles(userId: string) {
      const { data, error } = await supabase
        .from("study_cycles")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
      if (error || !data) {
        console.error("[migration-repo] fetchLegacyCycles:", error?.message)
        return []
      }
      return data as unknown as StudyCycle[]
    },

    async fetchLegacyItems(cycleIds: string[]) {
      if (cycleIds.length === 0) return []
      const { data, error } = await supabase
        .from("study_cycle_items")
        .select("*")
        .in("cycle_id", cycleIds)
        .order("order", { ascending: true })
      if (error || !data) {
        console.error("[migration-repo] fetchLegacyItems:", error?.message)
        return []
      }
      return data as unknown as StudyCycleItem[]
    },

    async fetchLegacySessions(cycleIds: string[]) {
      if (cycleIds.length === 0) return []
      const { data, error } = await supabase
        .from("study_cycle_sessions")
        .select("*")
        .in("cycle_id", cycleIds)
      if (error || !data) {
        // Fallback defensivo: colunas V2 podem não existir (schema legado básico)
        if (error.message.includes("column") || error.message.includes("schema cache")) {
          const { data: basic, error: basicErr } = await supabase
            .from("study_cycle_sessions")
            .select("id, cycle_id, cycle_item_id, study_history_id, created_at")
            .in("cycle_id", cycleIds)
          if (basicErr || !basic) return []
          // Sem minutes_contributed no schema legado → considera 0 (mensurável via study_history)
          return (basic as unknown as StudyCycleSession[]).map((s) => ({
            ...s,
            minutes_contributed: 0,
            extra_minutes: 0,
            round_number: 1,
          }))
        }
        console.error("[migration-repo] fetchLegacySessions:", error?.message)
        return []
      }
      return data as unknown as StudyCycleSession[]
    },

    async fetchMigratedPlans(userId: string) {
      // Planos canônicos rastreados: parent_cycle_id aponta para o legado
      const legacyCycles = await this.fetchLegacyCycles(userId)
      const cycleIds = legacyCycles.map((c) => c.id)
      if (cycleIds.length === 0) return []

      const { data, error } = await supabase
        .from("study_plans")
        .select("*")
        .in("parent_cycle_id", cycleIds)
      if (error || !data) {
        // parent_cycle_id pode não existir (pré-migration) → retorna vazio graciosamente
        if (error.message.includes("column") || error.message.includes("parent_cycle_id")) {
          return []
        }
        console.error("[migration-repo] fetchMigratedPlans:", error?.message)
        return []
      }
      return data as unknown as StudyPlan[]
    },

    async fetchMigratedPlanItems(planIds: string[]) {
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from("study_plan_items")
        .select("id, study_plan_id, discipline_id, day_of_week, duration_minutes, priority, priority_score, recommended_sessions, created_at")
        .in("study_plan_id", planIds)
      if (error || !data) {
        console.error("[migration-repo] fetchMigratedPlanItems:", error?.message)
        return []
      }
      return data as unknown as StudyPlanItem[]
    },

    async insertMigratedPlan(plan) {
      // Tentativa 1: com colunas V2 (total_cycle_minutes, parent_cycle_id)
      const { data, error } = await supabase
        .from("study_plans")
        .insert({
          user_id: plan.user_id,
          version: plan.version,
          plan_type: plan.plan_type,
          status: plan.status,
          name: plan.name,
          total_cycle_minutes: plan.total_cycle_minutes,
          weekly_minutes: plan.weekly_minutes,
          parent_cycle_id: plan.parent_cycle_id,
          generated_reason: plan.generated_reason,
          active: plan.active,
          start_date: new Date().toISOString().split("T")[0],
        })
        .select()
        .single()

      if (data) return data as unknown as StudyPlan

      // Fallback: sem colunas V2 (schema pré-migration)
      console.warn("[migration-repo] insertMigratedPlan fallback (sem colunas V2):", error?.message)
      const { data: basic, error: basicErr } = await supabase
        .from("study_plans")
        .insert({
          user_id: plan.user_id,
          version: plan.version,
          plan_type: plan.plan_type,
          status: plan.status,
          name: plan.name,
          weekly_minutes: plan.weekly_minutes,
          generated_reason: plan.generated_reason,
          active: plan.active,
          start_date: new Date().toISOString().split("T")[0],
        })
        .select()
        .single()

      if (basicErr || !basic) throw new Error(basicErr?.message ?? "Falha ao inserir plano migrado")
      return basic as unknown as StudyPlan
    },

    async insertMigratedPlanItems(items) {
      if (items.length === 0) return []
      const rows = items.map((i) => ({
        study_plan_id: i.study_plan_id,
        discipline_id: i.discipline_id,
        day_of_week: i.day_of_week,
        duration_minutes: i.duration_minutes,
        priority: i.priority,
        priority_score: i.priority_score,
        recommended_sessions: i.recommended_sessions,
      }))
      const { data, error } = await supabase.from("study_plan_items").insert(rows).select()
      if (error || !data) throw new Error(error?.message ?? "Falha ao inserir itens migrados")
      return data as unknown as StudyPlanItem[]
    },

    async getNextPlanVersion(userId: string) {
      const { count } = await supabase
        .from("study_plans")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
      return (count ?? 0) + 1
    },

    async markCycleAsMigrated(cycleId: string) {
      // Flag de rastreio read-only (NUNCA delete no legado)
      const { error } = await supabase
        .from("study_cycles")
        .update({ migrated_at: new Date().toISOString() })
        .eq("id", cycleId)
      if (error) console.error("[migration-repo] markCycleAsMigrated:", error?.message)
    },

    async isCycleMigrated(cycleId: string) {
      // Primary: existe study_plans com parent_cycle_id = cycleId
      const { data, error } = await supabase
        .from("study_plans")
        .select("id")
        .eq("parent_cycle_id", cycleId)
        .limit(1)
        .maybeSingle()

      if (!error && data) return true

      // Secondary: coluna migrated_at no legado (pós-migration)
      const { data: cycle, error: cycleErr } = await supabase
        .from("study_cycles")
        .select("migrated_at")
        .eq("id", cycleId)
        .maybeSingle()

      if (cycleErr) {
        if (cycleErr.message.includes("column") || cycleErr.message.includes("migrated_at")) {
          return false // coluna ainda não existe → não migrado
        }
        console.error("[migration-repo] isCycleMigrated:", cycleErr.message)
        return false
      }
      return Boolean(cycle?.migrated_at)
    },
  }
}