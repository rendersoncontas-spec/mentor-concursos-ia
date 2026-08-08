-- ========================================================================================
-- SPRINT 5: BANCO GLOBAL DE DISCIPLINAS E EDITAIS
-- Executar no SQL Editor do Supabase
-- ========================================================================================

-- 1. TABELA EXAMS (Mestre de Concursos)
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  organizer text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura de concursos permitida a todos os usuários" ON public.exams
  FOR SELECT USING (auth.role() = 'authenticated');

-- 2. TABELA SUBJECTS (Assuntos Vinculados a Disciplinas)
-- Depende da tabela public.disciplines (criada na Sprint 3)
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura de assuntos permitida a todos os usuários" ON public.subjects
  FOR SELECT USING (auth.role() = 'authenticated');

-- 3. TABELA EXAM_SUBJECTS (O Edital Inteligente)
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
CREATE POLICY "Leitura de editais permitida a todos os usuários" ON public.exam_subjects
  FOR SELECT USING (auth.role() = 'authenticated');


-- ========================================================================================
-- SEEDS INICIAIS
-- ========================================================================================

-- A. Inserir Concursos Básicos (Exams)
INSERT INTO public.exams (name, organizer, active)
VALUES 
  ('Polícia Federal - Agente', 'Cebraspe', true),
  ('Polícia Rodoviária Federal', 'Cebraspe', true)
ON CONFLICT DO NOTHING;

-- B. Inserir Disciplinas (Caso a Sprint 3 não tenha populado)
INSERT INTO public.disciplines (name, area)
VALUES 
  ('Língua Portuguesa', 'Geral'),
  ('Direito Constitucional', 'Direito'),
  ('Direito Administrativo', 'Direito')
ON CONFLICT DO NOTHING; -- Nota: a tabela disciplines atual não tem constraint UNIQUE(name), portanto evite rodar várias vezes o SEED ou garanta unicidade.

-- C. Inserir Assuntos (Subjects)
DO $$
DECLARE 
  portugues_id uuid;
  const_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO portugues_id FROM public.disciplines WHERE name = 'Língua Portuguesa' LIMIT 1;
  SELECT id INTO const_id FROM public.disciplines WHERE name = 'Direito Constitucional' LIMIT 1;
  SELECT id INTO admin_id FROM public.disciplines WHERE name = 'Direito Administrativo' LIMIT 1;

  IF portugues_id IS NOT NULL THEN
    INSERT INTO public.subjects (discipline_id, name, slug) VALUES 
      (portugues_id, 'Compreensão e Interpretação de Textos', 'compreensao-interpretacao'),
      (portugues_id, 'Crase', 'crase'),
      (portugues_id, 'Concordância Verbal e Nominal', 'concordancia'),
      (portugues_id, 'Regência Verbal e Nominal', 'regencia');
  END IF;

  IF const_id IS NOT NULL THEN
    INSERT INTO public.subjects (discipline_id, name, slug) VALUES 
      (const_id, 'Direitos e Garantias Fundamentais', 'direitos-garantias-fundamentais'),
      (const_id, 'Organização do Estado', 'organizacao-do-estado'),
      (const_id, 'Controle de Constitucionalidade', 'controle-constitucionalidade');
  END IF;

  IF admin_id IS NOT NULL THEN
    INSERT INTO public.subjects (discipline_id, name, slug) VALUES 
      (admin_id, 'Atos Administrativos', 'atos-administrativos'),
      (admin_id, 'Licitações e Contratos (Lei 14.133)', 'licitacoes-contratos'),
      (admin_id, 'Poderes Administrativos', 'poderes-administrativos');
  END IF;
END $$;

-- D. Inserir o Edital (Exam Subjects)
DO $$
DECLARE
  pf_id uuid;
  portugues_id uuid;
  const_id uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO pf_id FROM public.exams WHERE name = 'Polícia Federal - Agente' LIMIT 1;
  SELECT id INTO portugues_id FROM public.disciplines WHERE name = 'Língua Portuguesa' LIMIT 1;
  SELECT id INTO const_id FROM public.disciplines WHERE name = 'Direito Constitucional' LIMIT 1;
  SELECT id INTO admin_id FROM public.disciplines WHERE name = 'Direito Administrativo' LIMIT 1;

  IF pf_id IS NOT NULL THEN
    -- Inserir todos os assuntos mapeados para a Polícia Federal com pesos específicos
    INSERT INTO public.exam_subjects (exam_id, discipline_id, subject_id, weight)
    SELECT pf_id, portugues_id, id, 1.5 FROM public.subjects WHERE discipline_id = portugues_id;
    
    INSERT INTO public.exam_subjects (exam_id, discipline_id, subject_id, weight)
    SELECT pf_id, const_id, id, 1.0 FROM public.subjects WHERE discipline_id = const_id;
    
    INSERT INTO public.exam_subjects (exam_id, discipline_id, subject_id, weight)
    SELECT pf_id, admin_id, id, 1.2 FROM public.subjects WHERE discipline_id = admin_id;
  END IF;
END $$;
