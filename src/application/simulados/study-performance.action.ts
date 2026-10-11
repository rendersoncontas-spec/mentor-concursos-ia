"use server"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { loadDisciplineIdentity } from "@/application/disciplines/discipline-identity.loader"
import { createClient } from "@/infrastructure/supabase/server"
import { fetchAllPagesInParallel, type PageResult } from "@/lib/parallel-pagination"
import { startOfDayInSaoPauloMs, todayKeyInSaoPaulo } from "@/lib/sao-paulo"

import { getSimuladoRecordsAction } from "./simulado-records.actions"
import {
  buildStudyPerformance,
  isStudyPerformancePeriod,
  periodWindow,
  type StudyPerformancePeriodKey,
  type StudyPerformanceReport,
  type StudySessionLite,
} from "./study-performance"

/**
 * G2.11 — estudo × desempenho por disciplina, no período pedido.
 *
 * Três leituras, nenhuma por disciplina (sem N+1):
 *   1. simulados externos — a MESMA action da tela de Simulados;
 *   2. sessões de `study_history` do período, paginadas (só 4 colunas);
 *   3. identidade das disciplinas envolvidas (G2.12: aliases do catálogo +
 *      nome pessoal), em consultas `in (...)` por lote — `loadDisciplineIdentity`.
 * Sem cache: cada abertura da tela e cada troca de período leem o banco, então
 * um estudo ou simulado recém-registrado já aparece.
 */
export async function getStudyPerformanceAction(
  periodKey: StudyPerformancePeriodKey,
): Promise<{ data: StudyPerformanceReport | null; error: string | null }> {
  try {
    if (!isStudyPerformancePeriod(periodKey)) return { data: null, error: "Período inválido." }
    const supabase = await createClient()
    const userId = await getEffectiveUserId(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    const todayKey = todayKeyInSaoPaulo()
    const { startKey } = periodWindow(periodKey, todayKey)
    const sinceIso = startKey ? new Date(startOfDayInSaoPauloMs(startKey)).toISOString() : null

    const [recordsResult, sessionsResult] = await Promise.all([
      getSimuladoRecordsAction({ skipIdentity: true }),
      fetchAllPagesInParallel<Record<string, unknown>>(
        (from, to, withCount) => {
          let query = supabase
            .from("study_history")
            .select("id, discipline_id, started_at, duration_minutes, active_minutes", withCount ? { count: "exact" } : undefined)
            .eq("user_id", userId)
          if (sinceIso) query = query.gte("started_at", sinceIso)
          return query
            .order("started_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to) as unknown as PromiseLike<PageResult<Record<string, unknown>>>
        },
        { maxRows: 50_000, perfLabel: "study_history.study_performance" },
      ),
    ])

    if (recordsResult.error) return { data: null, error: recordsResult.error }
    if (sessionsResult.error) return { data: null, error: "Não foi possível carregar o histórico de estudo." }

    const sessions: StudySessionLite[] = sessionsResult.data.map((r) => ({
      id: String(r["id"]),
      disciplineId: typeof r["discipline_id"] === "string" && r["discipline_id"] ? (r["discipline_id"] as string) : null,
      startedAt: String(r["started_at"] ?? ""),
      // Mesma regra do motor de estatísticas: duration_minutes, senão active_minutes.
      durationMinutes: Number(r["duration_minutes"] ?? r["active_minutes"] ?? 0),
    }))

    const records = recordsResult.data ?? []
    const ids = new Set<string>()
    sessions.forEach((s) => s.disciplineId && ids.add(s.disciplineId))
    records.forEach((r) => r.subjects.forEach((s) => s.disciplineId && ids.add(s.disciplineId)))

    const identity = await loadDisciplineIdentity(supabase, userId, ids)
    if (identity.error) return { data: null, error: identity.error }

    return {
      data: buildStudyPerformance({
        records,
        sessions,
        disciplineNames: new Map<string, string>(),
        identity: identity.data,
        periodKey,
        todayKey,
      }),
      error: null,
    }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao analisar estudo e desempenho." }
  }
}
