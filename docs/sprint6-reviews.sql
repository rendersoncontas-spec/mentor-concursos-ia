-- ==============================================================================
-- Migration: Criação do Motor Inteligente de Revisões (review-engine)
-- Sprint 6: SM-2+, FSRS, Separação de Fila, Estados (NEW, LEARNING, REVIEW, etc)
-- ==============================================================================

-- 1. Estratégias de Revisão (Para suportar SM2, FSRS, AI, etc)
CREATE TABLE IF NOT EXISTS public.review_strategies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE, -- 'SM2', 'FSRS', 'AI_RETENTION'
  description text,
  parameters jsonb, -- Parâmetros de calibração base da estratégia
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Inserir as estratégias base
INSERT INTO public.review_strategies (name, description, parameters) 
VALUES 
  ('SM2_PLUS', 'Algoritmo SuperMemo-2 estendido com Heurísticas do Mentor IA', '{"default_ease": 2.5, "min_ease": 1.3}'),
  ('FSRS', 'Free Spaced Repetition Scheduler (Baseado em Retrievability e Stability)', '{"request_retention": 0.9, "weights": []}')
ON CONFLICT (name) DO NOTHING;

-- 2. Itens de Revisão (O "Flashcard" universal do Mentor IA)
-- Pode ser um tópico inteiro, uma questão específica ou um flashcard de resumo.
CREATE TABLE IF NOT EXISTS public.review_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.question_topics(id) ON DELETE CASCADE,
  
  -- Polimorfismo: De onde veio essa revisão?
  source_type text NOT NULL CHECK (source_type IN ('QUESTION', 'TOPIC', 'FLASHCARD', 'STUDY_SESSION')),
  source_id uuid NOT NULL, 
  
  -- Estado da Memória (SM2 / FSRS)
  review_stage text NOT NULL DEFAULT 'NEW' CHECK (review_stage IN ('NEW', 'LEARNING', 'REVIEW', 'MASTERED', 'LAPSED')),
  ease_factor numeric(5,2) DEFAULT 2.5, -- Para SM-2
  stability_score numeric(10,4) DEFAULT 0, -- Para FSRS (Dias)
  memory_strength integer DEFAULT 0 CHECK (memory_strength >= 0 AND memory_strength <= 100),
  forget_probability numeric(5,2) DEFAULT 0, -- Probabilidade atual de esquecimento (0 a 1)
  
  -- Agendamentos
  last_review_at timestamp with time zone,
  next_review_at timestamp with time zone,
  review_count integer DEFAULT 0,
  lapses_count integer DEFAULT 0,
  
  -- Metadados de prioridade
  base_priority numeric(5,2) DEFAULT 1.0,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  UNIQUE(user_id, source_type, source_id)
);

-- 3. Fila Diária (Otimização para consultas de "O que revisar hoje")
-- Essa tabela é populada/atualizada por crons ou triggers diariamente, puxando os review_items que venceram.
CREATE TABLE IF NOT EXISTS public.review_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_item_id uuid NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED')),
  due_date date NOT NULL, -- A data que a revisão venceu (para agrupar atrasadas)
  calculated_priority numeric(10,4) NOT NULL, -- Pondera atraso, importância da disciplina, etc.
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  UNIQUE(review_item_id, due_date)
);

-- 4. Histórico de Revisão (Log imutável das sessões)
CREATE TABLE IF NOT EXISTS public.review_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_item_id uuid NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  strategy_used_id uuid REFERENCES public.review_strategies(id) ON DELETE SET NULL,
  
  -- Dados da sessão
  review_date timestamp with time zone DEFAULT timezone('utc'::text, now()),
  grade integer NOT NULL CHECK (grade >= 1 AND grade <= 5), -- Nota que o aluno ou motor deu para a revisão
  duration_seconds integer,
  
  -- Deltas (O quanto a revisão afetou os algoritmos)
  previous_interval_days numeric(10,4),
  new_interval_days numeric(10,4),
  previous_ease numeric(5,2),
  new_ease numeric(5,2),
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 5. Cache de Estatísticas de Revisão (Para o Analytics do Dashboard)
CREATE TABLE IF NOT EXISTS public.review_statistics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  
  total_reviews integer DEFAULT 0,
  mastered_items integer DEFAULT 0,
  retention_rate numeric(5,2) DEFAULT 0, -- % média de acertos nas revisões (Retrievability)
  current_streak integer DEFAULT 0,
  
  last_calculated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


-- ==========================================
-- Índices para Performance do Anki-Engine
-- ==========================================
CREATE INDEX idx_review_items_user_stage ON public.review_items(user_id, review_stage);
CREATE INDEX idx_review_items_next_review ON public.review_items(user_id, next_review_at);
CREATE INDEX idx_review_queue_pending ON public.review_queue(user_id, status, calculated_priority DESC);
CREATE INDEX idx_review_history_user_date ON public.review_history(user_id, review_date DESC);


-- ==========================================
-- Políticas RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.review_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_statistics ENABLE ROW LEVEL SECURITY;

-- Estratégias: Leitura Pública
CREATE POLICY "Leitura pública de estratégias" ON public.review_strategies FOR SELECT USING (true);

-- Items: Isolamento de Tenant
CREATE POLICY "Usuário vê próprios itens" ON public.review_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário modifica próprios itens" ON public.review_items FOR ALL USING (auth.uid() = user_id);

-- Queue: Isolamento de Tenant
CREATE POLICY "Usuário vê própria fila" ON public.review_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário modifica própria fila" ON public.review_queue FOR ALL USING (auth.uid() = user_id);

-- History: Isolamento de Tenant
CREATE POLICY "Usuário vê próprio histórico" ON public.review_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário modifica próprio histórico" ON public.review_history FOR ALL USING (auth.uid() = user_id);

-- Statistics: Isolamento de Tenant
CREATE POLICY "Usuário vê próprias estatísticas" ON public.review_statistics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário modifica próprias estatísticas" ON public.review_statistics FOR ALL USING (auth.uid() = user_id);
