-- ============================================================================
-- FASE CICLO -- "Concluir volta" (encerrar manualmente a rodada atual)
--
-- Por que esta tabela existe: o motor de reconciliacao (reconcileCycleFromStudies)
-- e um replay puro e cronologico do historico real de estudos. O marcador de
-- "pular materia" (study_cycle_item_skips) e atemporal por design -- ele nunca
-- e "desfeito" nem depende de ordem, e isso e seguro porque normalmente so UM
-- item de cada vez e pulado, com os demais ainda dependendo de progresso real.
--
-- "Concluir volta" precisa fechar a rodada TODA de uma vez, mesmo com varios
-- itens ainda parcialmente estudados. Reutilizar o mesmo marcador atemporal
-- para TODOS os itens simultaneamente quebra o replay: o motor fecha a rodada
-- antes mesmo de processar o estudo real ja registrado nela, atribuindo esse
-- estudo a rodada seguinte por engano (confirmado via teste automatizado --
-- ver cycle-reconciliation.engine.test.ts, casos "Concluir volta - Caso 1/3").
--
-- Esta tabela grava "concluir volta" como um EVENTO NO TEMPO (concluded_at),
-- para que o motor possa intercala-lo corretamente entre os estudos reais ja
-- registrados (antes dele) e os que vierem depois (apos ele) -- nunca misturado
-- atemporalmente como os pulos de item. Nenhuma linha de study_history e
-- criada ou alterada por esta tabela. Nao substitui nem apaga nada existente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_cycle_round_conclusions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.study_cycles(id) ON DELETE CASCADE,
  -- Rodada que o servidor observou como "atual" no momento do clique. Usada
  -- pelo motor apenas como protecao extra (nunca fecha duas rodadas de uma
  -- vez so): a conclusao so tem efeito se, ao alcanca-la na linha do tempo do
  -- replay, a rodada corrente ainda for exatamente esta.
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
