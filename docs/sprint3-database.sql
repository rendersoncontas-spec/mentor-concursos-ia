-- ========================================================================================
-- SPRINT 3: ONBOARDING DO ALUNO E ESTRUTURA DO BANCO DE DADOS
-- Cole este script no SQL Editor do Supabase e execute.
-- ========================================================================================

-- 1. TABELA PROFILES (Vínculo com auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  weekly_study_hours integer,
  work_regime text CHECK (work_regime IN ('FULL_TIME', 'PART_TIME', 'UNEMPLOYED', 'STUDENT')),
  experience_level text CHECK (experience_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  onboarding_completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id)
);

-- Habilitar RLS em profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seu próprio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger para criar profile automaticamente quando o usuário se cadastra no auth.users
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

-- Se o trigger já existir, apagamos antes para recriar
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ========================================================================================
-- 2. TABELA USER_TARGETS (Objetivos e Histórico de Concursos)
CREATE TABLE IF NOT EXISTS public.user_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_exam text NOT NULL,
  target_role text NOT NULL,
  main_study_source text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver seus próprios objetivos" ON public.user_targets
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Usuários podem inserir seus objetivos" ON public.user_targets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus objetivos" ON public.user_targets
  FOR UPDATE USING (auth.uid() = user_id);


-- ========================================================================================
-- 3. TABELA DISCIPLINES (Mestre global - População futura)
CREATE TABLE IF NOT EXISTS public.disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  area text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
-- Leitura pública para todos os usuários logados
CREATE POLICY "Leitura de disciplinas permitida a todos os usuários" ON public.disciplines
  FOR SELECT USING (auth.role() = 'authenticated');


-- ========================================================================================
-- 4. TABELA USER_DISCIPLINES (Reaproveitamento Universal)
CREATE TABLE IF NOT EXISTS public.user_disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  proficiency_level text CHECK (proficiency_level IN ('LOW', 'MEDIUM', 'HIGH')),
  status text CHECK (status IN ('STUDYING', 'COMPLETED', 'REVISING')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, discipline_id)
);

ALTER TABLE public.user_disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas disciplinas" ON public.user_disciplines
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir disciplinas" ON public.user_disciplines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas disciplinas" ON public.user_disciplines
  FOR UPDATE USING (auth.uid() = user_id);


-- ========================================================================================
-- 5. TABELA STUDY_SESSIONS (Estrutura Inicial de Estudos)
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_target_id uuid REFERENCES public.user_targets(id) ON DELETE SET NULL,
  discipline_id uuid REFERENCES public.disciplines(id) ON DELETE SET NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver suas sessões de estudo" ON public.study_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar sessões de estudo" ON public.study_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
