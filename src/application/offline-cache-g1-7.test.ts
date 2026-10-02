// ============================================================================
// G1.7 — OFFLINE, CACHE, LOGOUT, ISOLAMENTO DE ESTADO.
// Harness local/isolado: IndexedDB real não existe no node, então o estado
// persistente é provado por (a) lógica pura do guarda, (b) travas wiring
// dos fluxos canônicos, (c) suíte offline existente (IDB/queue/worker).
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

process.env["NEXT_PUBLIC_SUPABASE_URL"] ??= "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ??= "mock-anon-key"

// Import dinâmico APÓS os stubs acima: a cadeia
// user-switch-guard → supabase/client valida env no load (mesmo padrão de
// integrity-g1-3.test.ts para review.service: loader async, nunca top-level).
type Guard = typeof import("@/infrastructure/offline/user-switch-guard.ts")
let guard: Guard | null = null
async function loadGuard(): Promise<Guard> {
  guard ??= (await import("@/infrastructure/offline/user-switch-guard.ts")) as Guard
  return guard
}

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// 1-2. Guarda de troca de usuário (G-31): decisão pura + sem-efeito sem browser.
// ---------------------------------------------------------------------------

describe("G-31 — guarda de troca de usuário", () => {
  it("1. detectUserSwitch: só troca quando há anterior E atual diferentes", async () => {
    const { detectUserSwitch } = await loadGuard()
    assert.equal(detectUserSwitch(null, "b"), false)
    assert.equal(detectUserSwitch("a", null), false)
    assert.equal(detectUserSwitch(null, null), false)
    assert.equal(detectUserSwitch("a", "a"), false)
    assert.equal(detectUserSwitch("a", "b"), true)
  })

  it("2. sem browser (SSR/teste): no-op honesto, nunca purga", async () => {
    const { purgeOnUserSwitch } = await loadGuard()
    assert.deepEqual(await purgeOnUserSwitch("a"), { switched: false })
    assert.deepEqual(await purgeOnUserSwitch(null), { switched: false })
  })

  it("3. boot global invoca o guarda e recarrega na troca (wiring)", () => {
    const body = src("src/features/study-session/components/study-provider.tsx")
    assert.match(body, /purgeOnUserSwitch\(resolvedUserId\)/)
    assert.match(body, /if \(switched\)/)
    assert.match(body, /window\.location\.reload\(\)/)
  })

  it("4. login SPA invoca o guarda e navega com replace na troca (wiring)", () => {
    const body = src("src/features/auth/components/login-form.tsx")
    assert.match(body, /purgeOnUserSwitch\(await getGuardUserId\(\)\)/)
    assert.match(body, /window\.location\.replace\("\/dashboard"\)/)
  })

  it("5. todos os logouts canônicos recarregam (timers morrem com o contexto)", () => {
    for (const path of [
      "src/features/auth/components/logout-button.tsx",
      "src/components/layout/header.tsx",
      "src/features/profile/components/account-settings-modal.tsx",
    ]) {
      const body = src(path)
      assert.match(body, /clearUserLocalData\(\)/, `${path} sem clearUserLocalData`)
      assert.match(body, /clearOfflinePrivateDataForLogout\(\)/, `${path} sem clear offline`)
      assert.match(body, /location\.replace\("\/login"\)/, `${path} sem reload`)
    }
  })

  it("6. recovery usa a action canônica (cookie de support também cai)", () => {
    const body = src("src/features/auth/components/update-password-form.tsx")
    assert.match(body, /logoutAction\(\)/)
    assert.doesNotMatch(body, /supabase\.auth\.signOut\(\)/)
  })
})

// ---------------------------------------------------------------------------
// 7-9. Fila e worker isolados por dono (G-31/G-39).
// ---------------------------------------------------------------------------

describe("G-31/G-39 — sync_queue e worker isolados por usuário", () => {
  it("7. worker só coleta do usuário corrente e re-checa dono por item", () => {
    const body = src("src/infrastructure/offline/sync-worker.ts")
    assert.match(body, /getPending\(userId\)/)
    assert.match(body, /if \(op\.userId !== userId\) continue/)
    assert.match(body, /if \(!userId\)/)
  })

  it("8. operação carrega userId obrigatório; mesma ID no retry", () => {
    const types = src("src/infrastructure/offline/types.ts")
    assert.match(types, /userId: string/)
    const worker = src("src/infrastructure/offline/sync-worker.ts")
    assert.match(worker, /isStillEligible\(op\)/)
  })

  it("9. logout nunca limpa a queue (decisão B documentada)", () => {
    const idx = src("src/infrastructure/offline/index.ts")
    assert.match(idx, /nunca é limpa por esta função/)
    assert.match(idx, /clearUserData\(userId\)/)
  })
})

// ---------------------------------------------------------------------------
// 10-12. Cache privado (G-30): erro não contamina; troca invalida.
// ---------------------------------------------------------------------------

describe("G-30 — cache privado não vaza entre usuários", () => {
  it("10. erro nunca é armazenado (wiring do mecanismo)", () => {
    const body = src("src/lib/server-action-cache.ts")
    assert.match(body, /inflight\.delete/)
    assert.doesNotMatch(body, /cacheStore\.set\([^)]*error/)
  })

  it("11. troca de identidade invalida o cache em memória", () => {
    assert.match(src("src/utils/user-data.ts"), /clearServerActionCache\(\)/)
    assert.match(src("src/features/auth/components/login-form.tsx"), /clearServerActionCache\(\)/)
  })

  it("12. sem sessão local, save recusa em vez de gravar órfão (suíte cobre)", () => {
    const body = src("src/infrastructure/offline/save-study-session.ts")
    assert.match(body, /getClientUserId|getUserId/)
  })
})

// ---------------------------------------------------------------------------
// 13. PWA/SW (G-57): comportamento documentado.
// ---------------------------------------------------------------------------

describe("G-57 — PWA shell sem Service Worker", () => {
  it("13. manifest existe; nenhum SW registrado no src", () => {
    assert.match(src("src/app/manifest.ts"), /display:\s*["']standalone["']/)
    assert.doesNotMatch(src("src/features/study-session/components/study-provider.tsx"), /serviceWorker/)
  })
})
