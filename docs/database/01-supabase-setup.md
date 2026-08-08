# 🚀 Guia Operacional de Setup — Ambiente Supabase Definitivo

> **Documento Oficial de DevOps & Database Engineering**  
> **Status:** Manual Operacional Completo  
> **Objetivo:** Permitir que qualquer desenvolvedor recrie 100% do ambiente Supabase do **Mentor Concursos IA** do zero sem necessidade de conhecimento prévio.

---

## 📌 Visão Geral da Arquitetura de Serviços Supabase

O ambiente do Mentor Concursos IA utiliza os seguintes recursos do ecossistema Supabase:

| Recurso | Utilização no Projeto | Configuração Necessária |
|:---|:---|:---:|
| **Database (PostgreSQL 15+)** | Schema `public` com 24 tabelas relacionais | SQL Editor / Script Consolidado |
| **Auth (GoTrue)** | Autenticação por E-mail/Senha com confirmação e RLS | Painel Supabase Auth |
| **Storage (S3 Compatible)** | Buckets `avatars` e `question-media` | Painel Supabase Storage |
| **Realtime / Subscriptions** | Não utilizado na v1.0 | Desativado por padrão |
| **Edge Functions** | Não utilizado na v1.0 | Não necessário |

---

## 📋 PASSO 1: Criação do Projeto no Supabase Cloud

1. Acesse o painel do [Supabase](https://database.new) e faça login.
2. Clique em **"New Project"** e selecione a sua organização.
3. Preencha os campos de cadastro do projeto:
   - **Name:** `mentor-concursos-ia-prod` (ou `dev`)
   - **Database Password:** Gere uma senha forte e armazene de forma segura no seu cofre de senhas.
   - **Region:** Selecione `South America (São Paulo) - sa-east-1` (menor latência para o público brasileiro).
   - **Pricing Plan:** Free ou Pro.
4. Aguarde de 1 a 3 minutos até que o provisionamento do projeto seja finalizado.
5. Após o carregamento do painel, vá em **Project Settings ➔ API**:
   - Copie a **Project URL** (`https://<seu-projeto>.supabase.co`).
   - Copie a **anon / public key** (`eyJhbGciOiJIUzI1Ni...`).

---

## 🔐 PASSO 2: Configuração do Supabase Auth

1. No menu lateral do painel Supabase, vá em **Authentication ➔ Providers**.
2. Garanta que o provedor **Email** esteja **Enabled**:
   - **Enable Email Signup:** `ON`
   - **Confirm email:** `OFF` (em ambiente de desenvolvimento local) ou `ON` (em produção).
3. Vá em **Authentication ➔ URL Configuration**:
   - **Site URL:** `http://localhost:3000` (ou sua URL de produção Vercel).
   - **Redirect URLs:** Adicione `http://localhost:3000/auth/callback` e `http://localhost:3000/**`.
4. *(Opcional)* Em **Authentication ➔ Email Templates**, você pode personalizar o template de confirmação colando o HTML presente em `docs/supabase-email-template.html`.

---

## 📦 PASSO 3: Configuração dos Storage Buckets

1. No menu lateral, acesse **Storage ➔ Buckets**.
2. Clique em **"New Bucket"** e crie os dois buckets públicos necessários:

   ### Bucket 1: `avatars`
   - **Bucket Name:** `avatars`
   - **Public Bucket:** `ON` (Ativado)
   - **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`
   - **Max object size:** `5MB`

   ### Bucket 2: `question-media`
   - **Bucket Name:** `question-media`
   - **Public Bucket:** `ON` (Ativado)
   - **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
   - **Max object size:** `10MB`

---

## 🛠️ PASSO 4: Execução das Migrations (SQL Editor)

Acesse **SQL Editor ➔ New Query** no painel do Supabase, cole o script unificado abaixo e clique em **"Run"**.

Este script executa todas as 24 tabelas, triggers, RLS e seeds na **ordem estrita de integridade referencial** definida no plano de migração:

```sql
-- ========================================================================================
-- MENTOR CONCURSOS IA — SCRIPT DE MIGRAÇÃO CONSOLIDADO E DEFINITIVO
-- ========================================================================================

-- ----------------------------------------------------------------------------------------
-- ETAPA 1: ESTRUTURA CORE E AUTENTICAÇÃO
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  weekly_study_hours integer DEFAULT 10,
  work_regime text CHECK (work_regime IN ('FULL_TIME', 'PART_TIME', 'UNEMPLOYED', 'STUDENT')),
  experience_level text CHECK (experience_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  onboarding_completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem ver seu próprio perfil" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger de criação automática do Profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ----------------------------------------------------------------------------------------
-- ETAPA 2: DOMÍNIO MESTRE DE CONCURSOS E DISCIPLINAS
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  organizer text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de concursos permitida a todos os usuários" ON public.exams;
CREATE POLICY "Leitura de concursos permitida a todos os usuários" ON public.exams FOR SELECT USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  area text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de disciplinas permitida a todos os usuários" ON public.disciplines;
CREATE POLICY "Leitura de disciplinas permitida a todos os usuários" ON public.disciplines FOR SELECT USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de assuntos permitida a todos os usuários" ON public.subjects;
CREATE POLICY "Leitura de assuntos permitida a todos os usuários" ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.exam_disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  weight numeric DEFAULT 1.0 CHECK (weight > 0),
  display_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(exam_id, discipline_id)
);

ALTER TABLE public.exam_disciplines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de exam_disciplines permitida" ON public.exam_disciplines;
CREATE POLICY "Leitura de exam_disciplines permitida" ON public.exam_disciplines FOR SELECT USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  weight numeric DEFAULT 1.0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(exam_id, discipline_id, subject_id)
);

ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura de editais permitida a todos" ON public.exam_subjects;
CREATE POLICY "Leitura de editais permitida a todos" ON public.exam_subjects FOR SELECT USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------------------
-- ETAPA 3: VÍNCULOS E PROGRESSO DO USUÁRIO
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  target_exam text NOT NULL,
  target_role text NOT NULL,
  main_study_source text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem próprios objetivos" ON public.user_targets;
