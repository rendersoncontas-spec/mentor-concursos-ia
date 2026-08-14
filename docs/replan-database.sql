-- ============================================================================
-- REPLANEJAMENTO ADAPTATIVO DO CRONOGRAMA — NOMEIA
-- ----------------------------------------------------------------------------
-- Duas tabelas novas:
--   1. study_plan_daily_blocks : cronograma DATADO (o que deve ser feito em cada
--      data). ID estável por bloco (rastreamento planejado ↔ realizado).
--   2. study_plan_replan_events : registro de cada reajuste (transparência,
--      histórico e desfazer).
--
-- Regras:
--   - NUNCA modificar o passado: blocos de datas anteriores são imutáveis
--     (apenas leitura para cálculo de pendência).
--   - Somente o futuro é reescrito (origem 'REAJUSTE'/'CRITICO').
--   - source_block_id (auto-referência) impede duplicar uma pendência já
--     reintroduzida (não criar duas vezes a mesma atividade).
-- ============================================================================

-- 1. BLOCOS DIÁRIOS
CREATE TABLE IF NOT EXISTS public.study_plan_daily_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.study_plan_items(id) ON DELETE SET NULL,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  execution_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO')),
  origin text NOT NULL DEFAULT 'BASE'
    CHECK (origin IN ('BASE', 'REAJUSTE', 'CRITICO')),
  -- Bloco original que gerou esta pendência (anti-duplicação)
  source_block_id uuid REFERENCES public.study_plan_daily_blocks(id) ON DELETE SET NULL,
  replan_event_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_blocks_user_date
  ON public.study_plan_daily_blocks (user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_daily_blocks_plan_date
  ON public.study_plan_daily_blocks (study_plan_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_daily_blocks_event
  ON public.study_plan_daily_blocks (replan_event_id)
  WHERE replan_event_id IS NOT NULL;

ALTER TABLE public.study_plan_daily_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê seus blocos diários" ON public.study_plan_daily_blocks;
CREATE POLICY "Usuário vê seus blocos diários"
  ON public.study_plan_daily_blocks FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário insere seus blocos diários" ON public.study_plan_daily_blocks;
CREATE POLICY "Usuário insere seus blocos diários"
  ON public.study_plan_daily_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário atualiza seus blocos diários" ON public.study_plan_daily_blocks;
CREATE POLICY "Usuário atualiza seus blocos diários"
  ON public.study_plan_daily_blocks FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário exclui seus blocos diários" ON public.study_plan_daily_blocks;
CREATE POLICY "Usuário exclui seus blocos diários"
  ON public.study_plan_daily_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- 2. EVENTOS DE REAJUSTE (transparência + desfazer)
CREATE TABLE IF NOT EXISTS public.study_plan_replan_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'AUTO'
    CHECK (trigger IN ('AUTO', 'MANUAL', 'DAY_CLOSE')),
  reason text NOT NULL,
  pending_minutes integer NOT NULL DEFAULT 0,
  pending_blocks integer NOT NULL DEFAULT 0,
  redistributed_days integer NOT NULL DEFAULT 0,
  unscheduled_minutes integer NOT NULL DEFAULT 0,
  critical boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reverted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replan_events_user
  ON public.study_plan_replan_events (user_id, created_at DESC);

ALTER TABLE public.study_plan_replan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê seus eventos de reajuste" ON public.study_plan_replan_events;
CREATE POLICY "Usuário vê seus eventos de reajuste"
  ON public.study_plan_replan_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário insere seus eventos de reajuste" ON public.study_plan_replan_events;
CREATE POLICY "Usuário insere seus eventos de reajuste"
  ON public.study_plan_replan_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário atualiza seus eventos de reajuste" ON public.study_plan_replan_events;
CREATE POLICY "Usuário atualiza seus eventos de reajuste"
  ON public.study_plan_replan_events FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário exclui seus eventos de reajuste" ON public.study_plan_replan_events;
CREATE POLICY "Usuário exclui seus eventos de reajuste"
  ON public.study_plan_replan_events FOR DELETE
  USING (auth.uid() = user_id);

-- 3. PREFERÊNCIA "Reajustar automaticamente meu cronograma"
--    (perfil → preferences jsonb, chave: adaptive_replan). O padrão fica ON.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

-- ============================================================================
-- MIGRAÇÃO — "Marcar como concluído hoje" (fechamento manual de bloco)
-- ----------------------------------------------------------------------------
-- Habilita o status 'CONCLUIDO_MANUAL' e guarda os minutos perdoados para
-- exibição ("Concluído com 2 min pendentes") e o instante do fechamento.
-- Rodar no SQL Editor do Supabase (banco já existente).
-- ============================================================================

ALTER TABLE public.study_plan_daily_blocks
  ADD COLUMN IF NOT EXISTS manual_pending_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_close_at timestamptz;

ALTER TABLE public.study_plan_daily_blocks
  DROP CONSTRAINT IF EXISTS study_plan_daily_blocks_status_check;

ALTER TABLE public.study_plan_daily_blocks
  ADD CONSTRAINT study_plan_daily_blocks_status_check
  CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'CONCLUIDO_MANUAL'));
