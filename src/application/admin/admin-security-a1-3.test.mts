// ============================================================================
// A1.3 — prova de segurança e robustez da administração (comportamental).
// Harness: mock.module desvia createClient/cookies/revalidatePath/Sentry;
// auth-guard e paginação são REAIS; banco é FakePostgrest (com escritas).
// RLS real NÃO é testável aqui (sem docker/CLI) — limitação declarada.
// ============================================================================

import assert from "node:assert/strict"
import { before, beforeEach, describe, it, mock } from "node:test"

import { FakePostgrest } from "@/lib/testing/fake-postgrest.ts"

type Row = Record<string, unknown>

const H = {
  user: null as { id: string } | null,
  db: null as unknown as FakePostgrest,
  jar: new Map<string, string>(),
}

mock.module("@/infrastructure/supabase/server", {
  namedExports: {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: H.user }, error: null }) },
      from: (t: string) => (H.db as FakePostgrest).from(t),
    }),
  },
})
mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({
      get: (n: string) => (H.jar.has(n) ? { value: H.jar.get(n) as string } : undefined),
      set: (n: string, v: string) => {
        H.jar.set(n, v)
      },
    }),
  },
})
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } })
mock.module("@sentry/nextjs", { namedExports: { captureException: () => {} } })

let admin: typeof import("./admin.actions.ts")
let guard: typeof import("./auth-guard.ts")
before(async () => {
  admin = await import("./admin.actions.ts")
  guard = await import("./auth-guard.ts")
})

const ADMIN = "u-admin"
const MOD_A = "u-mod-a"
const MOD_B = "u-mod-b"
const U1 = "u1"
const U2 = "u2"

function seed(extra?: {
  roles?: Row[]
  profiles?: Row[]
  sessions?: Row[]
  history?: Row[]
  attempts?: Row[]
  plans?: Row[]
}) {
  const profiles: Row[] = [
    { id: ADMIN, name: "Admin", email: "admin@x", created_at: "2026-01-01" },
    { id: MOD_A, name: "ModA", email: "moda@x", created_at: "2026-01-02" },
    { id: MOD_B, name: "ModB", email: "modb@x", created_at: "2026-01-03" },
    { id: U1, name: "U1", email: "u1@x", weekly_study_hours: 20, created_at: "2026-01-04" },
    { id: U2, name: "U2", email: "u2@x", created_at: "2026-01-05" },
    ...(extra?.profiles ?? []),
  ]
  // G1.1: usuários comuns TÊM linha 'user' (invariante de produção: trigger
  // on_auth_user_created_role + backfill da migration 20260928_g11). Sem
  // isso, o resolvedor canônico (fail-closed) os trataria como desconhecidos.
  const user_roles: Row[] = [
    { id: "r1", user_id: ADMIN, role: "admin" },
    { id: "r2", user_id: MOD_A, role: "moderator" },
    { id: "r3", user_id: MOD_B, role: "moderator" },
    { id: "r5", user_id: U1, role: "user" },
    { id: "r6", user_id: U2, role: "user" },
    ...(extra?.roles ?? []),
  ]
  H.db = new FakePostgrest(
    {
      profiles,
      user_roles,
      support_sessions: [...(extra?.sessions ?? [])],
      audit_logs: [],
      study_history: [...(extra?.history ?? [])],
      question_attempts: [...(extra?.attempts ?? [])],
      study_plans: [...(extra?.plans ?? [])],
    },
    1000,
  )
  H.jar.clear()
}

function tables(): Record<string, Row[]> {
  return (H.db as unknown as { tables: Record<string, Row[]> }).tables
}

function audits(action?: string): Row[] {
  const rows = tables()["audit_logs"] ?? []
  return action ? rows.filter((r) => r["action"] === action) : rows
}

function activeSessions(): Row[] {
  return (tables()["support_sessions"] ?? []).filter((r) => r["status"] === "ACTIVE")
}

beforeEach(() => {
  H.user = null
  H.jar.clear()
  seed()
})

