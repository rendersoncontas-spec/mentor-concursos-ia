-- ==============================================================================
-- Migration: Criação do Histórico Inteligente de Estudos (study_history)
-- Prepara as fundações para coleta de métricas de Inteligência Artificial
-- ==============================================================================

-- 1. Criação do tipo Enum (Opcional no Postgres usar CHECK constraints ou ENUM real. Usaremos CHECK por maior portabilidade/flexibilidade)

CREATE TABLE IF NOT EXISTS public.study_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  
  -- Relaciona com um item do cronograma (NULL se for "Estudo Livre" ou Avulso)
  study_plan_item_id uuid REFERENCES public.study_plan_items(id) ON DELETE SET NULL,
  
  -- Origem do estudo (Plano, Livre, Simulado, etc)
  study_source text NOT NULL DEFAULT 'FREE' CHECK (study_source IN ('PLAN', 'FREE', 'REVIEW', 'SIMULADO', 'QUESTOES', 'VIDEO', 'PDF')),
  
  -- Tempo e Duração
  started_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  finished_at timestamp with time zone,
  duration_minutes integer, -- Preenchido automaticamente ao finalizar
  planned_minutes integer,  -- Qual era a intenção inicial (se veio do plano)
  
  -- Status da Sessão
  completed boolean DEFAULT false, -- Chegou até o fim do tempo planejado?
  interrupted boolean DEFAULT false, -- O usuário clicou em 'Pausar' ou desistiu no meio?
  
  -- Métricas para IA (Valores de 1 a 5. NULL se o usuário pular o feedback inicial)
  energy_level integer CHECK (energy_level >= 1 AND energy_level <= 5),
  difficulty integer CHECK (difficulty >= 1 AND difficulty <= 5),
  focus_score integer CHECK (focus_score >= 1 AND focus_score <= 5),
  mood text, -- Aberto para sentimentos ou categorização posterior ('Tired', 'Motivated', etc)
  
  -- Anotações livres
  notes text,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 2. Índices de Performance Analítica
CREATE INDEX IF NOT EXISTS idx_study_history_user_time ON public.study_history(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_history_discipline ON public.study_history(discipline_id);
CREATE INDEX IF NOT EXISTS idx_study_history_source ON public.study_history(study_source);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.study_history ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS
DROP POLICY IF EXISTS "Usuários podem ver seu próprio histórico" ON public.study_history;
CREATE POLICY "Usuários podem ver seu próprio histórico"
  ON public.study_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem registrar estudo" ON public.study_history;
CREATE POLICY "Usuários podem registrar estudo"
  ON public.study_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar sua própria sessão" ON public.study_history;
CREATE POLICY "Usuários podem atualizar sua própria sessão"
  ON public.study_history FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem apagar registros acidentais" ON public.study_history;
CREATE POLICY "Usuários podem apagar registros acidentais"
  ON public.study_history FOR DELETE
  USING (auth.uid() = user_id);
