import type { SupabaseClient } from "@supabase/supabase-js"
import assert from "node:assert/strict"
import { test } from "node:test"

process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

async function getAction() {
  const mod = await import("./get-disciplines.action")
  return mod.fetchActivePlanDisciplines
}

type MockDatabaseState = {
  study_plans: Array<{
    id: string
    user_id: string
    name: string
    version: number
    plan_type: string
    active: boolean
    status: string
    generated_at: string
  }>
  study_plan_items: Array<{
    id: string
    study_plan_id: string
    discipline_id: string
    day_of_week: number
    duration_minutes: number
    priority: number | null
    priority_score: number | null
    created_at: string
  }>
  disciplines: Array<{
    id: string
    name: string
    area: string | null
    color_hex: string | null
  }>
  study_history: Array<{
    id: string
    user_id: string
    discipline_id: string
    duration_minutes: number
  }>
  user_disciplines: Array<{
    id: string
    user_id: string
    discipline_id: string
  }>
}

function createMockSupabaseClient(state: MockDatabaseState): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: (tableName: string) => {
      let filterUserId: string | null = null
      let filterActive: boolean | null = null
      let filterPlanId: string | null = null

      const builder = {
        select: (_columns?: string) => builder,
        eq: (col: string, val: unknown) => {
          if (col === "user_id") filterUserId = String(val)
          if (col === "active") filterActive = Boolean(val)
          if (col === "study_plan_id") filterPlanId = String(val)
          return builder
        },
        order: (_col: string, _opts?: { ascending?: boolean }) => builder,
        limit: (_n: number) => builder,
        maybeSingle: async () => {
          const res = await builder.then()
          return { data: res.data?.[0] ?? null, error: null }
        },
        then: async (
          resolve?: (res: { data: unknown[]; error: null }) => unknown,
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
              return {
                ...item,
                disciplines: disc,
              }
            })
          } else if (tableName === "disciplines") {
            data = [...state.disciplines]
          }

          const result = { data, error: null }
          if (resolve) {
            resolve(result)
            return result
          }
          return result
        },
      }

      return builder as unknown as ReturnType<SupabaseClient["from"]>
    },
  } as unknown as SupabaseClient
}

test("getActivePlanDisciplines: retorna SOMENTE disciplinas do planejamento ativo e ignora histórico/outras disciplinas", async () => {
  const dbState: MockDatabaseState = {
    study_plans: [
      {
        id: "plan-active-1",
        user_id: "user-1",
        name: "SEFAZ-SP — v1",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: true,
        status: "ACTIVE",
        generated_at: "2026-08-14T10:00:00Z",
      },
    ],
    disciplines: [
      {
        id: "disc-ti",
        name: "Tecnologia da Informação (TI)",
        area: "Exatas",
        color_hex: "#0ea5e9",
      },
      { id: "disc-const", name: "Direito Constitucional", area: "Direito", color_hex: "#f43f5e" },
      { id: "disc-trib", name: "Direito Tributário", area: "Direito", color_hex: "#8b5cf6" },
      { id: "disc-port", name: "Língua Portuguesa", area: "Básicas", color_hex: "#10b981" },
      // Disciplinas que estão no histórico / catálogo mas NÃO no plano ativo:
      { id: "disc-adm", name: "Administração", area: "Geral", color_hex: "#f59e0b" },
      { id: "disc-antropo", name: "Antropologia", area: "Humanas", color_hex: "#6366f1" },
      { id: "disc-arqueo", name: "Arqueologia", area: "Humanas", color_hex: "#14b8a6" },
      { id: "disc-contab", name: "Contabilidade Geral", area: "Exatas", color_hex: "#ef4444" },
    ],
    study_plan_items: [
      {
        id: "item-1",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-ti",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5.0,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "item-2",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-const",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 2,
        priority_score: 4.5,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "item-3",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-trib",
        day_of_week: 2,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4.0,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "item-4",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-port",
        day_of_week: 3,
        duration_minutes: 60,
        priority: 1,
        priority_score: 3.5,
        created_at: "2026-08-14T10:00:00Z",
      },
    ],
    study_history: [
      { id: "hist-1", user_id: "user-1", discipline_id: "disc-adm", duration_minutes: 120 },
      { id: "hist-2", user_id: "user-1", discipline_id: "disc-antropo", duration_minutes: 60 },
      { id: "hist-3", user_id: "user-1", discipline_id: "disc-arqueo", duration_minutes: 90 },
      { id: "hist-4", user_id: "user-1", discipline_id: "disc-contab", duration_minutes: 45 },
    ],
    user_disciplines: [
      { id: "ud-1", user_id: "user-1", discipline_id: "disc-adm" },
      { id: "ud-2", user_id: "user-1", discipline_id: "disc-antropo" },
    ],
  }

  const getActivePlanDisciplines = await getAction()
  const mockSupabase = createMockSupabaseClient(dbState)
  const result = await getActivePlanDisciplines(mockSupabase, "user-1")

  assert.equal(result.hasActivePlan, true)
  assert.equal(result.disciplines.length, 4)
  assert.deepEqual(
    result.disciplines.map((d) => d.name),
    [
      "Tecnologia da Informação (TI)",
      "Direito Constitucional",
      "Direito Tributário",
      "Língua Portuguesa",
    ],
  )
  assert.equal(
    result.disciplines.every((d) => d.fromPlan),
    true,
  )
  // Garante que nenhuma disciplina fora do plano vazou
  assert.equal(
    result.disciplines.some((d) => d.name === "Administração"),
    false,
  )
  assert.equal(
    result.disciplines.some((d) => d.name === "Antropologia"),
    false,
  )
  assert.equal(
    result.disciplines.some((d) => d.name === "Arqueologia"),
    false,
  )
  assert.equal(
    result.disciplines.some((d) => d.name === "Contabilidade Geral"),
    false,
  )
})

