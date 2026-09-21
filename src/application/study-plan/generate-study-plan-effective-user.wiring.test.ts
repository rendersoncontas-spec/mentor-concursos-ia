import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para a correção de generateStudyPlanAction e
 * deactivateStudyPlanAction na Fase 13 (decisão aprovada na Fase 12 de
 * fechamento de produção).
 *
 * ACHADO REAL: as duas ações derivavam o usuário via supabase.auth.getUser()
 * (sempre o operador real), enquanto o restante do domínio de Planejamento
 * (list-plans.action.ts) já usa getEffectiveUserId. Resultado: durante uma
 * sessão de suporte, um admin gerando/desativando um cronograma pelo
 * Dashboard/Planejamento operava sobre o PRÓPRIO plano do admin, em vez do
 * plano do usuário-alvo que ele estava atendendo — inconsistente com o
 * restante da tela, que já respeitava a sessão de suporte.
 *
 * Corrigido: as duas funções agora derivam o usuário via
 * getEffectiveUserId(supabase), como list-plans.action.ts já fazia.
 *
 * Por que teste estático: mesma limitação documentada nos demais
 * *.wiring.test.ts deste projeto — não há infraestrutura de teste com
 * Supabase real nem de renderização React aqui.
 */

function readSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "application", "study-plan", "generate-study-plan.action.ts"),
    "utf-8",
  )
}

function extractFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  assert.ok(start !== -1, `${signature} deve existir`)
  const end = source.indexOf("\nexport async function", start + 1)
  return source.slice(start, end === -1 ? source.length : end)
}

describe("generateStudyPlanAction/deactivateStudyPlanAction respeitam a sessão de suporte (getEffectiveUserId)", () => {
  it("importa getEffectiveUserId de @/application/admin/auth-guard", () => {
    const source = readSource()
    assert.match(source, /import \{ getEffectiveUserId \} from "@\/application\/admin\/auth-guard"/)
  })

  it("generateStudyPlanAction deriva o usuário via getEffectiveUserId e não chama supabase.auth.getUser()", () => {
    const source = readSource()
    const fnBody = extractFunctionBody(source, "export async function generateStudyPlanAction")

    assert.match(fnBody, /const effectiveUserId = await getEffectiveUserId\(supabase\)/)
    assert.doesNotMatch(
      fnBody,
      /supabase\.auth\.getUser\(\)/,
      "não deve mais chamar supabase.auth.getUser() diretamente nesta função",
    )
    assert.doesNotMatch(
      fnBody,
      /\buser\.id\b/,
      "não deve mais restar nenhuma referência a user.id nesta função",
    )
  })

  it("generateStudyPlanAction usa effectiveUserId em todas as operações de leitura/escrita ligadas ao usuário", () => {
    const source = readSource()
    const fnBody = extractFunctionBody(source, "export async function generateStudyPlanAction")

    assert.match(fnBody, /\.eq\("user_id", effectiveUserId\)/)
    assert.match(fnBody, /\.eq\("id", effectiveUserId\)/)
    assert.match(fnBody, /user_id: effectiveUserId,/)
    assert.match(
      fnBody,
      /generateStudyPlan\(supabase, effectiveUserId, reason, rawTarget\.id, targetWeeklyHours\)/,
    )
  })

  it("deactivateStudyPlanAction deriva o usuário via getEffectiveUserId e não chama supabase.auth.getUser()", () => {
    const source = readSource()
    const fnBody = extractFunctionBody(source, "export async function deactivateStudyPlanAction")

    assert.match(fnBody, /const effectiveUserId = await getEffectiveUserId\(supabase\)/)
    assert.doesNotMatch(
      fnBody,
      /supabase\.auth\.getUser\(\)/,
      "não deve mais chamar supabase.auth.getUser() diretamente nesta função",
    )
    assert.match(fnBody, /deactivateUserStudyPlan\(supabase, effectiveUserId\)/)
  })
})
