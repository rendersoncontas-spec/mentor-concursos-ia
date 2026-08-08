-- ==============================================================================
-- Migration: Criação do Motor Adaptativo e de Log de Decisões (ALE)
-- Sprint 7: Log de Auditoria para Modificações de Pesos e Prioridades
-- ==============================================================================

-- 1. Histórico de Adaptação (Decisões Heurísticas/IA que mutam o cronograma)
CREATE TABLE IF NOT EXISTS public.adaptive_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Alvo da Mutação
  discipline_id uuid REFERENCES public.disciplines(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.question_topics(id) ON DELETE CASCADE, -- opcional
  
  -- O que foi decidido
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('WEIGHT_CHANGE', 'BURNOUT_INTERVENTION', 'REVIEW_INJECTION', 'SESSION_CAPACITY_CHANGE')),
  previous_value numeric(10,4), -- Ex: 1.0 (peso base)
  new_value numeric(10,4),      -- Ex: 1.18 (peso aumentado)
  delta numeric(10,4),          -- Ex: +0.18 (+18%)
  
  -- Por que e Quem decidiu
  reason text NOT NULL,
  confidence integer NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  engine text NOT NULL, -- Ex: 'ALE_HEURISTIC', 'GPT_4O', 'GEMINI'
  algorithm_version text NOT NULL, -- Ex: 'v1.0.0'
  
  -- Controle de Ciclo de Vida do Efeito
  expires_at timestamp with time zone, -- Quando essa recomendação deixa de fazer efeito na criação de um novo cronograma
  is_active boolean DEFAULT true,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- Índices para Performance do ALE
-- ==========================================
CREATE INDEX idx_adaptive_user_active ON public.adaptive_history(user_id, is_active);
CREATE INDEX idx_adaptive_user_discipline ON public.adaptive_history(user_id, discipline_id) WHERE is_active = true;

-- ==========================================
-- Políticas RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.adaptive_history ENABLE ROW LEVEL SECURITY;

-- Usuário vê próprio histórico de adaptações
CREATE POLICY "Usuário vê seu histórico adaptativo" ON public.adaptive_history FOR SELECT USING (auth.uid() = user_id);
-- O sistema insere no escopo do usuário
CREATE POLICY "Usuário modifica seu histórico adaptativo" ON public.adaptive_history FOR ALL USING (auth.uid() = user_id);
