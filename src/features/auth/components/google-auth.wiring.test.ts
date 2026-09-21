// ─────────────────────────────────────────────────────────────────────────────
// LOGIN COM GOOGLE — testes de integração/arquitetura (mesmo padrão wiring dos
// demais *.wiring.test.ts deste projeto: sem infraestrutura de renderização de
// React nos testes, então travamos o contrato lendo o código-fonte real).
//
// O que este arquivo garante:
//  1) o botão Google existe e está ligado às telas de login e cadastro;
//  2) o fluxo usa o client Supabase já existente (infrastructure/supabase),
//     não uma lógica paralela;
//  3) signInWithOAuth usa provider "google" e aponta para /auth/callback;
//  4) o callback troca o code por sessão no SERVIDOR (nunca expõe token no
//     client) e nunca importa/usa a service role key;
//  5) o redirect pós-callback usa o validador de rota segura (nunca aceita
//     um redirect externo arbitrário);
//  6) o login por e-mail/senha (fluxo existente) continua intacto;
//  7) nenhuma variável NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY é criada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8")
}

const GOOGLE_BUTTON_PATH = "src/features/auth/components/google-auth-button.tsx"
const CALLBACK_ROUTE_PATH = "src/app/auth/callback/route.ts"
const LOGIN_FORM_PATH = "src/features/auth/components/login-form.tsx"
const REGISTER_FORM_PATH = "src/features/auth/components/register-form.tsx"
const LOGIN_PAGE_PATH = "src/app/(auth)/login/page.tsx"

describe("GoogleAuthButton: usa o client Supabase existente e aponta para /auth/callback", () => {
  const source = readSource(GOOGLE_BUTTON_PATH)

  it('importa createClient de "@/infrastructure/supabase/client" (o mesmo client browser já usado no resto do app)', () => {
    assert.ok(source.includes('from "@/infrastructure/supabase/client"'))
    assert.equal(
      source.includes("@supabase/supabase-js"),
      false,
      "não deve instanciar um client Supabase novo/paralelo diretamente com @supabase/supabase-js",
    )
  })

  it('chama signInWithOAuth com provider "google"', () => {
    assert.ok(source.includes("signInWithOAuth"))
    assert.ok(/provider:\s*"google"/.test(source))
  })

  it("redirectTo aponta para /auth/callback", () => {
    assert.ok(source.includes('"/auth/callback"'))
  })

  it("valida o `next` com isSafeRedirectPath antes de anexá-lo à URL de retorno", () => {
    assert.ok(source.includes("isSafeRedirectPath"))
  })

  it("trata erro do signInWithOAuth com feedback ao usuário (toast) e sai do estado de loading", () => {
    assert.ok(source.includes("toast.error"))
    assert.ok(source.includes("setIsLoading(false)"))
  })
})

describe("GoogleAuthButton está integrado nas telas de login e cadastro (Fase 6)", () => {
  it("login-form.tsx renderiza <GoogleAuthButton", () => {
    const source = readSource(LOGIN_FORM_PATH)
    assert.ok(source.includes("<GoogleAuthButton"))
  })

  it("register-form.tsx renderiza <GoogleAuthButton", () => {
    const source = readSource(REGISTER_FORM_PATH)
    assert.ok(source.includes("<GoogleAuthButton"))
  })

  it("login por e-mail/senha continua chamando loginAction (fluxo existente intacto)", () => {
    const source = readSource(LOGIN_FORM_PATH)
    assert.ok(source.includes("loginAction(values)"))
  })
})

describe("/auth/callback: troca o code no servidor, nunca expõe token, nunca usa service role", () => {
  const source = readSource(CALLBACK_ROUTE_PATH)

  it('usa o server client existente ("@/infrastructure/supabase/server"), não um client novo', () => {
    assert.ok(source.includes('from "@/infrastructure/supabase/server"'))
  })

  it("troca o code por sessão com exchangeCodeForSession", () => {
    assert.ok(source.includes("exchangeCodeForSession(code)"))
  })

  it("nunca referencia SERVICE_ROLE_KEY", () => {
    assert.equal(/SERVICE_ROLE/i.test(source), false)
  })

  it("nunca expõe o access_token da sessão na URL de redirect (evita vazar token pro histórico do navegador)", () => {
    assert.equal(source.includes("access_token"), false)
    assert.equal(source.includes("data.session.access_token"), false)
  })

  it("usa resolvePostAuthDestination (respeita onboarding e valida o `next`) para decidir o redirect final", () => {
    assert.ok(source.includes("resolvePostAuthDestination"))
  })

  it("erro do provider ou do exchange redireciona para /login com um código curto em oauthError, nunca a mensagem técnica do Supabase", () => {
    assert.ok(source.includes('"/login"'))
    assert.ok(source.includes("oauthError"))
  })

  it("chama backfillProfileFromGoogle (sincroniza profile) em vez de inserir um profile paralelo", () => {
    assert.ok(source.includes("backfillProfileFromGoogle"))
    assert.equal(/\.from\(\s*"profiles"\s*\)\s*\.insert/.test(source), false, "callback não deve fazer INSERT direto em profiles")
  })
})

describe("Nenhuma env var de service role é criada em lugar nenhum do projeto (Fase 17)", () => {
  it("nenhum arquivo em src/ referencia NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ou similar exposto ao client", () => {
    let matches = ""
    try {
      matches = execSync(
        "grep -rln \"NEXT_PUBLIC.*SERVICE_ROLE\" src --include=*.ts --include=*.tsx | grep -v google-auth.wiring.test.ts | xargs -r grep -n \"NEXT_PUBLIC.*SERVICE_ROLE\" || true",
        { cwd: ROOT, encoding: "utf-8" },
      )
    } catch {
      matches = ""
    }
    assert.equal(matches.trim(), "", `não deveria existir nenhuma env pública de service role:\n${matches}`)
  })
})

describe("google-oauth-profile.ts nunca faz INSERT em profiles (o trigger handle_new_user do banco cria a linha)", () => {
  it("não contém .from(\"profiles\").insert(", () => {
    const source = readSource("src/application/auth/google-oauth-profile.ts")
    assert.equal(/\.from\(\s*"profiles"\s*\)\s*\.insert/.test(source), false)
  })
})

describe("Documentação de configuração existe (Fase 16)", () => {
  it("docs/google-auth-setup.md existe", () => {
    assert.ok(existsSync(join(ROOT, "docs/google-auth-setup.md")), "docs/google-auth-setup.md deveria existir")
  })
})

describe("Página de login exibe erros amigáveis do OAuth (Fase 12)", () => {
  it("login/page.tsx renderiza o componente de toast de erro do OAuth", () => {
    const source = readSource(LOGIN_PAGE_PATH)
    assert.ok(source.includes("OAuthErrorToast"))
  })
})
