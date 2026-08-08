-- Script para permitir a exclusão de concursos
CREATE POLICY "Usuários podem excluir seus próprios objetivos" ON public.user_targets
  FOR DELETE USING (auth.uid() = user_id);
