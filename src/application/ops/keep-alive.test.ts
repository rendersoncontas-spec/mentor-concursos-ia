import assert from "node:assert/strict"
import test from "node:test"

import { buildSupabaseHealthCheckUrl, isAuthorizedCronRequest } from "./keep-alive"

test("isAuthorizedCronRequest: nega quando CRON_SECRET não está configurado (fail-closed)", () => {
  assert.equal(isAuthorizedCronRequest("Bearer qualquer-coisa", undefined), false)
  assert.equal(isAuthorizedCronRequest("Bearer qualquer-coisa", null), false)
  assert.equal(isAuthorizedCronRequest("Bearer qualquer-coisa", ""), false)
})

test("isAuthorizedCronRequest: nega quando o header Authorization está ausente", () => {
  assert.equal(isAuthorizedCronRequest(null, "segredo-123"), false)
  assert.equal(isAuthorizedCronRequest(undefined, "segredo-123"), false)
})

test("isAuthorizedCronRequest: nega quando o segredo não bate", () => {
  assert.equal(isAuthorizedCronRequest("Bearer errado", "segredo-123"), false)
  assert.equal(isAuthorizedCronRequest("segredo-123", "segredo-123"), false) // falta o prefixo "Bearer "
})

test("isAuthorizedCronRequest: autoriza quando o header bate exatamente", () => {
  assert.equal(isAuthorizedCronRequest("Bearer segredo-123", "segredo-123"), true)
})

test("buildSupabaseHealthCheckUrl: monta a URL de health check da Auth API", () => {
  assert.equal(
    buildSupabaseHealthCheckUrl("https://exemplo.supabase.co"),
    "https://exemplo.supabase.co/auth/v1/health",
  )
})

test("buildSupabaseHealthCheckUrl: remove barra(s) final(is) da URL base antes de montar", () => {
  assert.equal(
    buildSupabaseHealthCheckUrl("https://exemplo.supabase.co/"),
    "https://exemplo.supabase.co/auth/v1/health",
  )
  assert.equal(
    buildSupabaseHealthCheckUrl("https://exemplo.supabase.co//"),
    "https://exemplo.supabase.co/auth/v1/health",
  )
})
