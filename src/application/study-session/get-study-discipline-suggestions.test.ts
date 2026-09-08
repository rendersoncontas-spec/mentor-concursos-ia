import type { SupabaseClient } from "@supabase/supabase-js"
import assert from "node:assert/strict"
import { test } from "node:test"

process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

async function getSuggestionsAction() {
  const mod = await import("./get-study-discipline-suggestions.action")
  return mod.fetchStudyDisciplineSuggestions
}

type MockDatabaseState = {
  study_plans: Array<{
    id: string
    user_id: string
    name: string
    active: boolean
    generated_at: string
  }>
  study_plan_items: Array<{
    id: string
    study_plan_id: string
    discipline_id: string
    day_of_week: number
    priority: number | null
  }>
  disciplines: Array<{
    id: string
    name: string
    area: string | null
    color_hex: string | null
  }>
  study_cycles: Array<{
    id: string
    user_id: string
    name: string
    status: string
    current_item_index: number
    current_round: number
    total_rounds_done: number
    current_item_progress_min: number
    created_at: string
    updated_at: string
  }>
  study_cycle_items: Array<{
    id: string
    cycle_id: string
    discipline_id: string
    order: number
    priority: "ALTA" | "MEDIA" | "BAIXA"
    difficulty: "FACIL" | "MEDIA" | "DIFICIL"
    planned_minutes: number
  }>
  study_history: Array<{
    id: string
    user_id: string
    discipline_id: string
    started_at: string
  }>
}

function createMockSupabase(state: MockDatabaseState): SupabaseClient {
  return {
    from: (tableName: string) => {
      let filterUserId: string | null = null
      let filterActive: boolean | null = null
      let filterStatus: string | null = null
      let filterCycleId: string | null = null
      let filterPlanId: string | null = null
      let filterGteStartedAt: string | null = null

      const builder = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: unknown) => {
          if (col === "user_id") filterUserId = String(val)
          if (col === "active") filterActive = Boolean(val)
          if (col === "status") filterStatus = String(val)
          if (col === "cycle_id") filterCycleId = String(val)
          if (col === "study_plan_id") filterPlanId = String(val)
          return builder
        },
        gte: (col: string, val: unknown) => {
          if (col === "started_at") filterGteStartedAt = String(val)
          return builder
        },
        order: (_col: string, _opts?: unknown) => builder,
        limit: (_n: number) => builder,
        maybeSingle: async () => {
          const res = await builder.then()
          return { data: res.data?.[0] ?? null, error: null }
        },
        then: async (
          resolve?: (res: { data: unknown[]; error: null }) => unknown
        ): Promise<{ data: unknown[]; error: null }> => {
          let data: unknown[] = []

          if (tableName === "study_plans") {
            data = state.study_plans.filter((p) => {
              if (filterUserId !== null && p.user_id !== filterUserId) return false
              if (filterActive !== null && p.active !== filterActive) return false
              return true
            })
          } else if (tableName === "study_plan_items") {
            const items = state.study_plan_items.filter((item) => {
              if (filterPlanId !== null && item.study_plan_id !== filterPlanId) return false
              return true
            })
            data = items.map((item) => {
              const disc = state.disciplines.find((d) => d.id === item.discipline_id) ?? null
              return { ...item, disciplines: disc }
            })
          } else if (tableName === "study_cycles") {
            data = state.study_cycles.filter((c) => {
              if (filterUserId !== null && c.user_id !== filterUserId) return false
              if (filterStatus !== null && c.status !== filterStatus) return false
              return true
            })
          } else if (tableName === "study_cycle_items") {
            const items = state.study_cycle_items.filter((item) => {
              if (filterCycleId !== null && item.cycle_id !== filterCycleId) return false
              return true
            })
            data = items.map((item) => {
              const disc = state.disciplines.find((d) => d.id === item.discipline_id) ?? null
              return { ...item, discipline: disc }
            })
          } else if (tableName === "study_history") {
            const history = state.study_history.filter((h) => {
              if (filterUserId !== null && h.user_id !== filterUserId) return false
              if (filterGteStartedAt !== null && new Date(h.started_at) < new Date(filterGteStartedAt)) return false
              return true
            })
            data = history
              .slice()
              .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
              .map((h) => {
                const disc = state.disciplines.find((d) => d.id === h.discipline_id) ?? null
                return { ...h, disciplines: disc }
              })
          }

          const result = { data, error: null }
          if (resolve) resolve(result)
          return result
        },
      }

      return builder as unknown as ReturnType<SupabaseClient["from"]>
    },
  } as unknown as SupabaseClient
}

