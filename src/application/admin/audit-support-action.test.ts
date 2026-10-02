import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { auditSupportAction } from "./admin-audit"

/**
 * Fase G2.6.1 — correção de segurança (achado ALTO da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01"):
 * a trilha de auditoria do modo suporte existia como mecanismo
 * (auditSupportAction) mas tinha um único ponto de chamada em todo o app
 * (deleteCycleAction), porque cada Server Action precisava reimplementar
 * manualmente a leitura de cookie/sessão de suporte antes de chamá-la.
 *
 * Este teste verifica o comportamento real (não apenas o texto do arquivo)
 * do mecanismo de auditoria em si: o shape do registro gravado em
 * audit_logs e a garantia de que uma falha na auditoria nunca propaga e
 * quebra a ação principal. A nova forma de chamar isso automaticamente — via
 * getEffectiveUserId(supabase, auditContext) — é coberta por
 * effective-user-mutation-audit.wiring.test.ts (verificação estática de que
 * cada mutação relevante passa o contexto certo).
 */

interface FakeSupabase {
  from(table: string): { insert(payload: unknown): Promise<{ error: null }> }
  inserts: { table: string; payload: unknown }[]
}

function fakeSupabase(onInsert?: () => never): FakeSupabase {
  const inserts: { table: string; payload: unknown }[] = []
  return {
    inserts,
    from(table: string) {
      return {
        async insert(payload: unknown) {
          if (onInsert) onInsert()
          inserts.push({ table, payload })
          return { error: null }
        },
      }
    },
  }
}

describe("Fase G2.6.1 — auditSupportAction grava o registro correto em audit_logs", () => {
  it("grava actor (moderador), target (usuário efetivo), action prefixada e metadata com a sessão/recurso", async () => {
    const supabase = fakeSupabase()
    await auditSupportAction(supabase as never, {
      supportSessionId: "sess-1",
      moderatorId: "mod-1",
      targetUserId: "target-1",
      action: "DELETE_CYCLE",
      resource: "cycle-123",
      result: "success",
    })

    assert.equal(supabase.inserts.length, 1)
    const inserted = supabase.inserts[0]
    assert.ok(inserted)
    const { table, payload } = inserted
    assert.equal(table, "audit_logs")
    assert.deepEqual(payload, {
      actor_user_id: "mod-1",
      target_user_id: "target-1",
      action: "SUPPORT_DELETE_CYCLE",
      metadata: { supportSessionId: "sess-1", resource: "cycle-123", result: "success" },
    })
  })

  it("nunca grava senha/token — metadata só contém identificadores e resultado", async () => {
    const supabase = fakeSupabase()
    await auditSupportAction(supabase as never, {
      supportSessionId: "sess-2",
      moderatorId: "mod-2",
      targetUserId: "target-2",
      action: "DELETE_SIMULADO",
      resource: "sim-9",
      result: "success",
    })
    const inserted = supabase.inserts[0]
    assert.ok(inserted)
    const keys = Object.keys((inserted.payload as { metadata: Record<string, unknown> }).metadata)
    assert.deepEqual(keys.sort(), ["resource", "result", "supportSessionId"])
  })

  it("uma falha ao gravar a auditoria nunca propaga (a ação principal nunca pode quebrar por causa disto)", async () => {
    const supabase = fakeSupabase(() => {
      throw new Error("audit_logs indisponível")
    })
    await assert.doesNotReject(
      auditSupportAction(supabase as never, {
        supportSessionId: "sess-3",
        moderatorId: "mod-3",
        targetUserId: "target-3",
        action: "UPDATE_CYCLE",
        resource: "cycle-9",
        result: "success",
      }),
    )
  })
})
