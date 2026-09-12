-- ============================================================================
-- FIX: Adicionar política DELETE em study_cycle_sessions
--
-- Causa: o rebuild (reconcileCycleProgress) faz DELETE + INSERT, mas a tabela
-- study_cycle_sessions só possuía policies de INSERT e SELECT. O DELETE era
-- bloqueado silenciosamente pelo RLS, causando acumulação de sessões a cada
-- execução do rebuild (774 sessões derivadas de 42 estudos reais).
--
-- Solução: criar política DELETE com mesma lógica da SELECT.
-- ============================================================================

-- 1. Criar política de DELETE
CREATE POLICY "Usuários podem deletar sessões de seus ciclos"
ON public.study_cycle_sessions
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.study_cycles
    WHERE study_cycles.id = study_cycle_sessions.cycle_id
      AND study_cycles.user_id = auth.uid()
  )
);

-- 2. Confirmar que a política foi criada
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'study_cycle_sessions'
ORDER BY policyname;
