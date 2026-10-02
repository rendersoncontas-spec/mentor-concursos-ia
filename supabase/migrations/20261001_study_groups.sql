-- ============================================================================
-- Fase J.1 — Comunidade (MVP): Grupos de Estudo e Ranking Interno
--
-- Decisões desta fase (ver claude/fase-j-comunidade-turmas-brief-2026-10-01.md):
--   - "Grupo de Estudos" é o nome usado na interface.
--   - Uma pessoa pode pertencer a quantos grupos quiser ao mesmo tempo.
--   - O código de convite pode ser regenerado pelo dono a qualquer momento;
--     o código antigo para de funcionar imediatamente (não há histórico de
--     códigos — é sobrescrito).
--   - O dono NÃO pode sair do próprio grupo (evita grupo órfão sem dono) —
--     só pode apagar o grupo inteiro, o que remove todos os membros.
--   - Sem limite de tamanho no banco; um limite de bom senso é validado na
--     camada de aplicação (ajustável sem nova migration).
--   - Nenhuma linha em study_group_members é inserida diretamente pelo
--     cliente: a entrada só acontece pelas funções SECURITY DEFINER abaixo,
--     o que evita condição de corrida entre "ler o grupo pelo código" e
--     "inserir a membership", e não expõe study_groups a buscas por código
--     (sem política de SELECT pública).
--
-- Fora de escopo desta fase (J.1 — só banco e regras de acesso): ranking
-- interno, meta coletiva, UI. Ver fases J.2/J.3.
--
-- Tabelas novas, sem dados existentes para migrar. Aditivo e idempotente
-- (CREATE TABLE/POLICY/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS antes de
-- recriar, CREATE OR REPLACE FUNCTION).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------------------------
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc'::text, now()),
  primary key (group_id, user_id)
);

create index if not exists idx_study_groups_owner on public.study_groups (owner_id);
create index if not exists idx_study_group_members_user on public.study_group_members (user_id);

-- ----------------------------------------------------------------------------
-- 2. RLS — study_groups
-- ----------------------------------------------------------------------------
alter table public.study_groups enable row level security;

-- Só quem já é membro (ou o dono) vê o grupo — ninguém "descobre" grupos
-- listando a tabela; entrar só é possível pelo código, via função da seção 6.
drop policy if exists "Usuário vê grupos dos quais participa" on public.study_groups;
create policy "Usuário vê grupos dos quais participa" on public.study_groups
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.study_group_members m
      where m.group_id = study_groups.id and m.user_id = auth.uid()
    )
  );

-- O dono pode editar a própria linha (ex.: renomear, fora do escopo da J.1,
-- mas a política já cobre isso para não exigir outra migration depois).
drop policy if exists "Dono atualiza o próprio grupo" on public.study_groups;
create policy "Dono atualiza o próprio grupo" on public.study_groups
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Dono apaga o próprio grupo" on public.study_groups;
create policy "Dono apaga o próprio grupo" on public.study_groups
  for delete using (auth.uid() = owner_id);

-- Sem política de INSERT: toda criação de grupo passa por
-- create_study_group() (seção 5), que cria o grupo E a membership do dono
-- numa única transação — evita um grupo sem nenhum membro se a segunda
-- escrita falhasse como dois passos separados vindos do cliente.

-- ----------------------------------------------------------------------------
-- 3. RLS — study_group_members
-- ----------------------------------------------------------------------------
alter table public.study_group_members enable row level security;

drop policy if exists "Usuário vê membros dos próprios grupos" on public.study_group_members;
create policy "Usuário vê membros dos próprios grupos" on public.study_group_members
  for select using (
    exists (
      select 1 from public.study_group_members m2
      where m2.group_id = study_group_members.group_id and m2.user_id = auth.uid()
    )
  );

