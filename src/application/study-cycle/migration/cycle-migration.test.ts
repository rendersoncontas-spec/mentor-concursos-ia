/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  runCycleMigration,
  type CycleMigrationRepository,
  type RunCycleMigrationInput,
} from "./cycle-migration.service"
import type { StudyCycle, StudyCycleItem, StudyCycleSession } from "@/domain/study-cycle/study-cycle.types"
import type { StudyPlan, StudyPlanItem } from "@/domain/study-plan/study-plan.types"

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
  const dry = result as any
  assert.equal(dry.users[0].source.itemsTotalPlannedMinutes, 60)
  assert.equal(dry.users[0].target.itemsTotalMinutes, 60)
  assert.equal(dry.users[0].status, "VALIDATED")
})

test("migration: execução real migra ciclo", async () => {
  const result = await runCycleMigration(FAKE_REPO, { dryRun: false, userId: "u1" })
  assert.equal(result.dryRun, false)
  const exec = result as any
  assert.equal(exec.migratedUsers[0].userId, "u1")
  assert.ok(exec.migratedUsers[0].planId)
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
  const dry = result as any
  assert.equal(dry.users[0].status, "DIVERGENCES_FOUND")
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
  const dry = result as any
  const user = dry.users[0]
  assert.equal(user.status, "DIVERGENCES_FOUND")
  const minutesDiv = user.divergences.find((d: any) => d.field === "PLANNED_MINUTES")
  assert.ok(minutesDiv)
  assert.equal(minutesDiv.expected, 60)
  assert.equal(minutesDiv.actual, 30)
  assert.equal(minutesDiv.delta, -30)
  assert.equal(dry.safeToExecute, false)
})
