-- ========================================================================================
-- MIGRATION: Autocomplete inteligente de tópicos — tópicos personalizados por usuário
-- Rodar NO SQL EDITOR do Supabase (1x, é idempotente).
--
-- O que faz:
--   1. Adiciona `user_id` em public.topics (NULL = catálogo global; preenchido = tópico
--      personalizado criado pelo próprio usuário via app).
--   2. Substitui o índice único global por 2 índices parciais:
--      - global        : (discipline_id, normalize_text(name))  WHERE user_id IS NULL
--      - por usuário   : (user_id, discipline_id, normalize_text(name)) WHERE user_id IS NOT NULL
--   3. Ajusta RLS: SELECT só vê tópicos globais + os próprios; INSERT só permite criar
--      tópicos com user_id = auth.uid() (app nunca cria tópico global).
-- ========================================================================================

-- 1. Coluna user_id (NULL = catálogo global; preenchido = personalizado do usuário)
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Reutiliza a função de normalização existente (imutável, sem extensões)
--    (já criada em docs/topic-catalog.sql; garante aqui por segurança)

-- 3. Índices únicos parciais (substituem o antigo único global)
DROP INDEX IF EXISTS topics_discipline_name_norm_idx;

CREATE UNIQUE INDEX topics_discipline_name_norm_idx
  ON public.topics (discipline_id, public.normalize_text(name))
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS topics_user_discipline_name_norm_idx
  ON public.topics (user_id, discipline_id, public.normalize_text(name))
  WHERE user_id IS NOT NULL;

-- 4. RLS — SELECT: tópicos globais + os próprios tópicos personalizados
DROP POLICY IF EXISTS "Todos podem ler tópicos" ON public.topics;
CREATE POLICY "Todos podem ler tópicos"
  ON public.topics FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

-- INSERT: o app SÓ cria tópicos personalizados (user_id = auth.uid()).
-- Tópicos globais continuam sendo seedados via SQL Editor / service role (bypass RLS).
DROP POLICY IF EXISTS "Usuários autenticados podem criar tópicos" ON public.topics;
CREATE POLICY "Usuários autenticados podem criar tópicos personalizados"
  ON public.topics FOR INSERT
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());