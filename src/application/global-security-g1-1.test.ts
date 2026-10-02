// ============================================================================
// G1.1 — SEGURANÇA E ISOLAMENTO GLOBAL.
// Cobertura mínima exigida pelo escopo (comportamental sempre que possível;
// wiring estático só onde a action exige runtime Next/Supabase real):
// G-01 (1-5), G-02 (6-8), G-17 (9-10), G-27 (11-13), G-28 (14-19),
// G-29 (20-25), G-30 (26-28), G-31 (29-33), G-03 (34-36).
// RLS real NÃO validada aqui (sem banco) — ver relatório G1.1 §7.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  canonicalDisciplineKey,
  isValidDisciplineColorHex,
  isValidDisciplineDisplayName,
  normalizeDisciplineColorHex,
  normalizeDisciplineDisplay,
  sameCanonicalDisciplineName,
} from "@/domain/disciplines/discipline-naming.ts"
import {
  classifyLibraryUrl,
  isAllowedLibraryUrl,
  isSafeHref,
  normalizeLibraryUrlInput,
} from "@/domain/library/library-url.ts"
import {
  decideAdminReadAccess,
  decideSupportAccess,
  resolveTargetRoleForAuthorization,
} from "@/application/admin/auth-guard.ts"
import {
  buildScopedCacheKey,
  clearServerActionCache,
  fetchWithCache,
  readFreshCache,
  seedCache,
  __resetServerActionCacheForTests,
} from "@/lib/server-action-cache.ts"
import {
  EDITAL_TOPIC_PROGRESS_IMPORT_LIMIT,
  fetchTopicProgress,
  importTopicProgress,
  isStorageMissingError,
  normalizeTopicKey,
  saveTopicChecked,
} from "@/application/edital/edital-topic-progress.service.ts"

// ---------------------------------------------------------------------------
// Fakes mínimos (comportamentais, sem Next/Supabase).
// ---------------------------------------------------------------------------

type FakeRow = Record<string, unknown>

function createFakeSupabase(opts: {
  rpcImpl?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  tables?: Record<string, FakeRow[]>
  throwOnTable?: string[]
}) {
  const tables: Record<string, FakeRow[]> = opts.tables ?? {}
  const throwOnTable = new Set(opts.throwOnTable ?? [])

  class Query {
    private table: string
    private filters: Array<(r: FakeRow) => boolean> = []
    private selectCols: string | null = null
    constructor(table: string) {
      this.table = table
    }
    select(cols: string) {
      this.selectCols = cols
      return this
    }
    eq(col: string, value: unknown) {
      this.filters.push((r) => r[col] === value)
      return this
    }
    private rows(): FakeRow[] {
      if (throwOnTable.has(this.table)) {
        throw { message: `relation "public.${this.table}" does not exist` }
      }
      return (tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)))
    }
    async maybeSingle() {
      try {
        const rows = this.rows()
        void this.selectCols
        return { data: rows[0] ?? null, error: null }
      } catch (err) {
        return { data: null, error: err }
      }
    }
    then<TResult1 = { data: FakeRow[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: FakeRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      try {
        const rows = this.rows()
        return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected)
      } catch (err) {
        return Promise.reject(err).then(onfulfilled, onrejected)
      }
    }
    async upsert(payload: FakeRow | FakeRow[], _opts?: Record<string, unknown>) {
      if (throwOnTable.has(this.table)) {
        return { data: null, error: { message: `relation "public.${this.table}" does not exist` } }
      }
      const list = Array.isArray(payload) ? payload : [payload]
      const store = (tables[this.table] ??= [])
      for (const row of list) store.push({ ...row })
      return { data: list, error: null }
    }
  }

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (opts.rpcImpl) return opts.rpcImpl(fn, args)
      return { data: null, error: { message: "rpc not mocked" } }
    },
    from: (table: string) => ({
      select: (cols: string) => new Query(table).select(cols),
      upsert: (payload: FakeRow | FakeRow[], upsertOpts?: Record<string, unknown>) =>
        new Query(table).upsert(payload, upsertOpts),
    }),
  }
}

// ---------------------------------------------------------------------------
// G-27 — normalização canônica.
// ---------------------------------------------------------------------------

