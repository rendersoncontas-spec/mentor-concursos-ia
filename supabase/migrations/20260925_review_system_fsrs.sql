-- ============================================================================
-- Fase I.1 — Sistema real de Revisões (repetição espaçada com FSRS)
--
-- Decisões desta fase (ver Claude outputs/fase-i-revisoes-arquitetura):
--   D1  a revisão é de TÓPICO e SUBTÓPICO do edital (sem questões/flashcards);
--   D5  origem polimórfica: source_type + source_id → topics.id / subtopics.id
--       (NÃO question_topics);
--   D7  o agendamento é calculado pela biblioteca ts-fsrs (MIT), atrás da porta
--       de domínio ReviewScheduler;
--   D8  review_queue, review_statistics, review_strategies e as colunas do
--       SM-2 continuam existindo como LEGADO, sem uso no novo fluxo;
--   D3/D9 sem tabela de flashcards e sem review_settings (retenção 0,9 padrão,
--       sem limite diário).
--
-- As 4 tabelas de revisão estão vazias (0 linhas verificadas em 25/09/2026),
-- então não há migração de dados: nenhuma linha é criada, alterada ou apagada.
-- Aditivo e idempotente (ADD COLUMN IF NOT EXISTS / DROP ... IF EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. review_items — estado atual de memória de cada item (1 linha por item)
-- ----------------------------------------------------------------------------
alter table public.review_items
  -- D do FSRS (dificuldade, 1 a 10). stability_score (S) já existia.
  add column if not exists difficulty numeric(8,4),
  -- intervalo em dias agendado pela última resposta (0 nos passos de minutos)
  add column if not exists scheduled_days numeric(10,4) not null default 0,
  -- passo atual de (re)aprendizagem do FSRS; sem ele um item em LEARNING nunca
  -- se forma para REVIEW (a biblioteca recomeçaria sempre do passo 0)
  add column if not exists learning_steps integer not null default 0,
  -- fora da fila, estado preservado
  add column if not exists suspended_at timestamptz,
  -- removido das revisões pelo aluno; histórico preservado
  add column if not exists archived_at timestamptz;

-- topic_id apontava para question_topics (taxonomia do banco de questões), que
-- não é o edital (D5). A coluna fica como legado, sem uso e sem FK.
alter table public.review_items
  drop constraint if exists review_items_topic_id_fkey;

-- Estados persistidos = os 4 estados do próprio FSRS. "Atrasado" e "maduro" são
-- derivados (de next_review_at e da estabilidade), não estados guardados.
alter table public.review_items
  drop constraint if exists review_items_review_stage_check;
alter table public.review_items
  add constraint review_items_review_stage_check
  check (review_stage in ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING'));

-- Origem da primeira entrega (D1/D5). QUESTION/FLASHCARD/STUDY_SESSION saem do
-- CHECK porque nenhum fluxo desta fase cria esses itens.
alter table public.review_items
  drop constraint if exists review_items_source_type_check;
alter table public.review_items
  add constraint review_items_source_type_check
  check (source_type in ('EDITAL_TOPIC', 'EDITAL_SUBTOPIC'));

-- Fila: itens ativos por vencimento (ordem determinística com o id).
create index if not exists idx_review_items_active_due
  on public.review_items (user_id, next_review_at, id)
  where suspended_at is null and archived_at is null;

-- RLS explícita (antes o FOR ALL não declarava WITH CHECK).
alter table public.review_items enable row level security;
drop policy if exists "Usuário vê próprios itens" on public.review_items;
create policy "Usuário vê próprios itens" on public.review_items
  for select using (auth.uid() = user_id);
drop policy if exists "Usuário modifica próprios itens" on public.review_items;
create policy "Usuário modifica próprios itens" on public.review_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. review_history — evento imutável, suficiente para reproduzir o cálculo
-- ----------------------------------------------------------------------------
-- Sem DEFAULT de propósito: o evento só é aceito completo. Um insert que
-- omitisse "como estava antes" gravaria um evento fabricado (era o problema de
-- previous_interval_days/new_ease, que ficavam com significado ambíguo).
-- A tabela está vazia, então NOT NULL sem default é aplicável.
alter table public.review_history
  add column if not exists session_id uuid,
  add column if not exists elapsed_days numeric(10,4) not null,
  add column if not exists scheduled_days numeric(10,4) not null,
  add column if not exists state_before text not null,
  add column if not exists state_after text not null,
  add column if not exists stability_before numeric(12,4) not null,
  add column if not exists stability_after numeric(12,4) not null,
  add column if not exists difficulty_before numeric(8,4) not null,
  add column if not exists difficulty_after numeric(8,4) not null,
  add column if not exists due_before timestamptz not null,
  add column if not exists due_after timestamptz not null,
  -- resposta dada antes do vencimento
  add column if not exists early boolean not null default false,
  -- idempotência: a mesma resposta reenviada não vira dois eventos
  add column if not exists client_operation_id text;

-- O player usa 4 notas (Errei/Difícil/Bom/Fácil), como a biblioteca.
alter table public.review_history
  drop constraint if exists review_history_grade_check;
alter table public.review_history
  add constraint review_history_grade_check check (grade between 1 and 4);

alter table public.review_history
  drop constraint if exists review_history_state_before_check,
  drop constraint if exists review_history_state_after_check;
alter table public.review_history
  add constraint review_history_state_before_check
    check (state_before in ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING')),
  add constraint review_history_state_after_check
    check (state_after in ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING'));

create unique index if not exists uq_review_history_user_operation
  on public.review_history (user_id, client_operation_id)
  where client_operation_id is not null;
create index if not exists idx_review_history_item_date
  on public.review_history (review_item_id, review_date);

-- ----------------------------------------------------------------------------
-- 3. review_sessions — agrupa as respostas de uma rodada (tempo real da sessão)
-- ----------------------------------------------------------------------------
create table if not exists public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'DISCARDED')),
  started_at timestamptz not null default timezone('utc'::text, now()),
  finished_at timestamptz,
  items_answered integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- uma única sessão ACTIVE por usuário
create unique index if not exists uq_review_sessions_one_active
  on public.review_sessions (user_id) where status = 'ACTIVE';
create index if not exists idx_review_sessions_user_status
  on public.review_sessions (user_id, status);

alter table public.review_sessions enable row level security;
drop policy if exists "Usuário vê próprias sessões de revisão" on public.review_sessions;
create policy "Usuário vê próprias sessões de revisão" on public.review_sessions
  for select using (auth.uid() = user_id);
drop policy if exists "Usuário modifica próprias sessões de revisão" on public.review_sessions;
create policy "Usuário modifica próprias sessões de revisão" on public.review_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.review_history
  drop constraint if exists review_history_session_id_fkey;
alter table public.review_history
  add constraint review_history_session_id_fkey
  foreign key (session_id) references public.review_sessions(id) on delete set null;
create index if not exists idx_review_history_session on public.review_history (session_id);

-- ----------------------------------------------------------------------------
-- 4. review_history append-only, com dono verificado
--    A FK para review_items NÃO passa pela RLS: sem a checagem abaixo, um
--    usuário poderia inserir histórico apontando para o item de outro.
-- ----------------------------------------------------------------------------
drop policy if exists "Usuário modifica próprio histórico" on public.review_history;
drop policy if exists "Usuário insere histórico dos próprios itens" on public.review_history;
create policy "Usuário insere histórico dos próprios itens" on public.review_history
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.review_items ri
      where ri.id = review_item_id and ri.user_id = auth.uid()
    )
  );
-- Sem políticas de UPDATE/DELETE: o histórico não pode ser alterado nem apagado
-- pelo usuário (a exclusão em cascata de um item continua valendo no banco).
drop policy if exists "Usuário vê próprio histórico" on public.review_history;
create policy "Usuário vê próprio histórico" on public.review_history
  for select using (auth.uid() = user_id);
