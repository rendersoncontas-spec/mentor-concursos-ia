-- ============================================================================
-- G1.1 (G-29) — PROGRESSO DE TÓPICOS DO EDITAL POR USUÁRIO (server-side).
--
-- Substitui `mentor_edital_checked_topics[_targetId]` (localStorage como
-- fonte) por persistência por usuário com RLS. O dado pertence ao usuário:
-- nunca global.
--
-- NÃO APLICAR DIRETAMENTE EM PRODUÇÃO pelo agente. Revisar, staging,
-- `supabase db push`. Idempotente, sem apagar dados.
--
-- topic_key é TEXT livre (não FK): os identificadores de tópico hoje são
-- heterogêneos ("rlm-1", "custom-<timestamp>", UUIDs do importer).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.edital_topic_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.user_targets(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT edital_topic_progress_topic_key_len
    CHECK (char_length(topic_key) BETWEEN 1 AND 320),
  CONSTRAINT edital_topic_progress_user_target_topic_unique
    UNIQUE (user_id, target_id, topic_key)
);

CREATE INDEX IF NOT EXISTS idx_edital_topic_progress_user_target
  ON public.edital_topic_progress (user_id, target_id);

ALTER TABLE public.edital_topic_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem próprio progresso de tópicos" ON public.edital_topic_progress;
CREATE POLICY "Usuários veem próprio progresso de tópicos"
  ON public.edital_topic_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários criam próprio progresso de tópicos" ON public.edital_topic_progress;
CREATE POLICY "Usuários criam próprio progresso de tópicos"
  ON public.edital_topic_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários atualizam próprio progresso de tópicos" ON public.edital_topic_progress;
CREATE POLICY "Usuários atualizam próprio progresso de tópicos"
  ON public.edital_topic_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários removem próprio progresso de tópicos" ON public.edital_topic_progress;
CREATE POLICY "Usuários removem próprio progresso de tópicos"
  ON public.edital_topic_progress FOR DELETE
  USING (auth.uid() = user_id);
