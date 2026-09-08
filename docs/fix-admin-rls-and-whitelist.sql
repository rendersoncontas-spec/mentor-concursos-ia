-- ========================================================================================
-- MENTOR CONCURSOS IA — PERMISSÃO DE LEITURA PARA ADMIN/MODERADOR NO SUPABASE
-- ========================================================================================
-- Este script atualiza as políticas RLS para que o Administrador/Moderador consiga
-- visualizar todos os estudantes cadastrados no Painel de Administração.
-- ========================================================================================

-- 1. Permitir que Administrador e Moderador leiam todos os perfis de estudantes
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil ou moderador/admin vê todos" ON public.profiles;

CREATE POLICY "Usuários podem ver seu próprio perfil ou moderador/admin vê todos"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id 
    OR public.get_user_role(auth.uid()) IN ('admin', 'moderator')
  );

-- 2. Permitir que Administrador e Moderador leiam todas as roles
DROP POLICY IF EXISTS "Usuários podem ver seu próprio role" ON public.user_roles;
DROP POLICY IF EXISTS "Usuários veem seu role ou moderador/admin vê todos" ON public.user_roles;

CREATE POLICY "Usuários veem seu role ou moderador/admin vê todos"
  ON public.user_roles FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.get_user_role(auth.uid()) IN ('admin', 'moderator')
  );

-- 3. Permitir que Administrador modifique roles
DROP POLICY IF EXISTS "Administrador pode gerenciar roles" ON public.user_roles;

CREATE POLICY "Administrador pode gerenciar roles"
  ON public.user_roles FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- 4. Permitir que Administrador e Moderador leiam estatísticas e histórico no diagnóstico
DROP POLICY IF EXISTS "Admin/Moderador pode ver histórico para diagnóstico" ON public.study_history;
CREATE POLICY "Admin/Moderador pode ver histórico para diagnóstico"
  ON public.study_history FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.get_user_role(auth.uid()) IN ('admin', 'moderator')
  );

DROP POLICY IF EXISTS "Admin/Moderador pode ver tentativas para diagnóstico" ON public.question_attempts;
CREATE POLICY "Admin/Moderador pode ver tentativas para diagnóstico"
  ON public.question_attempts FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.get_user_role(auth.uid()) IN ('admin', 'moderator')
  );

DROP POLICY IF EXISTS "Admin/Moderador pode ver planos para diagnóstico" ON public.study_plans;
CREATE POLICY "Admin/Moderador pode ver planos para diagnóstico"
  ON public.study_plans FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.get_user_role(auth.uid()) IN ('admin', 'moderator')
  );

-- 5. Garantir que 'rendersonluan@gmail.com' seja ADMIN definitivo
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'rendersonluan@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
