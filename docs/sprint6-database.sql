-- ========================================================================================
-- SPRINT 6: SISTEMA GLOBAL DE DISCIPLINAS
-- Executar no SQL Editor do Supabase
-- ========================================================================================

-- ========================================================================================
-- 1. TABELA EXAM_DISCIPLINES (Associativa — Edital por Concurso)
-- Relaciona exams <-> disciplines com peso e prioridade
-- ========================================================================================
CREATE TABLE IF NOT EXISTS public.exam_disciplines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  weight numeric DEFAULT 1.0 CHECK (weight > 0),
  display_order integer DEFAULT 0,      -- Ordem de exibição no edital
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(exam_id, discipline_id)
);

ALTER TABLE public.exam_disciplines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de exam_disciplines permitida a usuários autenticados" ON public.exam_disciplines
  FOR SELECT USING (auth.role() = 'authenticated');

-- ========================================================================================
-- 2. ATUALIZAR USER_DISCIPLINES
-- Adicionar mastery_level e ampliar status para incluir NOT_STARTED e READY_FOR_SCHEDULE
-- ========================================================================================

-- Adicionar mastery_level
ALTER TABLE public.user_disciplines
  ADD COLUMN IF NOT EXISTS mastery_level integer DEFAULT 0
    CHECK (mastery_level >= 0 AND mastery_level <= 100);

-- Atualizar a constraint de status para incluir os novos valores
ALTER TABLE public.user_disciplines
  DROP CONSTRAINT IF EXISTS user_disciplines_status_check;

ALTER TABLE public.user_disciplines
  ADD CONSTRAINT user_disciplines_status_check
    CHECK (status IN ('NOT_STARTED', 'STUDYING', 'REVISING', 'COMPLETED', 'READY_FOR_SCHEDULE'));

-- Política DELETE (para remoções futuras pelo usuário)
CREATE POLICY IF NOT EXISTS "Usuários podem deletar suas disciplinas" ON public.user_disciplines
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================================================================
-- 3. SEEDS — DISCIPLINAS GLOBAIS
-- Inserir disciplinas globais (sem vínculo com concurso — reaproveitáveis)
-- ========================================================================================
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
ON CONFLICT DO NOTHING;

-- ========================================================================================
-- 4. SEEDS — EXAM_DISCIPLINES (Edital da Polícia Federal — Agente)
-- ========================================================================================
DO $$
DECLARE
  pf_id uuid;
  d_portugues uuid;
  d_info uuid;
  d_logica uuid;
  d_estatistica uuid;
  d_const uuid;
  d_admin uuid;
  d_penal uuid;
  d_proc_penal uuid;
  d_leg_esp uuid;
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
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ========================================================================================
-- 5. SEEDS — EXAM_DISCIPLINES (Edital da Polícia Rodoviária Federal)
-- ========================================================================================
DO $$
DECLARE
  prf_id uuid;
  d_portugues uuid;
  d_info uuid;
  d_etica uuid;
  d_const uuid;
  d_admin uuid;
  d_penal uuid;
  d_proc_penal uuid;
  d_fisica uuid;
  d_transito uuid;
BEGIN
  SELECT id INTO prf_id FROM public.exams WHERE name = 'Polícia Rodoviária Federal' LIMIT 1;

  SELECT id INTO d_portugues  FROM public.disciplines WHERE name = 'Língua Portuguesa' LIMIT 1;
  SELECT id INTO d_info       FROM public.disciplines WHERE name = 'Informática' LIMIT 1;
  SELECT id INTO d_etica      FROM public.disciplines WHERE name = 'Ética no Serviço Público' LIMIT 1;
  SELECT id INTO d_const      FROM public.disciplines WHERE name = 'Direito Constitucional' LIMIT 1;
  SELECT id INTO d_admin      FROM public.disciplines WHERE name = 'Direito Administrativo' LIMIT 1;
  SELECT id INTO d_penal      FROM public.disciplines WHERE name = 'Direito Penal' LIMIT 1;
  SELECT id INTO d_proc_penal FROM public.disciplines WHERE name = 'Direito Processual Penal' LIMIT 1;
  SELECT id INTO d_fisica     FROM public.disciplines WHERE name = 'Física' LIMIT 1;
  SELECT id INTO d_transito   FROM public.disciplines WHERE name = 'Legislação de Trânsito' LIMIT 1;

  IF prf_id IS NOT NULL THEN
    INSERT INTO public.exam_disciplines (exam_id, discipline_id, weight, display_order) VALUES
      (prf_id, d_portugues,  2.0, 1),
      (prf_id, d_info,       1.5, 2),
      (prf_id, d_etica,      1.0, 3),
      (prf_id, d_const,      2.0, 4),
      (prf_id, d_admin,      2.0, 5),
      (prf_id, d_penal,      2.0, 6),
      (prf_id, d_proc_penal, 2.0, 7),
      (prf_id, d_fisica,     1.5, 8),
      (prf_id, d_transito,   2.0, 9)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ========================================================================================
-- DOCUMENTAÇÃO: TABELA FUTURA user_subjects (Sprint 7+)
-- Esta tabela registrará o progresso granular do aluno por assunto (subject),
-- permitindo geração de cronogramas inteligentes e revisões espaçadas.
--
-- CREATE TABLE public.user_subjects (
--   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--   user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
--   subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
--   status text CHECK (status IN ('NOT_STARTED','STUDYING','REVISING','COMPLETED')),
--   mastery_level integer DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 100),
--   last_studied_at timestamp with time zone,
--   next_review_at timestamp with time zone,   -- Para revisão espaçada (Spaced Repetition)
--   created_at timestamp with time zone DEFAULT now(),
--   UNIQUE(user_id, subject_id)
-- );
-- ========================================================================================
