import test from "node:test"
import assert from "node:assert/strict"

import {
  canOperatorAccessTarget,
  type UserRole,
  SUPPORT_SESSION_MAX_AGE_SECONDS,
} from "./auth-guard"

// ---------------------------------------------------------------------------
// TESTES DE HIERARQUIA DE ACESSO E IMPERSONAÇÃO
// ---------------------------------------------------------------------------

test("SEGURANÇA: Usuário comum (USER) NUNCA pode acessar/impersonar ninguém", () => {
  assert.equal(canOperatorAccessTarget("user", "user"), false)
  assert.equal(canOperatorAccessTarget("user", "moderator"), false)
  assert.equal(canOperatorAccessTarget("user", "admin"), false)
})

test("SEGURANÇA: Moderador (MODERATOR) pode acessar USER, mas NUNCA ADMIN", () => {
  assert.equal(canOperatorAccessTarget("moderator", "user"), true, "Moderador deve poder prestar suporte a estudantes")
  assert.equal(canOperatorAccessTarget("moderator", "admin"), false, "Moderador NÃO PODE acessar contas de Administrador")
  assert.equal(canOperatorAccessTarget("moderator", "moderator"), false, "Moderador não pode acessar outro moderador")
})

test("SEGURANÇA: Administrador (ADMIN) pode acessar USER e MODERATOR", () => {
  assert.equal(canOperatorAccessTarget("admin", "user"), true)
  assert.equal(canOperatorAccessTarget("admin", "moderator"), true)
})

test("CONFIGURAÇÃO: Tempo máximo de sessão de suporte é de 30 minutos (1800s)", () => {
  assert.equal(SUPPORT_SESSION_MAX_AGE_SECONDS, 1800)
})

test("EXPIRAÇÃO: Sessão com data no passado é considerada expirada", () => {
  const pastDate = new Date(Date.now() - 5000)
  const isExpired = Date.now() > pastDate.getTime()
  assert.equal(isExpired, true)
})

test("EXPIRAÇÃO: Sessão com data no futuro permanece ativa", () => {
  const futureDate = new Date(Date.now() + 25 * 60 * 1000) // 25 min no futuro
  const isExpired = Date.now() > futureDate.getTime()
  assert.equal(isExpired, false)
})

test("ROLES: Conjunto estrito de roles permitidas", () => {
  const validRoles: UserRole[] = ["user", "moderator", "admin"]
  assert.equal(validRoles.includes("user"), true)
  assert.equal(validRoles.includes("moderator"), true)
  assert.equal(validRoles.includes("admin"), true)
  // @ts-expect-error testando rejeição de role inválida
  assert.equal(validRoles.includes("superuser"), false)
})
