-- ========================================================================================
-- SPRINT 13 - SIMULADOR COMPLETO (Módulo Simulados)
--
-- Reutiliza as tabelas existentes (questões, tentativas, revisões, simulados):
--   - public.questions          -> banco de questões (já existia, sprint5-questions.sql)
--   - public.question_attempts  -> FONTE OFICIAL de respostas/desempenho (estatísticas
--                                  consomem esta tabela automaticamente)
--   - public.review_items       -> revisões/flashcards gerados a partir dos erros
--   - public.simulados          -> cabeçalho (sprint12-simulados.sql) - agora estendido
--   - public.simulado_disciplines -> desempenho agregado por disciplina (sprint12)
--
-- Novo: public.simulado_questions (estado real da sessão, questão por questão).
-- ========================================================================================

-- ----------------------------------------------------------------------------------------
-- 1. Estender public.simulados com o ciclo de vida real do simulado
-- ----------------------------------------------------------------------------------------
ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'CONFIG'
    CHECK (status IN ('CONFIG', 'IN_PROGRESS', 'FINISHED', 'CANCELED')),
  ADD COLUMN IF NOT EXISTS mode text,
    -- COMPLETO, DISCIPLINA, MATERIA, TOPICO, REVISAO, ERROS, PERSONALIZADO, RAPIDO, DESAFIO, ADAPTATIVO
  ADD COLUMN IF NOT EXISTS difficulty_filter text
    CHECK (difficulty_filter IN ('TODAS', 'FACIL', 'MEDIA', 'DIFICIL', 'ADAPTATIVO') OR difficulty_filter IS NULL),
  ADD COLUMN IF NOT EXISTS duration_limit_seconds integer,
  ADD COLUMN IF NOT EXISTS exam_name text,
  ADD COLUMN IF NOT EXISTS role_name text,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS avg_time_per_question_seconds integer,
  ADD COLUMN IF NOT EXISTS score text
    CHECK (score IN ('EXCELENTE', 'BOM', 'REGULAR', 'BAIXO') OR score IS NULL);

CREATE INDEX IF NOT EXISTS idx_simulados_user_status ON public.simulados(user_id, status);

-- ----------------------------------------------------------------------------------------
-- 2. public.simulado_questions - estado persistido de cada questão da sessão
--    (resposta escolhida, marcação para revisão, correção, tempo por questão)
-- ----------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  simulado_id uuid NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  selected_answer text,
  is_marked boolean NOT NULL DEFAULT false,
  is_correct boolean,
  answered boolean NOT NULL DEFAULT false,
  response_time_seconds integer,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  UNIQUE(simulado_id, question_id),
  UNIQUE(simulado_id, order_index)
);

ALTER TABLE public.simulado_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário gerencia questões de seus simulados" ON public.simulado_questions;
CREATE POLICY "Usuário gerencia questões de seus simulados" ON public.simulado_questions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_simulado_questions_simulado ON public.simulado_questions(simulado_id);
CREATE INDEX IF NOT EXISTS idx_simulado_questions_user ON public.simulado_questions(user_id);

-- ----------------------------------------------------------------------------------------
-- 3. public.questions.alternatives - alternativas estruturadas para o player
--    JSONB: [{"label": "A", "text": "..."}, ...]
--    Questões sem alternatives e sem resposta Certo/Errado não entram no pool do simulado.
--    Comportamento antigo da tabela é 100% preservado (coluna nova e opcional).
-- ----------------------------------------------------------------------------------------
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS alternatives jsonb;