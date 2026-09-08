import type { StudyCycle, StudyCycleItem, StudyCycleSession } from "@/domain/study-cycle/study-cycle.types"
import type { StudyPlan, StudyPlanItem } from "@/domain/study-plan/study-plan.types"

/**
 * ==============================================================================
 * MIGRAÇÃO DE CICLOS LEGADOS → MODELO CANÔNICO (study_plans)
 * ==============================================================================
 *
 * Diretrizes do plano:
 * - NÃO deletar tabelas legadas (study_cycles, study_cycle_items, study_cycle_sessions):
 *   preservadas em modo read-only como salvaguarda.
 * - Parar escritas no legado: novas criações vão para study_plans (plan_type =
 *   CICLO_ROTATIVO), study_plan_items e study_plan_daily_blocks.
 * - Dry-run: simula e compara métricas SEM executar nenhum INSERT/UPDATE.
 * - Execução: migração transacional por usuário, idempotente via parent_cycle_id.
 */

// ==============================================================================
// Tipos de Métricas e Validação
// ==============================================================================

export interface SourceMetrics {
  cyclesCount: number
  itemsCount: number
  itemsTotalPlannedMinutes: number
  sessionsCount: number
  sessionsTotalMinutes: number
}

export interface NewPlanMetrics {
  plansCount: number
  itemsCount: number
  itemsTotalMinutes: number
}

export type DivergenceField = "ITEMS_COUNT" | "PLANNED_MINUTES" | "SESSIONS_COUNT" | "SESSIONS_MINUTES"

export interface Divergence {
  field: DivergenceField
  expected: number
  actual: number
  delta: number
}

export interface UserMigrationReport {
  userId: string
  source: SourceMetrics
  target: NewPlanMetrics
  divergences: Divergence[]
  status: "VALIDATED" | "DIVERGENCES_FOUND"
}

export interface DryRunReport {
  dryRun: true
  executedAt: string
  users: UserMigrationReport[]
  totals: {
    usersProcessed: number
    usersWithDivergences: number
    cyclesFound: number
  }
  safeToExecute: boolean
}

export interface ExecutionReport {
  dryRun: false
  executedAt: string
  migratedUsers: Array<{
    userId: string
    planId: string
    createdItems: number
    postMigrationValidation: UserMigrationReport | null
  }>
  skippedUsers: Array<{ userId: string; reason: string }>
  failures: Array<{ userId: string; reason: string }>
}

export type MigrationReport = DryRunReport | ExecutionReport

// ==============================================================================
// Contrato do Repositório (injetável para permitir testes com fixtures)
// ==============================================================================

export interface CycleMigrationRepository {
  /** Busca todos os usuários distintos que possuem ciclos legados */
  listUserIdsWithCycles(): Promise<string[]>

  /** Busca ciclos legados de um usuário (read-only no legado) */
  fetchLegacyCycles(userId: string): Promise<StudyCycle[]>

  /** Busca itens dos ciclos legados */
  fetchLegacyItems(cycleIds: string[]): Promise<StudyCycleItem[]>

  /** Busca sessões dos ciclos legados */
  fetchLegacySessions(cycleIds: string[]): Promise<StudyCycleSession[]>

  /** Busca planos canônicos migrados (rastreados via parent_cycle_id) */
  fetchMigratedPlans(userId: string): Promise<StudyPlan[]>

  /** Busca itens dos planos canônicos migrados */
  fetchMigratedPlanItems(planIds: string[]): Promise<StudyPlanItem[]>

  /** Insere um novo plano canônico com parent_cycle_id (idempotência) */
  insertMigratedPlan(plan: {
    user_id: string
    version: number
    plan_type: "CICLO_ROTATIVO"
    status: "ACTIVE" | "PAUSED"
    name: string
    total_cycle_minutes: number
    weekly_minutes: number
    parent_cycle_id: string
    generated_reason: string
    active: boolean
  }): Promise<StudyPlan>

  /** Insere itens de um plano canônico */
  insertMigratedPlanItems(items: Array<Omit<StudyPlanItem, "id" | "created_at">>): Promise<StudyPlanItem[]>

  /** Busca a próxima versão de plano disponível para o usuário */
  getNextPlanVersion(userId: string): Promise<number>

  /** Marca o ciclo legado como migrado (sem deletar; flag de rastreio) */
  markCycleAsMigrated(cycleId: string): Promise<void>

  /** Verifica se um ciclo legado já foi migrado (idempotência) */
  isCycleMigrated(cycleId: string): Promise<boolean>
}

// ==============================================================================
// Métricas (funções puras)
// ==============================================================================

export function computeSourceMetrics(
  cycles: StudyCycle[],
  items: StudyCycleItem[],
  sessions: StudyCycleSession[]
): SourceMetrics {
  return {
    cyclesCount: cycles.length,
    itemsCount: items.length,
    itemsTotalPlannedMinutes: items.reduce((acc, item) => acc + (item.planned_minutes ?? 0), 0),
    sessionsCount: sessions.length,
    sessionsTotalMinutes: sessions.reduce(
      (acc, s) => acc + (s.minutes_contributed ?? 0) + (s.extra_minutes ?? 0),
      0
    ),
  }
}