describe("G-27 — mesma disciplina com diferenças de case/trim não duplica", () => {
  it("11a. case/trim/espaços/hífen colapsam para a mesma chave", () => {
    assert.equal(canonicalDisciplineKey("Direito Penal"), "direito penal")
    assert.equal(canonicalDisciplineKey("direito penal"), "direito penal")
    assert.equal(canonicalDisciplineKey("  Direito Penal  "), "direito penal")
    assert.equal(canonicalDisciplineKey("Direito  Penal"), "direito penal")
    assert.equal(canonicalDisciplineKey("Direito-Penal"), "direito penal")
    assert.ok(sameCanonicalDisciplineName("Direito Penal", "direito penal"))
    assert.ok(sameCanonicalDisciplineName("Direito Penal", " Direito-Penal "))
  })

  it("11b. acentos são dobrados na chave, mas preservados no display", () => {
    assert.equal(canonicalDisciplineKey("Raciocínio Lógico"), "raciocinio logico")
    assert.equal(normalizeDisciplineDisplay("  Raciocínio  Lógico "), "Raciocínio Lógico")
  })

  it("12. display original é preservado (caixa/acentos/hífen)", () => {
    assert.equal(normalizeDisciplineDisplay("Direito Penal"), "Direito Penal")
    assert.ok(isValidDisciplineDisplayName("Direito Previdenciário"))
    assert.ok(!isValidDisciplineDisplayName("   "))
    assert.ok(!isValidDisciplineDisplayName("x".repeat(121)))
    assert.ok(!isValidDisciplineDisplayName(42))
  })

  it("13. cores: null/automática ou #rrggbb; resto inválido", () => {
    assert.ok(isValidDisciplineColorHex(null))
    assert.ok(isValidDisciplineColorHex("#0ea5e9"))
    assert.ok(!isValidDisciplineColorHex("red"))
    assert.ok(!isValidDisciplineColorHex("#fff"))
    assert.equal(normalizeDisciplineColorHex("  #0EA5E9  "), "#0EA5E9")
    assert.equal(normalizeDisciplineColorHex(""), null)
  })
})

// ---------------------------------------------------------------------------
// G-28 — URLs da Biblioteca.
// ---------------------------------------------------------------------------

describe("G-28 — Biblioteca aceita só http(s) no servidor", () => {
  it("14/15. https e http válidos (incl. query e Unicode)", () => {
    assert.equal(classifyLibraryUrl("https://drive.google.com/file/abc"), "valid")
    assert.equal(classifyLibraryUrl("http://exemplo.com/a?b=1&c=2"), "valid")
    assert.equal(classifyLibraryUrl("https://exemplo.com/açaí"), "valid")
    assert.ok(isAllowedLibraryUrl("https://qconcursos.com/cadernos/1"))
  })

  it("16/17/18. javascript:/data:/vbscript: rejeitados (qualquer caixa)", () => {
    assert.equal(classifyLibraryUrl("javascript:alert(1)"), "invalid")
    assert.equal(classifyLibraryUrl("JaVaScRiPt:alert(1)"), "invalid")
    assert.equal(classifyLibraryUrl("data:text/html,<h1>x</h1>"), "invalid")
    assert.equal(classifyLibraryUrl("vbscript:msgbox(1)"), "invalid")
    assert.equal(classifyLibraryUrl("file:///etc/passwd"), "invalid")
    assert.ok(!isSafeHref("javascript:alert(1)"))
  })

  it("19. bordas/relativas/malformadas", () => {
    // whitespace nas bordas é aparado e aceito…
    assert.equal(classifyLibraryUrl("  https://exemplo.com/x  "), "valid")
    // …mas espaço interno, relativa e malformada são rejeitadas.
    assert.equal(classifyLibraryUrl("https://exemplo.com/a b"), "invalid")
    assert.equal(classifyLibraryUrl("/cadernos/1"), "invalid")
    assert.equal(classifyLibraryUrl("www.exemplo.com"), "invalid")
    assert.equal(classifyLibraryUrl("ht!tp://[invalido"), "invalid")
    assert.equal(classifyLibraryUrl(""), "empty")
    assert.equal(classifyLibraryUrl(undefined), "empty")
    assert.equal(normalizeLibraryUrlInput("  https://a.com  "), "https://a.com")
  })
})

