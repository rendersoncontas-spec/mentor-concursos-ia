-- ==============================================================================
-- Sprint 9 - Metas de Estudo Semanais
-- ==============================================================================

-- 1. Adicionar colunas de Metas no perfil do usuário
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS weekly_questions_goal integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS weekly_revisions_goal integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS weekly_study_days_goal integer DEFAULT 6,
ADD COLUMN IF NOT EXISTS week_start_day integer DEFAULT 1; -- 0: Domingo, 1: Segunda, ...

-- Comentários para documentação do banco
COMMENT ON COLUMN profiles.weekly_questions_goal IS 'Meta de questões resolvidas por semana';
COMMENT ON COLUMN profiles.weekly_revisions_goal IS 'Meta de revisões por semana (opcional)';
COMMENT ON COLUMN profiles.weekly_study_days_goal IS 'Meta de dias estudados na semana (opcional)';
COMMENT ON COLUMN profiles.week_start_day IS 'Dia em que a semana de estudo começa (0=Domingo, 1=Segunda, etc)';