CREATE POLICY "Usuários veem próprios objetivos" ON public.user_targets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Usuários gerenciam próprios objetivos" ON public.user_targets;
CREATE POLICY "Usuários gerenciam próprios objetivos" ON public.user_targets FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  proficiency_level text CHECK (proficiency_level IN ('LOW', 'MEDIUM', 'HIGH')),
  status text CHECK (status IN ('NOT_STARTED', 'STUDYING', 'REVISING', 'COMPLETED', 'READY_FOR_SCHEDULE')),
  mastery_level integer DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 100),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, discipline_id)
);

ALTER TABLE public.user_disciplines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem suas disciplinas" ON public.user_disciplines;
CREATE POLICY "Usuários veem suas disciplinas" ON public.user_disciplines FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Usuários gerenciam suas disciplinas" ON public.user_disciplines;
CREATE POLICY "Usuários gerenciam suas disciplinas" ON public.user_disciplines FOR ALL USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------------------
-- ETAPA 4: PLANEJAMENTO E HISTÓRICO DE ESTUDOS
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.study_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  generated_reason text DEFAULT 'manual',
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários gerenciam seus planos" ON public.study_plans;
CREATE POLICY "Usuários gerenciam seus planos" ON public.study_plans FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.study_plan_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  study_plan_id uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  priority integer DEFAULT 1,
  priority_score numeric DEFAULT 1.0,
  recommended_sessions integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem itens de seus planos" ON public.study_plan_items;
CREATE POLICY "Usuários veem itens de seus planos" ON public.study_plan_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.study_plans sp WHERE sp.id = study_plan_id AND sp.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Usuários gerenciam itens de seus planos" ON public.study_plan_items;
CREATE POLICY "Usuários gerenciam itens de seus planos" ON public.study_plan_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.study_plans sp WHERE sp.id = study_plan_id AND sp.user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.study_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  study_plan_item_id uuid REFERENCES public.study_plan_items(id) ON DELETE SET NULL,
  study_source text NOT NULL DEFAULT 'FREE' CHECK (study_source IN ('PLAN', 'FREE', 'REVIEW', 'SIMULADO', 'QUESTOES', 'VIDEO', 'PDF')),
  started_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  finished_at timestamp with time zone,
  duration_minutes integer,
  planned_minutes integer,
  completed boolean DEFAULT false,
  interrupted boolean DEFAULT false,
  energy_level integer CHECK (energy_level >= 1 AND energy_level <= 5),
  difficulty integer CHECK (difficulty >= 1 AND difficulty <= 5),
  focus_score integer CHECK (focus_score >= 1 AND focus_score <= 5),
  mood text,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.study_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários gerenciam próprio histórico" ON public.study_history;
