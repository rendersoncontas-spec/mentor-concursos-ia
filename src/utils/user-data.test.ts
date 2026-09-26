// ============================================================================
// P1.4 — ISOLAMENTO DO PLANEJAMENTO ENTRE USUÁRIOS.
// 1) Comportamental: preenche as chaves do usuário A, executa
//    clearUserLocalData(), nenhuma chave pessoal pode permanecer.
// 2) Wiring: lista canônica completa + todos os caminhos de logout usam o
//    fluxo central (header, logout-button, account-settings, update-password).
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  clearUserLocalData,
  PERSONAL_PLANNING_STORAGE_KEYS,
} from "./user-data.ts"

const REQUIRED_PLANNING_KEYS = [
  "mentor_user_work_scale",
  "mentor_user_first_shift_day",
  "mentor_user_shift_anchor_date",
  "mentor_shift_anchor_date",
  "mentor_user_study_days",
  "mentor_user_weekly_hours",
  "mentor_user_session_min_minutes",
  "mentor_user_session_max_minutes",
  "mentor_user_session_style",
  "mentor_user_custom_scale",
  "mentor_user_first_day_of_week",
]

function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const fake = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
    clear: () => store.clear(),
  }
  ;(globalThis as Record<string, unknown>)["window"] = {}
  ;(globalThis as Record<string, unknown>)["localStorage"] = fake
  // Object.keys(localStorage) precisa enumerar as chaves:
  Object.defineProperties(fake, {})
  const proxy = new Proxy(fake, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (_t, p) =>
      typeof p === "string" && store.has(p)
        ? { enumerable: true, configurable: true }
        : undefined,
  })
  ;(globalThis as Record<string, unknown>)["localStorage"] = proxy
  return store
}

describe("P1.4 — lista canônica de chaves pessoais do Planejamento", () => {
  it("contém as 11 chaves obrigatórias da auditoria", () => {
    for (const key of REQUIRED_PLANNING_KEYS) {
      assert.ok(
        (PERSONAL_PLANNING_STORAGE_KEYS as string[]).includes(key),
        `falta ${key}`,
      )
    }
  })
})

describe("P1.4 — USUÁRIO A → logout → USUÁRIO B não herda nada", () => {
  it("clearUserLocalData remove as 12 chaves pessoais e preserva estado global", () => {
    const store = installFakeStorage()

    // Cenário: usuário A configurou tudo.
    const userA: Record<string, string> = {
      mentor_user_work_scale: "24x72",
      mentor_user_first_shift_day: "2",
      mentor_user_shift_anchor_date: "2026-09-01",
      mentor_shift_anchor_date: "2026-09-01",
      mentor_user_study_days: JSON.stringify(["seg", "ter", "qua"]),
      mentor_user_weekly_hours: "25",
      mentor_user_session_min_minutes: "45",
      mentor_user_session_max_minutes: "90",
      mentor_user_session_style: "equilibradas",
      mentor_user_custom_scale: JSON.stringify({ work: 3, off: 2 }),
      mentor_user_first_day_of_week: "Segunda-feira",
      mentor_custom_shift_days: JSON.stringify({ "2026-09-02": "PLANTAO" }),
      mentor_replan_info_cache: "{}",
      mentor_closed_block_keys: "[]",
    }
    for (const [k, v] of Object.entries(userA)) store.set(k, v)
    // Estado global não-pessoal deve sobreviver.
    store.set("sidebar-collapsed", "1")

    clearUserLocalData()

    for (const key of [
      ...REQUIRED_PLANNING_KEYS,
      "mentor_custom_shift_days",
      "mentor_replan_info_cache",
      "mentor_closed_block_keys",
    ]) {
      assert.equal(store.has(key), false, `${key} vazou para o próximo usuário`)
    }
    assert.equal(store.get("sidebar-collapsed"), "1")
  })
})

describe("P1.4 — todos os caminhos de logout usam o fluxo central", () => {
  const header = readFileSync("src/components/layout/header.tsx", "utf8")
  const logoutBtn = readFileSync(
    "src/features/auth/components/logout-button.tsx",
    "utf8",
  )
  const settings = readFileSync(
    "src/features/profile/components/account-settings-modal.tsx",
    "utf8",
  )
  const updatePwd = readFileSync(
    "src/features/auth/components/update-password-form.tsx",
    "utf8",
  )

  it("header, logout-button e account-settings chamam clearUserLocalData", () => {
    for (const [name, src] of [
      ["header", header],
      ["logout-button", logoutBtn],
      ["account-settings", settings],
    ] as const) {
      assert.match(src, /clearUserLocalData\(\)/, `${name} não limpa`)
    }
  })

  it("update-password usa o fluxo central (sem removeItem duplicado)", () => {
    assert.match(updatePwd, /clearUserLocalData\(\)/)
    assert.doesNotMatch(updatePwd, /localStorage\.removeItem/)
    const clearIdx = updatePwd.indexOf("clearUserLocalData()")
    const signOutIdx = updatePwd.indexOf("auth.signOut()")
    assert.ok(clearIdx > 0 && signOutIdx > clearIdx, "limpeza deve vir antes do signOut")
  })
})
