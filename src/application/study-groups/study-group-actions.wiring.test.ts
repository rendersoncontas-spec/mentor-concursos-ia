import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase J.1 — Comunidade (MVP): Grupos de Estudo.
 *
 * `study-group.actions.ts` é uma Server Action "use server" que chama
 * `createClient()` diretamente (lê cookies()/env), no mesmo molde de
 * `goals.action.ts` — que, no projeto, não tem teste comportamental próprio
 * (não há injeção de dependência nem mock de módulo com `node:test`). Por
 * isso este é um teste de fiação: garante que o código-fonte faz as
 * checagens de segurança/validação certas e chama os nomes de RPC que
 * realmente existem na migration (supabase/migrations/20261001_study_groups.sql),
 * não que o comportamento em tempo de execução contra um Postgres de verdade
 * está correto (isso é coberto, do lado do banco, por
 * study-groups-rls.wiring.test.ts e, de verdade, só por um teste manual numa
 * branch do Supabase — ver a limitação documentada lá).
 */

const source = fs.readFileSync(
  path.join(process.cwd(), "src", "application", "study-groups", "study-group.actions.ts"),
  "utf-8",
)

function actionBody(name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  assert.ok(start > 0, `action ${name} não encontrada`)
  const nextExport = source.indexOf("\nexport async function ", start + 1)
  return source.slice(start, nextExport > 0 ? nextExport : undefined)
}

describe("Fase J.1 — mutações operam sobre o usuário realmente autenticado, não o 'efetivo'", () => {
  // Decisão documentada no topo do arquivo: entrar/criar/sair/apagar/regenerar
  // usam auth.getUser() (identidade real), nunca getEffectiveUserId (que
  // trocaria de usuário durante uma sessão de suporte de admin). Só a LEITURA
  // (listar minhas turmas) usa getEffectiveUserId, de propósito.
  for (const name of [
    "createStudyGroupAction",
    "joinStudyGroupByCodeAction",
    "leaveStudyGroupAction",
    "regenerateInviteCodeAction",
    "deleteStudyGroupAction",
  ]) {
    it(`${name} usa supabase.auth.getUser()`, () => {
      assert.match(actionBody(name), /supabase\.auth\.getUser\(\)/)
    })
    it(`${name} não usa getEffectiveUserId`, () => {
      assert.doesNotMatch(actionBody(name), /getEffectiveUserId/)
    })
  }

  it("listMyStudyGroupsAction usa getEffectiveUserId (consistente com o resto do app em sessão de suporte)", () => {
    assert.match(actionBody("listMyStudyGroupsAction"), /getEffectiveUserId/)
  })
})

describe("Fase J.1 — cada action chama exatamente o RPC que existe na migration", () => {
  const migrationSql = fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261001_study_groups.sql"),
    "utf-8",
  )

  it("createStudyGroupAction chama create_study_group com p_name", () => {
    const body = actionBody("createStudyGroupAction")
    assert.match(body, /supabase\.rpc\("create_study_group", \{ p_name: name \}\)/)
    assert.match(migrationSql, /create or replace function public\.create_study_group\(p_name text\)/)
  })

  it("joinStudyGroupByCodeAction chama join_study_group_by_code com p_code", () => {
    const body = actionBody("joinStudyGroupByCodeAction")
    assert.match(body, /supabase\.rpc\("join_study_group_by_code", \{ p_code: code \}\)/)
    assert.match(migrationSql, /create or replace function public\.join_study_group_by_code\(p_code text\)/)
  })

  it("regenerateInviteCodeAction chama regenerate_study_group_invite_code com p_group_id", () => {
    const body = actionBody("regenerateInviteCodeAction")
    assert.match(body, /supabase\.rpc\("regenerate_study_group_invite_code", \{\s*p_group_id: groupId,?\s*\}\)/)
    assert.match(
      migrationSql,
      /create or replace function public\.regenerate_study_group_invite_code\(p_group_id uuid\)/,
    )
  })
})

describe("Fase J.1 — validação e regras de negócio do lado da aplicação", () => {
  it("todas as actions que recebem entrada do usuário validam com um schema Zod antes de usar o valor", () => {
    assert.match(actionBody("createStudyGroupAction"), /createStudyGroupSchema\.parse\(input\)/)
    assert.match(actionBody("joinStudyGroupByCodeAction"), /joinStudyGroupSchema\.parse\(input\)/)
    assert.match(actionBody("leaveStudyGroupAction"), /studyGroupIdSchema\.parse\(input\)/)
    assert.match(actionBody("regenerateInviteCodeAction"), /studyGroupIdSchema\.parse\(input\)/)
    assert.match(actionBody("deleteStudyGroupAction"), /studyGroupIdSchema\.parse\(input\)/)
    assert.match(actionBody("getStudyGroupDetailAction"), /studyGroupIdSchema\.parse\(input\)/)
  })

  it("leaveStudyGroupAction recusa o dono com uma mensagem amigável, antes de depender só do erro do Postgres", () => {
    const body = actionBody("leaveStudyGroupAction")
    assert.match(body, /group\?\.owner_id === user\.id/)
    assert.match(body, /O dono não pode sair do grupo/)
  })

  it("deleteStudyGroupAction confere que quem chama é o dono antes de tentar apagar", () => {
    const body = actionBody("deleteStudyGroupAction")
    assert.match(body, /group\.owner_id !== user\.id/)
  })

  it("joinStudyGroupByCodeAction aplica o limite de bom senso de membros antes do RPC, sem constraint no banco", () => {
    const body = actionBody("joinStudyGroupByCodeAction")
    assert.match(body, /MAX_GROUP_MEMBERS/)
    assert.match(body, /count[\s\S]*>=\s*MAX_GROUP_MEMBERS/)
  })
})
