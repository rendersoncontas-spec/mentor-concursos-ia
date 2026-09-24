import { test } from "node:test"
import assert from "node:assert/strict"
import {
  runCycleMigration,
  type CycleMigrationRepository,
  type DryRunReport,
  type ExecutionReport,
} from "./cycle-migration.service"
import type { StudyCycle, StudyCycleItem } from "@/domain/study-cycle/study-cycle.types"
import type { StudyPlan, StudyPlanItem } from "@/domain/study-plan/study-plan.types"

/** Primeiro elemento, falhando o teste se a lista estiver vazia. */
function firstOf<T>(list: readonly T[]): T {
  const item = list[0]
  assert.ok(item !== undefined, "lista vazia")
  return item
}

// --- Mock Repo ---

const FAKE_REPO: CycleMigrationRepository = {
  listUserIdsWithCycles: async () => ["u1"],
  fetchLegacyCycles: async () => [
    { id: "c1", user_id: "u1", name: "Ciclo 1", status: "ACTIVE" } as StudyCycle,
  ],
  fetchLegacyItems: async () => [
    { cycle_id: "c1", planned_minutes: 60 } as StudyCycleItem,
  ],
  fetchLegacySessions: async () => [],
  fetchMigratedPlans: async () => [],
  fetchMigratedPlanItems: async () => [],
  insertMigratedPlan: async (p) => ({ id: "p1", ...p } as unknown as StudyPlan),
  insertMigratedPlanItems: async (items) => items.map((i, idx) => ({ id: `i${idx}`, ...i } as unknown as StudyPlanItem)),
  getNextPlanVersion: async () => 1,
  markCycleAsMigrated: async () => {},
  isCycleMigrated: async () => false,
}

test("migration: dry-run de ciclo com 60 min legado gera 60 min no plano", async () => {
  const result = await runCycleMigration(FAKE_REPO, { dryRun: true, userId: "u1" })
  assert.equal(result.dryRun, true)
  const dry = result as DryRunReport
  const first = firstOf(dry.users)
  assert.equal(first.source.itemsTotalPlannedMinutes, 60)
  assert.equal(first.target.itemsTotalMinutes, 60)
  assert.equal(first.status, "VALIDATED")
})

test("migration: execução real migra ciclo", async () => {
  const result = await runCycleMigration(FAKE_REPO, { dryRun: false, userId: "u1" })
  assert.equal(result.dryRun, false)
  const exec = result as ExecutionReport
  const migrated = firstOf(exec.migratedUsers)
  assert.equal(migrated.userId, "u1")
  assert.ok(migrated.planId)
})

test("migration: dry-run divergente detecta erro", async () => {
  const brokenRepo: CycleMigrationRepository = {
    ...FAKE_REPO,
    // Legacy source is 60, but we simulate that we have an existing plan with 100
    // so pending simulation won't find divergence, but if we mark it as migrated...
    // Actually simpler: override simulation logic by returning dummy legacy plan
    fetchLegacyCycles: async () => [{ id: "c1", user_id: "u1", name: "Ciclo 1", status: "ACTIVE" } as StudyCycle],
    fetchLegacyItems: async () => [{ cycle_id: "c1", planned_minutes: 100 } as StudyCycleItem],
    isCycleMigrated: async () => true,
    fetchMigratedPlans: async () => [{ id: "p1", user_id: "u1" } as StudyPlan],
    fetchMigratedPlanItems: async () => [{ study_plan_id: "p1", duration_minutes: 60 } as StudyPlanItem], // LEGADO=100, CANÔNICO=60
  }
  const result = await runCycleMigration(brokenRepo, { dryRun: true, userId: "u1" })
  const dry = result as DryRunReport
  assert.equal(firstOf(dry.users).status, "DIVERGENCES_FOUND")
})

test("migration: dry-run detecta drift em ciclo ja migrado (plano canônico diverge do legado)", async () => {
  const driftRepo: CycleMigrationRepository = {
    ...FAKE_REPO,
    isCycleMigrated: async () => true,
    fetchMigratedPlans: async () => [{ id: "p1", user_id: "u1" } as StudyPlan],
    fetchMigratedPlanItems: async () => [
      { study_plan_id: "p1", duration_minutes: 30 } as StudyPlanItem, // legado tem 60 → drift de -30
    ],
  }
  const result = await runCycleMigration(driftRepo, { dryRun: true, userId: "u1" })
  const dry = result as DryRunReport
  const user = firstOf(dry.users)
  assert.equal(user.status, "DIVERGENCES_FOUND")
  const minutesDiv = user.divergences.find((d) => d.field === "PLANNED_MINUTES")
  assert.ok(minutesDiv)
  assert.equal(minutesDiv.expected, 60)
  assert.equal(minutesDiv.actual, 30)
  assert.equal(minutesDiv.delta, -30)
  assert.equal(dry.safeToExecute, false)
})
