import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" (verificação estática do código-fonte) para a
 * classificação de erro do callback do Google OAuth, corrigida na fase de
 * hardening de 2026-09-21.
 *
 * Contexto do bug encontrado: src/app/auth/callback/route.ts classificava o
 * cenário "já existe uma conta com este e-mail em outro provider" checando
 * exclusivamente error.message.toLowerCase().includes("already registered" |
 * "identity") — um texto que a própria API do Supabase não garante estável
 * entre versões. A versão instalada (@supabase/auth-js, via
 * @supabase/supabase-js 2.112.2) expõe error.code tipado (ErrorCode) com
 * códigos estáveis para este cenário (identity_already_exists,
 * email_conflict_identity_not_deletable, email_exists, user_already_exists,
 * manual_linking_disabled — ver node_modules/@supabase/auth-js/dist/module/
 * lib/error-codes.d.ts). A correção passou a checar error.code como fonte
 * primária, mantendo o texto de error.message apenas como fallback (nunca
 * removido, para cobrir um AuthUnknownError sem code).
 *
 * Por que teste estático: este é um Route Handler do Next.js
 * (src/app/auth/callback/route.ts) — não há infraestrutura de teste de
 * requisição HTTP real neste projeto (mesma limitação documentada nos
 * demais *.wiring.test.ts). O teste garante que a checagem por código não
 * seja removida/enfraquecida numa edição futura, não que o fluxo real do
 * Supabase funcione ponta a ponta.
 */

function readSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "app", "auth", "callback", "route.ts"),
    "utf-8",
  )
}

describe("callback OAuth: classificação de 'conta já existe' não depende só de texto de erro", () => {
  it("checa error?.code contra um conjunto de códigos estáveis do Supabase antes do texto", () => {
    const source = readSource()
    assert.match(source, /error\?\.code/, "deve inspecionar error?.code")
    for (const code of [
      "identity_already_exists",
      "email_conflict_identity_not_deletable",
      "email_exists",
      "user_already_exists",
      "manual_linking_disabled",
    ]) {
      assert.ok(source.includes(`"${code}"`), `deve listar o código estável "${code}"`)
    }
  })

  it("mantém o texto de error.message como fallback (não remove a checagem antiga)", () => {
    const source = readSource()
    assert.match(source, /message\.includes\("already registered"\)/)
    assert.match(source, /message\.includes\("identity"\)/)
  })

  it("decide 'account_exists_different_method' pela união (OR) do código confiável com o texto legado", () => {
    const source = readSource()
    const guardIdx = source.indexOf("if (hasReliableCode || matchesLegacyMessage)")
    assert.ok(
      guardIdx !== -1,
      "a decisão deve ser hasReliableCode || matchesLegacyMessage (nunca substituir, só complementar)",
    )
    const after = source.slice(guardIdx, guardIdx + 150)
    assert.match(after, /return toLogin\("account_exists_different_method"\)/)
  })

  it("nunca expõe a mensagem técnica do Supabase ao usuário (só o código curto oauthError)", () => {
    const source = readSource()
    // A mensagem técnica só pode aparecer em console.error/console.warn, nunca em toLogin(...)
    const toLoginCalls = [...source.matchAll(/toLogin\(([^)]*)\)/g)].map((m) => m[1] ?? "")
    for (const arg of toLoginCalls) {
      assert.ok(
        !/error(\?\.)?\.(message)/.test(arg),
        `toLogin não deve receber error.message diretamente (recebeu: ${arg})`,
      )
    }
  })
})
