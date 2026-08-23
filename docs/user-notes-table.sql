-- ========================================================================================
-- TABELA USER_NOTES (Bloco de Notas Rápido / Quick Notes do NomeIA)
-- ========================================================================================

CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text DEFAULT '',
  content text DEFAULT '',
  discipline_name text,
  tags text[] DEFAULT '{}',
  color text DEFAULT 'yellow',
  is_pinned boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS restritas por usuário (Isolamento total de dados)
DROP POLICY IF EXISTS "Usuários podem ver suas próprias notas" ON public.user_notes;
CREATE POLICY "Usuários podem ver suas próprias notas" ON public.user_notes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem inserir suas próprias notas" ON public.user_notes;
CREATE POLICY "Usuários podem inserir suas próprias notas" ON public.user_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias notas" ON public.user_notes;
CREATE POLICY "Usuários podem atualizar suas próprias notas" ON public.user_notes
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem excluir suas próprias notas" ON public.user_notes;
CREATE POLICY "Usuários podem excluir suas próprias notas" ON public.user_notes
  FOR DELETE USING (auth.uid() = user_id);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON public.user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_updated_at ON public.user_notes(updated_at DESC);
