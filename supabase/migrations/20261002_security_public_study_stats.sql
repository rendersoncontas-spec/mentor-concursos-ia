-- Fase G2.6.1 — Correção de segurança (achado CRÍTICO #1 da auditoria
-- 2026-10-01): public.public_study_stats era uma view que roda com o
-- privilégio do dono (comportamento padrão de view no Postgres quando
-- security_invoker não está ligado), bypassando a RLS de study_history, e
-- tinha SELECT liberado para `anon` e para o pseudo-papel `PUBLIC`. Isso
-- permitia que qualquer pessoa na internet, sem autenticação, usando só a
-- chave anon pública, lesse nome + estatísticas agregadas de estudo de
-- TODOS os usuários, sem nenhuma checagem de preferência de privacidade.
--
-- A view continua em uso real (fallback em
-- src/application/study-analytics/study-analytics.actions.ts, usado quando
-- a RPC get_global_ranking não está disponível e a RLS do usuário limita a
-- leitura direta de study_history a si mesmo) — por isso ela NÃO é
-- removida, apenas corrigida:
--
--   1. anon/PUBLIC perdem todo acesso — só `authenticated` pode consultar.
--   2. A view passa a respeitar profiles.preferences->>'publicProfile',
--      exatamente como já faz get_public_study_profile: usuários que
--      marcaram o perfil como privado deixam de aparecer para terceiros.
--
-- Mesmas 5 colunas de saída de antes — nenhuma mudança é necessária no
-- código da aplicação que já consulta esta view.

revoke all on public.public_study_stats from public;
revoke all on public.public_study_stats from anon;

create or replace view public.public_study_stats as
select
  sh.user_id,
  p.name as display_name,
  sum(coalesce(sh.active_minutes, sh.duration_minutes, 0)) as total_minutes,
  coalesce(sum((sh.metadata ->> 'questions_answered'::text)::integer), 0::bigint) as questions_count,
  coalesce(sum((sh.metadata ->> 'pages_read'::text)::integer), 0::bigint) as pages_count
from study_history sh
  left join profiles p on p.id = sh.user_id
where coalesce((p.preferences ->> 'publicProfile')::boolean, true) = true
group by sh.user_id, p.name;

grant select on public.public_study_stats to authenticated;