test("getActivePlanDisciplines: deduplica disciplinas que aparecem em múltiplos dias no plano ativo", async () => {
  const dbState: MockDatabaseState = {
    study_plans: [
      {
        id: "plan-active-1",
        user_id: "user-1",
        name: "Plano com repetições",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: true,
        status: "ACTIVE",
        generated_at: "2026-08-14T10:00:00Z",
      },
    ],
    disciplines: [
      { id: "disc-port", name: "Língua Portuguesa", area: "Básicas", color_hex: "#10b981" },
      { id: "disc-rlm", name: "Raciocínio Lógico", area: "Exatas", color_hex: "#0ea5e9" },
    ],
    study_plan_items: [
      // Português na Segunda, Quarta e Sexta
      {
        id: "i1",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-port",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "i2",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-port",
        day_of_week: 3,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "i3",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-port",
        day_of_week: 5,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-14T10:00:00Z",
      },
      // RLM na Terça e Quinta
      {
        id: "i4",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-rlm",
        day_of_week: 2,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "i5",
        study_plan_id: "plan-active-1",
        discipline_id: "disc-rlm",
        day_of_week: 4,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4,
        created_at: "2026-08-14T10:00:00Z",
      },
    ],
    study_history: [],
    user_disciplines: [],
  }

  const getActivePlanDisciplines = await getAction()
  const mockSupabase = createMockSupabaseClient(dbState)
  const result = await getActivePlanDisciplines(mockSupabase, "user-1")

  assert.equal(result.hasActivePlan, true)
  assert.equal(result.disciplines.length, 2)
  assert.deepEqual(
    result.disciplines.map((d) => d.id),
    ["disc-port", "disc-rlm"],
  )
})

test("getActivePlanDisciplines: retorna hasActivePlan false quando usuário não tem plano ativo", async () => {
  const dbState: MockDatabaseState = {
    study_plans: [
      // Apenas plano arquivado
      {
        id: "plan-old",
        user_id: "user-1",
        name: "Plano Antigo",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: false,
        status: "ARCHIVED",
        generated_at: "2026-01-01T10:00:00Z",
      },
    ],
    disciplines: [{ id: "disc-1", name: "Direito", area: null, color_hex: null }],
    study_plan_items: [
      {
        id: "i1",
        study_plan_id: "plan-old",
        discipline_id: "disc-1",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-01-01T10:00:00Z",
      },
    ],
    study_history: [{ id: "h1", user_id: "user-1", discipline_id: "disc-1", duration_minutes: 60 }],
    user_disciplines: [{ id: "ud1", user_id: "user-1", discipline_id: "disc-1" }],
  }

  const getActivePlanDisciplines = await getAction()
  const mockSupabase = createMockSupabaseClient(dbState)
  const result = await getActivePlanDisciplines(mockSupabase, "user-1")

  assert.equal(result.hasActivePlan, false)
  assert.equal(result.disciplines.length, 0)
})

test("getActivePlanDisciplines: retorna hasActivePlan true com lista vazia quando plano ativo não tem itens", async () => {
  const dbState: MockDatabaseState = {
    study_plans: [
      {
        id: "plan-empty",
        user_id: "user-1",
        name: "Plano Vazio",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: true,
        status: "ACTIVE",
        generated_at: "2026-08-14T10:00:00Z",
      },
    ],
    disciplines: [{ id: "disc-1", name: "Direito", area: null, color_hex: null }],
    study_plan_items: [],
    study_history: [{ id: "h1", user_id: "user-1", discipline_id: "disc-1", duration_minutes: 60 }],
    user_disciplines: [{ id: "ud1", user_id: "user-1", discipline_id: "disc-1" }],
  }

  const getActivePlanDisciplines = await getAction()
  const mockSupabase = createMockSupabaseClient(dbState)
  const result = await getActivePlanDisciplines(mockSupabase, "user-1")

  assert.equal(result.hasActivePlan, true)
  assert.equal(result.disciplines.length, 0)
})

