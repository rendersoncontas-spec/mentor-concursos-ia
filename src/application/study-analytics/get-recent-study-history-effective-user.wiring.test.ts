import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para a correção de getRecentStudyHistoryAction na Fase 13
 * (decisão aprovada na Fase 12 de fechamento de produção).
 *
 * ACHADO REAL: getRecentStudyHistoryAction (usada pelo widget de
 * "atividades recentes" do Dashboard, em
 * src/features/dashboard/components/dashboard-widget-catalog.tsx) derivava
 * o usuário via supabase.auth.getUser() (sempre o operador real), enquanto
 * outras ações do MESMO domínio do Dashboard (dashboard-layout.action.ts,
 * statistics-center.action.ts) já usam getEffectiveUserId. Resultado: um
 * admin em modo suporte via as estatísticas do usuário-alvo, mas o widget
 * de atividades recentes mostrava o histórico do PRÓPRIO ADMIN, misturando
 * dados de duas contas na mesma tela do Dashboard.
 *
 * Corrigido: getRecentStudyHistoryAction agora deriva o usuário via
 * getEffectiveUserId(supabase), como o restante do domínio.
 *
 * Por que teste estático: mesma limitação documentada nos demais
 * *.wiring.test.ts deste projeto — não há infraestrutura de teste com
 * Supabase real nem de renderização React aqui.
 */

function readSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "application", "study-analytics", "study-analytics.actions.ts"),
    "utf-8",
  )
}

describe("getRecentStudyHistoryAction respeita a sessão de suporte (getEffectiveUserId)", () => {
  it("importa getEffectiveUserId de @/application/admin/auth-guard", () => {
    const source = readSource()
    assert.match(source, /import \{ getEffectiveUserId \} from "@\/application\/admin\/auth-guard"/)
  })

  it("deriva o usuário via getEffectiveUserId em vez de supabase.auth.getUser()", () => {
    const source = readSource()
    const fnStart = source.indexOf("export async function getRecentStudyHistoryAction")
    assert.ok(fnStart !== -1, "getRecentStudyHistoryAction deve existir")
    const fnEnd = source.indexOf("\nexport async function", fnStart + 1)
    const fnBody = source.slice(fnStart, fnEnd === -1 ? source.length : fnEnd)

    assert.match(fnBody, /const effectiveUserId = await getEffectiveUserId\(supabase\)/)
    assert.doesNotMatch(
      fnBody,
      /supabase\.auth\.getUser\(\)/,
      "não deve mais chamar supabase.auth.getUser() diretamente nesta função",
    )
  })

  it("filtra study_history por effectiveUserId, não por um user.id do operador real", () => {
    const source = readSource()
    const fnStart = source.indexOf("export async function getRecentStudyHistoryAction")
    const fnEnd = source.indexOf("\nexport async function", fnStart + 1)
    const fnBody = source.slice(fnStart, fnEnd === -1 ? source.length : fnEnd)

    assert.match(fnBody, /\.eq\("user_id", effectiveUserId\)/)
  })

  it("recusa (retorna lista vazia) quando não há usuário efetivo, em vez de prosseguir sem filtro", () => {
    const source = readSource()
    const fnStart = source.indexOf("export async function getRecentStudyHistoryAction")
    const fnEnd = source.indexOf("\nexport async function", fnStart + 1)
    const fnBody = source.slice(fnStart, fnEnd === -1 ? source.length : fnEnd)

    assert.match(fnBody, /if \(!effectiveUserId\) return \{ data: \[\], error: null \}/)
  })
})