// ---------------------------------------------------------------------------
// G-01 — hierarquia de suporte + fail-closed.
// ---------------------------------------------------------------------------

describe("G-01 — moderator nunca impersona admin; falha fecha", () => {
  it("1/2. moderator→user permitido; moderator→moderator negado (contrato)", () => {
    assert.equal(decideSupportAccess("moderator", "user").allowed, true)
    assert.equal(decideSupportAccess("moderator", "moderator").allowed, false)
  })

  it("3. moderator→admin negado", () => {
    const d = decideSupportAccess("moderator", "admin")
    assert.equal(d.allowed, false)
  })

  it("4. admin→user e admin→moderator permitidos; admin→admin negado (contrato)", () => {
    assert.equal(decideSupportAccess("admin", "user").allowed, true)
    assert.equal(decideSupportAccess("admin", "moderator").allowed, true)
    assert.equal(decideSupportAccess("admin", "admin").allowed, false)
    assert.equal(decideSupportAccess("user", "user").allowed, false)
    assert.equal(decideSupportAccess("user", "admin").allowed, false)
  })

  it("5. falha na resolução (null) → fail-closed para todos os operadores", () => {
    for (const op of ["user", "moderator", "admin"] as const) {
      const d = decideSupportAccess(op, null)
      assert.equal(d.allowed, false, `operador ${op} deveria negar com papel desconhecido`)
    }
  })

  it("G-01 comportamental: RPC resolve o papel real (não depende da RLS da tabela)", async () => {
    const db = createFakeSupabase({
      rpcImpl: async (fn, args) => {
        assert.equal(fn, "get_user_role")
        assert.equal(args["target_user_id"], "admin-1")
        return { data: "admin", error: null }
      },
      tables: { user_roles: [] }, // RLS própria-linha: 0 linhas visíveis
    })
    const role = await resolveTargetRoleForAuthorization(db as never, "admin-1")
    assert.equal(role, "admin")
    assert.equal(decideSupportAccess("moderator", role).allowed, false)
    assert.equal(decideSupportAccess("admin", role).allowed, false)
  })

  it("G-01 comportamental: sem RPC e sem linha (RLS own-only) → null, nunca 'user'", async () => {
    const db = createFakeSupabase({
      rpcImpl: async () => ({ data: null, error: { message: "function does not exist" } }),
      tables: { user_roles: [{ user_id: "mod-1", role: "moderator" }] },
    })
    // Moderador consulta o ADMIN: tabela não mostra (RLS) → null → nega.
    const role = await resolveTargetRoleForAuthorization(db as never, "admin-1")
    assert.equal(role, null)
    assert.equal(decideSupportAccess("moderator", role).allowed, false)
  })

  it("G-01 comportamental: sem RPC mas com linha legível → usa a linha (compatibilidade)", async () => {
    const db = createFakeSupabase({
      rpcImpl: async () => ({ data: null, error: { message: "function does not exist" } }),
      tables: { user_roles: [{ user_id: "user-9", role: "user" }] },
    })
    assert.equal(await resolveTargetRoleForAuthorization(db as never, "user-9"), "user")
  })

  it("G-01 comportamental: valor inesperado da RPC → null", async () => {
    const db = createFakeSupabase({
      rpcImpl: async () => ({ data: "superuser", error: null }),
    })
    assert.equal(await resolveTargetRoleForAuthorization(db as never, "x"), null)
    assert.equal(await resolveTargetRoleForAuthorization(db as never, ""), null)
  })
})

// ---------------------------------------------------------------------------
// G-03 — leitura administrativa com hierarquia.
// ---------------------------------------------------------------------------

describe("G-03 — moderator não lê admin; demais leituras preservadas", () => {
  it("34. moderator→admin read negado; moderator→user/moderator permitidos", () => {
    assert.equal(decideAdminReadAccess("moderator", "admin").allowed, false)
    assert.equal(decideAdminReadAccess("moderator", "user").allowed, true)
    assert.equal(decideAdminReadAccess("moderator", "moderator").allowed, true)
  })

  it("35/36. admin→todos permitido; user negado; null fail-closed", () => {
    assert.equal(decideAdminReadAccess("admin", "admin").allowed, true)
    assert.equal(decideAdminReadAccess("admin", "user").allowed, true)
    assert.equal(decideAdminReadAccess("user", "user").allowed, false)
    assert.equal(decideAdminReadAccess("moderator", null).allowed, false)
    assert.equal(decideAdminReadAccess("admin", null).allowed, false)
  })
})