test("getActivePlanDisciplines: troca de plano ativo atualiza imediatamente as sugestões sem reter plano arquivado", async () => {
  const dbState: MockDatabaseState = {
    study_plans: [
      {
        id: "plan-a",
        user_id: "user-1",
        name: "Plano A (Arquivado)",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: false,
        status: "ARCHIVED",
        generated_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "plan-b",
        user_id: "user-1",
        name: "Plano B (Ativo)",
        version: 2,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: true,
        status: "ACTIVE",
        generated_at: "2026-08-14T10:00:00Z",
      },
    ],
    disciplines: [
      { id: "disc-port", name: "Português", area: null, color_hex: null },
      { id: "disc-rlm", name: "RLM", area: null, color_hex: null },
      { id: "disc-ing", name: "Inglês", area: null, color_hex: null },
      { id: "disc-adm", name: "Direito Administrativo", area: null, color_hex: null },
    ],
    study_plan_items: [
      // Itens do Plano A
      {
        id: "i1",
        study_plan_id: "plan-a",
        discipline_id: "disc-port",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "i2",
        study_plan_id: "plan-a",
        discipline_id: "disc-rlm",
        day_of_week: 2,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4,
        created_at: "2026-08-01T10:00:00Z",
      },
      // Itens do Plano B
      {
        id: "i3",
        study_plan_id: "plan-b",
        discipline_id: "disc-ing",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "i4",
        study_plan_id: "plan-b",
        discipline_id: "disc-adm",
        day_of_week: 2,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4,
        created_at: "2026-08-14T10:00:00Z",
      },
    ],
    study_history: [],
    user_disciplines: [],
  }

  const getActivePlanDisciplines = await getAction()
  const mockSupabase = createMockSupabaseClient(dbState)
  const result = await getActivePlanDisciplines(mockSupabase, "user-1")

  assert.equal(result.hasActivePlan, true)
  assert.deepEqual(
    result.disciplines.map((d) => d.name),
    ["Inglês", "Direito Administrativo"],
  )
})

test("getActivePlanDisciplines: isolamento entre contas (Usuário A vs Usuário B)", async () => {
  const dbState: MockDatabaseState = {
    study_plans: [
      {
        id: "plan-user-a",
        user_id: "user-a",
        name: "Plano User A",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: true,
        status: "ACTIVE",
        generated_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "plan-user-b",
        user_id: "user-b",
        name: "Plano User B",
        version: 1,
        plan_type: "CRONOGRAMA_SEMANAL",
        active: true,
        status: "ACTIVE",
        generated_at: "2026-08-14T10:00:00Z",
      },
    ],
    disciplines: [
      { id: "disc-port", name: "Português", area: null, color_hex: null },
      { id: "disc-rlm", name: "RLM", area: null, color_hex: null },
      { id: "disc-trib", name: "Direito Tributário", area: null, color_hex: null },
      { id: "disc-contab", name: "Contabilidade", area: null, color_hex: null },
    ],
    study_plan_items: [
      {
        id: "ia1",
        study_plan_id: "plan-user-a",
        discipline_id: "disc-port",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "ia2",
        study_plan_id: "plan-user-a",
        discipline_id: "disc-rlm",
        day_of_week: 2,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "ib1",
        study_plan_id: "plan-user-b",
        discipline_id: "disc-trib",
        day_of_week: 1,
        duration_minutes: 60,
        priority: 1,
        priority_score: 5,
        created_at: "2026-08-14T10:00:00Z",
      },
      {
        id: "ib2",
        study_plan_id: "plan-user-b",
        discipline_id: "disc-contab",
        day_of_week: 2,
        duration_minutes: 60,
        priority: 1,
        priority_score: 4,
        created_at: "2026-08-14T10:00:00Z",
      },
    ],
    study_history: [],
    user_disciplines: [],
  }

  const getActivePlanDisciplines = await getAction()
  const mockSupabase = createMockSupabaseClient(dbState)
  const resultA = await getActivePlanDisciplines(mockSupabase, "user-a")
  const resultB = await getActivePlanDisciplines(mockSupabase, "user-b")

  assert.deepEqual(
    resultA.disciplines.map((d) => d.name),
    ["Português", "RLM"],
  )
  assert.deepEqual(
    resultB.disciplines.map((d) => d.name),
    ["Direito Tributário", "Contabilidade"],
  )
})
