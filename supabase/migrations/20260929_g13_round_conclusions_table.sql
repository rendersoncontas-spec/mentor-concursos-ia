-- ============================================================================
-- G1.3 (subauditoria §7) — tabela ACTIVE MISSING: study_cycle_round_conclusions.
--
-- Evidência: `concludeCurrentCycleRound` (cycle-study-registration.service) e
-- o botão "concluir volta" (active-cycle-panel) escrevem nesta tabela, mas ela
-- NÃO existe no banco real (migration 20260926 nunca aplicada) — o fluxo de
-- conclusão manual de volta está funcionalmente quebrado (erro honesto hoje).
-- Conteúdo idêntico ao da migration original 20260926 (não reescrito).
-- Idempotente. RLS + policies + grants incluídos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_cycle_round_conclusions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.study_cycles(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concluded_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (cycle_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_study_cycle_round_conclusions_cycle
  ON public.study_cycle_round_conclusions(cycle_id);

ALTER TABLE public.study_cycle_round_conclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem suas proprias conclusoes de rodada" ON public.study_cycle_round_conclusions;
CREATE POLICY "Usuarios veem suas proprias conclusoes de rodada" ON public.study_cycle_round_conclusions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuarios criam conclusoes em seus proprios ciclos" ON public.study_cycle_round_conclusions;
CREATE POLICY "Usuarios criam conclusoes em seus proprios ciclos" ON public.study_cycle_round_conclusions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_round_conclusions.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.study_cycle_round_conclusions TO authenticated;
