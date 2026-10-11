// G2.12 — validação da migration de identidade canônica em PGlite (Postgres em memória).
// Uso (fora do projeto, sem adicionar dependência): numa pasta temporária,
//   npm i @electric-sql/pglite@0.2 && node g2-12-migration-check.mjs <caminho da migration>
// com um catalog.json ([[id, name, name_key_gravada], ...]) exportado do catálogo (somente leitura).
/* global process, console */
import { PGlite } from "@electric-sql/pglite"
import fs from "node:fs"
const MIG = process.argv[2]
const cat = JSON.parse(fs.readFileSync("catalog.json", "utf8"))
function jsKey(name) {
  let s = ""
  for (const ch of name.normalize("NFD")) { const cp = ch.codePointAt(0); if (cp >= 0x300 && cp <= 0x36f) continue; s += ch }
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}
const db = new PGlite()
const out = []
const ok = (c, m) => { out.push((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1 }
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true),''),'anon') $$;
create table public.user_roles(user_id uuid primary key, role text);
create function public.get_user_role(target_user_id uuid) returns text language sql stable security definer as $$ select coalesce((select role from public.user_roles where user_id=target_user_id),'user') $$;
create table public.disciplines(id uuid primary key default gen_random_uuid(), name text not null, area text, created_at timestamptz default now(), color_hex text, name_key text);
create unique index disciplines_name_key_unique_idx on public.disciplines(name_key);
alter table public.disciplines enable row level security;
create policy "Leitura de disciplinas permitida a todos os usuários" on public.disciplines for select using (auth.role()='authenticated');
create policy "Usuários autenticados podem atualizar disciplinas" on public.disciplines for update using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "Usuários autenticados podem criar disciplinas" on public.disciplines for insert with check (auth.role()='authenticated');
create role authenticated;
grant usage on schema public, auth to authenticated;
grant select, insert, update on public.disciplines to authenticated;
grant select on public.user_roles to authenticated;
insert into public.user_roles values ('00000000-0000-0000-0000-00000000000a','admin'),('00000000-0000-0000-0000-00000000000b','user');
`)
for (const [id, name, key] of cat) await db.query("insert into public.disciplines(id,name,name_key) values ($1,$2,$3)", [id, name, key])
const sql = fs.readFileSync(MIG, "utf8")
await db.exec(sql)
await db.exec(sql) // idempotência
ok(true, "migration aplicada 2x sem erro")
const rows = (await db.query("select id,name,name_key,canonical_discipline_id from public.disciplines")).rows
ok(rows.length === 123, "nenhuma linha apagada/criada: " + rows.length)
const mism = rows.filter((r) => r.name_key !== jsKey(r.name))
ok(mism.length === 0, "name_key == canonicalDisciplineKey em todas as linhas (divergentes: " + mism.map((r) => r.name).join("|") + ")")
const names = rows.reduce((a, r) => (a[r.id] = r.name, a), {})
const orig = cat.reduce((a, [id, n]) => (a[id] = n, a), {})
ok(rows.every((r) => r.name === orig[r.id]), "nenhum name alterado")
const aliases = rows.filter((r) => r.canonical_discipline_id).map((r) => `${r.name} -> ${names[r.canonical_discipline_id]}`).sort()
ok(JSON.stringify(aliases) === JSON.stringify(["Raciocínio Lógico-Matemático -> Raciocínio Lógico e Matemático", "Tecnologia da Informação -> Tecnologia da Informação (TI)"]), "só os 2 vínculos comprovados: " + aliases.join("; "))
// paridade SQL x JS em casos-limite
const edge = ["Direito-Penal", "  Língua   Portuguesa ", "Ética decomposta", "Ciências Atuariais (Atuária)", "AÇÃO ÜBER Ñandú", "Raciocínio Lógico—Matemático", "CF/1988", "tab\tdentro", "Ýy ÿ", "Øresund ß"]
for (const e of edge) {
  const r = (await db.query("select public.discipline_name_key($1) k", [e])).rows[0].k
  ok(r === jsKey(e), `paridade "${e}" sql=${JSON.stringify(r)} js=${JSON.stringify(jsKey(e))}`)
}
// trigger de name_key em insert legado (sem chave)
await db.query("insert into public.disciplines(id,name) values ('11111111-1111-1111-1111-111111111111','Língua Latina')")
ok((await db.query("select name_key from public.disciplines where id='11111111-1111-1111-1111-111111111111'")).rows[0].name_key === "lingua latina", "insert sem name_key recebe a chave canônica")
// insert duplicado canônico é barrado pelo UNIQUE
let dup = null
try { await db.query("insert into public.disciplines(name) values ('lingua portuguesa')") } catch (e) { dup = e.message }
ok(dup && /unique|duplicate/i.test(dup), "duplicata canônica sem acento é barrada: " + dup)
// guarda: usuário comum (sem RLS, superuser + uid) não muda vínculo
const RL = "a1e89de7-b9e9-4512-a107-efecf8cbad1b", RLM = "a999929b-2793-43d9-b0a4-36a617d1bda8", RLM2 = "6514acc4-4497-4f42-b56b-d3d29ae9d819"
async function expectErr(label, q, params = []) { let m = null; try { await db.query(q, params) } catch (e) { m = e.message } ok(!!m, label + (m ? ": " + m : " (sem erro!)")) }
await db.exec("set test.uid = '00000000-0000-0000-0000-00000000000b'")
await expectErr("usuário comum não altera canonical (trigger)", `update public.disciplines set canonical_discipline_id='${RLM}' where id='${RL}'`)
await expectErr("usuário comum não insere alias", `insert into public.disciplines(name, canonical_discipline_id) values ('X alias','${RLM}')`)
// RLS: como authenticated comum, UPDATE do catálogo não afeta linhas
await db.exec("set test.role = 'authenticated'; set role authenticated")
const upd = await db.query(`update public.disciplines set name='Hackeado' where id='${RL}'`)
ok(upd.affectedRows === 0, "RLS: usuário comum não renomeia o catálogo global (afetadas=" + upd.affectedRows + ")")
const ins = await db.query("insert into public.disciplines(name) values ('Matéria Nova Usuario') returning name_key")
ok(ins.rows[0].name_key === "materia nova usuario", "usuário comum continua podendo criar matéria (import/criação)")
await db.exec("reset role")
// admin
await db.exec("set test.uid = '00000000-0000-0000-0000-00000000000a'; set role authenticated")
await expectErr("cadeia barrada (alvo já é alias)", `update public.disciplines set canonical_discipline_id='${RLM2}' where id='${RL}'`)
await expectErr("canônica com aliases não vira alias", `update public.disciplines set canonical_discipline_id='${RL}' where id='${RLM}'`)
await expectErr("auto-referência barrada", `update public.disciplines set canonical_discipline_id='${RL}' where id='${RL}'`)
const adm = await db.query(`update public.disciplines set name='Raciocínio Lógico ' where id='${RL}' returning name_key`)
ok(adm.rows.length === 1 && adm.rows[0].name_key === "raciocinio logico", "admin atualiza catálogo; name_key recalculada")
await db.exec("reset role; reset test.uid; reset test.role")
// ON DELETE SET NULL (linha de teste)
await db.query("insert into public.disciplines(id,name) values ('22222222-2222-2222-2222-222222222222','Canon Teste'),('33333333-3333-3333-3333-333333333333','Alias Teste')")
await db.query("update public.disciplines set canonical_discipline_id='22222222-2222-2222-2222-222222222222' where id='33333333-3333-3333-3333-333333333333'")
await db.query("delete from public.disciplines where id='22222222-2222-2222-2222-222222222222'")
ok((await db.query("select canonical_discipline_id c from public.disciplines where id='33333333-3333-3333-3333-333333333333'")).rows[0].c === null, "apagar a canônica só desfaz o vínculo (SET NULL)")
console.log(out.join("\n"))