const mockDisciplines = [
  { id: "disc-trib", name: "Direito Tributário", area: "Direito", color_hex: "#10b981" },
  { id: "disc-const", name: "Direito Constitucional", area: "Direito", color_hex: "#3b82f6" },
  { id: "disc-cont", name: "Contabilidade Geral", area: "Exatas", color_hex: "#f59e0b" },
  { id: "disc-port", name: "Língua Portuguesa", area: "Básica", color_hex: "#8b5cf6" },
  { id: "disc-adm", name: "Direito Administrativo", area: "Direito", color_hex: "#ef4444" },
]

test("1. Com planejamento ativo: sugestões vêm do planejamento", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [
      {
        id: "plan-1",
        user_id: "user-1",
        name: "Plano Receita",
        active: true,
        generated_at: "2026-09-01T00:00:00Z",
      },
    ],
    study_plan_items: [
      { id: "pi-1", study_plan_id: "plan-1", discipline_id: "disc-trib", day_of_week: 1, priority: 1 },
      { id: "pi-2", study_plan_id: "plan-1", discipline_id: "disc-const", day_of_week: 2, priority: 2 },
    ],
    study_cycles: [],
    study_cycle_items: [],
    study_history: [],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "PLAN")
  assert.equal(res.suggestions.length, 2)
  assert.deepEqual(
    res.suggestions.map((s) => s.name),
    ["Direito Constitucional", "Direito Tributário"]
  )
  assert.equal(res.suggestions.every((s) => s.from === "PLAN"), true)
})

test("2. Com planejamento ativo + ciclo ativo: sugestões vêm SOMENTE do planejamento", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [
      {
        id: "plan-1",
        user_id: "user-1",
        name: "Plano",
        active: true,
        generated_at: "2026-09-01T00:00:00Z",
      },
    ],
    study_plan_items: [
      { id: "pi-1", study_plan_id: "plan-1", discipline_id: "disc-port", day_of_week: 1, priority: 1 },
    ],
    study_cycles: [
      {
        id: "cycle-1",
        user_id: "user-1",
        name: "Ciclo",
        status: "ACTIVE",
        current_item_index: 0,
        current_round: 1,
        total_rounds_done: 0,
        current_item_progress_min: 0,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    study_cycle_items: [
      {
        id: "ci-1",
        cycle_id: "cycle-1",
        discipline_id: "disc-trib",
        order: 1,
        priority: "ALTA",
        difficulty: "DIFICIL",
        planned_minutes: 90,
      },
    ],
    study_history: [],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "PLAN")
  assert.equal(res.suggestions.length, 1)
  assert.equal(res.suggestions[0]?.name, "Língua Portuguesa")
  // Não mistura com a matéria do ciclo
  assert.equal(res.suggestions.some((s) => s.name === "Direito Tributário"), false)
})

test("3. Sem planejamento + ciclo ativo: sugestões vêm do ciclo (em foco primeiro)", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [],
    study_plan_items: [],
    study_cycles: [
      {
        id: "cycle-1",
        user_id: "user-1",
        name: "Ciclo RFB",
        status: "ACTIVE",
        current_item_index: 1, // Cursor aponta para o 2º item (Constitucional)
        current_round: 1,
        total_rounds_done: 0,
        current_item_progress_min: 25,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ],
    study_cycle_items: [
      {
        id: "ci-1",
        cycle_id: "cycle-1",
        discipline_id: "disc-trib",
        order: 1,
        priority: "ALTA",
        difficulty: "DIFICIL",
        planned_minutes: 90,
      },
      {
        id: "ci-2",
        cycle_id: "cycle-1",
        discipline_id: "disc-const",
        order: 2,
        priority: "MEDIA",
        difficulty: "MEDIA",
        planned_minutes: 60,
      },
      {
        id: "ci-3",
        cycle_id: "cycle-1",
        discipline_id: "disc-cont",
        order: 3,
        priority: "BAIXA",
        difficulty: "FACIL",
        planned_minutes: 30,
      },
    ],
    study_history: [],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "CYCLE")
  assert.ok(res.suggestions.length >= 2)
  // A primeira sugestão DEVE ser a que está em foco (cursor = item 1 = Direito Constitucional)
  assert.equal(res.suggestions[0]?.name, "Direito Constitucional")
  assert.equal(res.suggestions[0]?.metadata?.isCurrentInCycle, true)
  assert.equal(res.suggestions[0]?.metadata?.difficulty, "MEDIA")
  assert.equal(res.suggestions[0]?.from, "CYCLE")
})

