-- ========================================================================================
-- SPRINT 7: MOTOR DE CRONOGRAMA INTELIGENTE V1
-- Executar no SQL Editor do Supabase
-- ========================================================================================

-- ========================================================================================
-- 1. TABELA STUDY_PLANS
-- ========================================================================================
CREATE TABLE IF NOT EXISTS public.study_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  generated_reason text DEFAULT 'manual',   -- 'manual' | 'onboarding' | 'ai_suggested'
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem apenas seus próprios planos" ON public.study_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus planos" ON public.study_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus planos" ON public.study_plans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus planos" ON public.study_plans
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================================================================
-- 2. TABELA STUDY_PLAN_ITEMS
-- ========================================================================================
CREATE TABLE IF NOT EXISTS public.study_plan_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  study_plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Dom, 1=Seg, ..., 6=Sab
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  priority integer DEFAULT 1,                  -- Ordem de exibição dentro do dia
  priority_score numeric DEFAULT 1.0,          -- Score calculado pelo algoritmo (peso × fatores)
  recommended_sessions integer DEFAULT 1,      -- Sessões sugeridas para cumprir a duração do dia
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem itens de seus planos" ON public.study_plan_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_plans sp
      WHERE sp.id = study_plan_id AND sp.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem inserir itens em seus planos" ON public.study_plan_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_plans sp
      WHERE sp.id = study_plan_id AND sp.user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem deletar itens de seus planos" ON public.study_plan_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.study_plans sp
      WHERE sp.id = study_plan_id AND sp.user_id = auth.uid()
    )
  );

-- ========================================================================================
-- NOTA FUTURA: availableDays
-- Conceito preparado para Sprint 8+ onde o aluno poderá indicar quais dias da semana
-- está disponível para estudar. Quando implementado, será adicionado em profiles:
--
--   ALTER TABLE public.profiles
--     ADD COLUMN available_days integer[] DEFAULT ARRAY[0,1,2,3,4,5,6];
--
-- O algoritmo receberá esse array e distribuirá os itens apenas nos dias disponíveis.
-- ========================================================================================