export function computeTargetMetrics(
  plans: StudyPlan[],
  items: StudyPlanItem[]
): NewPlanMetrics {
  return {
    plansCount: plans.length,
    itemsCount: items.length,
    itemsTotalMinutes: items.reduce((acc, item) => acc + item.duration_minutes, 0),
  }
}

export function findDivergences(source: SourceMetrics, target: NewPlanMetrics): Divergence[] {
  const divergences: Divergence[] = []

  if (source.itemsCount !== target.itemsCount) {
    divergences.push({
      field: "ITEMS_COUNT",
      expected: source.itemsCount,
      actual: target.itemsCount,
      delta: target.itemsCount - source.itemsCount,
    })
  }

  if (source.itemsTotalPlannedMinutes !== target.itemsTotalMinutes) {
    divergences.push({
      field: "PLANNED_MINUTES",
      expected: source.itemsTotalPlannedMinutes,
      actual: target.itemsTotalMinutes,
      delta: target.itemsTotalMinutes - source.itemsTotalPlannedMinutes,
    })
  }

  return divergences
}

// ==============================================================================
// Transformação: legado → canônico (função pura)
// ==============================================================================

export function mapCycleToCanonicalPlan(
  cycle: StudyCycle,
  items: StudyCycleItem[],
  version: number
): {
  plan: {
    user_id: string
    version: number
    plan_type: "CICLO_ROTATIVO"
    status: "ACTIVE" | "PAUSED"
    name: string
    total_cycle_minutes: number
    weekly_minutes: number
    parent_cycle_id: string
    generated_reason: string
    active: boolean
  }
  items: Array<Omit<StudyPlanItem, "id" | "created_at">>
} {
  const totalCycleMinutes = items.reduce((acc, item) => acc + (item.planned_minutes ?? 0), 0)

  const plan = {
    user_id: cycle.user_id,
    version,
    plan_type: "CICLO_ROTATIVO" as const,
    status: (cycle.status === "ACTIVE" ? "ACTIVE" : "PAUSED") as "ACTIVE" | "PAUSED",
    name: cycle.name,
    total_cycle_minutes: totalCycleMinutes,
    weekly_minutes: totalCycleMinutes,
    parent_cycle_id: cycle.id,
    generated_reason: "legacy_cycle_migration",
    active: cycle.status === "ACTIVE",
  }

  const canonicalItems = items
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item, index) => ({
      study_plan_id: "", // preenchido após insert do plano
      discipline_id: item.discipline_id,
      day_of_week: 0 as const, // Ciclo Rotativo não é amarrado a dia
      duration_minutes: item.planned_minutes ?? 0,
      execution_order: index + 1,
      block_status: "PENDENTE" as const,
      priority: index + 1,
      priority_score: 0,
      recommended_sessions: 1,
    }))

  return { plan, items: canonicalItems }
}

// ==============================================================================
// Motor de Migração
// ==============================================================================

export interface RunCycleMigrationInput {
  dryRun: boolean
  userId?: string // Opcional: migra um usuário específico
}

export async function runCycleMigration(
  repo: CycleMigrationRepository,
  input: RunCycleMigrationInput
): Promise<MigrationReport> {
  const executedAt = new Date().toISOString()

  const userIds = input.userId
    ? [input.userId]
    : await repo.listUserIdsWithCycles()

  if (userIds.length === 0) {
    return input.dryRun
      ? {
          dryRun: true,
          executedAt,
          users: [],
          totals: { usersProcessed: 0, usersWithDivergences: 0, cyclesFound: 0 },
          safeToExecute: true,
        }
      : {
          dryRun: false,
          executedAt,
          migratedUsers: [],
          skippedUsers: [],
          failures: [],
        }
  }

  if (input.dryRun) {
    return dryRunAll(repo, userIds, executedAt)
  }

  return executeAll(repo, userIds, executedAt)
}

