// ============================================================================
// A1.2 — integridade: erro!=vazio em details, total coerente com roleFilter,
// roles com erro honesto, semântica dos audits.
// Comportamental onde o módulo é puro; wiring onde a action exige servidor.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { auditSupportAction } from "./admin-audit.ts"

const actions = readFileSync(
  "src/application/admin/admin.actions.ts",
  "utf8",
)
const detailsView = readFileSync(
  "src/features/admin/components/admin-user-details-view.tsx",
  "utf8",
)

function fnBody(name: string): string {
  const start = actions.indexOf(`export async function ${name}`)
  assert.ok(start >= 0, `${name} deve existir`)
  const next = actions.indexOf("export async function", start + 10)
  return actions.slice(start, next === -1 ? undefined : next)
}

describe("A1.2 details 1-9: erro por fonte, nunca zero falso", () => {
  it("flags independentes history/attempts no contrato e no cálculo", () => {
    assert.match(actions, /historyUnavailable = historyResult\.error !== null/)
    assert.match(actions, /attemptsUnavailable = attemptsResult\.error !== null/)
    assert.match(actions, /unavailable: \{\s*history: historyUnavailable,\s*attempts: attemptsUnavailable,\s*\}/)
  })

  it("UI mostra 'Histórico indisponível' e 'Questões indisponíveis'", () => {
    assert.match(detailsView, /Histórico indisponível/)
    assert.match(detailsView, /Questões indisponíveis/)
    assert.match(detailsView, /unavailable\.history/)
    assert.match(detailsView, /unavailable\.attempts/)
  })

  it("falha numa fonte não zera a outra (cálculos usam só dados válidos)", () => {
    const body = fnBody("getUserDetailsAdminAction")
    assert.match(body, /const historyData = historyUnavailable \? \[\] : historyResult\.data/)
    assert.match(body, /const attemptsData = attemptsUnavailable \? \[\] : attemptsResult\.data/)
  })
})

describe("A1.2 search 10-16: total coerente com roleFilter", () => {
  it("roleFilter válido filtra no banco (ids) antes do count", () => {
    const body = fnBody("searchUsersAdminAction")
    assert.match(body, /\.from\("user_roles"\)/)
    assert.match(body, /\.in\("id", roleUserIds/)
    const idsIdx = body.indexOf('roleUserIds = (roleRows')
    const countIdx = body.indexOf('count: "exact"')
    assert.ok(idsIdx > 0 && countIdx > idsIdx)
  })

  it("roleFilter=user usa o conjunto exato (exclui só papel elevado)", () => {
    const body = fnBody("searchUsersAdminAction")
    assert.match(body, /\.in\("role", \["moderator", "admin"\]\)/)
    assert.match(body, /\.not\("id", "in"/)
  })

  it("roleFilter inválido é rejeitado (nunca lista filtrada + total global)", () => {
    const body = fnBody("searchUsersAdminAction")
    assert.match(body, /Filtro de papel inválido/)
  })

  it("sem filtro em memória restante (data/total do mesmo conjunto)", () => {
    const body = fnBody("searchUsersAdminAction")
    assert.doesNotMatch(body, /filteredUsers/)
  })
})

describe("A1.2 roles 17-19: erro honesto, sem admin fantasiado de user", () => {
  it("falha na leitura de roles invalida a resposta", () => {
    const body = fnBody("searchUsersAdminAction")
    assert.match(body, /rolesError/)
    assert.match(body, /Erro ao carregar papéis dos usuários/)
  })
})

describe("A1.2 audit 20-24: sem sucesso falso", () => {
  it("START falha sem cookie quando o audit falha", () => {
    const body = fnBody("startSupportSessionAction")
    assert.match(body, /start_support_audit/)
    assert.match(body, /Não foi possível registrar a sessão de suporte/)
  })

  it("ROLE_CHANGED falha quando o audit falha (upsert idempotente p/ retry)", () => {
    const body = fnBody("updateUserRoleAdminAction")
    assert.match(body, /role_changed_audit/)
    assert.match(body, /registro de auditoria falhou/)
  })

  it("END_SUPPORT documenta best-effort (limpeza idempotente)", () => {
    const body = fnBody("endSupportSessionAction")
    assert.match(body, /best-effort/)
  })

  it("comportamental: audit grava actor/target/action com prefixo SUPPORT_", async () => {
    const writes: Record<string, unknown>[] = []
    const fake = {
      from: (_t: string) => ({
        insert: (row: Record<string, unknown>) => {
          writes.push(row)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    } as never
    await auditSupportAction(fake, {
      supportSessionId: "s1",
      moderatorId: "m1",
      targetUserId: "t1",
      action: "DELETE_CYCLE",
      resource: "c1",
      result: "success",
    })
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0], {
      actor_user_id: "m1",
      target_user_id: "t1",
      action: "SUPPORT_DELETE_CYCLE",
      metadata: { supportSessionId: "s1", resource: "c1", result: "success" },
    })
  })

  it("comportamental: falha do audit nunca quebra o chamador", async () => {
    const fake = {
      from: (_t: string) => ({
        insert: () => Promise.reject(new Error("db fora")),
      }),
    } as never
    await auditSupportAction(fake, {
      supportSessionId: "s1",
      moderatorId: "m1",
      targetUserId: "t1",
      action: "X",
      resource: "y",
      result: "failure",
    })
  })

})
