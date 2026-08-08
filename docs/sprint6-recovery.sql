-- ========================================================================================
-- SPRINT 6: SCRIPT DE RECUPERAÇÃO PARA USUÁRIOS EXISTENTES
-- ========================================================================================
-- Este script resolve o problema de `user_disciplines` estar vazio para usuários
-- que concluíram o onboarding ANTES da implementação da Sprint 6 (Seed automático).
-- ========================================================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- 1. Itera sobre todos os usuários ativos que já completaram o onboarding
  FOR rec IN
    SELECT ut.user_id, ut.exam_id
    FROM public.user_targets ut
    JOIN public.profiles p ON p.id = ut.user_id
    WHERE ut.is_active = true 
      AND p.onboarding_completed = true
      AND ut.exam_id IS NOT NULL
  LOOP
    -- 2. Insere as disciplinas do edital correspondente para o usuário
    -- Ignora duplicatas via ON CONFLICT
    INSERT INTO public.user_disciplines (user_id, discipline_id, status, mastery_level)
    SELECT rec.user_id, ed.discipline_id, 'NOT_STARTED', 0
    FROM public.exam_disciplines ed
    WHERE ed.exam_id = rec.exam_id
    ON CONFLICT (user_id, discipline_id) DO NOTHING;
  END LOOP;
END $$;
