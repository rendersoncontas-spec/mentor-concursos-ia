-- ============================================================================
-- IMPORTADOR INTELIGENTE DE EDITAIS (NomeIA)
-- Tabela de entidade de edital importado pelo usuário (per-user, RLS).
-- Executar no SQL Editor do Supabase como statement ÚNICO (bloco DO $$).
-- Idempotente: pode rodar novamente sem danos.
-- ============================================================================

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.user_editais (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    name text NOT NULL,
    organizer text,
    position_name text,
    banca text,
    exam_date date,
    publication_date date,
    registration_date date,
    source text NOT NULL DEFAULT 'edital_import',
    original_filename text NOT NULL,
    file_hash text NOT NULL,
    structure jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, file_hash)
  );

  CREATE INDEX IF NOT EXISTS user_editais_user_id_idx ON public.user_editais (user_id);
  CREATE INDEX IF NOT EXISTS user_editais_created_at_idx ON public.user_editais (created_at DESC);

  ALTER TABLE public.user_editais ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "user_editais_select_own" ON public.user_editais;
  CREATE POLICY "user_editais_select_own" ON public.user_editais FOR SELECT USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "user_editais_insert_own" ON public.user_editais;
  CREATE POLICY "user_editais_insert_own" ON public.user_editais FOR INSERT WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "user_editais_update_own" ON public.user_editais;
  CREATE POLICY "user_editais_update_own" ON public.user_editais FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "user_editais_delete_own" ON public.user_editais;
  CREATE POLICY "user_editais_delete_own" ON public.user_editais FOR DELETE USING (auth.uid() = user_id);
END
$$;
