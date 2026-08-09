-- Migration: Tabela de layouts personalizáveis do Dashboard do Usuário
-- Permite que cada usuário organize, redimensione, ative e reordene seus widgets no Home

CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    widget_id VARCHAR(100) NOT NULL,
    position_order INT NOT NULL DEFAULT 0,
    col_span INT NOT NULL DEFAULT 1 CHECK (col_span BETWEEN 1 AND 3),
    row_span INT NOT NULL DEFAULT 1 CHECK (row_span BETWEEN 1 AND 2),
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_widget_unique UNIQUE (user_id, widget_id)
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- Politica SELECT
CREATE POLICY "Usuários podem visualizar seus próprios layouts do dashboard"
    ON public.user_dashboard_layouts
    FOR SELECT
    USING (auth.uid() = user_id);

-- Politica INSERT
CREATE POLICY "Usuários podem inserir seus próprios layouts do dashboard"
    ON public.user_dashboard_layouts
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Politica UPDATE
CREATE POLICY "Usuários podem atualizar seus próprios layouts do dashboard"
    ON public.user_dashboard_layouts
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Politica DELETE
CREATE POLICY "Usuários podem excluir seus próprios layouts do dashboard"
    ON public.user_dashboard_layouts
    FOR DELETE
    USING (auth.uid() = user_id);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_user ON public.user_dashboard_layouts(user_id, position_order);