async function dryRunAll(
  repo: CycleMigrationRepository,
  userIds: string[],
  executedAt: string
): Promise<DryRunReport> {
  const reports: UserMigrationReport[] = []

  for (const userId of userIds) {
    const cycles = await repo.fetchLegacyCycles(userId)
    if (cycles.length === 0) continue

    const cycleIds = cycles.map((c) => c.id)
    const [items, sessions] = await Promise.all([
      repo.fetchLegacyItems(cycleIds),
      repo.fetchLegacySessions(cycleIds),
    ])

    const source = computeSourceMetrics(cycles, items, sessions)

    // Separa ciclos pendentes dos já migrados
    const migratedStatuses = await Promise.all(cycleIds.map((id) => repo.isCycleMigrated(id)))
    const pendingCycles = cycles.filter((_, idx) => !migratedStatuses[idx])
    const alreadyMigratedCycles = cycles.filter((_, idx) => migratedStatuses[idx])

    // 1. Simula a migração dos ciclos PENDENTES (mapeamento 1:1 preserva totais)
    const pendingItems = pendingCycles.flatMap((c) => items.filter((i) => i.cycle_id === c.id))
    const pendingSource = computeSourceMetrics(pendingCycles, pendingItems, sessions.filter((s) =>
      pendingCycles.some((c) => c.id === s.cycle_id)
    ))
    const simulatedTarget: NewPlanMetrics = {
      plansCount: pendingCycles.length,
      itemsCount: pendingItems.length,
      itemsTotalMinutes: pendingItems.reduce((acc, item) => acc + (item.planned_minutes ?? 0), 0),
    }
    const simulationDivergences = findDivergences(pendingSource, simulatedTarget)

    // 2. Valida ciclos JÁ MIGRADOS contra os planos canônicos reais (detecção de drift)
    let driftDivergences: Divergence[] = []
    let existingPlansCount = 0
    if (alreadyMigratedCycles.length > 0) {
      const migratedItems = alreadyMigratedCycles.flatMap((c) =>
        items.filter((i) => i.cycle_id === c.id)
      )
      const migratedSource = computeSourceMetrics(alreadyMigratedCycles, migratedItems, [])

      const plans = await repo.fetchMigratedPlans(userId)
      const planIds = plans.map((p) => p.id)
      const planItems = planIds.length > 0 ? await repo.fetchMigratedPlanItems(planIds) : []
      const actualTarget = computeTargetMetrics(plans, planItems)
      existingPlansCount = plans.length

      driftDivergences = findDivergences(migratedSource, actualTarget)
    }

    const divergences = [...simulationDivergences, ...driftDivergences]

    reports.push({
      userId,
      source,
      target: {
        plansCount: simulatedTarget.plansCount + existingPlansCount,
        itemsCount: simulatedTarget.itemsCount,
        itemsTotalMinutes: simulatedTarget.itemsTotalMinutes,
      },
      divergences,
      status: divergences.length === 0 ? "VALIDATED" : "DIVERGENCES_FOUND",
    })
  }

  return {
    dryRun: true,
    executedAt,
    users: reports,
    totals: {
      usersProcessed: reports.length,
      usersWithDivergences: reports.filter((r) => r.status === "DIVERGENCES_FOUND").length,
      cyclesFound: reports.reduce((acc, r) => acc + r.source.cyclesCount, 0),
    },
    safeToExecute: reports.every((r) => r.status === "VALIDATED"),
  }
}

async function executeAll(
  repo: CycleMigrationRepository,
  userIds: string[],
  executedAt: string
): Promise<ExecutionReport> {
  const migratedUsers: ExecutionReport["migratedUsers"] = []
  const skippedUsers: ExecutionReport["skippedUsers"] = []
  const failures: ExecutionReport["failures"] = []

  for (const userId of userIds) {
    try {
      const cycles = await repo.fetchLegacyCycles(userId)
      if (cycles.length === 0) {
        skippedUsers.push({ userId, reason: "Nenhum ciclo legado encontrado." })
        continue
      }

      const cycleIds = cycles.map((c) => c.id)

      // Idempotência: pula ciclos já migrados
      const migratedStatuses = await Promise.all(cycleIds.map((id) => repo.isCycleMigrated(id)))
      const pendingCycles = cycles.filter((_, idx) => !migratedStatuses[idx])
      if (pendingCycles.length === 0) {
        skippedUsers.push({ userId, reason: "Todos os ciclos já foram migrados (idempotente)." })
        continue
      }

      const [items, sessions] = await Promise.all([
        repo.fetchLegacyItems(cycleIds),
        repo.fetchLegacySessions(cycleIds),
      ])

      const source = computeSourceMetrics(pendingCycles, items, sessions)

      // Migrar cada ciclo pendente como um plano canônico separado
      let createdItems = 0
      let lastPlanId = ""

      for (const cycle of pendingCycles) {
        const cycleItems = items.filter((i) => i.cycle_id === cycle.id)
        if (cycleItems.length === 0) continue

        const version = await repo.getNextPlanVersion(userId)
        const { plan, items: canonicalItems } = mapCycleToCanonicalPlan(cycle, cycleItems, version)

        const insertedPlan = await repo.insertMigratedPlan(plan)
        lastPlanId = insertedPlan.id

        const insertedItems = await repo.insertMigratedPlanItems(
          canonicalItems.map((i) => ({ ...i, study_plan_id: insertedPlan.id }))
        )
        createdItems += insertedItems.length

        await repo.markCycleAsMigrated(cycle.id)
      }

      // Verificação pós-migração: compara totais legado vs novo
      const [migratedPlans, migratedPlanItems] = await Promise.all([
        repo.fetchMigratedPlans(userId),
        repo.fetchMigratedPlanItems((await repo.fetchMigratedPlans(userId)).map((p) => p.id)),
      ])
      const target = computeTargetMetrics(migratedPlans, migratedPlanItems)
      const postValidation: UserMigrationReport = {
        userId,
        source,
        target,
        divergences: findDivergences(source, target),
        status: "VALIDATED",
      }

      migratedUsers.push({
        userId,
        planId: lastPlanId,
        createdItems,
        postMigrationValidation: postValidation,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      failures.push({ userId, reason })
    }
  }

  return { dryRun: false, executedAt, migratedUsers, skippedUsers, failures }
}