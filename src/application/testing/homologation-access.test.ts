import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"

import { FakePostgrest } from "@/lib/testing/fake-postgrest"

import {
  checkHomologationAccess,
  HOMOLOGATION_FORBIDDEN_MESSAGE,
  HOMOLOGATION_UNAUTHENTICATED_MESSAGE,
  runHomologationGuarded,
} from "./homologation-access"

// O serviço real (usado nos testes de "nenhuma escrita") importa módulos que
// validam as variáveis públicas do Supabase ao carregar — mesmo padrão dos
// outros testes: valores falsos e import dinâmico.
process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

async function homologationService() {
  return (await import("./homologation.service")).HomologationService
}

/**
 * Fase G.1 — a homologação (que grava dados de teste na conta de quem roda)
 * só pode ser usada por administradores, tanto pela página quanto chamando a
 * Server Action diretamente. Cliente Supabase falso em memória: nenhum
 * usuário é criado em banco real.
 */

const ADMIN = "11111111-1111-1111-1111-111111111111"
const MODERATOR = "22222222-2222-2222-2222-222222222222"
const COMMON = "33333333-3333-3333-3333-333333333333"
const NO_ROLE_ROW = "44444444-4444-4444-4444-444444444444"

const ROLES = [
  { user_id: ADMIN, role: "admin" },
  { user_id: MODERATOR, role: "moderator" },
  { user_id: COMMON, role: "user" },
]

type FakeClient = { db: FakePostgrest; supabase: SupabaseClient }

/** Mesmo formato de `supabase.auth.getUser()`; `userId` null = sem sessão. */
function client(userId: string | null, opts: { authError?: boolean } = {}): FakeClient {
  const db = new FakePostgrest({
    user_roles: ROLES,
    // tabelas que a homologação escreveria — se algo chegar aqui, o teste vê
    study_plans: [],
    study_history: [],
    user_disciplines: [],
  })
  const auth = {
    async getUser() {
      if (opts.authError) return { data: { user: null }, error: { message: "JWT expired" } }
      return { data: { user: userId ? { id: userId } : null }, error: null }
    },
  }
  const supabase = Object.assign(db, { auth }) as unknown as SupabaseClient
  return { db, supabase }
}

function readSource(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf-8")
}

describe("homologation: checkHomologationAccess (mecanismo de papéis existente — user_roles)", () => {
  it("A. administrador → permitido, com o id da própria sessão", async () => {
    const { supabase } = client(ADMIN)
    assert.deepEqual(await checkHomologationAccess(supabase), { allowed: true, userId: ADMIN })
  })

  it("B. moderador/suporte → negado (o papel cobre /admin e modo suporte, não esta ferramenta)", async () => {
    const { supabase } = client(MODERATOR)
    assert.deepEqual(await checkHomologationAccess(supabase), { allowed: false, reason: "FORBIDDEN" })
  })

  it("C. usuário comum → negado (com linha 'user' ou sem linha em user_roles)", async () => {
    assert.deepEqual(await checkHomologationAccess(client(COMMON).supabase), {
      allowed: false,
      reason: "FORBIDDEN",
    })
    assert.deepEqual(await checkHomologationAccess(client(NO_ROLE_ROW).supabase), {
      allowed: false,
      reason: "FORBIDDEN",
    })
  })

  it("E. sem sessão (ou sessão inválida) → negado como não autenticado, sem consultar papéis", async () => {
    for (const c of [client(null), client(ADMIN, { authError: true })]) {
      assert.deepEqual(await checkHomologationAccess(c.supabase), {
        allowed: false,
        reason: "UNAUTHENTICATED",
      })
      assert.equal(c.db.requests.length, 0)
    }
  })

  it("falha fechada: erro ao ler user_roles conta como usuário comum", async () => {
    const { supabase } = client(ADMIN)
    const broken = Object.assign(Object.create(supabase), {
      from() {
        throw new Error("rede indisponível")
      },
    }) as SupabaseClient
    assert.deepEqual(await checkHomologationAccess(broken), { allowed: false, reason: "FORBIDDEN" })
  })
})