// ---------------------------------------------------------------------------
// G-30 — cache isolado por escopo + limpeza em troca de identidade.
// ---------------------------------------------------------------------------

describe("G-30 — cache pessoal isolado por usuário/escopo", () => {
  it("26. A e B com o mesmo `key` lógico não compartilham dado", async () => {
    __resetServerActionCacheForTests()
    let callsA = 0
    let callsB = 0
    const keyA = buildScopedCacheKey("user-A", "recentStudyHistory:14")
    const keyB = buildScopedCacheKey("user-B", "recentStudyHistory:14")
    assert.notEqual(keyA, keyB)
    const a = await fetchWithCache(keyA, async () => (++callsA, "dados-A"), { ttl: 60_000 })
    const b = await fetchWithCache(keyB, async () => (++callsB, "dados-B"), { ttl: 60_000 })
    assert.equal(a, "dados-A")
    assert.equal(b, "dados-B")
    assert.equal(callsA, 1)
    assert.equal(callsB, 1)
  })

  it("27. mesmo usuário + mesmos args continua cacheado (sem refetch)", async () => {
    __resetServerActionCacheForTests()
    let calls = 0
    const k = buildScopedCacheKey("user-A", "activeCycleOverview")
    await fetchWithCache(k, async () => (++calls, { v: 1 }), { ttl: 60_000 })
    await fetchWithCache(k, async () => (++calls, { v: 2 }), { ttl: 60_000 })
    assert.equal(calls, 1)
  })

  it("28/target. escopo operador+target isola caches administrativos", async () => {
    __resetServerActionCacheForTests()
    const k1 = buildScopedCacheKey("mod-1:user-9", "userDetails")
    const k2 = buildScopedCacheKey("mod-2:user-9", "userDetails")
    assert.notEqual(k1, k2)
    await fetchWithCache(k1, async () => "visto-por-mod-1", { ttl: 60_000 })
    const fresh = readFreshCache<string>(k2, 60_000)
    assert.equal(fresh, null)
  })

  it("G-30 comportamental: clearUserLocalData limpa o cache (troca A→B)", async () => {
    __resetServerActionCacheForTests()
    const { clearUserLocalData } = await import("@/utils/user-data.ts")
    const store = new Map<string, string>()
    const fake = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    }
    const proxy = new Proxy(fake, {
      ownKeys: () => [...store.keys()],
      getOwnPropertyDescriptor: (_t, p) =>
        typeof p === "string" && store.has(p) ? { enumerable: true, configurable: true } : undefined,
    })
    ;(globalThis as Record<string, unknown>)["window"] = {}
    ;(globalThis as Record<string, unknown>)["localStorage"] = proxy
    seedCache("recentStudyHistory:14", ["dado-de-A"])
    // G-29: chave legada não-escopada também é removida no logout.
    store.set("mentor_edital_checked_topics", JSON.stringify({ "rlm-1": true }))
    clearUserLocalData()
    assert.equal(readFreshCache("recentStudyHistory:14", 60_000), null)
    assert.equal(store.has("mentor_edital_checked_topics"), false)
    delete (globalThis as Record<string, unknown>)["localStorage"]
    delete (globalThis as Record<string, unknown>)["window"]
  })

  it("G-30 comportamental: clearServerActionCache esvazia tudo", async () => {
    seedCache("k", "v")
    clearServerActionCache()
    assert.equal(readFreshCache("k", 60_000), null)
  })
})

// ---------------------------------------------------------------------------
// G-29 — progresso de tópicos server-side.
// ---------------------------------------------------------------------------

function progressDb(opts?: {
  targets?: FakeRow[]
  progress?: FakeRow[]
  missingTable?: boolean
}) {
  return createFakeSupabase({
    tables: {
      user_targets: opts?.targets ?? [{ id: "t1", user_id: "user-A" }],
      edital_topic_progress: opts?.progress ?? [],
    },
    throwOnTable: opts?.missingTable ? ["edital_topic_progress"] : [],
  })
}

