-- ========================================================================================
-- MENTOR CONCURSOS IA — SISTEMA DE MODERAÇÃO, ADMINISTRAÇÃO E SUPORTE
-- ========================================================================================

-- ----------------------------------------------------------------------------------------
-- 1. TABELA DE ROLES DOS USUÁRIOS (public.user_roles)
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_role UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Política de leitura: usuários podem ver apenas a sua própria role; moderadores e admins têm consulta via SECURITY DEFINER
DROP POLICY IF EXISTS "Usuários podem ver seu próprio role" ON public.user_roles;
CREATE POLICY "Usuários podem ver seu próprio role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------------------
-- 2. FUNÇÃO SEGURA PARA OBTER ROLE DO USUÁRIO (SECURITY DEFINER)
-- ----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_role(target_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF target_user_id IS NULL THEN
    RETURN 'user';
  END IF;

  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = target_user_id
  LIMIT 1;

  RETURN COALESCE(v_role, 'user');
END;
$$;

-- ----------------------------------------------------------------------------------------
-- 3. TRIGGER AUTOMÁTICO: ATRIBUIR ROLE 'user' PARA NOVOS CADASTROS
-- ----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_role();

-- ----------------------------------------------------------------------------------------
-- 4. TABELA DE SESSÕES TEMPORÁRIAS DE SUPORTE (public.support_sessions)
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_mod ON public.support_sessions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_target ON public.support_sessions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_status ON public.support_sessions(status);
CREATE INDEX IF NOT EXISTS idx_support_sessions_expires ON public.support_sessions(expires_at);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderador pode ler suas próprias sessões de suporte" ON public.support_sessions;
CREATE POLICY "Moderador pode ler suas próprias sessões de suporte"
  ON public.support_sessions FOR SELECT
  USING (auth.uid() = moderator_id);

-- ----------------------------------------------------------------------------------------
-- 5. TABELA DE AUDITORIA IMUTÁVEL (public.audit_logs - APPEND ONLY)
-- ----------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Usuários e moderadores não podem UPDATE nem DELETE audit logs (append-only)
DROP POLICY IF EXISTS "Inserção de logs de auditoria permitida para autenticados" ON public.audit_logs;
CREATE POLICY "Inserção de logs de auditoria permitida para autenticados"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = actor_user_id);

DROP POLICY IF EXISTS "Leitura de logs permitida para o próprio autor" ON public.audit_logs;
CREATE POLICY "Leitura de logs permitida para o próprio autor"
  ON public.audit_logs FOR SELECT
  USING (auth.uid() = actor_user_id);

-- ----------------------------------------------------------------------------------------
-- 6. CORREÇÃO DE RLS PARA TODAS AS TABELAS DO SISTEMA
-- ----------------------------------------------------------------------------------------

DO $$
BEGIN
  -- Garantir RLS em tabelas auxiliares
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'edital_requests') THEN
    ALTER TABLE public.edital_requests ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'library_materials') THEN
    ALTER TABLE public.library_materials ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_notes') THEN
    ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'study_imports') THEN
    ALTER TABLE public.study_imports ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
