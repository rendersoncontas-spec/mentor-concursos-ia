import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" (verificação estática do texto das migrations SQL) para
 * a fase de hardening de produção de 21/09/2026.
 *
 * LIMITAÇÃO DOCUMENTADA (item 5 do brief de hardening): este ambiente não tem
 * acesso a um Postgres real nem à instância de produção do Supabase. Estes
 * testes NÃO executam as migrations, NÃO criam usuários/linhas de teste e
 * NÃO provam que o RLS realmente bloqueia/permite o que deveria em tempo de
 * execução. Eles apenas garantem, de forma estática, que:
 *
 *   1. as policies que a auditoria de hardening identificou como faltantes
 *      continuam presentes no arquivo de migration correspondente (para que
 *      uma edição futura não as remova/quebre silenciosamente);
 *   2. o padrão de idempotência do projeto (DROP POLICY IF EXISTS antes de
 *      cada CREATE POLICY, guardas DO $$ ... END $$ condicionais) é seguido.
 *
 * "Não fingir que um teste textual prova RLS real" — a prova real exigiria
 * rodar as migrations contra um Postgres de verdade (ex.: supabase CLI +
 * Docker) e testar com usuários autenticados distintos, o que não está
 * disponível neste ambiente/CI atual.
 */

function readMigration(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", fileName), "utf-8")
}

const CYCLE_SESSIONS_MIGRATION = "20260921_study_cycle_sessions_delete_policy.sql"
const SUPPORT_SESSIONS_MIGRATION = "20260921_1_support_sessions_audit_rls.sql"