describe("G-29 — edital_topic_progress por usuário (server é a verdade)", () => {
  it("20. usuário A lê o próprio progresso", async () => {
    const db = progressDb({ progress: [{ user_id: "user-A", target_id: "t1", topic_key: "rlm-1", checked: true }] })
    const res = await fetchTopicProgress(db as never, "user-A", "t1")
    assert.equal(res.status, "ok")
    assert.deepEqual(res.checked, { "rlm-1": true })
  })

  it("21/22. A não lê B e B não lê A (target de outro usuário = inválido)", async () => {
    const db = progressDb()
    assert.equal((await fetchTopicProgress(db as never, "user-B", "t1")).status, "invalid-target")
    assert.equal((await saveTopicChecked(db as never, "user-B", "t1", "rlm-1", true)).status, "invalid-target")
  })

  it("24. logout não mistura: escrita exige ownership do target", async () => {
    const db = progressDb({ targets: [{ id: "tB", user_id: "user-B" }] })
    const res = await saveTopicChecked(db as never, "user-A", "tB", "rlm-1", true)
    assert.equal(res.status, "invalid-target")
  })

  it("25. target/topic isolados + chave normalizada + limite de importação", async () => {
    const db = progressDb()
    assert.equal((await saveTopicChecked(db as never, "user-A", "t1", "  ", true)).status, "invalid-target")
    assert.equal((await saveTopicChecked(db as never, "user-A", "t1", "rlm-1", true)).status, "saved")
    assert.equal(normalizeTopicKey("x".repeat(321)), null)
    assert.equal(EDITAL_TOPIC_PROGRESS_IMPORT_LIMIT, 2000)
    const big: Record<string, boolean> = {}
    for (let i = 0; i < 2005; i++) big[`topic-${i}`] = true
    const imp = await importTopicProgress(db as never, "user-A", "t1", big)
    assert.equal(imp.status, "imported")
    if (imp.status === "imported") assert.equal(imp.imported, 2000)
  })

  it("G-29 comportamental: sem a tabela (pré-migration) → storage-unavailable honesto", async () => {
    const db = progressDb({ missingTable: true })
    assert.equal(isStorageMissingError({ message: 'relation "public.edital_topic_progress" does not exist' }), true)
    assert.equal((await fetchTopicProgress(db as never, "user-A", "t1")).status, "storage-unavailable")
    assert.equal((await saveTopicChecked(db as never, "user-A", "t1", "rlm-1", true)).status, "storage-unavailable")
  })
})

// ---------------------------------------------------------------------------
// G-31 — offline isolado entre usuários (comportamental, IndexedDB fake).
// 29. A offline cria operação; 30. logout limpa sessão/snapshots e mantém a
// fila isolada (decisão B documentada); 31/32. B não vê nem sincroniza A;
// 33. A retorna e encontra sua fila intacta.
// ---------------------------------------------------------------------------