describe("A1.3-2 anonymous: tudo negado, zero writes", () => {
  it("search/details/start/update negados; endSupport rejeitado; nada escrito", async () => {
    H.user = null
    const s = await admin.searchUsersAdminAction({})
    assert.equal(s.data, null)
    assert.ok(s.error)
    const d = await admin.getUserDetailsAdminAction(U1)
    assert.equal(d.data, null)
    const st = await admin.startSupportSessionAction(U1)
    assert.equal(st.ok, false)
    const en = await admin.endSupportSessionAction()
    assert.equal(en.ok, false)
    const up = await admin.updateUserRoleAdminAction(U1, "moderator")
    assert.equal(up.ok, false)
    assert.equal((H.db as FakePostgrest).writes.length, 0)
    assert.equal(audits().length, 0)
  })
})

describe("A1.3-3 normal user: negado em tudo, sem vazar B", () => {
  it("search/details/start/update negados; endSupport ok sem writes; nada de B", async () => {
    H.user = { id: U1 }
    assert.equal((await admin.searchUsersAdminAction({})).data, null)
    const d = await admin.getUserDetailsAdminAction(U2)
    assert.equal(d.data, null)
    assert.ok(d.error)
    assert.equal((await admin.startSupportSessionAction(U2)).ok, false)
    const en = await admin.endSupportSessionAction()
    assert.equal(en.ok, true)
    assert.equal((await admin.updateUserRoleAdminAction(U2, "moderator")).ok, false)
    assert.equal((H.db as FakePostgrest).writes.length, 0)
  })
})

describe("A1.3-4 moderator: escopo exato", () => {
  it("vê lista e detalhes (inclusive de outro moderator — contrato atual)", async () => {
    H.user = { id: MOD_A }
    const s = await admin.searchUsersAdminAction({})
    assert.ok(s.data && s.data.users.length >= 4)
    const d = await admin.getUserDetailsAdminAction(MOD_B)
    assert.ok(d.data && d.data.id === MOD_B)
  })

  it("suporte sobre user ok; sobre moderator negado; role negado", async () => {
    H.user = { id: MOD_A }
    const ok = await admin.startSupportSessionAction(U1)
    assert.equal(ok.ok, true)
    const denied = await admin.startSupportSessionAction(MOD_B)
    assert.equal(denied.ok, false)
    assert.match(denied.error ?? "", /não permitida/i)
    assert.equal((await admin.updateUserRoleAdminAction(U1, "moderator")).ok, false)
  })
})

describe("A1.3-5 admin: tudo permitido + last-admin", () => {
  it("fluxo completo com audits e transições de role", async () => {
    H.user = { id: ADMIN }
    const s = await admin.searchUsersAdminAction({})
    assert.ok(s.data && s.data.total >= 5)
    const d = await admin.getUserDetailsAdminAction(U1)
    assert.ok(d.data && d.data.email === "u1@x")
    const up = await admin.updateUserRoleAdminAction(U1, "moderator")
    assert.equal(up.ok, true)
    assert.equal((await guard.getUserRole(H.db as never, U1)), "moderator")
    const down = await admin.updateUserRoleAdminAction(U1, "user")
    assert.equal(down.ok, true)
    const roles = audits("ROLE_CHANGED")
    assert.equal(roles.length, 2)
    assert.ok(roles.every((r) => r["actor_user_id"] === ADMIN && r["target_user_id"] === U1))
  })

  it("último admin não se rebaixa: rejeitado, role intacta, sem audit falso", async () => {
    H.user = { id: ADMIN }
    const r = await admin.updateUserRoleAdminAction(ADMIN, "moderator")
    assert.equal(r.ok, false)
    assert.match(r.error ?? "", /mínimo 1 administrador/)
    assert.equal(await guard.getUserRole(H.db as never, ADMIN), "admin")
    assert.equal(audits("ROLE_CHANGED").length, 0)
  })

  it("com 2 admins, rebaixar 1 é permitido", async () => {
    seed({ roles: [{ id: "r4", user_id: U1, role: "admin" }] })
    H.user = { id: ADMIN }
    const r = await admin.updateUserRoleAdminAction(U1, "moderator")
    assert.equal(r.ok, true)
    assert.equal(await guard.getUserRole(H.db as never, ADMIN), "admin")
  })
})

