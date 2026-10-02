// ============================================================================
// G1.9 — AUTENTICAÇÃO, SESSÃO E HARDENING.
// Varreduras regressivas do src (segredos/XSS/service-role) + unidades
// puras (redirect, schemas, retry-auth) + travas wiring dos fluxos.
// ============================================================================

import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  isSafeRedirectPath,
  resolvePostAuthDestination,
} from "@/domain/auth/auth-redirect.ts"
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/domain/auth/auth.schemas.ts"
import { classifySaveStudySessionResult } from "@/infrastructure/offline/classify-save-result.ts"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

function walkSrc(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkSrc(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const SRC_FILES = walkSrc()
const APP_FILES = SRC_FILES.filter((f) => !/\.test\.(ts|tsx|mts)$/.test(f))

// ---------------------------------------------------------------------------
// 1-3. Fronteiras rígidas: service-role, segredos em log, XSS sink.
// ---------------------------------------------------------------------------

describe("G1.9 — fronteiras rígidas do src", () => {
  function stripLineComments(body: string): string {
    return body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n")
  }

  function stripQuoted(line: string): string {
    return line
      .replace(/"([^"\\]|\\.)*"/g, '""')
      .replace(/'([^'\\]|\\.)*'/g, "''")
      .replace(/`([^`\\]|\\.)*`/g, "``")
  }

  it("1. service role nunca chega ao código (só docs/comentário CLI)", () => {
    const hits = APP_FILES.filter((f) =>
      /SUPABASE_SERVICE_ROLE_KEY|service_role|createAdminClient/.test(stripLineComments(src(f))),
    )
    assert.deepEqual(hits, [], `service-role em código: ${hits.join(", ")}`)
  })

  it("2. nenhuma senha/token em console/Sentry/localStorage", () => {
    const hits: string[] = []
    for (const f of APP_FILES) {
      const lines = src(f).split("\n")
      lines.forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return
        // Identificadores fora de strings: console.log(password) vaza;
        // "Forgot password erro:" dentro de string é só rótulo.
        const code = stripQuoted(line)
        if (
          /console\.(log|error|warn|info)\([^)]*\b(password|passwd|access_token|refresh_token|secret|service_role)\b/i.test(code) ||
          /Sentry\.(capture\w+|set\w*)\([^)]*\b(password|access_token|refresh_token|secret)\b/i.test(code) ||
          /localStorage\.(setItem|getItem)\([^)]*\b(token|password)\b/i.test(code) ||
          /document\.cookie/i.test(code)
        ) {
          hits.push(`${f}:${i + 1}`)
        }
      })
    }
    assert.deepEqual(hits, [], `segredo em log/storage: ${hits.join(", ")}`)
  })

  it("3. nenhum dangerouslySetInnerHTML no src", () => {
    const hits = APP_FILES.filter((f) => src(f).includes("dangerouslySetInnerHTML"))
    assert.deepEqual(hits, [], `XSS sink em: ${hits.join(", ")}`)
  })
})

// ---------------------------------------------------------------------------
// 4-6. Redirect seguro + password policy coerente nos dois tiers.
// ---------------------------------------------------------------------------

describe("G1.9 — redirects e password policy", () => {
  it("4. isSafeRedirectPath bloqueia externos e aceita internos", () => {
    assert.equal(isSafeRedirectPath("https://evil.com"), false)
    assert.equal(isSafeRedirectPath("//evil.com/x"), false)
    assert.equal(isSafeRedirectPath("/\\evil"), false)
    assert.equal(isSafeRedirectPath("javascript:alert(1)"), false)
    assert.equal(isSafeRedirectPath("/login?x=1 2"), false)
    assert.equal(isSafeRedirectPath("dashboard"), false)
    assert.equal(isSafeRedirectPath(null), false)
    assert.equal(isSafeRedirectPath("/dashboard"), true)
    assert.equal(isSafeRedirectPath("/auth/callback?next=/x"), true)
  })

  it("5. destino pós-auth: next seguro vence; senão onboarding/dashboard", () => {
    assert.equal(
      resolvePostAuthDestination({ onboardingCompleted: true, nextParam: "/ciclos" }),
      "/ciclos",
    )
    assert.equal(
      resolvePostAuthDestination({ onboardingCompleted: true, nextParam: "https://evil.com" }),
      "/dashboard",
    )
    assert.equal(
      resolvePostAuthDestination({ onboardingCompleted: false, nextParam: null }),
      "/onboarding",
    )
  })

  it("6. schemas exigem senha ≥6 e confirmação igual (front e server usam os mesmos)", () => {
    assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "12345" }).success, false)
    assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "123456" }).success, true)
    assert.equal(
      registerSchema.safeParse({ name: "Ana", email: "a@b.com", password: "123456", confirmPassword: "xxxxxx" }).success,
      false,
    )
    assert.equal(
      resetPasswordSchema.safeParse({ password: "", confirmPassword: "" }).success,
      false,
    )
    for (const path of [
      "src/application/auth/login.action.ts",
      "src/application/auth/register.action.ts",
      "src/application/auth/forgot-password.action.ts",
    ]) {
      assert.match(src(path), /\.parse\(/, `${path} sem parse server-side`)
    }
  })
})

// ---------------------------------------------------------------------------
// 7-9. Sessão expirada, bootstrap, env fail-fast.
// ---------------------------------------------------------------------------

describe("G1.9 — sessão, bootstrap e env", () => {
  it("7. sessão expirada é retryable (operação preservada), nunca sucesso falso", () => {
    const r = classifySaveStudySessionResult({ success: false, error: "Usuário não autenticado. Faça login novamente." })
    assert.equal(r.retryable, true)
  })

  it("8. bootstrap fecha em produção sem sessão (wiring)", () => {
    const body = src("src/app/(protected)/layout.tsx")
    assert.match(body, /if \(!effectiveUser && !isDevMode\)/)
    assert.match(body, /redirect\("\/login"\)/)
    assert.match(body, /process\.env\.NODE_ENV === "development"/)
  })

  it("9. env inválida falha cedo (wiring do schema central)", () => {
    const body = src("src/config/env.ts")
    assert.match(body, /z\.string\(\)\.url\(/)
    assert.match(body, /z\.string\(\)\.min\(1/)
    assert.match(body, /throw new Error\("Variáveis de ambiente inválidas/)
  })
})

// ---------------------------------------------------------------------------
// 10-13. Autorização server-side e isolamento de suporte.
// ---------------------------------------------------------------------------

describe("G1.9 — autorização e suporte", () => {
  it("10. save de estudo usa identidade do servidor, nunca do cliente", () => {
    const body = src("src/application/study-session/study-session.action.ts")
    assert.match(body, /supabase\.auth\.getUser\(\)/)
    assert.match(body, /user_id: user\.id/)
    assert.doesNotMatch(body, /data\["user_id"\]/)
    assert.doesNotMatch(body, /data\["userId"\]/)
  })

  it("11. role fail-closed para elevação; suporte nunca vira admin de admin", () => {
    const guard = src("src/application/admin/auth-guard.ts")
    assert.match(guard, /decideSupportAccess|decideAdminReadAccess/)
    assert.match(guard, /return null/)
  })

  it("12. cookie de support: httpOnly + Secure em prod + SameSite, com limpeza", () => {
    const actions = src("src/application/admin/admin.actions.ts")
    assert.match(actions, /httpOnly:\s*true/)
    assert.match(actions, /sameSite:\s*["']lax["']/)
    assert.match(actions, /secure:\s*process\.env\.NODE_ENV === ["']production["']/)
    assert.match(src("src/application/auth/logout.action.ts"), /cookieStore\.delete\(SUPPORT_SESSION_COOKIE_NAME\)/)
  })

  it("13. callback OAuth troca código no servidor e valida destino (wiring)", () => {
    const route = src("src/app/auth/callback/route.ts")
    assert.match(route, /exchangeCodeForSession\(/)
    assert.match(route, /resolvePostAuthDestination|isSafeRedirectPath/)
    assert.doesNotMatch(route, /service_role|SERVICE_ROLE/)
  })
})
