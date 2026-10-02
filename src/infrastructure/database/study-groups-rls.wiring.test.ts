import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase J.1 — Comunidade (MVP): Grupos de Estudo.
 *
 * Testes de "wiring" (verificação estática do texto da migration SQL), no
 * mesmo espírito de `schema-rls-hardening.wiring.test.ts`.
 *
 * LIMITAÇÃO DOCUMENTADA: este ambiente não tem acesso a um Postgres real nem
 * à instância de produção do Supabase. Estes testes NÃO executam a migration,
 * NÃO criam usuários/linhas de teste e NÃO provam que o RLS realmente
 * bloqueia/permite o que deveria em tempo de execução — isso exigiria rodar a
 * migration contra um Postgres de verdade (ex.: supabase CLI + Docker, ou uma
 * branch do projeto Supabase) com usuários autenticados distintos, o que não
 * está disponível neste ambiente. O que estes testes garantem é que o
 * DESENHO pretendido (ver claude/fase-j-comunidade-turmas-brief-2026-10-01.md)
 * está de fato escrito no arquivo: RLS ligado nas duas tabelas, nenhuma
 * política de INSERT direta em nenhuma das duas (só pelas funções SECURITY
 * DEFINER), o dono bloqueado de sair do próprio grupo, e as funções com
 * `security definer` protegidas por `set search_path = public`.
 *
 * Recomendação para verificação real antes de aplicar em produção: rodar esta
 * migration numa branch de desenvolvimento do Supabase (ou localmente via
 * `supabase start`) e testar manualmente os três cenários de segurança da
 * seção 10 do brief com dois usuários de teste distintos.
 */

function readMigration(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", "20261001_study_groups.sql"),
    "utf-8",
  )
}

describe("Fase J.1 — migration de study_groups/study_group_members existe e é aditiva", () => {
  const sql = readMigration()

  it("cria as duas tabelas de forma idempotente (IF NOT EXISTS)", () => {
    assert.match(sql, /create table if not exists public\.study_groups/)
    assert.match(sql, /create table if not exists public\.study_group_members/)
  })

  it("invite_code é único e não nulo", () => {
    const tableStart = sql.indexOf("create table if not exists public.study_groups")
    const tableBody = sql.slice(tableStart, tableStart + 400)
    assert.match(tableBody, /invite_code text not null unique/)
  })

  it("study_group_members tem chave primária composta (impede entrar duas vezes no mesmo grupo)", () => {
    const tableStart = sql.indexOf("create table if not exists public.study_group_members")
    const tableBody = sql.slice(tableStart, tableStart + 400)
    assert.match(tableBody, /primary key \(group_id, user_id\)/)
  })
})

describe("Fase J.1 — RLS está ligado e sem política de INSERT direta", () => {
  const sql = readMigration()

  it("RLS habilitado nas duas tabelas", () => {
    assert.match(sql, /alter table public\.study_groups enable row level security/)
    assert.match(sql, /alter table public\.study_group_members enable row level security/)
  })

  it("não existe nenhuma 'for insert' fora dos comentários — toda entrada passa pelas funções SECURITY DEFINER", () => {
    // Remove comentários de linha (--) antes de procurar "for insert", para não
    // dar falso-negativo com o texto explicativo que cita a ausência de política.
    const withoutComments = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
    assert.doesNotMatch(withoutComments, /for insert/i)
  })

  it("a leitura de study_groups exige ser dono ou membro (nenhum SELECT público)", () => {
    const policyStart = sql.indexOf('"Usuário vê grupos dos quais participa"', sql.indexOf("create policy"))
    assert.ok(policyStart > 0)
    const policyBody = sql.slice(policyStart, policyStart + 400)
    assert.match(policyBody, /auth\.uid\(\) = owner_id/)
    assert.match(policyBody, /study_group_members m/)
  })

  it("o dono é bloqueado de sair do próprio grupo diretamente na policy de DELETE (não só na aplicação)", () => {
    const policyStart = sql.indexOf('"Usuário sai do próprio grupo, exceto o dono"', sql.indexOf("create policy"))
    assert.ok(policyStart > 0, "policy de saída do grupo não encontrada")
    const policyBody = sql.slice(policyStart, policyStart + 500)
    assert.match(policyBody, /auth\.uid\(\) = user_id/)
    assert.match(policyBody, /not exists/)
    assert.match(policyBody, /g\.owner_id = auth\.uid\(\)/)
  })

  it("só o dono pode apagar ou atualizar o grupo", () => {
    const deleteIdx = sql.indexOf('"Dono apaga o próprio grupo"')
    const updateIdx = sql.indexOf('"Dono atualiza o próprio grupo"')
    assert.ok(deleteIdx > 0 && updateIdx > 0)
    assert.match(sql.slice(deleteIdx, deleteIdx + 200), /auth\.uid\(\) = owner_id/)
    assert.match(sql.slice(updateIdx, updateIdx + 250), /auth\.uid\(\) = owner_id/)
  })
})

