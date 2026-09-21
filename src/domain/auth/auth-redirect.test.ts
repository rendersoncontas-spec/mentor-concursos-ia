import assert from "node:assert/strict"
import test from "node:test"

import { isSafeRedirectPath, resolvePostAuthDestination } from "./auth-redirect"

test("isSafeRedirectPath: aceita caminhos internos simples", () => {
  assert.equal(isSafeRedirectPath("/dashboard"), true)
  assert.equal(isSafeRedirectPath("/planejamento?tab=hoje"), true)
  assert.equal(isSafeRedirectPath("/ciclos"), true)
})

test("isSafeRedirectPath: rejeita valores vazios/ausentes", () => {
  assert.equal(isSafeRedirectPath(null), false)
  assert.equal(isSafeRedirectPath(undefined), false)
  assert.equal(isSafeRedirectPath(""), false)
})

test("isSafeRedirectPath: rejeita URLs absolutas (open redirect)", () => {
  assert.equal(isSafeRedirectPath("https://site-malicioso.com"), false)
  assert.equal(isSafeRedirectPath("http://evil.com/phish"), false)
  assert.equal(isSafeRedirectPath("javascript:alert(1)"), false)
})

test("isSafeRedirectPath: rejeita protocol-relative URLs (//host)", () => {
  assert.equal(isSafeRedirectPath("//evil.com"), false)
  assert.equal(isSafeRedirectPath("//evil.com/dashboard"), false)
})

test("isSafeRedirectPath: rejeita caminhos sem barra inicial", () => {
  assert.equal(isSafeRedirectPath("dashboard"), false)
  assert.equal(isSafeRedirectPath("evil.com/dashboard"), false)
})

test("isSafeRedirectPath: rejeita caminhos com espaços/controles embutidos usados para escapar", () => {
  assert.equal(isSafeRedirectPath("/dashboard\n.evil.com"), false)
  assert.equal(isSafeRedirectPath("/ da shboard"), false)
})

test("resolvePostAuthDestination: usa next seguro quando presente", () => {
  const dest = resolvePostAuthDestination({ onboardingCompleted: true, nextParam: "/ciclos" })
  assert.equal(dest, "/ciclos")
})

test("resolvePostAuthDestination: ignora next inseguro e cai para a regra de onboarding", () => {
  const dest = resolvePostAuthDestination({
    onboardingCompleted: true,
    nextParam: "https://evil.com",
  })
  assert.equal(dest, "/dashboard")
})

test("resolvePostAuthDestination: sem next, onboarding pendente vai para /onboarding", () => {
  const dest = resolvePostAuthDestination({ onboardingCompleted: false, nextParam: null })
  assert.equal(dest, "/onboarding")
})

test("resolvePostAuthDestination: sem next, onboarding concluído vai para /dashboard", () => {
  const dest = resolvePostAuthDestination({ onboardingCompleted: true, nextParam: undefined })
  assert.equal(dest, "/dashboard")
})
