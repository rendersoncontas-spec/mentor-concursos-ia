-- ========================================================================================
-- MIGRATION: Ranking Global - Nomes reais (fix "Estudante #xxxx")
-- Corrige: no ranking global, usuários apareciam como "Estudante #xxxx" porque o
-- nome real não chegava ao app. Causa raiz: a policy RLS de profiles
-- ("Usuários podem ver seu próprio perfil", auth.uid() = id) bloqueia a leitura do
-- nome de outros usuários via SELECT direto, e a view public_study_stats (fallback
-- do ranking quando o RLS trava a leitura direta de study_history) não tinha coluna
-- de nome. A view roda com privilégios do dono (sem RLS, como já ocorria com os
-- totais), então o JOIN com profiles passa a entregar display_name de todos os usuários.
-- Execute no SQL Editor do Supabase.
-- ========================================================================================

-- 1. Recriar a view pública incluindo nome (bypassa RLS)
DROP VIEW IF EXISTS public.public_study_stats;

CREATE VIEW public.public_study_stats AS
SELECT
  sh.user_id,
  p.name AS display_name,
  SUM(COALESCE(sh.active_minutes, sh.duration_minutes, 0)) AS total_minutes,
  COALESCE(SUM((sh.metadata->>'questions_answered')::int), 0) AS questions_count,
  COALESCE(SUM((sh.metadata->>'pages_read')::int), 0) AS pages_count
FROM public.study_history sh
LEFT JOIN public.profiles p ON p.id = sh.user_id
GROUP BY sh.user_id, p.name;

-- 2. Permitir leitura (mesmos grants da versão anterior)
GRANT SELECT ON public.public_study_stats TO authenticated;
GRANT SELECT ON public.public_study_stats TO public;

-- 3. Verificação (execute separadamente):
-- SELECT user_id, display_name, total_minutes
-- FROM public.public_study_stats
-- ORDER BY total_minutes DESC
-- LIMIT 10;