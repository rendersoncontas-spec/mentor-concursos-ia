-- ========================================================================================
-- SPRINT 14 - SISTEMA COMPLETO DE REPETIÇÃO ESPAÇADA (Aba Revisões)
--
-- Reutiliza as tabelas existentes (review_items, review_queue, review_history,
-- review_strategies) e adiciona:
--   1. Colunas de conteúdo/espaçado em review_items (flashcards, tags, soft-delete,
--      streak, dificuldade FSRS, intervalo anterior)
--   2. review_settings  -> configurações de carga/perfil/reta final do usuário
--   3. review_sessions  -> sessões de revisão persistentes (continuar/descartar)
--   4. review_history.session_id -> vincula cada resposta à sessão
--
-- Aditivo e idempotente (ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS).
-- Executar no SQL Editor do Supabase.
-- ========================================================================================

-- ----------------------------------------------------------------------------------------
-- 1. review_items: conteúdo de flashcard, tags, estados e métricas do FSRS
-- ----------------------------------------------------------------------------------------
ALTER TABLE public.review_items
  ADD COLUMN IF NOT EXISTS card_type text DEFAULT 'QA'
    CHECK (card_type IN ('QA', 'CLOZE', 'TRUE_FALSE', 'MULTIPLE_CHOICE', 'OPEN', 'QUESTION')),
  ADD COLUMN IF NOT EXISTS card_front text,
  ADD COLUMN IF NOT EXISTS card_back text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS difficulty numeric(5,2) DEFAULT 4.93, -- FSRS D (1 a 10)
  ADD COLUMN IF NOT EXISTS last_interval_days numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_correct integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_wrong integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_review_items_not_deleted ON public.review_items(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_items_tags ON public.review_items(user_id) USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_review_items_type ON public.review_items(user_id, card_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_items_suspended ON public.review_items(user_id, is_suspended) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------------------
-- 2. review_settings: controle de carga, retenção desejada, perfil e reta final
-- ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_settings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  new_cards_per_day integer NOT NULL DEFAULT 20,
  max_reviews_per_day integer NOT NULL DEFAULT 200,
  desired_retention numeric(4,3) NOT NULL DEFAULT 0.900, -- 0.80 a 0.95
  max_daily_minutes integer,                             -- limite opcional de tempo diário
  review_profile text NOT NULL DEFAULT 'EQUILIBRADO'
    CHECK (review_profile IN ('EQUILIBRADO', 'ALTA_RETENCAO', 'RETA_FINAL', 'LEVE')),
  exam_date date,                                        -- usada no Modo Reta Final e prioridade
  reta_final boolean NOT NULL DEFAULT false,
  auto_add_errors boolean NOT NULL DEFAULT true,         -- erros de simulado viram revisão automaticamente?
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.review_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê próprias configurações" ON public.review_settings;
CREATE POLICY "Usuário vê próprias configurações" ON public.review_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário modifica próprias configurações" ON public.review_settings;
CREATE POLICY "Usuário modifica próprias configurações" ON public.review_settings
  FOR ALL USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------------------
-- 3. review_sessions: sessões persistentes (continuar/descartar após reload)
-- ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'COMPLETED', 'DISCARDED')),
  mode text NOT NULL DEFAULT 'ALL',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,       -- critério usado para montar a fila
  queue_ids jsonb NOT NULL DEFAULT '[]'::jsonb,     -- ids ordenados dos review_items (fila inteligente)
  answered_ids jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ids já respondidos nesta sessão
  cards_total integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  finished_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário vê próprias sessões" ON public.review_sessions;
CREATE POLICY "Usuário vê próprias sessões" ON public.review_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário modifica próprias sessões" ON public.review_sessions;
CREATE POLICY "Usuário modifica próprias sessões" ON public.review_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_review_sessions_user_status ON public.review_sessions(user_id, status);

-- ----------------------------------------------------------------------------------------
-- 4. review_history: vínculo com a sessão (histórico imutável é preservado)
-- ----------------------------------------------------------------------------------------
ALTER TABLE public.review_history
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.review_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_review_history_session ON public.review_history(session_id);