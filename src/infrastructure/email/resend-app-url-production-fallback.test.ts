import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

import { getAppUrl } from "@/infrastructure/email/resend.client"

/**
 * Testes de comportamento real (não apenas wiring) para getAppUrl(), do
 * hardening de 2026-09-21.
 *
 * Contexto: getAppUrl() monta a URL base usada em todos os links enviados
 * por e-mail (recuperação de senha, confirmação de cadastro, boas-vindas —
 * ver email.service.ts). Ela já resolvia, em ordem, NEXT_PUBLIC_APP_URL
 * (variável realmente usada por este projeto, ver .env.local),
 * NEXT_PUBLIC_SITE_URL e VERCEL_URL antes de cair em
 * "http://localhost:3000". O gap real não era a ordem das variáveis (não
 * inventamos nenhuma nova, conforme instrução do hardening), e sim que essa
 * queda para localhost em produção era silenciosa: nenhum log indicava que
 * os links enviados por e-mail para usuários reais estavam quebrados.
 *
 * process.env é mutado diretamente aqui (não há injeção de dependência no
 * módulo original) — cada teste salva e restaura as variáveis tocadas para
 * não vazar estado para os demais arquivos de teste executados no mesmo
 * processo do test runner.
 */

const TOUCHED_KEYS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "VERCEL_URL", "NODE_ENV"] as const

let originalValues: Record<string, string | undefined>
let originalConsoleError: typeof console.error
let consoleErrorCalls: unknown[][]

beforeEach(() => {
  originalValues = {}
  const env = process.env as Record<string, string | undefined>
  for (const key of TOUCHED_KEYS) {
    originalValues[key] = env[key]
    delete env[key]
  }
  consoleErrorCalls = []
  originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    consoleErrorCalls.push(args)
  }
})

afterEach(() => {
  const env = process.env as Record<string, string | undefined>
  for (const key of TOUCHED_KEYS) {
    const value = originalValues[key]
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  console.error = originalConsoleError
})

function setNodeEnv(value: string) {
  // NODE_ENV é readonly no tipo do Node, mas é uma env var comum em runtime.
  ;(process.env as Record<string, string>)["NODE_ENV"] = value
}

describe("getAppUrl(): fallback de localhost em produção fica visível (hardening 2026-09-21)", () => {
  it("usa NEXT_PUBLIC_APP_URL quando definida, sem logar nada, mesmo em produção", () => {
    process.env["NEXT_PUBLIC_APP_URL"] = "https://app.nomeia.com.br"
    setNodeEnv("production")
    assert.equal(getAppUrl(), "https://app.nomeia.com.br")
    assert.equal(consoleErrorCalls.length, 0, "não deve logar erro quando a variável está configurada")
  })

  it("cai para NEXT_PUBLIC_SITE_URL quando NEXT_PUBLIC_APP_URL não está definida", () => {
    process.env["NEXT_PUBLIC_SITE_URL"] = "https://site.nomeia.com.br"
    setNodeEnv("production")
    assert.equal(getAppUrl(), "https://site.nomeia.com.br")
    assert.equal(consoleErrorCalls.length, 0)
  })

  it("cai para VERCEL_URL (com https://) quando as duas variáveis NEXT_PUBLIC_* não estão definidas", () => {
    process.env["VERCEL_URL"] = "meu-app.vercel.app"
    setNodeEnv("production")
    assert.equal(getAppUrl(), "https://meu-app.vercel.app")
    assert.equal(consoleErrorCalls.length, 0)
  })

  it("BUG CORRIGIDO: sem nenhuma variável configurada em produção, ainda retorna localhost:3000 (comportamento preservado) mas agora loga um console.error com orientação", () => {
    setNodeEnv("production")
    assert.equal(getAppUrl(), "http://localhost:3000")
    assert.equal(consoleErrorCalls.length, 1, "deve logar exatamente um aviso")
    const [firstArg] = consoleErrorCalls[0] ?? []
    assert.match(String(firstArg), /\[RESEND\]/)
    assert.match(String(firstArg), /NEXT_PUBLIC_APP_URL/)
  })

  it("fora de produção (dev/test), cai em localhost:3000 sem logar nada (fallback de desenvolvimento continua silencioso)", () => {
    setNodeEnv("development")
    assert.equal(getAppUrl(), "http://localhost:3000")
    assert.equal(consoleErrorCalls.length, 0, "em dev, o fallback é o comportamento esperado — não deve logar")
  })
})