describe("Fase J.1 — funções SECURITY DEFINER seguem o padrão de segurança do projeto", () => {
  const sql = readMigration()
  const functionNames = [
    "create_study_group",
    "join_study_group_by_code",
    "regenerate_study_group_invite_code",
  ]

  for (const name of functionNames) {
    it(`${name} é SECURITY DEFINER com search_path fixo (mesmo padrão de get_public_study_profile)`, () => {
      const idx = sql.indexOf(`create or replace function public.${name}`)
      assert.ok(idx > 0, `função ${name} não encontrada`)
      const body = sql.slice(idx, idx + 600)
      assert.match(body, /security definer/)
      assert.match(body, /set search_path = public/)
    })

    it(`${name} recusa chamada sem usuário autenticado`, () => {
      const idx = sql.indexOf(`create or replace function public.${name}`)
      const nextIdx = sql.indexOf("create or replace function public.", idx + 1)
      const body = sql.slice(idx, nextIdx > 0 ? nextIdx : undefined)
      assert.match(body, /auth\.uid\(\) is null/)
    })
  }

  it("join_study_group_by_code usa ON CONFLICT DO NOTHING (idempotente — reenviar o mesmo código não duplica nem falha)", () => {
    const idx = sql.indexOf("create or replace function public.join_study_group_by_code")
    const body = sql.slice(idx, idx + 1200)
    assert.match(body, /on conflict \(group_id, user_id\) do nothing/)
  })

  it("regenerate_study_group_invite_code verifica que quem chama é o dono do grupo", () => {
    const idx = sql.indexOf("create or replace function public.regenerate_study_group_invite_code")
    const body = sql.slice(idx, idx + 1200)
    assert.match(body, /v_group\.owner_id <> auth\.uid\(\)/)
  })

  it("create_study_group insere o grupo e a membership do dono (não deixa o grupo sem nenhum membro)", () => {
    const idx = sql.indexOf("create or replace function public.create_study_group")
    const nextIdx = sql.indexOf("create or replace function public.", idx + 1)
    const body = sql.slice(idx, nextIdx > 0 ? nextIdx : undefined)
    assert.match(body, /insert into public\.study_groups/)
    assert.match(body, /insert into public\.study_group_members/)
  })

  it("o código de convite usa um alfabeto sem caracteres ambíguos (sem I, O, 0, 1)", () => {
    const idx = sql.indexOf("create or replace function public.generate_study_group_invite_code")
    const body = sql.slice(idx, idx + 400)
    const alphabetMatch = body.match(/'([A-Z0-9]+)'/)
    assert.ok(alphabetMatch, "alfabeto não encontrado")
    const alphabet = alphabetMatch?.[1] ?? ""
    for (const ambiguous of ["I", "O", "0", "1"]) {
      assert.ok(!alphabet.includes(ambiguous), `alfabeto não deveria conter '${ambiguous}'`)
    }
  })
})