CREATE POLICY "Usuários gerenciam próprio histórico" ON public.study_history FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_study_history_user_time ON public.study_history(user_id, started_at DESC);

-- ----------------------------------------------------------------------------------------
-- ETAPA 5: BANCO DE QUESTÕES
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.question_sources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  logo_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.question_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de fontes" ON public.question_sources;
CREATE POLICY "Leitura pública de fontes" ON public.question_sources FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.question_topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  parent_topic_id uuid REFERENCES public.question_topics(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.question_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de tópicos" ON public.question_topics;
CREATE POLICY "Leitura pública de tópicos" ON public.question_topics FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid REFERENCES public.question_sources(id) ON DELETE SET NULL,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.question_topics(id) ON DELETE SET NULL,
  statement text NOT NULL,
  correct_answer text NOT NULL,
  official_answer text,
  explanation text,
  exam_board text,
  exam_name text,
  exam_year integer,
  difficulty_level integer CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  difficulty_label text CHECK (difficulty_label IN ('Muito Fácil', 'Fácil', 'Média', 'Difícil', 'Muito Difícil')),
  estimated_time_seconds integer,
  question_status text NOT NULL DEFAULT 'ACTIVE' CHECK (question_status IN ('ACTIVE', 'CANCELED', 'OUTDATED')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de questões" ON public.questions;
CREATE POLICY "Leitura pública de questões" ON public.questions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.question_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answer text NOT NULL,
  correct boolean NOT NULL,
  response_time_seconds integer NOT NULL,
  confidence_level integer CHECK (confidence_level >= 1 AND confidence_level <= 5),
  review_required boolean DEFAULT false,
  mistake_type text CHECK (mistake_type IN ('CONTENT', 'INTERPRETATION', 'DISTRACTION', 'TIME', 'GUESS', null)),
  attempt_source text DEFAULT 'MANUAL',
  answered_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia próprias tentativas" ON public.question_attempts;
CREATE POLICY "Usuário gerencia próprias tentativas" ON public.question_attempts FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_qattempts_user_time ON public.question_attempts(user_id, answered_at DESC);

CREATE TABLE IF NOT EXISTS public.question_lists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.question_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia próprios cadernos" ON public.question_lists;
CREATE POLICY "Usuário gerencia próprios cadernos" ON public.question_lists FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.question_list_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id uuid NOT NULL REFERENCES public.question_lists(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(list_id, question_id)
);

ALTER TABLE public.question_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia itens de seus cadernos" ON public.question_list_items;
CREATE POLICY "Usuário gerencia itens de seus cadernos" ON public.question_list_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.question_lists WHERE id = question_list_items.list_id AND user_id = auth.uid())
);

-- ----------------------------------------------------------------------------------------
-- ETAPA 6: MOTOR DE REVISÕES ESPAÇADAS (ANKI ENGINE)
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.review_strategies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  parameters jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.review_strategies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura pública de estratégias" ON public.review_strategies;
CREATE POLICY "Leitura pública de estratégias" ON public.review_strategies FOR SELECT USING (true);

INSERT INTO public.review_strategies (name, description, parameters) 
VALUES 
  ('SM2_PLUS', 'Algoritmo SuperMemo-2 estendido com Heurísticas do Mentor IA', '{"default_ease": 2.5, "min_ease": 1.3}'),
  ('FSRS', 'Free Spaced Repetition Scheduler (Baseado em Retrievability e Stability)', '{"request_retention": 0.9, "weights": []}')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.review_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.question_topics(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('QUESTION', 'TOPIC', 'FLASHCARD', 'STUDY_SESSION')),
  source_id uuid NOT NULL,
  review_stage text NOT NULL DEFAULT 'NEW' CHECK (review_stage IN ('NEW', 'LEARNING', 'REVIEW', 'MASTERED', 'LAPSED')),
  ease_factor numeric(5,2) DEFAULT 2.5,
  stability_score numeric(10,4) DEFAULT 0,
  memory_strength integer DEFAULT 0 CHECK (memory_strength >= 0 AND memory_strength <= 100),
  forget_probability numeric(5,2) DEFAULT 0,
  last_review_at timestamp with time zone,
  next_review_at timestamp with time zone,
  review_count integer DEFAULT 0,
  lapses_count integer DEFAULT 0,
  base_priority numeric(5,2) DEFAULT 1.0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, source_type, source_id)
);

ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia próprios itens de revisão" ON public.review_items;
CREATE POLICY "Usuário gerencia próprios itens de revisão" ON public.review_items FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_review_items_user_stage ON public.review_items(user_id, review_stage);
CREATE INDEX IF NOT EXISTS idx_review_items_next_review ON public.review_items(user_id, next_review_at);