describe("hardening 2026-09-21: migration de DELETE em study_cycle_sessions", () => {
  it("o arquivo de migration existe em supabase/migrations", () => {
    assert.doesNotThrow(() => readMigration(CYCLE_SESSIONS_MIGRATION))
  })

  it("cria a policy de DELETE esperada, com DROP POLICY IF EXISTS antes (idempotente)", () => {
    const sql = readMigration(CYCLE_SESSIONS_MIGRATION)
    assert.match(
      sql,
      /DROP POLICY IF EXISTS "Usuários podem deletar sessões de seus ciclos" ON public\.study_cycle_sessions;\s*\n\s*CREATE POLICY "Usuários podem deletar sessões de seus ciclos"/,
      'deve dar DROP POLICY IF EXISTS imediatamente antes do CREATE POLICY de DELETE',
    )
    assert.match(sql, /FOR DELETE/, "a policy criada deve ser FOR DELETE")
  })

  it("escopa o DELETE por dono do ciclo (study_cycles.user_id = auth.uid()), nunca por linha solta", () => {
    const sql = readMigration(CYCLE_SESSIONS_MIGRATION)
    const policyStart = sql.indexOf('CREATE POLICY "Usuários podem deletar sessões de seus ciclos"')
    assert.ok(policyStart !== -1)
    const policyBody = sql.slice(policyStart, policyStart + 400)
    assert.match(policyBody, /study_cycles\.id = study_cycle_sessions\.cycle_id/)
    assert.match(policyBody, /study_cycles\.user_id = auth\.uid\(\)/)
  })

  it("está protegida por uma checagem de existência da tabela (não falha em banco sem a tabela)", () => {
    const sql = readMigration(CYCLE_SESSIONS_MIGRATION)
    assert.match(sql, /IF EXISTS \(\s*SELECT 1 FROM pg_tables/)
    assert.match(sql, /tablename = 'study_cycle_sessions'/)
  })

  it("NÃO altera reconcile_study_cycle nem qualquer outra função (motor de ciclos congelado)", () => {
    const sql = readMigration(CYCLE_SESSIONS_MIGRATION)
    assert.ok(!/CREATE (OR REPLACE )?FUNCTION/i.test(sql), "esta migration deve conter apenas policy, nunca função")
    assert.ok(!/reconcile_study_cycle\s*\(/.test(sql) || /--.*reconcile_study_cycle/.test(sql), "só pode citar reconcile_study_cycle em comentário explicativo, nunca alterá-la")
  })
})

describe("hardening 2026-09-21: migration de INSERT/UPDATE em support_sessions + audit_logs", () => {
  it("o arquivo de migration existe em supabase/migrations", () => {
    assert.doesNotThrow(() => readMigration(SUPPORT_SESSIONS_MIGRATION))
  })

  it("cria a policy de UPDATE de support_sessions (endSupportSessionAction/expiração dependem dela)", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    assert.match(
      sql,
      /DROP POLICY IF EXISTS "Moderador pode atualizar suas próprias sessões" ON public\.support_sessions;\s*\n\s*CREATE POLICY "Moderador pode atualizar suas próprias sessões"\s*\n\s*ON public\.support_sessions FOR UPDATE/,
    )
    const policyStart = sql.indexOf('CREATE POLICY "Moderador pode atualizar suas próprias sessões"')
    const policyBody = sql.slice(policyStart, policyStart + 250)
    assert.match(policyBody, /USING \(auth\.uid\(\) = moderator_id\)/)
    assert.match(policyBody, /WITH CHECK \(auth\.uid\(\) = moderator_id\)/)
  })

  it("cria a policy de INSERT de support_sessions (startSupportSessionAction depende dela)", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    assert.match(
      sql,
      /DROP POLICY IF EXISTS "Moderador pode criar sessões de suporte" ON public\.support_sessions;\s*\n\s*CREATE POLICY "Moderador pode criar sessões de suporte"\s*\n\s*ON public\.support_sessions FOR INSERT/,
    )
  })

  it("a policy de INSERT de support_sessions só é criada se public.get_user_role existir (não é especulativa)", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    const insertBlockStart = sql.indexOf("-- 2. support_sessions: INSERT")
    assert.ok(insertBlockStart !== -1, "deve haver uma seção dedicada ao INSERT de support_sessions")
    const insertBlock = sql.slice(insertBlockStart, sql.indexOf("-- 3. audit_logs"))
    assert.match(insertBlock, /pg_proc/)
    assert.match(insertBlock, /proname = 'get_user_role'/)
    assert.match(insertBlock, /RAISE NOTICE/, "deve avisar (não falhar) se get_user_role não existir")
  })

  it("a policy de INSERT exige auth.uid() = moderator_id E get_user_role em ('admin','moderator')", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    const policyStart = sql.indexOf('CREATE POLICY "Moderador pode criar sessões de suporte"')
    const policyBody = sql.slice(policyStart, policyStart + 300)
    assert.match(policyBody, /auth\.uid\(\) = moderator_id/)
    assert.match(policyBody, /get_user_role\(auth\.uid\(\)\) IN \('admin', 'moderator'\)/)
  })

  it("preserva o INSERT de audit_logs restrito ao próprio autor (auditoria não pode ser forjada em nome de outro usuário)", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    const policyStart = sql.indexOf('CREATE POLICY "Inserção de logs de auditoria permitida para autenticados"')
    assert.ok(policyStart !== -1)
    const policyBody = sql.slice(policyStart, policyStart + 200)
    assert.match(policyBody, /FOR INSERT/)
    assert.match(policyBody, /WITH CHECK \(auth\.uid\(\) = actor_user_id\)/)
  })

  it("SELECT de audit_logs sempre preserva a leitura do próprio autor, com ou sem get_user_role", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    const auditBlockStart = sql.indexOf("-- 3. audit_logs")
    assert.ok(auditBlockStart !== -1)
    const auditBlock = sql.slice(auditBlockStart)

    // A policy de SELECT de audit_logs e criada duas vezes (ramo IF com
    // get_user_role e ramo ELSE sem ela). Cada ocorrencia, isoladamente,
    // precisa preservar auth.uid() = actor_user_id.
    const policyMarker = 'CREATE POLICY "Leitura de logs permitida para o próprio autor"'
    const occurrences: number[] = []
    let searchFrom = 0
    for (;;) {
      const idx = auditBlock.indexOf(policyMarker, searchFrom)
      if (idx === -1) break
      occurrences.push(idx)
      searchFrom = idx + policyMarker.length
    }
    assert.ok(occurrences.length >= 2, "deve haver duas variantes de SELECT (com e sem get_user_role)")

    for (const idx of occurrences) {
      const snippet = auditBlock.slice(idx, idx + 300)
      assert.match(snippet, /FOR SELECT/, "cada variante deve ser FOR SELECT")
      assert.match(
        snippet,
        /auth\.uid\(\) = actor_user_id/,
        "toda variante de SELECT deve preservar a leitura do próprio autor",
      )
    }
  })

  it("todas as policies desta migration são idempotentes (DROP POLICY IF EXISTS antes de cada CREATE POLICY)", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    const createMatches = [...sql.matchAll(/CREATE POLICY "([^"]+)"/g)]
    assert.ok(createMatches.length >= 5, "espera-se pelo menos 5 CREATE POLICY nesta migration")
    for (const match of createMatches) {
      const policyName = match[1]
      assert.ok(policyName, "o grupo de captura do nome da policy deve existir")
      const dropPattern = new RegExp(`DROP POLICY IF EXISTS "${policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
      assert.match(sql, dropPattern, `deve haver DROP POLICY IF EXISTS para "${policyName}"`)
    }
  })

  it("não altera a regra de impersonação (canOperatorAccessTarget continua só em código)", () => {
    const sql = readMigration(SUPPORT_SESSIONS_MIGRATION)
    assert.ok(!/CREATE (OR REPLACE )?FUNCTION/i.test(sql), "esta migration deve conter apenas policies, nunca funções novas")
  })
})
