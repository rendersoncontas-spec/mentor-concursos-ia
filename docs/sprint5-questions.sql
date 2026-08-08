-- ==============================================================================
-- Migration: Criação do Sistema Inteligente de Questões (questions)
-- Sprint 5: Suporte a IA, fontes variadas, e métricas granulares de erro
-- ==============================================================================

-- 1. Fontes de Questões (QConcursos, TEC, Interno)
CREATE TABLE IF NOT EXISTS public.question_sources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  logo_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 2. Tópicos e Assuntos (Árvore Infinita)
CREATE TABLE IF NOT EXISTS public.question_topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  parent_topic_id uuid REFERENCES public.question_topics(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 3. Base de Questões
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid REFERENCES public.question_sources(id) ON DELETE SET NULL,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.question_topics(id) ON DELETE SET NULL,
  
  -- Conteúdo
  statement text NOT NULL,
  correct_answer text NOT NULL,
  official_answer text, -- Para casos de anulação/mudança de gabarito
  explanation text,
  
  -- Metadados da Prova
  exam_board text,
  exam_name text,
  exam_year integer,
  
  -- Dificuldade (Dupla escala para ML e UI)
  difficulty_level integer CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  difficulty_label text CHECK (difficulty_label IN ('Muito Fácil', 'Fácil', 'Média', 'Difícil', 'Muito Difícil')),
  
  -- Tempo esperado de resolução
  estimated_time_seconds integer,
  
  -- Ciclo de vida
  question_status text NOT NULL DEFAULT 'ACTIVE' CHECK (question_status IN ('ACTIVE', 'CANCELED', 'OUTDATED')),
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 4. Tentativas do Usuário (O coração do Analytics)
CREATE TABLE IF NOT EXISTS public.question_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  
  selected_answer text NOT NULL,
  correct boolean NOT NULL,
  
  -- Métricas de Performance
  response_time_seconds integer NOT NULL,
  confidence_level integer CHECK (confidence_level >= 1 AND confidence_level <= 5),
  
  -- Fluxos de IA e Revisão
  review_required boolean DEFAULT false,
  mistake_type text CHECK (mistake_type IN ('CONTENT', 'INTERPRETATION', 'DISTRACTION', 'TIME', 'GUESS', null)),
  
  attempt_source text DEFAULT 'MANUAL', -- Pode ser 'SIMULADO', 'LISTA', etc.
  
  answered_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 5. Listas de Questões Customizadas (Cadernos)
CREATE TABLE IF NOT EXISTS public.question_lists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.question_list_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id uuid NOT NULL REFERENCES public.question_lists(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(list_id, question_id)
);

-- ==========================================
-- Índices para Performance de Analytics
-- ==========================================
CREATE INDEX idx_qattempts_user_time ON public.question_attempts(user_id, answered_at DESC);
CREATE INDEX idx_qattempts_question ON public.question_attempts(question_id);
CREATE INDEX idx_qtopics_parent ON public.question_topics(parent_topic_id);
CREATE INDEX idx_questions_discipline ON public.questions(discipline_id);
CREATE INDEX idx_questions_topic ON public.questions(topic_id);

-- ==========================================
-- Políticas RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.question_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_list_items ENABLE ROW LEVEL SECURITY;

-- Question Sources: Todos podem ver
CREATE POLICY "Leitura pública de fontes" ON public.question_sources FOR SELECT USING (true);

-- Question Topics: Todos podem ver
CREATE POLICY "Leitura pública de tópicos" ON public.question_topics FOR SELECT USING (true);

-- Questions: Todos podem ver
CREATE POLICY "Leitura pública de questões" ON public.questions FOR SELECT USING (true);

-- Attempts: Usuário controla suas próprias tentativas
CREATE POLICY "Usuário vê próprias tentativas" ON public.question_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário insere próprias tentativas" ON public.question_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Lists: Usuário controla seus cadernos
CREATE POLICY "Usuário vê próprios cadernos" ON public.question_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuário modifica próprios cadernos" ON public.question_lists FOR ALL USING (auth.uid() = user_id);

-- List Items: Acesso através do caderno pai (Simplificando: checa o user_id do list_id, porém para queries performáticas o usuário insere)
CREATE POLICY "Usuário gerencia itens de seus cadernos" ON public.question_list_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.question_lists 
    WHERE id = question_list_items.list_id AND user_id = auth.uid()
  )
);