test("4. Sem planejamento + sem ciclo: sugestões vêm do histórico dos últimos 30 dias", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const now = new Date()
  const d1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 dias atrás
  const d2 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 dias atrás

  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [],
    study_plan_items: [],
    study_cycles: [],
    study_cycle_items: [],
    study_history: [
      { id: "h-1", user_id: "user-1", discipline_id: "disc-trib", started_at: d1 },
      { id: "h-2", user_id: "user-1", discipline_id: "disc-port", started_at: d2 },
    ],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "HISTORY")
  assert.equal(res.suggestions.length, 2)
  assert.equal(res.suggestions[0]?.name, "Direito Tributário")
  assert.equal(res.suggestions[1]?.name, "Língua Portuguesa")
  assert.equal(res.suggestions[0]?.from, "HISTORY")
})

test("5. Histórico: duplicadas aparecem somente uma vez", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const now = new Date()
  const d1 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
  const d2 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const d3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [],
    study_plan_items: [],
    study_cycles: [],
    study_cycle_items: [],
    // Aluno estudou Tributário 3 vezes
    study_history: [
      { id: "h-1", user_id: "user-1", discipline_id: "disc-trib", started_at: d1 },
      { id: "h-2", user_id: "user-1", discipline_id: "disc-trib", started_at: d2 },
      { id: "h-3", user_id: "user-1", discipline_id: "disc-trib", started_at: d3 },
      { id: "h-4", user_id: "user-1", discipline_id: "disc-const", started_at: d3 },
    ],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "HISTORY")
  // Deve ter apenas 2 disciplinas, Tributário não pode duplicar
  assert.equal(res.suggestions.length, 2)
  assert.equal(res.suggestions[0]?.name, "Direito Tributário")
  assert.equal(res.suggestions[1]?.name, "Direito Constitucional")
})

test("6. Histórico: ordenar pela atividade mais recente", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const now = new Date()
  const today = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString() // 1h atrás
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()

  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [],
    study_plan_items: [],
    study_cycles: [],
    study_cycle_items: [],
    study_history: [
      { id: "h-old", user_id: "user-1", discipline_id: "disc-cont", started_at: fiveDaysAgo },
      { id: "h-mid", user_id: "user-1", discipline_id: "disc-port", started_at: twoDaysAgo },
      { id: "h-recent", user_id: "user-1", discipline_id: "disc-trib", started_at: today },
    ],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "HISTORY")
  assert.deepEqual(
    res.suggestions.map((s) => s.name),
    ["Direito Tributário", "Língua Portuguesa", "Contabilidade Geral"]
  )
})

test("7. Atividade com mais de 30 dias: não aparece", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const now = new Date()
  const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString()
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [],
    study_plan_items: [],
    study_cycles: [],
    study_cycle_items: [],
    study_history: [
      { id: "h-recent", user_id: "user-1", discipline_id: "disc-trib", started_at: tenDaysAgo },
      { id: "h-old", user_id: "user-1", discipline_id: "disc-adm", started_at: fortyDaysAgo },
    ],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "HISTORY")
  assert.equal(res.suggestions.length, 1)
  assert.equal(res.suggestions[0]?.name, "Direito Tributário")
  // A disciplina de 40 dias atrás NÃO pode aparecer
  assert.equal(res.suggestions.some((s) => s.name === "Direito Administrativo"), false)
})

test("8. Sem planejamento + sem ciclo + sem histórico: lista vazia", async () => {
  const fetchStudyDisciplineSuggestions = await getSuggestionsAction()
  const dbState: MockDatabaseState = {
    disciplines: mockDisciplines,
    study_plans: [],
    study_plan_items: [],
    study_cycles: [],
    study_cycle_items: [],
    study_history: [],
  }

  const res = await fetchStudyDisciplineSuggestions(createMockSupabase(dbState), "user-1")

  assert.equal(res.source, "NONE")
  assert.equal(res.suggestions.length, 0)
})
