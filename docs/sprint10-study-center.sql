-- ==============================================================================
-- Migration: Centro Inteligente de Estudos (sprint10)
-- Aprimora a tabela study_history com novos campos de controle e metadados
-- ==============================================================================

-- 1. Remoção da constraint antiga de source para permitir flexibilidade
ALTER TABLE public.study_history 
  DROP CONSTRAINT IF EXISTS study_history_study_source_check;

-- 2. Adição das novas colunas na tabela study_history
ALTER TABLE public.study_history 
  ADD COLUMN IF NOT EXISTS study_type text, -- Ex: 'TEORIA', 'AUDIO', 'QUESTOES', etc
  ADD COLUMN IF NOT EXISTS technique text, -- Ex: 'POMODORO_25_5', 'FLOWTIME', 'LIVRE'
  ADD COLUMN IF NOT EXISTS active_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 3. Criação da tabela para Materiais Anexados (study_materials)
CREATE TABLE IF NOT EXISTS public.study_materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  study_history_id uuid NOT NULL REFERENCES public.study_history(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  material_type text NOT NULL, -- 'PDF', 'IMAGE', 'AUDIO', 'VIDEO', 'LINK'
  url text NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 4. Habilitar RLS e criar Políticas para study_materials
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seus próprios materiais" ON public.study_materials;
CREATE POLICY "Usuários podem ver seus próprios materiais"
  ON public.study_materials FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem adicionar materiais" ON public.study_materials;
CREATE POLICY "Usuários podem adicionar materiais"
  ON public.study_materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem remover materiais" ON public.study_materials;
CREATE POLICY "Usuários podem remover materiais"
  ON public.study_materials FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Atualização da tabela Tópicos (garantia)
-- Caso topics não possua as colunas, as criamos.
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS em topics se ainda não estiver
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler tópicos" ON public.topics;
CREATE POLICY "Todos podem ler tópicos"
  ON public.topics FOR SELECT
  USING (true); -- Tópicos costumam ser públicos/compartilhados, mas se for isolado, podemos restringir
