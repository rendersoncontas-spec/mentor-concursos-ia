-- ========================================================================================
-- STUDY CYCLES — Sistema de Ciclo de Estudo Inteligente
-- Cole este script no SQL Editor do Supabase e execute.
-- ========================================================================================

-- 1. TABELA STUDY_CYCLES (Cabeçalho do ciclo de estudo)
CREATE TABLE IF NOT EXISTS public.study_cycles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  contest_name text,
  edital_name text,
  status text NOT NULL DEFAULT 'PAUSED' CHECK (status IN ('ACTIVE', 'PAUSED', 'CONCLUDED')),
  current_item_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.study_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus próprios ciclos" ON public.study_cycles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus ciclos" ON public.study_cycles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus ciclos" ON public.study_cycles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem excluir seus ciclos" ON public.study_cycles
  FOR DELETE USING (auth.uid() = user_id);

-- 2. TABELA STUDY_CYCLE_ITEMS (Itens/matrérias dentro do ciclo)
CREATE TABLE IF NOT EXISTS public.study_cycle_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.study_cycles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('ALTA', 'MEDIA', 'BAIXA')),
  planned_minutes integer NOT NULL CHECK (planned_minutes > 0),
  completed_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO')),
  last_studied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.study_cycle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus itens de ciclo" ON public.study_cycle_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_items.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem criar itens de ciclo" ON public.study_cycle_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_items.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem atualizar itens de ciclo" ON public.study_cycle_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_items.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem excluir itens de ciclo" ON public.study_cycle_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_items.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

-- 3. TABELA STUDY_CYCLE_SESSIONS (Vínculo entre sessões de estudo e ciclos)
CREATE TABLE IF NOT EXISTS public.study_cycle_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.study_cycles(id) ON DELETE CASCADE,
  cycle_item_id uuid NOT NULL REFERENCES public.study_cycle_items(id) ON DELETE CASCADE,
  study_history_id uuid NOT NULL REFERENCES public.study_history(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.study_cycle_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver sessões de seus ciclos" ON public.study_cycle_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_sessions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem criar sessões de seus ciclos" ON public.study_cycle_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_sessions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

-- 4. FUNCTION para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_study_cycle_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS study_cycles_updated_at ON public.study_cycles;
CREATE TRIGGER study_cycles_updated_at
  BEFORE UPDATE ON public.study_cycles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_study_cycle_updated();

DROP TRIGGER IF EXISTS study_cycle_items_updated_at ON public.study_cycle_items;
CREATE TRIGGER study_cycle_items_updated_at
  BEFORE UPDATE ON public.study_cycle_items
  FOR EACH ROW EXECUTE PROCEDURE public.handle_study_cycle_updated();

-- 5. INDEX para performance
CREATE INDEX IF NOT EXISTS idx_study_cycles_user_id ON public.study_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_study_cycles_status ON public.study_cycles(status);
CREATE INDEX IF NOT EXISTS idx_study_cycle_items_cycle_id ON public.study_cycle_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_study_cycle_items_discipline_id ON public.study_cycle_items(discipline_id);
CREATE INDEX IF NOT EXISTS idx_study_cycle_sessions_cycle_id ON public.study_cycle_sessions(cycle_id);
CREATE INDEX IF NOT EXISTS idx_study_cycle_sessions_history_id ON public.study_cycle_sessions(study_history_id);
