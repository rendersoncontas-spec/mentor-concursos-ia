-- ============================================================================
-- G1.1 (G-02/G-17/G-27/G-04) — OWNERSHIP DO CATÁLOGO + CHAVE CANÔNICA +
-- ENDURECIMENTO DE get_user_role.
--
-- NÃO APLICAR DIRETAMENTE EM PRODUÇÃO pelo agente. O responsável pela release
-- deve revisar, rodar em staging e aplicar via pipeline (`supabase db push`).
-- Idempotente: replays seguros (IF NOT EXISTS / DROP IF EXISTS / blocos DO
-- com checagem). NENHUM dado é apagado por esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Aparência PESSOAL em user_disciplines (G-02).
-- O catálogo global (`disciplines`) deixa de ser o lugar de preferência do
-- usuário: `custom_name`/`custom_color_hex` NULL = segue o global.
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_disciplines
  ADD COLUMN IF NOT EXISTS custom_name text;

ALTER TABLE public.user_disciplines
  ADD COLUMN IF NOT EXISTS custom_color_hex text;

-- ----------------------------------------------------------------------------
-- 2. Chave canônica em disciplines (G-27).
-- `name_key` = canonicalDisciplineKey(name): trim, sem acentos, minúsculas,
-- não-alfanumérico vira espaço, espaços colapsados. O `name` original
-- (display) é preservado. O backfill SQL abaixo é uma APROXIMAÇÃO (sem
-- accent-folding garantido): linhas com acento podem ficar com name_key
-- divergente da chave JS — o lookup legado do código cobre esses casos e o
-- índice UNIQUE (bloco 3) só é criado quando não há colisão.
-- ----------------------------------------------------------------------------
ALTER TABLE public.disciplines
  ADD COLUMN IF NOT EXISTS name_key text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'disciplines' AND column_name = 'name_key'
  ) THEN
    UPDATE public.disciplines
    SET name_key = lower(
      regexp_replace(
        regexp_replace(trim(name), '[^a-zA-Z0-9 ]', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    )
    WHERE name_key IS NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. UNIQUE canônico (G-27) — SOMENTE se não houver duplicatas.
-- Se houver, a migration NÃO falha: emite NOTICE e pula a criação. Nesse
-- caso, triar as duplicatas (SELECT abaixo) antes de reaplicar este bloco —
-- nunca decidir automaticamente qual linha sobrevive.
--
--   SELECT name_key, array_agg(id), array_agg(name)
--   FROM public.disciplines WHERE name_key IS NOT NULL
--   GROUP BY name_key HAVING COUNT(*) > 1;
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'disciplines' AND column_name = 'name_key'
  ) THEN
    IF EXISTS (
      SELECT name_key FROM public.disciplines
      WHERE name_key IS NOT NULL
      GROUP BY name_key HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'G1.1: duplicatas canônicas em disciplines.name_key — índice UNIQUE NÃO criado. Triar com o SELECT documentado e reaplicar.';
    ELSE
      CREATE UNIQUE INDEX IF NOT EXISTS disciplines_name_key_unique_idx
        ON public.disciplines (name_key);
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Backfill de user_roles (G-01/G-03).
-- O resolvedor canônico do código é fail-closed: alvo sem linha resolvível
-- é "desconhecido" (nunca "user"). O trigger `on_auth_user_created_role`
-- cobre novos cadastros; este backfill cobre o legado, para que todo usuário
-- real resolva para um papel após a migration.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_roles'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT u.id, 'user'
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id
    )
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    RAISE NOTICE 'G1.1: user_roles não existe — backfill de papéis ignorado.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Endurecimento de get_user_role (G-04) contra uso como oráculo.
--
-- Por que NÃO `REVOKE EXECUTE FROM PUBLIC`: as policies de
-- `support_sessions` (INSERT), `audit_logs` (SELECT admin), `profiles`,
-- `user_roles`, `study_history`, `question_attempts` e `study_plans`
-- (variante fix-admin-rls) chamam `get_user_role(auth.uid())` na expressão
-- da policy — sem EXECUTE, essas leituras/escritas legítimas quebram. A
-- proteção vai no CORPO (compatível com as policies):
--   - chamador == alvo → comportamento idêntico ao atual (policies usam
--     sempre get_user_role(auth.uid()), então nada muda para elas);
--   - chamador moderator/admin consultando OUTRO → papel real (é o que o
--     painel admin e o resolvedor canônico do código precisam);
--   - chamador comum consultando OUTRO → sempre 'user' (não distingue admin
--     de user: oráculo fechado);
--   - alvo sem linha + chamador privilegiado consultando outro → NULL
--     (distingue "inexistente/desconhecido" de "user real"; o código faz
--     fail-closed em NULL).
-- search_path travado como antes (public, auth) — necessário para auth.uid().
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role(target_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_role TEXT;
  v_caller UUID;
  v_caller_role TEXT;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN 'user';
  END IF;

  v_caller := auth.uid();

  -- Sem sessão (ex.: anon): nunca revela nada além do default.
  IF v_caller IS NULL THEN
    RETURN 'user';
  END IF;

  -- Leitura própria (caminho das policies e do próprio papel): idêntico.
  IF v_caller = target_user_id THEN
    SELECT role INTO v_role
    FROM public.user_roles
    WHERE user_id = target_user_id
    LIMIT 1;
    RETURN COALESCE(v_role, 'user');
  END IF;

  -- Papel do chamador (bypassa RLS por ser DEFINER).
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller
  LIMIT 1;

  -- Equipe consultando outro usuário: papel real; sem linha → NULL
  -- (o código fail-closed distingue de "user").
  IF v_caller_role IN ('admin', 'moderator') THEN
    SELECT role INTO v_role
    FROM public.user_roles
    WHERE user_id = target_user_id
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    RETURN COALESCE(v_role, 'user');
  END IF;

  -- Usuário comum consultando outro: oráculo fechado.
  RETURN 'user';
END;
$func$;