-- "Sair do grupo": o próprio membro remove sua linha, EXCETO se for o dono —
-- a regra é reforçada aqui (não só na camada de aplicação) porque RLS é a
-- fronteira de segurança real, não a mensagem de erro bonita.
drop policy if exists "Usuário sai do próprio grupo, exceto o dono" on public.study_group_members;
create policy "Usuário sai do próprio grupo, exceto o dono" on public.study_group_members
  for delete using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.study_groups g
      where g.id = study_group_members.group_id and g.owner_id = auth.uid()
    )
  );

-- Sem política de INSERT: toda entrada em um grupo passa por
-- create_study_group() (o próprio dono) ou join_study_group_by_code()
-- (convidados), seções 5 e 6.

-- ----------------------------------------------------------------------------
-- 4. Geração de código de convite — função utilitária, sem acesso a tabela.
--    Alfabeto sem caracteres ambíguos (sem I, O, 0, 1), 7 caracteres.
-- ----------------------------------------------------------------------------
create or replace function public.generate_study_group_invite_code()
returns text
language sql
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 33) + 1)::int, 1),
    ''
  )
  from generate_series(1, 7);
$$;

-- ----------------------------------------------------------------------------
-- 5. Criar grupo — SECURITY DEFINER só para esta operação: cria o grupo e a
--    membership do dono numa única transação, e gera um código único sem
--    precisar de uma política de INSERT direta em nenhuma das duas tabelas.
-- ----------------------------------------------------------------------------
create or replace function public.create_study_group(p_name text)
returns public.study_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.study_groups;
  v_code text;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'O nome do grupo não pode ser vazio';
  end if;

  if length(trim(p_name)) > 80 then
    raise exception 'O nome do grupo pode ter no máximo 80 caracteres';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_study_group_invite_code();
    exit when not exists (select 1 from public.study_groups where invite_code = v_code);
    if v_attempt > 10 then
      raise exception 'Não foi possível gerar um código de convite único. Tente novamente.';
    end if;
  end loop;

  insert into public.study_groups (name, invite_code, owner_id)
  values (trim(p_name), v_code, auth.uid())
  returning * into v_group;

  insert into public.study_group_members (group_id, user_id)
  values (v_group.id, auth.uid());

  return v_group;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Entrar em um grupo por código — SECURITY DEFINER: resolve o código e
--    insere a membership numa operação atômica (evita condição de corrida
--    entre "ler o grupo" e "inserir a membership" se viessem como dois
--    passos separados do cliente).
-- ----------------------------------------------------------------------------
create or replace function public.join_study_group_by_code(p_code text)
returns public.study_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.study_groups;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'Código de convite inválido';
  end if;

  select * into v_group
  from public.study_groups
  where invite_code = upper(trim(p_code));

  if not found then
    raise exception 'Código de convite inválido';
  end if;

  insert into public.study_group_members (group_id, user_id)
  values (v_group.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Regenerar código de convite — só o dono; o código antigo para de
--    funcionar imediatamente (é sobrescrito, não um histórico de códigos).
--    SECURITY DEFINER para reaproveitar generate_study_group_invite_code()
--    com a mesma lógica de unicidade usada na criação.
-- ----------------------------------------------------------------------------
create or replace function public.regenerate_study_group_invite_code(p_group_id uuid)
returns public.study_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.study_groups;
  v_code text;
  v_attempt int := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_group from public.study_groups where id = p_group_id;
  if not found then
    raise exception 'Grupo não encontrado';
  end if;
  if v_group.owner_id <> auth.uid() then
    raise exception 'Só o dono do grupo pode gerar um novo código';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := public.generate_study_group_invite_code();
    exit when not exists (select 1 from public.study_groups where invite_code = v_code);
    if v_attempt > 10 then
      raise exception 'Não foi possível gerar um código de convite único. Tente novamente.';
    end if;
  end loop;

  update public.study_groups set invite_code = v_code where id = p_group_id
  returning * into v_group;

  return v_group;
end;
$$;
