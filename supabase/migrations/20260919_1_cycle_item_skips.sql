-- Torna o "pular matéria" do ciclo durável e compatível com o rebuild central.
--
-- Antes: skipCycleCurrentItemAction gravava um registro sintético (sem
-- study_history_id) direto em study_cycle_sessions e atualizava
-- study_cycles.current_item_index manualmente. Isso violava duas regras:
--   1. study_cycle_sessions.study_history_id é NOT NULL — o INSERT sintético
--      falhava na constraint e o erro era engolido por um catch silencioso.
--   2. Mesmo que o INSERT tivesse funcionado, o próximo rebuild
--      (reconcile_study_cycle) apaga e reconstrói TODAS as sessões a partir
--      apenas de study_history — um "pulo" sem lastro em estudo real
--      desaparecia e o cursor voltava para a matéria pulada.
--
-- Agora: "pular" grava apenas um marcador durável (cycle_item_id + rodada).
-- O motor de reconciliação (reconcileCycleFromStudies) passa a tratar um
-- item marcado como "satisfeito" para fins de cursor/rodada nessa rodada
-- específica, SEM alterar o cálculo de progresso/extra — o tempo real
-- estudado continua sendo somado normalmente a partir de study_history.
-- O marcador nunca é apagado pelo rebuild (não é uma tabela derivada).
CREATE TABLE IF NOT EXISTS public.study_cycle_item_skips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.study_cycles(id) ON DELETE CASCADE,
  cycle_item_id uuid NOT NULL REFERENCES public.study_cycle_items(id) ON DELETE CASCADE,
  round_number integer NOT NULL DEFAULT 1,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (cycle_item_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_study_cycle_item_skips_cycle ON public.study_cycle_item_skips(cycle_id);

ALTER TABLE public.study_cycle_item_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seus próprios pulos de ciclo" ON public.study_cycle_item_skips;
CREATE POLICY "Usuários veem seus próprios pulos de ciclo" ON public.study_cycle_item_skips
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários criam pulos em seus próprios ciclos" ON public.study_cycle_item_skips;
CREATE POLICY "Usuários criam pulos em seus próprios ciclos" ON public.study_cycle_item_skips
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_item_skips.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.study_cycle_item_skips TO authenticated;