CREATE TABLE IF NOT EXISTS public.review_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_item_id uuid NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED')),
  due_date date NOT NULL,
  calculated_priority numeric(10,4) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(review_item_id, due_date)
);

ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia própria fila de revisão" ON public.review_queue;
CREATE POLICY "Usuário gerencia própria fila de revisão" ON public.review_queue FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_review_queue_pending ON public.review_queue(user_id, status, calculated_priority DESC);

CREATE TABLE IF NOT EXISTS public.review_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  review_item_id uuid NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  strategy_used_id uuid REFERENCES public.review_strategies(id) ON DELETE SET NULL,
  review_date timestamp with time zone DEFAULT timezone('utc'::text, now()),
  grade integer NOT NULL CHECK (grade >= 1 AND grade <= 5),
  duration_seconds integer,
  previous_interval_days numeric(10,4),
  new_interval_days numeric(10,4),
  previous_ease numeric(5,2),
  new_ease numeric(5,2),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.review_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia histórico de revisão" ON public.review_history;
CREATE POLICY "Usuário gerencia histórico de revisão" ON public.review_history FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.review_statistics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  total_reviews integer DEFAULT 0,
  mastered_items integer DEFAULT 0,
  retention_rate numeric(5,2) DEFAULT 0,
  current_streak integer DEFAULT 0,
  last_calculated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.review_statistics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia estatísticas de revisão" ON public.review_statistics;
