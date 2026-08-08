-- ========================================================================================
-- SPRINT 5.5: REFATORAÇÃO DE ONBOARDING E CONCURSOS
-- Executar no SQL Editor do Supabase
-- ========================================================================================

-- 1. Adicionar slug na tabela exams e preencher os existentes
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.exams SET slug = 'policia-federal-agente' WHERE name = 'Polícia Federal - Agente';
UPDATE public.exams SET slug = 'policia-rodoviaria-federal' WHERE name = 'Polícia Rodoviária Federal';

-- 2. Adicionar exam_id na tabela user_targets
ALTER TABLE public.user_targets ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL;
