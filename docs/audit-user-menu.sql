-- ========================================================================================
-- AUDITORIA DO MENU DO USUÁRIO / CONTA
-- Migration não destrutiva (IF NOT EXISTS) — cole no SQL Editor do Supabase e execute.
-- ========================================================================================

-- 1. COLUNAS DE DADOS PESSOAIS E PREFERÊNCIAS EM PROFILES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

-- ========================================================================================
-- 2. TABELA EDITAL_REQUESTS (Pedidos de Editais persistidos por usuário)
-- ========================================================================================
CREATE TABLE IF NOT EXISTS public.edital_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  edital_name text NOT NULL,
  cargo text,
  link_url text,
  pdf_name text,
  description text,
  status text NOT NULL DEFAULT 'Pendente',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.edital_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios pedidos de edital" ON public.edital_requests;
CREATE POLICY "Usuários podem ver seus próprios pedidos de edital"
  ON public.edital_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar pedidos de edital" ON public.edital_requests;
CREATE POLICY "Usuários podem criar pedidos de edital"
  ON public.edital_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar seus pedidos de edital" ON public.edital_requests;
CREATE POLICY "Usuários podem atualizar seus pedidos de edital"
  ON public.edital_requests FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem excluir seus pedidos de edital" ON public.edital_requests;
CREATE POLICY "Usuários podem excluir seus pedidos de edital"
  ON public.edital_requests FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================================================================
-- 3. TABELA LIBRARY_MATERIALS (Biblioteca do usuário)
-- ========================================================================================
CREATE TABLE IF NOT EXISTS public.library_materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  discipline_name text,
  type text NOT NULL,
  url text NOT NULL DEFAULT '',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.library_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios materiais da biblioteca" ON public.library_materials;
CREATE POLICY "Usuários podem ver seus próprios materiais da biblioteca"
  ON public.library_materials FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem adicionar materiais na biblioteca" ON public.library_materials;
CREATE POLICY "Usuários podem adicionar materiais na biblioteca"
  ON public.library_materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar materiais da biblioteca" ON public.library_materials;
CREATE POLICY "Usuários podem atualizar materiais da biblioteca"
  ON public.library_materials FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem excluir materiais da biblioteca" ON public.library_materials;
CREATE POLICY "Usuários podem excluir materiais da biblioteca"
  ON public.library_materials FOR DELETE
  USING (auth.uid() = user_id);