describe("homologation: runHomologationGuarded (o que as Server Actions executam)", () => {
  it("D + F. usuário comum chamando a action diretamente → rejeitado e o fluxo real NUNCA roda (zero escrita)", async () => {
    const HomologationService = await homologationService()
    for (const userId of [COMMON, MODERATOR, NO_ROLE_ROW]) {
      const { db, supabase } = client(userId)
      const res = await runHomologationGuarded(supabase, (uid) =>
        HomologationService.runFlow1_FullCycle(supabase, uid),
      )
      assert.deepEqual(res, { data: null, error: HOMOLOGATION_FORBIDDEN_MESSAGE })
      assert.equal(db.writes.length, 0, "nenhuma escrita")
      // a única ida ao banco é a leitura do papel
      assert.deepEqual(
        db.requests.map((r) => `${r.method}:${r.table}`),
        ["select:user_roles"],
      )
    }
  })

  it("D + F. o mesmo vale para o teste do Mentor", async () => {
    const HomologationService = await homologationService()
    const { db, supabase } = client(COMMON)
    const res = await runHomologationGuarded(supabase, (uid) =>
      HomologationService.runTest_MentorEnergyDifference(supabase, uid),
    )
    assert.equal(res.data, null)
    assert.equal(res.error, HOMOLOGATION_FORBIDDEN_MESSAGE)
    assert.equal(db.writes.length, 0)
  })

  it("E. sem sessão → 'Não autenticado' e nada roda", async () => {
    const { db, supabase } = client(null)
    let ran = false
    const res = await runHomologationGuarded(supabase, async () => {
      ran = true
      return []
    })
    assert.deepEqual(res, { data: null, error: HOMOLOGATION_UNAUTHENTICATED_MESSAGE })
    assert.equal(ran, false)
    assert.equal(db.requests.length, 0)
  })

  it("A. administrador → o fluxo roda com o id do próprio admin", async () => {
    const { supabase } = client(ADMIN)
    const calls: string[] = []
    const res = await runHomologationGuarded(supabase, async (uid) => {
      calls.push(uid)
      return ["ok"]
    })
    assert.deepEqual(res, { data: ["ok"], error: null })
    assert.deepEqual(calls, [ADMIN])
  })
})

describe("homologation: wiring (página e Server Actions usam a checagem)", () => {
  const actions = readSource("src/application/testing/homologation.actions.ts")
  const page = readSource("src/app/(protected)/dashboard/homologation/page.tsx")

  it("toda Server Action exportada passa por runHomologationGuarded antes do HomologationService", () => {
    assert.ok(actions.startsWith('"use server"'))
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1])
    assert.deepEqual(exported, ["runHomologationFlow1Action", "runHomologationMentorAction"])
    const bodies = actions.split(/export async function /).slice(1)
    for (const body of bodies) {
      const guard = body.indexOf("runHomologationGuarded(")
      const service = body.indexOf("HomologationService.")
      assert.ok(guard !== -1, "action sem runHomologationGuarded")
      assert.ok(service > guard, "HomologationService só pode aparecer dentro do run protegido")
      assert.equal(body.includes("auth.getUser()"), false, "a autenticação é feita pelo guard, não à mão")
    }
  })

  it("página: sem sessão → /login; sem permissão → notFound(); o painel só renderiza depois disso", () => {
    const check = page.indexOf("checkHomologationAccess(supabase)")
    const deny = page.indexOf("notFound()")
    const panel = page.indexOf("<HomologationPanel />")
    assert.ok(check !== -1 && deny > check && panel > deny)
    assert.ok(page.includes('if (access.reason === "UNAUTHENTICATED") redirect("/login")'))
  })

  it("o serviço de homologação (valor, não só tipo) só é importado pelas actions protegidas", () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
          // `import type` não carrega o módulo; só imports de valor contam
          const valueImport = /^import\s+(?!type\b)[^\n]*homologation\.service"/m
          if (valueImport.test(fs.readFileSync(full, "utf-8"))) hits.push(path.relative(process.cwd(), full))
        }
      }
    }
    walk(path.join(process.cwd(), "src"))
    assert.deepEqual(hits.map((h) => h.split(path.sep).join("/")), ["src/application/testing/homologation.actions.ts"])
  })

  it("homologation-access.ts não é um arquivo de Server Actions (não vira endpoint)", () => {
    const access = readSource("src/application/testing/homologation-access.ts")
    assert.equal(/^\s*["']use server["']/m.test(access), false)
  })
})
