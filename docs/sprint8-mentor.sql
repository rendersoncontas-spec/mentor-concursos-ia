-- ==============================================================================
-- Migration: Criação da Tabela de Telemetria e Histórico do Mentor IA
-- Permite armazenar feedbacks, prompts, context hashes e respostas geradas.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.mentor_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Qual foi o provedor que gerou a resposta (ex: HEURISTIC, OPENAI, GEMINI)
  provider text NOT NULL, 
  
  -- Opcional: Qual modelo específico (ex: gpt-4o, gemini-1.5-pro, rule-engine-v1)
  model text,             
  
  -- O texto integral ou JSON do prompt injetado no LLM (ou logado no modo heurístico)
  prompt text,            
  
  -- A resposta final consolidada com Insights e Recomendações (MentorResponse formatada)
  response jsonb NOT NULL,
  
  -- Identificador de integridade do contexto que originou a análise
  context_hash text,      
  
  -- Identificador exato da fotografia do banco de dados na hora da análise
  snapshot_id text,       
  
  -- Telemetria Financeira e de Custo
  tokens_input integer,   
  tokens_output integer,  
  
  -- Latência da inferência do Provedor
  duration_ms integer,    
  
  -- Versionamento do prompt ou da infraestrutura
  version text,           
  
  -- Feedback do usuário para a inteligência (RLHF: Reinforcement Learning from Human Feedback) (1 a 5)
  feedback integer CHECK (feedback >= 1 AND feedback <= 5),
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_mentor_history_user ON public.mentor_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_history_provider ON public.mentor_history(provider);

-- Segurança RLS (Row Level Security)
ALTER TABLE public.mentor_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seu próprio histórico do mentor" ON public.mentor_history;
CREATE POLICY "Usuários podem ver seu próprio histórico do mentor"
  ON public.mentor_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem salvar registros no histórico do mentor" ON public.mentor_history;
CREATE POLICY "Usuários podem salvar registros no histórico do mentor"
  ON public.mentor_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar feedback do mentor" ON public.mentor_history;
CREATE POLICY "Usuários podem atualizar feedback do mentor"
  ON public.mentor_history FOR UPDATE
  USING (auth.uid() = user_id);
