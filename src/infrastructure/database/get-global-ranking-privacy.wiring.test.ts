import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase G2.6.1 — correção de segurança (achado CRÍTICO #2 da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01").
 *
 * get_global_ranking(...) é SECURITY DEFINER, liberada para
 * anon/authenticated/PUBLIC, e não fazia nenhuma checagem de autenticação
 * interna: p_current_user_id vinha do client sem validação e era usado só
 * de forma cosmética. Qualquer chamador, autenticado ou não, recebia o
 * ranking completo (nome + estatísticas) de todos os usuários.
 *
 * Teste de "wiring" (verificação estática do texto da migration SQL), no
 * mesmo espírito de `study-groups-rls.wiring.test.ts`. LIMITAÇÃO
 * DOCUMENTADA: este ambiente não executa a migration contra um Postgres
 * real — não prova em runtime que uma chamada anônima é rejeitada. O que
 * este teste garante é que a correção pretendida está escrita no arquivo.
 */

function readMigration(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261002_security_get_global_ranking.sql"),
    "utf-8",
  )
}

function functionBody(sql: string): string {
  const idx = sql.indexOf("create or replace function public.get_global_ranking")
  assert.ok(idx > 0, "função get_global_ranking não encontrada na migration")
  const endIdx = sql.indexOf("$function$;", idx) + "$function$;".length
  return sql.slice(idx, endIdx)
}

describe("Fase G2.6.1 — get_global_ranking bloqueia chamada anônima", () => {
  const sql = readMigration()
  const body = functionBody(sql)

  it("deriva a identidade do chamador via auth.uid(), nunca do parâmetro do client", () => {
    assert.match(body, /v_current_user_id\s*:=\s*auth\.uid\(\)/)
  })

  it("recusa a chamada quando não há sessão (auth.uid() IS NULL)", () => {
    assert.match(body, /IF v_current_user_id IS NULL THEN\s*\n?\s*RAISE EXCEPTION/)
  })

  it("p_current_user_id (fornecido pelo client) não é usado em nenhuma decisão de identidade dentro do corpo da função", () => {
    // Permitido aparecer só na declaração do parâmetro (assinatura da função)
    // e em comentários explicativos; remove comentários de linha (--) antes
    // de procurar, para não dar falso-negativo com o texto que explica que
    // o parâmetro é ignorado de propósito.
    const declareIdx = body.indexOf("DECLARE")
    const bodyAfterDeclare = body
      .slice(declareIdx)
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
    assert.doesNotMatch(bodyAfterDeclare, /p_current_user_id/)
  })

  it("mantém SECURITY DEFINER com search_path fixo (padrão do projeto)", () => {
    assert.match(body, /security definer/)
    assert.match(body, /set search_path to 'public'/)
  })
})

describe("Fase G2.6.1 — get_global_ranking respeita publicProfile e reforça grants", () => {
  const sql = readMigration()
  const body = functionBody(sql)

  it("exclui do ranking quem optou por perfil privado, exceto a si mesmo", () => {
    assert.match(body, /preferences->>'publicProfile'/)
    assert.match(body, /OR b\.user_id = v_current_user_id/)
  })

  it("revoga EXECUTE de anon e do pseudo-papel PUBLIC", () => {
    assert.match(sql, /revoke execute on function public\.get_global_ranking\([^)]*\) from public/)
    assert.match(sql, /revoke execute on function public\.get_global_ranking\([^)]*\) from anon/)
  })

  it("mantém EXECUTE para authenticated (não quebra o uso legítimo do app)", () => {
    assert.match(sql, /grant execute on function public\.get_global_ranking\([^)]*\) to authenticated/)
  })

  it("preserva a assinatura original da função (mesmos parâmetros, nenhuma mudança necessária em getGlobalRankingAction)", () => {
    assert.match(
      sql,
      /create or replace function public\.get_global_ranking\(p_period text DEFAULT 'this_week'::text, p_current_user_id uuid DEFAULT NULL::uuid, p_week_offset integer DEFAULT 0\)/,
    )
  })
})
