-- ============================================================================
-- CICLOS DE ESTUDO V2 — MIGRATION
-- Adiciona campos necessários para o ciclo contínuo e rotativo.
-- Execute no SQL Editor do Supabase.
-- Idempotente: pode ser executado múltiplas vezes sem erro.
-- ============================================================================

-- 1. Novos campos em study_cycles
ALTER TABLE public.study_cycles
  ADD COLUMN IF NOT EXISTS current_round             INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_rounds_done         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_item_progress_min INTEGER NOT NULL DEFAULT 0;

-- 2. Novos campos em study_cycle_sessions
ALTER TABLE public.study_cycle_sessions
  ADD COLUMN IF NOT EXISTS round_number         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS minutes_contributed  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_minutes        INTEGER NOT NULL DEFAULT 0;

-- 3. Garantir que study_cycle_sessions tem discipline_id para JOIN direto
ALTER TABLE public.study_cycle_sessions
  ADD COLUMN IF NOT EXISTS discipline_id uuid REFERENCES public.disciplines(id) ON DELETE SET NULL;

-- 4. Preencher discipline_id nas sessões antigas via JOIN com study_cycle_items
UPDATE public.study_cycle_sessions scs
SET discipline_id = sci.discipline_id
FROM public.study_cycle_items sci
WHERE scs.cycle_item_id = sci.id
  AND scs.discipline_id IS NULL;

-- 5. Preencher minutes_contributed das sessões antigas via study_history
UPDATE public.study_cycle_sessions scs
SET minutes_contributed = COALESCE(sh.duration_minutes, 0)
FROM public.study_history sh
WHERE scs.study_history_id = sh.id
  AND scs.minutes_contributed = 0;

-- 6. Para ciclos existentes: calcular current_item_progress_min
-- (soma de sessions do round atual para o item atual)
-- Esta query é uma approximation já que não sabemos o round_number das sessões antigas.
-- Deixamos como 0 para reinício limpo nos ciclos existentes.

-- 7. Adicionar campo difficulty em study_cycle_items (era priority/metadata)
ALTER TABLE public.study_cycle_items
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'MEDIA'
    CHECK (difficulty IN ('FACIL', 'MEDIA', 'DIFICIL'));

-- 8. Índices de performance
CREATE INDEX IF NOT EXISTS idx_cycle_sessions_item_round
  ON public.study_cycle_sessions (cycle_item_id, round_number);

CREATE INDEX IF NOT EXISTS idx_cycle_sessions_cycle_round
  ON public.study_cycle_sessions (cycle_id, round_number);

CREATE INDEX IF NOT EXISTS idx_cycle_sessions_discipline
  ON public.study_cycle_sessions (discipline_id)
  WHERE discipline_id IS NOT NULL;

-- 9. RLS para study_cycle_sessions (adicionar políticas que possam estar faltando)
ALTER TABLE public.study_cycle_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver sessões de seus ciclos" ON public.study_cycle_sessions;
CREATE POLICY "Usuários podem ver sessões de seus ciclos" ON public.study_cycle_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_sessions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Usuários podem criar sessões de seus ciclos" ON public.study_cycle_sessions;
CREATE POLICY "Usuários podem criar sessões de seus ciclos" ON public.study_cycle_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_sessions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Usuários podem atualizar sessões de seus ciclos" ON public.study_cycle_sessions;
CREATE POLICY "Usuários podem atualizar sessões de seus ciclos" ON public.study_cycle_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_sessions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Usuários podem excluir sessões de seus ciclos" ON public.study_cycle_sessions;
CREATE POLICY "Usuários podem excluir sessões de seus ciclos" ON public.study_cycle_sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_sessions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );
