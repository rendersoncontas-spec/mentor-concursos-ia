// ============================================================================
// A1.1 — hardening de segurança da administração:
// A/B helper de auditoria não-público; C-E endSupport com dono;
// F-H allowlist de roles; I-K escape literal da busca.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { escapePostgrestOrValue } from "./search-escape.ts"

const actions = readFileSync(
  "src/application/admin/admin.actions.ts",
  "utf8",
)
const auditModule = readFileSync(
  "src/application/admin/admin-audit.ts",
  "utf8",
)
const cycleActions = readFileSync(
  "src/application/study-cycle/study-cycle.actions.ts",
  "utf8",
)

function fnBody(name: string): string {
  const start = actions.indexOf(`export async function ${name}`)
  assert.ok(start >= 0, `${name} deve existir`)
  const next = actions.indexOf("export async function", start + 10)
  return actions.slice(start, next === -1 ? undefined : next)
}

describe("A1.1-A/B auditSupportAction não é API pública; internos íntegros", () => {
  it("A: admin.actions.ts não exporta auditSupportAction", () => {
    assert.doesNotMatch(actions, /export (async function|const) auditSupportAction/)
  })

  it("B: implementação vive em módulo sem diretiva de servidor e o caller a usa", () => {
    assert.doesNotMatch(auditModule, /^"use server";?/m)
    assert.match(auditModule, /export async function auditSupportAction/)
    assert.match(cycleActions, /@\/application\/admin\/admin-audit"/)
    assert.match(cycleActions, /await auditSupportAction\(supabase, \{/)
  })
})

describe("A1.1-C/D/E endSupport exige dono; idempotente autenticado", () => {
  it("C: anônimo recebe erro sem tocar no banco", () => {
    const body = fnBody("endSupportSessionAction")
    assert.match(body, /if \(!operator\)/)
    const retIdx = body.indexOf("Não autenticado")
    const firstDbIdx = body.indexOf(".from(")
    assert.ok(retIdx > 0 && firstDbIdx > 0 && retIdx < firstDbIdx)
  })

  it("D/E: autenticado encerra a PRÓPRIA sessão; sem sessão continua ok", () => {
    const body = fnBody("endSupportSessionAction")
    assert.match(body, /\.eq\("moderator_id", operator\.id\)/)
    assert.match(body, /return \{ ok: true, error: null \}/)
  })
})

describe("A1.1-F/G/H allowlist de roles antes de tudo", () => {
  it("F/G/H: user/moderator/admin passam; resto rejeitado pré-DB", () => {
    const body = fnBody("updateUserRoleAdminAction")
    assert.match(body, /newRole !== "user" && newRole !== "moderator" && newRole !== "admin"/)
    assert.match(body, /Papel inválido/)
    const allowIdx = body.indexOf("Papel inválido")
    const authIdx = body.indexOf("requireAdmin(")
    const writeIdx = body.indexOf(".upsert(")
    assert.ok(allowIdx < authIdx && authIdx < writeIdx)
    // Trava do último admin preservada abaixo da autorização.
    assert.match(body, /no mínimo 1 administrador/)
  })
})

describe("A1.1-I/J/K busca literal com escape", () => {
  it("I: nome, e-mail, hífen, acento e números passam intactos (só citados)", () => {
    assert.equal(escapePostgrestOrValue("Maria Silva"), '"Maria Silva"')
    assert.equal(escapePostgrestOrValue("joao.silva+1@email.com"), '"joao.silva+1@email.com"')
    assert.equal(escapePostgrestOrValue("São-Paulo 123"), '"São-Paulo 123"')
  })

  it("J: %, _, vírgula, parênteses, aspas e barra não alteram o filtro", () => {
    assert.equal(escapePostgrestOrValue("100%"), '"100\\%"')
    assert.equal(escapePostgrestOrValue("a_b"), '"a\\_b"')
    assert.equal(escapePostgrestOrValue("a,b"), '"a,b"')
    assert.equal(escapePostgrestOrValue("a(b)"), '"a(b)"')
    assert.equal(escapePostgrestOrValue('diz "oi"'), '"diz \\"oi\\""')
    assert.equal(escapePostgrestOrValue("a\\b"), '"a\\\\b"')
    assert.equal(escapePostgrestOrValue(""), '""')
  })

  it("K: search usa o escape e e-mail continua buscável", () => {
    const body = fnBody("searchUsersAdminAction")
    assert.match(body, /escapePostgrestOrValue\(params\.query\.trim\(\)\)/)
    assert.match(body, /email\.ilike/)
  })
})