describe("G-31 — USER A offline → logout → USER B nunca herda estado/fila", () => {
  let resetFakeIndexedDb: () => void
  let syncQueueMod: typeof import("../infrastructure/offline/sync-queue.ts")
  let sessionStoreMod: typeof import("../infrastructure/offline/session-store.ts")
  let snapshotMod: typeof import("../infrastructure/offline/snapshot-store.ts")
  let workerMod: typeof import("../infrastructure/offline/sync-worker.ts")

  it("setup do IndexedDB fake", async () => {
    const support = await import("../infrastructure/offline/test-support/fake-indexeddb.ts")
    support.installFakeIndexedDb()
    resetFakeIndexedDb = support.resetFakeIndexedDb
    syncQueueMod = await import("../infrastructure/offline/sync-queue.ts")
    sessionStoreMod = await import("../infrastructure/offline/session-store.ts")
    snapshotMod = await import("../infrastructure/offline/snapshot-store.ts")
    workerMod = await import("../infrastructure/offline/sync-worker.ts")
    assert.ok(resetFakeIndexedDb)
  })

  it("29/30. A cria operação + sessão + snapshot; logout limpa o privado e mantém SÓ a fila de A", async () => {
    resetFakeIndexedDb()
    const { syncQueue } = syncQueueMod
    const { sessionStore } = sessionStoreMod
    const { snapshotStore, ALL_SNAPSHOT_STORES } = snapshotMod

    await syncQueue.enqueue({
      userId: "user-A",
      type: "STUDY_SESSION_CREATE",
      entity: "study_history",
      payload: { discipline: "RLM" },
    })
    await sessionStore.set("user-A", {
      isActive: true,
      isMinimized: false,
      phase: "STUDYING",
      disciplineName: "RLM",
      disciplineId: undefined,
      topicName: "",
      studyType: "TEORIA",
      technique: "",
      notes: "",
      startTime: Date.now(),
      totalPausedMs: 0,
      lastPauseStartTime: null,
      plannedSeconds: 1500,
      activeSeconds: 100,
      pausedSeconds: 0,
      planItemId: null,
      source: "FREE",
    })
    await snapshotStore.set("dashboard_snapshot", "user-A", { v: 1 })

    // Logout de A = offlineStore.clearUserData("user-A") (mesmas 3 chamadas;
    // o barrel é só composição — wiring abaixo trava a composição real).
    await sessionStore.clear("user-A")
    await Promise.all(ALL_SNAPSHOT_STORES.map((s) => snapshotStore.clear(s, "user-A")))

    assert.equal(await sessionStore.get("user-A"), undefined)
    assert.equal(await snapshotStore.get("dashboard_snapshot", "user-A"), undefined)
    // Fila de A SOBREVIVE isolada (decisão B: sem perda silenciosa de estudo).
    assert.equal(await syncQueue.getPendingCount("user-A"), 1)
    // B não vê nada de A.
    assert.equal((await syncQueue.getPending("user-B")).length, 0)
    assert.equal(await syncQueue.getPendingCount("user-B"), 0)
  })

  it("31/32. worker como B não executa operação de A", async () => {
    resetFakeIndexedDb()
    const { syncQueue } = syncQueueMod
    const { createSyncPendingStudySessions } = workerMod
    await syncQueue.enqueue({
      userId: "user-A",
      type: "STUDY_SESSION_CREATE",
      entity: "study_history",
      payload: { discipline: "RLM" },
    })

    let saves = 0
    const syncAsB = createSyncPendingStudySessions({
      saveFn: async () => (++saves, { success: true, session: { id: "s1" } }),
      getUserId: async () => "user-B",
    })
    const summaryB = await syncAsB()
    assert.equal(saves, 0)
    assert.equal(summaryB.synced, 0)
    assert.equal(await syncQueue.getPendingCount("user-A"), 1)
  })

  it("33. A retorna e sincroniza a própria fila (comportamento da decisão B)", async () => {
    resetFakeIndexedDb()
    const { syncQueue } = syncQueueMod
    const { createSyncPendingStudySessions } = workerMod
    await syncQueue.enqueue({
      userId: "user-A",
      type: "STUDY_SESSION_CREATE",
      entity: "study_history",
      payload: { discipline: "RLM" },
    })

    let saves = 0
    const syncAsA = createSyncPendingStudySessions({
      saveFn: async () => (++saves, { success: true, session: { id: "s1" } }),
      getUserId: async () => "user-A",
    })
    const summaryA = await syncAsA()
    assert.equal(saves, 1)
    assert.equal(summaryA.synced, 1)
    assert.equal(await syncQueue.getPendingCount("user-A"), 0)
  })
})

// ---------------------------------------------------------------------------
// Wiring: actions usam os caminhos canônicos (sem fallback inseguro).
// ---------------------------------------------------------------------------

