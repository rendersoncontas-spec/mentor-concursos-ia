-- Diagnóstico: por que "Gerenciar importações" está vazio no app (SOMENTE LEITURA)

-- 1) O lote existe e a qual usuário pertence? (o e-mail aqui DEVE ser o e-mail logado no app)
SELECT si.id, si.user_id, au.email, si.source_name, si.total_rows, si.created_at
FROM public.study_imports si
JOIN auth.users au ON au.id = si.user_id
ORDER BY si.created_at DESC;

-- 2) Policies de study_imports (deve existir a policy SELECT "study_imports_select_own")
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'study_imports'
ORDER BY cmd;