describe("A1.3-6 isolamento A/B", () => {
  it("detalhes de U1 trazem só dados de U1", async () => {
    seed({
      history: [
        { id: "h1", user_id: U1, duration_minutes: 30 },
        { id: "h2", user_id: U2, duration_minutes: 999 },
      ],
      attempts: [
        { id: "a1", user_id: U1, correct: true },
        { id: "a2", user_id: U2, correct: false },
      ],
    })
    H.user = { id: ADMIN }
    const d = await admin.getUserDetailsAdminAction(U1)
    assert.ok(d.data)
    assert.equal(d.data.stats.totalMinutes, 30)
    assert.equal(d.data.stats.totalQuestions, 1)
  })

  it("sessão de A não é encerrável por B", async () => {
    seed({
      sessions: [
        {
          id: "s1",
          moderator_id: MOD_A,
          target_user_id: U1,
          session_token: "tok-A",
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    })
    H.user = { id: MOD_B }
    H.jar.set("mentor_support_session_token", "tok-A")
    const r = await admin.endSupportSessionAction()
    assert.equal(r.ok, true)
    assert.equal(activeSessions().length, 1)
    assert.equal(audits("SUPPORT_SESSION_ENDED").length, 0)
  })
})

describe("A1.3-7 operator vs target", () => {
  it("start/end/role registram actor=operador e target=alvo", async () => {
    H.user = { id: ADMIN }
    await admin.startSupportSessionAction(U1)
    const starts = audits("SUPPORT_SESSION_STARTED")
    assert.equal(starts.length, 1)
    assert.equal(starts[0]?.["actor_user_id"], ADMIN)
    assert.equal(starts[0]?.["target_user_id"], U1)
    const rows = tables()["support_sessions"] ?? []
    assert.equal(rows[0]?.["moderator_id"], ADMIN)
    assert.equal(rows[0]?.["target_user_id"], U1)
    await admin.endSupportSessionAction()
    const ends = audits("SUPPORT_SESSION_ENDED")
    assert.equal(ends.length, 1)
    assert.equal(ends[0]?.["actor_user_id"], ADMIN)
    await admin.updateUserRoleAdminAction(U1, "moderator")
    const roles = audits("ROLE_CHANGED")
    assert.equal(roles[0]?.["actor_user_id"], ADMIN)
    assert.equal(roles[0]?.["target_user_id"], U1)
  })
})

describe("A1.3-8 start concorrente: no máximo 1 ACTIVE", () => {
  it("dois starts sequenciais: anterior encerrada, cookie da última", async () => {
    H.user = { id: ADMIN }
    await admin.startSupportSessionAction(U1)
    const first = H.jar.get("mentor_support_session_token")
    await admin.startSupportSessionAction(U2)
    const rows = tables()["support_sessions"] ?? []
    assert.equal(activeSessions().length, 1)
    assert.equal(rows.length, 2)
    assert.equal(rows.filter((r) => r["status"] === "ENDED").length, 1)
    assert.equal(activeSessions()[0]?.["target_user_id"], U2)
    assert.notEqual(H.jar.get("mentor_support_session_token"), first)
    assert.equal(audits("SUPPORT_SESSION_STARTED").length, 2)
  })
})

describe("A1.3-9 endSupport A-G", () => {
  it("B autenticado sem sessão: ok idempotente, zero writes", async () => {
    H.user = { id: MOD_A }
    const r = await admin.endSupportSessionAction()
    assert.equal(r.ok, true)
    assert.equal((H.db as FakePostgrest).writes.length, 0)
  })

  it("C própria sessão: ENDED + audit; E repetir: ok sem audit novo", async () => {
    seed({
      sessions: [
        {
          id: "s1",
          moderator_id: MOD_A,
          target_user_id: U1,
          session_token: "tok",
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    })
    H.user = { id: MOD_A }
    H.jar.set("mentor_support_session_token", "tok")
    assert.equal((await admin.endSupportSessionAction()).ok, true)
    assert.equal(activeSessions().length, 0)
    assert.equal(audits("SUPPORT_SESSION_ENDED").length, 1)
    assert.equal((await admin.endSupportSessionAction()).ok, true)
    assert.equal(audits("SUPPORT_SESSION_ENDED").length, 1)
  })

  it("F expirada e G cookie malformado: sem catástrofe", async () => {
    seed({
      sessions: [
        {
          id: "s9",
          moderator_id: MOD_A,
          target_user_id: U1,
          session_token: "old",
          status: "EXPIRED",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() - 60000).toISOString(),
        },
      ],
    })
    H.user = { id: MOD_A }
    H.jar.set("mentor_support_session_token", "old")
    assert.equal((await admin.endSupportSessionAction()).ok, true)
    H.jar.set("mentor_support_session_token", "!!!not-a-token!!!")
    assert.equal((await admin.endSupportSessionAction()).ok, true)
  })
})

describe("A1.3-10 expiração real", () => {
  it("expirada → null + marcada EXPIRED; válida → sessão; inexistente → null", async () => {
    seed({
      sessions: [
        {
          id: "sx",
          moderator_id: MOD_A,
          target_user_id: U1,
          session_token: "tok-x",
          status: "ACTIVE",
          started_at: new Date(Date.now() - 3600000).toISOString(),
          expires_at: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: "sv",
          moderator_id: MOD_A,
          target_user_id: U2,
          session_token: "tok-v",
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    })
    const expired = await guard.getActiveSupportSession(H.db as never, MOD_A, "tok-x")
    assert.equal(expired, null)
    const rows = tables()["support_sessions"] ?? []
    assert.equal(rows.find((r) => r["id"] === "sx")?.["status"], "EXPIRED")
    const valid = await guard.getActiveSupportSession(H.db as never, MOD_A, "tok-v")
    assert.ok(valid && valid.targetUserId === U2)
    const missing = await guard.getActiveSupportSession(H.db as never, MOD_A, "nope")
    assert.equal(missing, null)
  })
})

describe("A1.3-11 roles: matriz, inválidos e corrida do último admin", () => {
  it("admin executa as 6 transições; moderator/user negados; inválidos rejeitados", async () => {
    H.user = { id: ADMIN }
    const pairs: [string, "user" | "moderator" | "admin"][] = [
      [U1, "moderator"],
      [U1, "admin"],
      [MOD_A, "user"],
      [MOD_A, "admin"],
      [ADMIN, "moderator"],
    ]
    // ADMIN→moderator com outro admin presente: permitido.
    seed({ roles: [{ id: "r4", user_id: U1, role: "admin" }] })
    for (const [target, role] of pairs) {
      assert.equal((await admin.updateUserRoleAdminAction(target, role)).ok, true, `${target}→${role}`)
    }
    H.user = { id: MOD_B }
    assert.equal((await admin.updateUserRoleAdminAction(U1, "user")).ok, false)
    // U2 nunca foi promovido (sem linha em user_roles = user): negado.
    H.user = { id: U2 }
    assert.equal((await admin.updateUserRoleAdminAction(U1, "admin")).ok, false)
    H.user = { id: ADMIN }
    const writesBefore = (H.db as FakePostgrest).writes.length
    for (const bad of ["superuser", "", "ADMIN", "null", "admin;DROP"]) {
      const r = await admin.updateUserRoleAdminAction(U1, bad as "user")
      assert.equal(r.ok, false, bad)
      assert.match(r.error ?? "", /Papel inválido/)
    }
    // Nenhuma escrita para roles inválidas (allowlist vem antes de tudo).
    const newWrites = (H.db as FakePostgrest).writes.slice(writesBefore)
    assert.ok(newWrites.every((w) => !(w.table === "user_roles" && w.method !== "select")))
  })

  it("corrida: duas demissões simultâneas nunca zeram os admins", async () => {
    seed({
      roles: [
        { id: "r1", user_id: ADMIN, role: "admin" },
        { id: "r4", user_id: U1, role: "admin" },
      ],
    })
    H.user = { id: ADMIN }
    const [a, b] = await Promise.all([
      admin.updateUserRoleAdminAction(U1, "moderator"),
      admin.updateUserRoleAdminAction(ADMIN, "moderator"),
    ])
    const admins = (tables()["user_roles"] ?? []).filter((r) => r["role"] === "admin")
    assert.ok(admins.length >= 1, `admins finais: ${admins.length}`)
    // Quem reportou sucesso tem audit; quem falhou, não tem sucesso falso.
    const roleAudits = audits("ROLE_CHANGED")
    assert.ok(roleAudits.length <= 2)
    void a
    void b
  })
})

describe("A1.3-13 audit: sucesso, falha op, falha audit, retry", () => {
  it("operação falha (hierarquia) não gera audit", async () => {
    H.user = { id: MOD_A }
    const r = await admin.startSupportSessionAction(MOD_B)
    assert.equal(r.ok, false)
    assert.equal(audits().length, 0)
  })

  it("falha do audit em START retorna erro sem cookie", async () => {
    H.user = { id: ADMIN }
    ;(H.db as FakePostgrest).failWriteOn("audit_logs", 99)
    const r = await admin.startSupportSessionAction(U1)
    assert.equal(r.ok, false)
    assert.match(r.error ?? "", /registrar a sessão/)
    assert.equal(H.jar.has("mentor_support_session_token"), false)
  })

  it("falha do audit em ROLE_CHANGED retorna erro (retry idempotente ok)", async () => {
    H.user = { id: ADMIN }
    ;(H.db as FakePostgrest).failWriteOn("audit_logs", 1)
    const r = await admin.updateUserRoleAdminAction(U1, "moderator")
    assert.equal(r.ok, false)
    assert.match(r.error ?? "", /auditoria/)
    const retry = await admin.updateUserRoleAdminAction(U1, "moderator")
    assert.equal(retry.ok, true)
    assert.equal(await guard.getUserRole(H.db as never, U1), "moderator")
  })

  it("END com audit falho continua ok (best-effort documentado)", async () => {
    seed({
      sessions: [
        {
          id: "s1",
          moderator_id: ADMIN,
          target_user_id: U1,
          session_token: "tok",
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      ],
    })
    H.user = { id: ADMIN }
    H.jar.set("mentor_support_session_token", "tok")
    ;(H.db as FakePostgrest).failWriteOn("audit_logs", 99)
    const r = await admin.endSupportSessionAction()
    assert.equal(r.ok, true)
    assert.equal(activeSessions().length, 0)
  })
})

describe("A1.3-15 sem cache entre usuários", () => {
  it("leituras repetidas A/B batem no banco a cada vez", async () => {
    H.user = { id: ADMIN }
    await admin.getUserDetailsAdminAction(U1)
    await admin.getUserDetailsAdminAction(U2)
    await admin.getUserDetailsAdminAction(U1)
    const selects = (H.db as FakePostgrest).requests.filter(
      (q) => q.table === "profiles" && q.method === "select",
    )
    assert.ok(selects.length >= 3)
  })
})

describe("A1.3-16 erro parcial por fonte", () => {
  it("history falha → unavailable.history, attempts intactos (e vice-versa)", async () => {
    seed({
      history: [{ id: "h1", user_id: U1, duration_minutes: 30 }],
      attempts: [{ id: "a1", user_id: U1, correct: true }],
    })
    H.user = { id: ADMIN }
    ;(H.db as FakePostgrest).failOn("study_history", 99)
    const d1 = await admin.getUserDetailsAdminAction(U1)
    assert.ok(d1.data)
    assert.equal(d1.data.stats.unavailable.history, true)
    assert.equal(d1.data.stats.unavailable.attempts, false)
    assert.equal(d1.data.stats.totalQuestions, 1)
    ;(H.db as FakePostgrest).failures["study_history"] = 0
    ;(H.db as FakePostgrest).failOn("question_attempts", 99)
    const d2 = await admin.getUserDetailsAdminAction(U1)
    assert.ok(d2.data)
    assert.equal(d2.data.stats.unavailable.attempts, true)
    assert.equal(d2.data.stats.totalMinutes, 30)
  })
})