describe("G1.1 wiring — código chama os caminhos seguros", () => {
  const guard = readFileSync("src/application/admin/auth-guard.ts", "utf8")
  const actions = readFileSync("src/application/admin/admin.actions.ts", "utf8")
  const disciplines = readFileSync("src/application/disciplines/discipline-actions.ts", "utf8")
  const library = readFileSync("src/application/library/library.action.ts", "utf8")
  const accordion = readFileSync("src/features/edital/components/edital-accordion.tsx", "utf8")
  const biblioteca = readFileSync("src/features/biblioteca/components/biblioteca-view.tsx", "utf8")
  const login = readFileSync("src/features/auth/components/login-form.tsx", "utf8")
  const worker = readFileSync("src/infrastructure/offline/sync-worker.ts", "utf8")
  const hook = readFileSync("src/hooks/use-cached-server-action.ts", "utf8")

  it("G-01/G-03: suporte e leitura usam resolvedor canônico + decisão (sem getUserRole no alvo)", () => {
    assert.match(actions, /resolveTargetRoleForAuthorization\(supabase, targetUserId\)/)
    assert.match(actions, /decideSupportAccess\(operatorRole, targetRole\)/)
    assert.match(actions, /decideAdminReadAccess\(operatorRole, targetRole\)/)
    assert.doesNotMatch(actions, /const targetRole = await getUserRole\(supabase, targetUserId\)/)
    assert.doesNotMatch(actions, /const role = await getUserRole\(supabase, targetUserId\)/)
    assert.match(guard, /Nunca|nunca.*interpretar|fail-closed/i)
  })

  it("G-02 (6/7/8): global exige admin; pessoal vai para user_disciplines", () => {
    assert.match(disciplines, /requireAdmin\(supabase, operator\.id\)/)
    assert.match(disciplines, /custom_name/)
    assert.match(disciplines, /custom_color_hex/)
    assert.match(disciplines, /Vínculo com a disciplina não encontrado/)
  })

  it("G-17 (9/10): criação pessoal via user_disciplines; global só se canonicamente novo", () => {
    assert.match(disciplines, /findDisciplineByName\(supabase, displayName\)/)
    assert.match(disciplines, /name_key/)
  })

  it("G-28: action valida URL no servidor; views usam rel seguro + href seguro", () => {
    assert.match(library, /classifyLibraryUrl/)
    assert.match(library, /http:\/\/.*https:\/\//)
    assert.match(biblioteca, /rel="noopener noreferrer"/)
    assert.match(biblioteca, /isSafeHref\(item\.url\)/)
    assert.match(accordion, /rel="noopener noreferrer"/)
  })

  it("G-29: accordion lê do servidor (localStorage só migra)", () => {
    assert.match(accordion, /getEditalTopicProgressAction/)
    assert.match(accordion, /importEditalTopicProgressAction/)
    assert.match(accordion, /setEditalTopicProgressAction/)
  })

  it("G-30: hook tem escopo; login limpa cache na troca de identidade", () => {
    assert.match(hook, /scope\?: string \| null/)
    assert.match(hook, /buildScopedCacheKey\(scope, key\)/)
    assert.match(login, /clearServerActionCache\(\)/)
  })

  it("G-31 (29-33): logout limpa offline; worker valida dono da operação", () => {
    for (const f of [
      "src/components/layout/header.tsx",
      "src/features/auth/components/logout-button.tsx",
      "src/features/profile/components/account-settings-modal.tsx",
      "src/features/auth/components/update-password-form.tsx",
    ]) {
      assert.match(readFileSync(f, "utf8"), /clearOfflinePrivateDataForLogout\(\)/, `${f} não limpa offline`)
    }
    assert.match(worker, /op\.userId !== userId/)
    const barrel = readFileSync("src/infrastructure/offline/index.ts", "utf8")
    assert.match(barrel, /clearOfflinePrivateDataForLogout/)
    assert.match(barrel, /offlineStore\.clearUserData\(userId\)/)
    assert.doesNotMatch(barrel, /sync_queue.*delete|delete.*sync_queue/i)
  })

  it("G-04: get_user_role endurecida com checagem do chamador (migration)", () => {
    const migration = readFileSync("supabase/migrations/20260928_g11_catalog_ownership.sql", "utf8")
    assert.match(migration, /v_caller := auth\.uid\(\)/)
    assert.match(migration, /IN \('admin', 'moderator'\)/)
    assert.match(migration, /RETURN NULL/)
    assert.match(migration, /oráculo fechado/)
  })

  it("G-29/G-02: migrations criam tabela com RLS e colunas pessoais", () => {
    const progress = readFileSync("supabase/migrations/20260928_g11_edital_topic_progress.sql", "utf8")
    assert.match(progress, /ENABLE ROW LEVEL SECURITY/)
    assert.match(progress, /auth\.uid\(\) = user_id/)
    assert.match(progress, /UNIQUE \(user_id, target_id, topic_key\)/)
    const catalog = readFileSync("supabase/migrations/20260928_g11_catalog_ownership.sql", "utf8")
    assert.match(catalog, /custom_name/)
    assert.match(catalog, /custom_color_hex/)
    assert.match(catalog, /name_key/)
  })
})
