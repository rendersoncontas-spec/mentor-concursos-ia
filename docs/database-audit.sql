-- ========================================================================================
-- AUDITORIA COMPLETA DO BANCO DE DADOS (APENAS LEITURA)
-- Arquivo: docs/database-audit.sql
-- Objetivo: Verificar estrutura, constraints, policies, RLS, FKs e dados existentes
-- ========================================================================================

-- 1. LISTAR TODAS AS TABELAS DO SCHEMA PUBLIC
SELECT 
    table_name 
FROM 
    information_schema.tables 
WHERE 
    table_schema = 'public' 
    AND table_type = 'BASE TABLE'
ORDER BY 
    table_name;

-- 2. LISTAR TODAS AS COLUNAS E TIPOS DAS TABELAS DO SCHEMA PUBLIC
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM 
    information_schema.columns 
WHERE 
    table_schema = 'public'
ORDER BY 
    table_name, 
    ordinal_position;

-- 3. VERIFICAR CONSTRAINTS (CHECK, UNIQUE, PRIMARY KEY)
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    cc.check_clause
FROM 
    information_schema.table_constraints tc
LEFT JOIN 
    information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE 
    tc.table_schema = 'public'
ORDER BY 
    tc.table_name, 
    tc.constraint_type;

-- 4. VERIFICAR CHAVES ESTRANGEIRAS (FOREIGN KEYS)
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
ORDER BY 
    tc.table_name;

-- 5. VERIFICAR ÍNDICES EXISTENTES
SELECT 
    tablename, 
    indexname, 
    indexdef 
FROM 
    pg_indexes 
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename, 
    indexname;

-- 6. VERIFICAR POLICIES (RLS) ATIVAS NO SCHEMA PUBLIC
SELECT 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check 
FROM 
    pg_policies 
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename, 
    policyname;

-- 7. VERIFICAR SE O RLS ESTÁ HABILITADO NAS TABELAS
SELECT 
    relname AS table_name, 
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM 
    pg_class 
WHERE 
    relnamespace = 'public'::regnamespace 
    AND relkind = 'r'
ORDER BY 
    relname;

-- ========================================================================================
-- AMOSTRAGEM DE DADOS EXISTENTES (ATÉ 10 REGISTROS POR TABELA CRÍTICA)
-- ========================================================================================

-- 8. DADOS: exams (Concursos Cadastrados)
SELECT id, name, active, created_at FROM public.exams LIMIT 10;

-- 9. DADOS: disciplines (Disciplinas Globais)
SELECT id, name, area, created_at FROM public.disciplines LIMIT 10;

-- 10. DADOS: user_targets (Objetivos dos Usuários)
SELECT id, user_id, exam_id, target_exam, target_role, is_active FROM public.user_targets LIMIT 10;

-- 11. DADOS: user_disciplines (Progresso dos Usuários)
-- Traz as colunas padrões que devem existir na Sprint 5/5.5
SELECT id, user_id, discipline_id, status, created_at FROM public.user_disciplines LIMIT 10;

-- ========================================================================================
-- FIM DA AUDITORIA
-- ========================================================================================