CREATE POLICY "Usuário gerencia estatísticas de revisão" ON public.review_statistics FOR ALL USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------------------
-- ETAPA 7: APRENDIZADO ADAPTATIVO E MENTOR IA
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.adaptive_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid REFERENCES public.disciplines(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.question_topics(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('WEIGHT_CHANGE', 'BURNOUT_INTERVENTION', 'REVIEW_INJECTION', 'SESSION_CAPACITY_CHANGE')),
  previous_value numeric(10,4),
  new_value numeric(10,4),
  delta numeric(10,4),
  reason text NOT NULL,
  confidence integer NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  engine text NOT NULL,
  algorithm_version text NOT NULL,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.adaptive_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia histórico adaptativo" ON public.adaptive_history;
CREATE POLICY "Usuário gerencia histórico adaptativo" ON public.adaptive_history FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_adaptive_user_active ON public.adaptive_history(user_id, is_active);

CREATE TABLE IF NOT EXISTS public.mentor_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text,
  prompt text,
  response jsonb NOT NULL,
  context_hash text,
  snapshot_id text,
  tokens_input integer,
  tokens_output integer,
  duration_ms integer,
  version text,
  feedback integer CHECK (feedback >= 1 AND feedback <= 5),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.mentor_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia histórico do mentor" ON public.mentor_history;
CREATE POLICY "Usuário gerencia histórico do mentor" ON public.mentor_history FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mentor_history_user ON public.mentor_history(user_id, created_at DESC);

-- ----------------------------------------------------------------------------------------
-- SEEDS ESSENCIAIS DE CONCURSOS E DISCIPLINAS
-- ----------------------------------------------------------------------------------------

INSERT INTO public.exams (name, organizer, active) VALUES 
  ('Polícia Federal - Agente', 'Cebraspe', true),
  ('Polícia Rodoviária Federal', 'Cebraspe', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.disciplines (name, area) VALUES
  ('Língua Portuguesa', 'Geral'),
  ('Informática', 'Geral'),
  ('Raciocínio Lógico', 'Geral'),
  ('Estatística', 'Geral'),
  ('Direito Constitucional', 'Direito'),
  ('Direito Administrativo', 'Direito'),
  ('Direito Penal', 'Direito'),
  ('Direito Processual Penal', 'Direito'),
  ('Legislação Especial', 'Direito'),
  ('Ética no Serviço Público', 'Geral'),
  ('Física', 'Ciências'),
  ('Legislação de Trânsito', 'Específico')
ON CONFLICT (name) DO NOTHING;

-- Mapeamento do Edital da Polícia Federal
DO $$
DECLARE
  pf_id uuid;
  d_portugues uuid; d_info uuid; d_logica uuid; d_estatistica uuid;
  d_const uuid; d_admin uuid; d_penal uuid; d_proc_penal uuid; d_leg_esp uuid;
BEGIN
  SELECT id INTO pf_id FROM public.exams WHERE name = 'Polícia Federal - Agente' LIMIT 1;
  SELECT id INTO d_portugues    FROM public.disciplines WHERE name = 'Língua Portuguesa' LIMIT 1;
  SELECT id INTO d_info         FROM public.disciplines WHERE name = 'Informática' LIMIT 1;
  SELECT id INTO d_logica       FROM public.disciplines WHERE name = 'Raciocínio Lógico' LIMIT 1;
  SELECT id INTO d_estatistica  FROM public.disciplines WHERE name = 'Estatística' LIMIT 1;
  SELECT id INTO d_const        FROM public.disciplines WHERE name = 'Direito Constitucional' LIMIT 1;
  SELECT id INTO d_admin        FROM public.disciplines WHERE name = 'Direito Administrativo' LIMIT 1;
  SELECT id INTO d_penal        FROM public.disciplines WHERE name = 'Direito Penal' LIMIT 1;
  SELECT id INTO d_proc_penal   FROM public.disciplines WHERE name = 'Direito Processual Penal' LIMIT 1;
  SELECT id INTO d_leg_esp      FROM public.disciplines WHERE name = 'Legislação Especial' LIMIT 1;

  IF pf_id IS NOT NULL THEN
    INSERT INTO public.exam_disciplines (exam_id, discipline_id, weight, display_order) VALUES
      (pf_id, d_portugues,   2.0, 1),
      (pf_id, d_info,        1.5, 2),
      (pf_id, d_logica,      1.5, 3),
      (pf_id, d_estatistica, 1.0, 4),
      (pf_id, d_const,       2.0, 5),
      (pf_id, d_admin,       2.0, 6),
      (pf_id, d_penal,       2.0, 7),
      (pf_id, d_proc_penal,  2.0, 8),
      (pf_id, d_leg_esp,     1.5, 9)
    ON CONFLICT (exam_id, discipline_id) DO NOTHING;
  END IF;
END $$;
```

---

## ⚙️ PASSO 5: Atualização das Variáveis Locais (`.env.local`)

Após a criação do projeto e execução do script SQL:

1. Abra o arquivo `.env.local` na raiz do seu projeto local.
2. Substitua os valores da URL e da chave anônima obtidas no **PASSO 1**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-novo-projeto-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_MODE=development
```

---

## 👤 PASSO 6: Criação e Validação do Usuário de Teste

1. Inicie a aplicação Next.js localmente:
   ```bash
   npm run dev
   ```
2. Acesse no navegador `http://localhost:3000/register`.
3. Cadastre um usuário de teste (ex: `teste@mentorconcursos.com.br` / `Senha123456`).
4. **Verificação da Trigger no Supabase:**
   - Acesse o painel Supabase em **Table Editor ➔ profiles**.
   - Verifique se um novo registro foi inserido automaticamente para o e-mail cadastrado.

---

## 🧪 PASSO 7: Validação de Segurança e Auditoria

1. Acesse o **SQL Editor** no painel Supabase.
2. Cole o conteúdo de auditoria localizado no arquivo `docs/database-audit.sql`:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   SELECT relname AS table_name, relrowsecurity AS rls_enabled FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
   ```
3. Garanta que o resultado retorne **`rls_enabled = true`** em **todas** as tabelas do schema `public`.

---

## ✅ PASSO 8: Teste de Conexão Final

Execute no terminal do projeto para validar que a aplicação Next.js compila e conecta sem erros ao novo ambiente:

```bash
npx tsc --noEmit
```

Se o comando finalizar sem nenhum erro de tipo ou de chave, o ambiente definitivo do Supabase estará **100% pronto para uso operacional**.
