-- ========================================================================================
-- MIGRATION: Verificar e Corrigir study_history para salvamento da Central
-- ========================================================================================

-- 1. Verificar a estrutura atual da tabela
-- (Execute separadamente para debug)
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'study_history'
-- ORDER BY ordinal_position;

-- 2. Garantir que a coluna study_source existe (NOT NULL com CHECK)
-- Se o sprint3-history.sql não criou com constraint, vamos criar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'study_history' AND column_name = 'study_source'
  ) THEN
    ALTER TABLE public.study_history
      ADD COLUMN study_source text NOT NULL DEFAULT 'FREE';
  END IF;
END $$;

-- Remover constraint antiga se existir e criar nova
ALTER TABLE public.study_history 
  DROP CONSTRAINT IF EXISTS study_history_study_source_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'study_history_study_source_check_v2'
  ) THEN
    ALTER TABLE public.study_history
      ADD CONSTRAINT study_history_study_source_check_v2
      CHECK (study_source IN ('PLAN', 'FREE', 'REVIEW', 'SIMULADO', 'QUESTOES', 'VIDEO', 'PDF'));
  END IF;
END $$;

-- 3. Garantir outras colunas necessárias
ALTER TABLE public.study_history 
  ADD COLUMN IF NOT EXISTS active_minutes integer DEFAULT 0;

ALTER TABLE public.study_history 
  ADD COLUMN IF NOT EXISTS paused_minutes integer DEFAULT 0;

ALTER TABLE public.study_history 
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.study_history 
  ADD COLUMN IF NOT EXISTS study_type text;

ALTER TABLE public.study_history 
  ADD COLUMN IF NOT EXISTS technique text;

-- 4. Garantir que started_at existe e pode receber valores
ALTER TABLE public.study_history 
  ALTER COLUMN started_at SET DEFAULT timezone('utc'::text, now());

-- 5. Garantir que finished_at pode ser NULL (já é por padrão)
-- Não precisa de alteração

-- 6. Garantir RLS permite INSERT para o próprio usuário
ALTER TABLE public.study_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem registrar estudo" ON public.study_history;
DROP POLICY IF EXISTS "Users can insert own study history" ON public.study_history;
DROP POLICY IF EXISTS "study_history_insert_policy" ON public.study_history;

CREATE POLICY "study_history_insert_policy"
  ON public.study_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_history_select_policy" ON public.study_history;
CREATE POLICY "study_history_select_policy"
  ON public.study_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_history_update_policy" ON public.study_history;
CREATE POLICY "study_history_update_policy"
  ON public.study_history FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_history_delete_policy" ON public.study_history;
CREATE POLICY "study_history_delete_policy"
  ON public.study_history FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Atualizar ranking RPC (mesma função da sprint anterior)
-- Apenas se necessário - pode ser executado separado

-- 8. Teste (execute separadamente):
-- INSERT INTO public.study_history (
--   user_id, discipline_id, study_source, 
--   active_minutes, duration_minutes, completed, 
--   started_at, finished_at, metadata
-- ) VALUES (
--   auth.uid(),
--   (SELECT id FROM public.disciplines LIMIT 1),
--   'FREE',
--   5, 5, true,
--   now() - interval '5 minutes',
--   now(),
--   '{}'::jsonb
-- );
-- SELECT * FROM public.study_history WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 5;