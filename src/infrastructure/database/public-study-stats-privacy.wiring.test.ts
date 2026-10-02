import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase G2.6.1 — correção de segurança (achado CRÍTICO #1 da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01").
 *
 * public.public_study_stats era uma view que roda com o privilégio do dono
 * (bypassando a RLS de study_history) e tinha SELECT liberado para `anon` e
 * `PUBLIC` — ou seja, qualquer pessoa na internet, sem login, conseguia ler
 * nome + estatísticas de estudo de todos os usuários via
 * `GET /rest/v1/public_study_stats`, sem nenhuma checagem de privacidade.
 *
 * Teste de "wiring" (verificação estática do texto da migration SQL), no
 * mesmo espírito de `study-groups-rls.wiring.test.ts` e
 * `schema-rls-hardening.wiring.test.ts`. LIMITAÇÃO DOCUMENTADA: este
 * ambiente não tem acesso a um Postgres real nem à instância de produção do
 * Supabase — não executa a migration, não prova em runtime que `anon` é
 * rejeitado nem que um perfil privado fica de fato oculto. O que este teste
 * garante é que a correção pretendida está escrita no arquivo da migration.
 */

function readMigration(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261002_security_public_study_stats.sql"),
    "utf-8",
  )
}

describe("Fase G2.6.1 — public_study_stats perde acesso anônimo", () => {
  const sql = readMigration()

  it("revoga todo acesso de anon à view", () => {
    assert.match(sql, /revoke all on public\.public_study_stats from anon/)
  })

  it("revoga todo acesso do pseudo-papel PUBLIC à view", () => {
    assert.match(sql, /revoke all on public\.public_study_stats from public/)
  })

  it("concede SELECT apenas para authenticated", () => {
    assert.match(sql, /grant select on public\.public_study_stats to authenticated/)
  })

  it("não concede nenhum privilégio a anon depois do REVOKE (sem 'grant ... to anon' na migration)", () => {
    const withoutComments = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
    assert.doesNotMatch(withoutComments, /grant[^;]*to anon/i)
  })
})

describe("Fase G2.6.1 — public_study_stats respeita a preferência publicProfile", () => {
  const sql = readMigration()

  it("a definição recriada da view filtra por preferences->>'publicProfile'", () => {
    const viewStart = sql.indexOf("create or replace view public.public_study_stats")
    assert.ok(viewStart > 0, "view não encontrada na migration")
    const viewBody = sql.slice(viewStart, viewStart + 1000)
    assert.match(viewBody, /preferences\s*->>\s*'publicProfile'/)
  })

  it("o padrão (sem preferência salva) continua público — mesma regra de get_public_study_profile", () => {
    const viewStart = sql.indexOf("create or replace view public.public_study_stats")
    const viewBody = sql.slice(viewStart, viewStart + 1000)
    assert.match(viewBody, /coalesce\(\(p\.preferences ->> 'publicProfile'\)::boolean, true\) = true/)
  })

  it("mantém exatamente as mesmas 5 colunas de saída (nenhuma mudança necessária no código que consome a view)", () => {
    const viewStart = sql.indexOf("create or replace view public.public_study_stats")
    const fromIdx = sql.indexOf("from study_history", viewStart)
    const selectBody = sql.slice(viewStart, fromIdx)
    for (const col of ["user_id", "display_name", "total_minutes", "questions_count", "pages_count"]) {
      assert.match(selectBody, new RegExp(col))
    }
  })
})
