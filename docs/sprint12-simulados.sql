-- ========================================================================================
-- SPRINT 12 - MÓDULO DE SIMULADOS
-- ========================================================================================

-- 1. Tabela Cabeçalho de Simulado
CREATE TABLE IF NOT EXISTS public.simulados (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  exam_board text NOT NULL, -- Banca (ex: FGV, Cebraspe)
  style text NOT NULL CHECK (style IN ('Múltipla Escolha', 'Certo/Errado')),
  time_spent_seconds integer,
  simulado_date date NOT NULL DEFAULT CURRENT_DATE,
  comments text,
  total_questions integer NOT NULL DEFAULT 0,
  total_correct integer NOT NULL DEFAULT 0,
  total_wrong integer NOT NULL DEFAULT 0,
  total_blank integer NOT NULL DEFAULT 0,
  score_percentage numeric(5,2) DEFAULT 0.0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.simulados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário gerencia próprios simulados" ON public.simulados;
CREATE POLICY "Usuário gerencia próprios simulados" ON public.simulados FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_simulados_user_time ON public.simulados(user_id, simulado_date DESC);

-- 2. Tabela de Desempenho por Disciplina no Simulado
CREATE TABLE IF NOT EXISTS public.simulado_disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  simulado_id uuid NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_name text NOT NULL, -- Salvando nome para histórico fixo, ou pode-se usar discipline_id
  discipline_id uuid REFERENCES public.disciplines(id) ON DELETE SET NULL,
  weight numeric DEFAULT 1.0,
  questions_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  blank_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.simulado_disciplines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário gerencia disciplinas de seus simulados" ON public.simulado_disciplines;
CREATE POLICY "Usuário gerencia disciplinas de seus simulados" ON public.simulado_disciplines FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_simulado_disciplines_simulado ON public.simulado_disciplines(simulado_id);
